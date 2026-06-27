import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { useLang } from '../context/LanguageContext';
import { authFetch } from '../utils/api';

export default function PaymentProcessingScreen({ navigation, route }) {
  const { t } = useLang();
  const {
    context, checkoutId, transferId,
    service, category,
    sellerPhone, sellerTill, method, notifyPhone,
    itemTitle, condition, inspectionHours, clientRef,
    amount, description, photoUrls,
    isFundi, fundiPhone, durationHours, beforePhotos,
    deliverables,
  } = route.params || {};

  const isSecondHand = category === 'second_hand';
  const seller       = method === 'till' ? sellerTill : sellerPhone;
  const pulse        = useRef(new Animated.Value(1)).current;
  const pollRef      = useRef(null);
  const [statusText, setStatusText] = useState('Initiating secure payment...');

  useEffect(() => {
    console.log('PaymentProcessing params:', JSON.stringify(route.params));
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();

    if (isFundi) {
      initiateFundiPayment();
    } else if (isSecondHand) {
      initiateSecondHandPayment();
    } else if (service === 'Delivery') {
      initiateDeliveryPayment();
    } else if (context === 'protectedTransfer') {
      setStatusText('Check your phone for M-Pesa prompt...');
      pollProtectedTransfer(checkoutId, transferId);
    } else {
      initiateBundlePayment();
    }

    // Cleanup — prevent setState on unmounted component
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);



  // ── SafeSend / Protected Transfer poll ─────────────────────────────────
  const pollProtectedTransfer = (checkoutId, transferId) => {
    let attempts = 0;
    const maxAttempts = 30;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res  = await authFetch(`/transfer/status/${checkoutId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          clearInterval(pollRef.current);
          setStatusText('SafeSend held securely!');
          navigation.replace('PaymentSuccess', {
            tx: {
              id:     transferId,
              amount,
              status: 'waiting_acceptance',
              isSafeSend: true,
            },
          });
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          Alert.alert('Payment Failed', 'M-Pesa payment was not completed.');
          navigation.goBack();
        } else if (attempts >= maxAttempts) {
          clearInterval(pollRef.current);
          Alert.alert('Timeout', 'Payment is taking too long. Check your transaction history.');
          navigation.goBack();
        }
      } catch (_) { /* keep polling on network blip */ }
    }, 4000);
  };

  // ── Fundi payment poll ──────────────────────────────────────────────────
  const pollFundiPayment = (checkoutRequestId, jobId) => {
    let attempts = 0;
    const maxAttempts = 30;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res  = await authFetch(`/fundi-mpesa/status/${checkoutRequestId}`);
        const data = await res.json();

        if (data.status === 'completed' && data.jobStatus === 'WAITING_FOR_FUNDI_ACCEPTANCE') {
          clearInterval(pollRef.current);
          setStatusText('Payment confirmed! Waiting for fundi to accept...');
          navigation.replace('PaymentSuccess', {
            tx: {
              id:         jobId,
              referenceNo: jobId,
              service:    'Fundi',
              seller:     fundiPhone,
              amount,
              status:     'waiting_acceptance',
              date:       new Date().toISOString(),
              isFundi:    true,
            },
          });
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          Alert.alert('Payment Failed', 'M-Pesa payment was not completed.');
          navigation.goBack();
        } else if (attempts >= maxAttempts) {
          clearInterval(pollRef.current);
          Alert.alert('Timeout', 'Payment is taking too long. Check your transaction history.');
          navigation.goBack();
        }
      } catch (_) { /* keep polling */ }
    }, 4000);
  };

  // ── Fundi payment initiation ────────────────────────────────────────────
  const initiateFundiPayment = async () => {
    try {
      setStatusText('Creating fundi job...');

      // Step 1 — create job
      const jobRes = await authFetch('/fundi', {
        method: 'POST',
        body: JSON.stringify({
          fundiPhone,
          amount:        parseFloat(amount),
          description,
          durationHours: parseInt(durationHours),
          beforePhotos:  beforePhotos || [],
          category,
          deliverables:  deliverables || [],
        }),
      });

      const jobData = await jobRes.json();
      if (!jobRes.ok || !jobData.success) {
        Alert.alert('Failed', jobData.message || 'Could not create job.');
        navigation.goBack();
        return;
      }

      const jobId = jobData.job.id;
      setStatusText('Initiating M-Pesa payment...');

      // Step 2 — STK push
      const payRes = await authFetch('/fundi-mpesa/pay', {
        method: 'POST',
        body: JSON.stringify({ jobId, phone: fundiPhone }),
      });

      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) {
        Alert.alert('Payment Failed', payData.message || 'Could not initiate payment.');
        navigation.goBack();
        return;
      }

      setStatusText('Check your phone for M-Pesa prompt...');
      pollFundiPayment(payData.checkoutRequestId, jobId);

    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
      navigation.goBack();
    }
  };

  // ── Shared poll — works for both flows ─────────────────────────────────
  const startPolling = (transactionId, referenceNo) => {
    let attempts    = 0;
    const maxAttempts = 30;
    const endpoint  = isSecondHand
      ? `/second-hand/status/${transactionId}`
      : `/transactions/bundle/status/${transactionId}`;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const statusRes  = await authFetch(endpoint);
        const statusData = await statusRes.json();
        const state      = statusData.transaction?.state;

        if (state === 'held') {
          clearInterval(pollRef.current);
          setStatusText('Payment confirmed!');
          navigation.replace('PaymentSuccess', {
            tx: {
              id: transactionId,
              referenceNo,
              service,
              seller,
              amount,
              status: 'held',
              date: new Date().toISOString(),
            },
          });
        } else if (['expired', 'cancelled', 'failed'].includes(state)) {
          clearInterval(pollRef.current);
          Alert.alert('Payment Failed', 'The payment was not completed.');
          navigation.goBack();
        } else if (attempts >= maxAttempts) {
          clearInterval(pollRef.current);
          Alert.alert('Timeout', 'Payment is taking too long. Check your transaction history.');
          navigation.goBack();
        }
      } catch (_) { /* network blip — keep polling */ }
    }, 4000);
  };

  // ── Second hand payment ─────────────────────────────────────────────────
  const initiateSecondHandPayment = async () => {
    try {
      setStatusText('Connecting to LipaSafe...');
      const res = await authFetch('/second-hand/buy', {
        method: 'POST',
        body: JSON.stringify({
          itemTitle,
          ...(method === 'pochi' ? { sellerPhone } : { sellerTill }),
          ...(notifyPhone ? { notifyPhone } : {}),
          method,
          amount:          parseFloat(amount),
          condition,
          inspectionHours: inspectionHours || 24,
          description:     description || `${service} payment`,
          clientRef,       // idempotency key — backend deduplicates on this
          ...(photoUrls && photoUrls.length > 0 ? { photoUrls } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        Alert.alert('Payment Failed', data.message || 'Could not initiate payment.');
        navigation.goBack();
        return;
      }

      setStatusText('Check your phone for M-Pesa prompt...');
      startPolling(data.transactionId, data.referenceNo);
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
      navigation.goBack();
    }
  };

  // ── Bundle payment — untouched ──────────────────────────────────────────
  const initiateBundlePayment = async () => {
    try {
      setStatusText('Connecting to LipaSafe...');
      const res = await authFetch('/transactions/bundle/initiate', {
        method: 'POST',
        body: JSON.stringify({
          ...(method === 'pochi' ? { sellerPhone } : { sellerTill }),
          ...(notifyPhone ? { notifyPhone } : {}),
          amount:      parseFloat(amount),
          description: description || `${service} payment`,
          method,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        Alert.alert('Payment Failed', data.message || 'Could not initiate payment.');
        navigation.goBack();
        return;
      }

      setStatusText('Check your phone for M-Pesa prompt...');
      startPolling(data.transactionId, data.referenceNo);
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
      navigation.goBack();
    }
  };

  // ── Delivery payment ────────────────────────────────────────────────────
  const initiateDeliveryPayment = async () => {
    try {
      setStatusText('Creating delivery order...');
      const { deliveryGuyPhone, address, deadline, productDescription, goods } = route.params || {};

      // Step 1 — create delivery order
      const orderRes = await authFetch('/delivery/create', {
        method: 'POST',
        body: JSON.stringify({
          deliveryGuyPhone,
          amount:             parseFloat(amount),
          goods:              goods || description,
          productDescription: productDescription || description,
          address,
          deliveryTime:       deadline ? new Date(deadline).toISOString() : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        Alert.alert('Failed', orderData.message || 'Could not create delivery order.');
        navigation.goBack();
        return;
      }

      const orderId = orderData.orderId;
      setStatusText('Initiating M-Pesa payment...');

      // Step 2 — STK push
      const payRes = await authFetch('/delivery-mpesa/pay', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });

      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) {
        Alert.alert('Payment Failed', payData.message || 'Could not initiate payment.');
        navigation.goBack();
        return;
      }

      setStatusText('Check your phone for M-Pesa prompt...');

      // Step 3 — poll for payment confirmation
      let attempts = 0;
      const maxAttempts = 30;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const statusRes  = await authFetch(`/delivery-mpesa/status/${payData.checkoutRequestId}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            clearInterval(pollRef.current);
            setStatusText('Payment confirmed!');
            navigation.replace('PaymentSuccess', {
              tx: {
                id:          orderId,
                referenceNo: orderId,
                service:     'Delivery',
                seller:      deliveryGuyPhone,
                amount,
                status:      'held',
                date:        new Date().toISOString(),
              },
            });
          } else if (statusData.status === 'failed') {
            clearInterval(pollRef.current);
            Alert.alert('Payment Failed', 'M-Pesa payment was not completed.');
            navigation.goBack();
          } else if (attempts >= maxAttempts) {
            clearInterval(pollRef.current);
            Alert.alert('Timeout', 'Payment is taking too long. Check your transaction history.');
            navigation.goBack();
          }
        } catch (_) { /* keep polling */ }
      }, 4000);

    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
      navigation.goBack();
    }
  };


  return (
    <View style={styles.container}>
      <Animated.View style={[styles.circle, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.text}>M</Text>
      </Animated.View>
      <Text style={styles.title}>{t.processing}</Text>
      <Text style={styles.subtitle}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  circle:    { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  text:      { fontSize: 40, fontWeight: 'bold', color: colors.primary },
  title:     { fontSize: 20, fontWeight: 'bold', color: colors.white, marginTop: 24 },
  subtitle:  { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
});
