import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';

export default function AddMoneyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [polling, setPolling]   = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const pollRef = useRef(null);

  const parsedAmount = parseFloat(amount) || 0;
  const canPay = parsedAmount >= 1;

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => () => stopPolling(), []);

  const startPolling = (checkoutRequestId) => {
    setPolling(true);
    setStatusMsg('Waiting for M-Pesa confirmation...');
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res  = await authFetch(`/mpesa/status/${checkoutRequestId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          stopPolling();
          setPolling(false);
          navigation.replace('PaymentSuccess', {
            tx: { id: checkoutRequestId, total: parsedAmount.toFixed(2), type: 'topup' }
          });
        } else if (data.status === 'failed') {
          stopPolling();
          setPolling(false);
          Alert.alert('Payment Failed', 'M-Pesa payment was not completed. Please try again.');
        } else if (attempts >= 24) {
          stopPolling();
          setPolling(false);
          Alert.alert('Timeout', 'Payment confirmation timed out. If money was deducted, contact support.');
        }
      } catch {
      }
    }, 5000);
  };

  const handlePay = async () => {
    setLoading(true);
    try {
      const res  = await authFetch('/mpesa/stk-push', {
        method: 'POST',
        body: JSON.stringify({ amount: parsedAmount }),
      });
      const data = await res.json();

      if (data.success) {
        setLoading(false);
        startPolling(data.checkoutRequestId);
      } else {
        Alert.alert('Failed', data.message || 'Could not initiate payment');
        setLoading(false);
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Money</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.mpesaBox}>
            <Text style={styles.mpesaM}>M</Text>
            <Text style={styles.mpesaLabel}>Pay via M-Pesa STK Push</Text>
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.kesPrefix}>KES</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              editable={!loading && !polling}
            />
          </View>

          <Text style={styles.hint}>Minimum KES 1 · Money added instantly to your wallet</Text>

          {polling ? (
            <View style={styles.pollingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.pollingText}>{statusMsg}</Text>
              <Text style={styles.pollingSubText}>Enter your M-Pesa PIN on the prompt</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.payBtn, !canPay && styles.payBtnDisabled]}
              disabled={!canPay || loading}
              onPress={handlePay}
            >
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <>
                    <Ionicons name="phone-portrait-outline" size={18} color={colors.white} />
                    <Text style={styles.payBtnText}>Send M-Pesa Prompt</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.white },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.gray },
  backBtn:        { padding: 4 },
  headerTitle:    { fontSize: 18, fontWeight: '700', color: colors.black },
  content:        { padding: 20 },
  mpesaBox:       { backgroundColor: '#169C3C', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  mpesaM:         { fontSize: 32, fontWeight: '900', color: colors.white },
  mpesaLabel:     { fontSize: 14, fontWeight: '600', color: colors.white },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, backgroundColor: colors.gray },
  kesPrefix:      { fontSize: 18, fontWeight: '700', color: colors.black, marginRight: 8 },
  input:          { flex: 1, fontSize: 24, fontWeight: '700', color: colors.black },
  hint:           { fontSize: 12, color: colors.grayDark, marginBottom: 24, textAlign: 'center' },
  payBtn:         { backgroundColor: '#169C3C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 12 },
  payBtnDisabled: { opacity: 0.4 },
  payBtnText:     { color: colors.white, fontSize: 16, fontWeight: '700' },
  pollingBox:     { alignItems: 'center', gap: 10, padding: 24, backgroundColor: colors.gray, borderRadius: 16 },
  pollingText:    { fontSize: 15, fontWeight: '600', color: colors.black },
  pollingSubText: { fontSize: 12, color: colors.grayDark },
});
