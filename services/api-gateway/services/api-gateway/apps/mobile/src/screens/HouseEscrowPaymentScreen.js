import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';
import { useNotifications } from '../context/NotificationContext';

const POLL_INTERVAL = 4000;
const MAX_POLLS     = 45; // 3 minutes

export default function HouseEscrowPaymentScreen({ navigation, route }) {
  const { escrowId, amount, platformFee, b2cFee = 0, total, sellerPhone, description, protectionHours } = route.params;

  const [phase,   setPhase]   = useState('initiating'); // initiating | waiting | awaiting_seller | success | failed
  const [message, setMessage] = useState('Sending M-Pesa prompt...');

  const { notifications } = useNotifications();
  const processedNotifIds = useRef(new Set());

  const pollCount  = useRef(0);
  const pollTimer  = useRef(null);
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  // Pulse animation while waiting
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Initiate STK push on mount
  useEffect(() => {
    initiatePush();
    return () => clearInterval(pollTimer.current);
  }, []);

  // Listen for seller's accept/reject decision while awaiting
  useEffect(() => {
    const hit = notifications.find(n =>
      n.houseEscrowId === escrowId &&
      (n.type === 'house_deal_accepted' || n.type === 'house_deal_rejected') &&
      !processedNotifIds.current.has(n.id)
    );
    if (!hit) return;
    processedNotifIds.current.add(hit.id);

    if (hit.type === 'house_deal_accepted') {
      setPhase('initiating');
      setMessage('Seller accepted! Sending M-Pesa prompt...');
      initiatePush();
    } else {
      clearInterval(pollTimer.current);
      setPhase('failed');
      setMessage('Seller declined the deal.');
    }
  }, [notifications]);

  const initiatePush = async () => {
    try {
      const res  = await authFetch('/house/pay', {
        method: 'POST',
        body: JSON.stringify({ escrowId }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.code === 'SELLER_NOT_ACCEPTED') {
          setPhase('awaiting_seller');
          setMessage('Waiting for seller to accept the deal');
          return;
        }
        throw new Error(data.message || 'STK push failed');
      }

      setPhase('waiting');
      setMessage('Check your phone for the M-Pesa prompt');
      startPolling();
    } catch (err) {
      setPhase('failed');
      setMessage(err.message);
    }
  };

  const startPolling = () => {
    pollTimer.current = setInterval(async () => {
      pollCount.current += 1;

      if (pollCount.current > MAX_POLLS) {
        clearInterval(pollTimer.current);
        setPhase('failed');
        setMessage('Payment timed out. Try again.');
        return;
      }

      try {
        const res  = await authFetch(`/house/status/${escrowId}`);
        const data = await res.json();
        if (!data.success) return;

        const status = data.escrow?.status;

        if (status === 'PAYMENT_HELD') {
          clearInterval(pollTimer.current);
          setPhase('success');
          setMessage('Payment confirmed!');
          setTimeout(() => {
            navigation.replace('HouseEscrowActive', {
              escrowId,
              amount,
              sellerPhone,
              description,
              protectionHours,
              inspectionDeadline: data.escrow.inspectionDeadline,
            });
          }, 1200);
        } else if (status === 'CANCELLED') {
          clearInterval(pollTimer.current);
          setPhase('failed');
          setMessage('Payment was cancelled.');
        }
      } catch {}
    }, POLL_INTERVAL);
  };

  const handleRetry = () => {
    clearInterval(pollTimer.current);
    pollCount.current = 0;
    setPhase('initiating');
    setMessage('Sending M-Pesa prompt...');
    initiatePush();
  };

  const handleCancel = () => {
    clearInterval(pollTimer.current);
    Alert.alert(
      'Cancel Payment',
      'The escrow has been created but not paid. Cancel and go back?',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Cancel', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const iconName =
    phase === 'success'         ? 'checkmark-circle' :
    phase === 'failed'          ? 'close-circle'      :
    phase === 'awaiting_seller' ? 'time-outline'      : 'phone-portrait';

  const iconColor =
    phase === 'success' ? colors.success :
    phase === 'failed'  ? colors.error   : colors.primary;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {phase === 'failed' && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>
          {phase === 'success'         ? 'Payment Confirmed' :
           phase === 'failed'          ? 'Payment Failed'    :
           phase === 'awaiting_seller' ? 'Waiting for Seller' : 'Waiting for Payment'}
        </Text>
        {phase === 'failed' && <View style={{ width: 40 }} />}
      </View>

      {/* Icon */}
      <View style={styles.iconWrap}>
        <Animated.View style={[
          styles.iconCircle,
          { borderColor: iconColor + '33' },
          phase === 'waiting' && { transform: [{ scale: pulseAnim }] },
        ]}>
          <Ionicons name={iconName} size={56} color={iconColor} />
        </Animated.View>
      </View>

      {/* Amount card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Amount being held</Text>
        <Text style={styles.cardAmount}>KES {total.toLocaleString()}</Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardSub}>Agreed amount</Text>
          <Text style={styles.cardSub}>KES {amount.toLocaleString()}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardSub}>LipaSafe fee</Text>
          <Text style={styles.cardSub}>KES {platformFee.toLocaleString()}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardSub}>M-Pesa B2C fee</Text>
          <Text style={styles.cardSub}>KES {b2cFee.toLocaleString()}</Text>
        </View>
        <View style={[styles.cardRow, { marginTop: 8 }]}>
          <Text style={styles.cardSub}>Seller</Text>
          <Text style={[styles.cardSub, { color: colors.black, fontWeight: '600' }]}>{sellerPhone}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardSub}>Inspection window</Text>
          <Text style={[styles.cardSub, { color: colors.black, fontWeight: '600' }]}>{protectionHours} hrs</Text>
        </View>
      </View>

      {/* Status message */}
      <View style={styles.statusWrap}>
        {phase === 'initiating' || phase === 'waiting' || phase === 'awaiting_seller'
          ? <ActivityIndicator color={colors.primary} style={{ marginBottom: 10 }} />
          : null
        }
        <Text style={[styles.statusText, phase === 'failed' && { color: colors.error }]}>
          {message}
        </Text>
        {phase === 'waiting' && (
          <Text style={styles.subStatus}>
            Enter your M-Pesa PIN when prompted.{'\n'}Do not leave this screen.
          </Text>
        )}
        {phase === 'awaiting_seller' && (
          <Text style={styles.subStatus}>
            You'll be notified the moment the seller responds.
          </Text>
        )}
      </View>

      {/* Actions */}
      {phase === 'failed' && (
        <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
          <Ionicons name="refresh" size={18} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.retryText}>Retry Payment</Text>
        </TouchableOpacity>
      )}

      {(phase === 'waiting' || phase === 'initiating' || phase === 'awaiting_seller') && (
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.white },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  backBtn:     { position: 'absolute', left: 16, padding: 8 },
  title:       { fontSize: 18, fontWeight: '700', color: colors.black },
  iconWrap:    { alignItems: 'center', marginTop: 32, marginBottom: 24 },
  iconCircle:  { width: 120, height: 120, borderRadius: 60, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' },
  card:        { marginHorizontal: 24, backgroundColor: colors.gray, borderRadius: 14, padding: 18, marginBottom: 24 },
  cardLabel:   { fontSize: 12, color: colors.grayDark, marginBottom: 4 },
  cardAmount:  { fontSize: 28, fontWeight: '800', color: colors.primary, marginBottom: 12 },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: colors.grayDark },
  statusWrap:  { alignItems: 'center', paddingHorizontal: 32 },
  statusText:  { fontSize: 15, fontWeight: '600', color: colors.black, textAlign: 'center' },
  subStatus:   { fontSize: 13, color: colors.grayDark, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  retryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 24, marginTop: 32, borderRadius: 12, paddingVertical: 16 },
  retryText:   { color: colors.white, fontSize: 16, fontWeight: '700' },
  cancelBtn:   { alignItems: 'center', marginTop: 24 },
  cancelText:  { fontSize: 14, color: colors.grayDark, textDecorationLine: 'underline' },
});
