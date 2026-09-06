import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

export default function OTPConfirmScreen({ navigation, route }) {
  const { transactionId, referenceNo, tx, category } = route.params || {};
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const inputs = useRef([]);

  const handleChange = (val, idx) => {
    if (!/^[0-9]?$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[idx] = val;
    setOtp(newOtp);
    if (val && idx < 5) inputs.current[idx + 1]?.focus();
    if (!val && idx > 0) inputs.current[idx - 1]?.focus();
  };

  const otpValue = otp.join('');

  const verify = async () => {
    if (otpValue.length !== 6) return Alert.alert('Enter OTP', 'Please enter the 6-digit OTP sent to your phone.');
    try {
      setLoading(true);
      const endpoint = category === 'second_hand'
        ? `/second-hand/${transactionId}/verify-otp`
        : `/transactions/bundle/${transactionId}/verify-otp`
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpValue }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Success',
          category === 'second_hand'
            ? 'Item confirmed. Funds have been released to the seller.'
            : 'OTP verified. Funds released to seller.',
          [
          { text: 'OK', onPress: () => navigation.navigate('TransactionsList') }
        ]);
      } else {
        Alert.alert('Error', data.message || 'Invalid OTP');
        setOtp(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LipaHeader title="Confirm Receipt" navigation={navigation} />
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Reference</Text>
          <Text style={styles.value}>{referenceNo}</Text>
          <Text style={styles.label}>Amount</Text>
          <Text style={[styles.value, styles.amount]}>KES {parseFloat(tx?.amount || 0).toFixed(2)}</Text>
        </View>

        <Text style={styles.instruction}>Enter the 6-digit OTP sent to your phone to confirm you received the service.</Text>

        <View style={styles.otpRow}>
          {otp.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={r => inputs.current[idx] = r}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={val => handleChange(val, idx)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <LipaButton
          title={loading ? 'Verifying...' : 'Confirm Receipt'}
          onPress={verify}
          disabled={loading || otpValue.length !== 6}
        />

        <TouchableOpacity
          style={styles.disputeBtn}
          onPress={() => navigation.navigate('Dispute', { transactionId, referenceNo })}
          disabled={loading}
        >
          <Text style={styles.disputeText}>⚠ I did not receive — Dispute</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  content:      { padding: 20 },
  card:         { backgroundColor: '#F3F4F6', borderRadius: 16, padding: 20, marginBottom: 24 },
  label:        { fontSize: 12, color: '#6B7280', marginTop: 10 },
  value:        { fontSize: 15, fontWeight: '600', color: '#111', marginTop: 4 },
  amount:       { fontSize: 22, color: colors.primary },
  instruction:  { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  otpRow:       { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 32 },
  otpBox:       { width: 46, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#111', backgroundColor: '#F9FAFB' },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  disputeBtn:   { marginTop: 16, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#EF4444' },
  disputeText:  { color: '#EF4444', fontWeight: '600', fontSize: 14 },
});
