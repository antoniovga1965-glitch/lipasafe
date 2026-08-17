import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

export default function DeliveryPickupOTPScreen({ navigation, route }) {
  const { orderId, deliveryPhone, goods, amount, deadline } = route.params || {};
  console.log('PICKUP OTP PARAMS:', JSON.stringify({ orderId, deliveryPhone }));
  const [otp, setOtp]         = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const inputs                = useRef([]);

  const handleChange = (val, index) => {
    if (!/^\d*$/.test(val)) return; 
    const updated = [...otp];
    updated[index] = val;
    setOtp(updated);
    if (val && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleBackspace = (val, index) => {
    if (val === '' && index > 0) inputs.current[index - 1]?.focus();
  };

  const enteredOtp = otp.join('');

  const submitOtp = async () => {
    if (enteredOtp.length !== 6) {
      Alert.alert('Incomplete', 'Enter all 6 digits.');
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch('/delivery/enter-pickup-otp', {
        method: 'POST',
        body: JSON.stringify({ orderId, deliveryGuyPhone: deliveryPhone, otp: enteredOtp }),
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert(
          ' Timer Started!',
          `Delivery countdown has started. Deliver by ${new Date(deadline).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true })}.`,
          [{
            text: 'OK',
            onPress: () => navigation.replace('DeliveryDuringPhoto', {
              orderId,
              deliveryPhone,
              goods,
              amount,
              deadline,
              timerEnd: data.timerEnd,
            })
          }]
        );
      } else {
        Alert.alert('Invalid OTP', data.message || `Wrong OTP. ${data.attemptsRemaining ?? ''} attempts remaining.`);
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
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Enter Pickup OTP" navigation={navigation} />
      <View style={styles.content}>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>🔐 Pickup OTP</Text>
          <Text style={styles.infoText}>
            Enter the 6-digit OTP sent to your phone. This starts the delivery
            countdown timer for both you and the buyer.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
          <Text style={styles.cardLabel}>Deliver By</Text>
          <Text style={styles.cardValue}>
            {deadline ? new Date(deadline).toLocaleString('en-KE', {
              day: '2-digit', month: 'short',
              hour: '2-digit', minute: '2-digit', hour12: true
            }) : '—'}
          </Text>
        </View>

        <Text style={styles.otpLabel}>Enter OTP</Text>
        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={ref => inputs.current[i] = ref}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={val => handleChange(val, i)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace') handleBackspace(digit, i);
              }}
              keyboardType="numeric"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        {loading && <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />}

        <LipaButton
          title={loading ? 'Verifying...' : 'Submit OTP & Start Timer'}
          onPress={submitOtp}
          disabled={enteredOtp.length !== 6 || loading}
        />

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#ffffff' },
  content:      { padding: 20 },
  infoBox:      { backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#4caf50' },
  infoTitle:    { fontWeight: '700', fontSize: 14, color: '#1b5e20', marginBottom: 6 },
  infoText:     { fontSize: 13, color: '#1b5e20', lineHeight: 20 },
  card:         { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 24 },
  cardLabel:    { fontSize: 12, color: '#666666', marginTop: 10 },
  cardValue:    { fontSize: 15, fontWeight: '600', color: '#000000', marginTop: 2 },
  amount:       { fontSize: 18, color: colors.primary },
  otpLabel:     { fontSize: 14, fontWeight: '600', color: '#000000', marginBottom: 12, textAlign: 'center' },
  otpRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  otpBox:       { width: 48, height: 56, borderWidth: 2, borderColor: '#dddddd', borderRadius: 12, textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#000000', backgroundColor: '#f9f9f9' },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: '#ffffff' },
});
