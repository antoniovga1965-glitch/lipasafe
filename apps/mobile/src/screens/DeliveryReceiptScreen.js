import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Image, StyleSheet, TextInput,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

function useCountdown(timerEnd) {
  const [timeLeft, setTimeLeft] = useState('');
  const [overdue, setOverdue]   = useState(false);
  useEffect(() => {
    if (!timerEnd) return;
    const tick = () => {
      const diff = new Date(timerEnd) - Date.now();
      if (diff <= 0) { setTimeLeft('00:00:00'); setOverdue(true); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerEnd]);
  return { timeLeft, overdue };
}

export default function DeliveryReceiptScreen({ navigation, route }) {
  const { orderId, goods, amount, deliveryPhone, timerEnd, isHighRisk } = route.params || {};
  const { timeLeft, overdue } = useCountdown(timerEnd);

  const [otp, setOtp]           = useState(['', '', '', '', '', '']);
  const [otpConfirmed, setOtpConfirmed] = useState(false);
  const [photo, setPhoto]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputs                  = useRef([]);

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

  const verifyOtp = async () => {
    if (enteredOtp.length !== 6) { Alert.alert('Incomplete', 'Enter all 6 digits.'); return; }
    try {
      setLoading(true);
      const res = await authFetch('/delivery/verify-receipt-otp', {
        method: 'POST',
        body: JSON.stringify({ orderId, otp: enteredOtp }),
      });
      const data = await res.json();
      if (data.success) {
        setOtpConfirmed(true);
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

  const pickPhoto = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', fromCamera ? 'Camera access needed.' : 'Gallery access needed.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.[0]) setPhoto(result.assets[0]);
  };

  const showPickerOptions = () => {
    Alert.alert('AFTER Photo', 'Take a photo of the goods as received.', [
      { text: 'Use Camera',   onPress: () => pickPhoto(true)  },
      { text: 'From Gallery', onPress: () => pickPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const markReceived = async () => {
    if (isHighRisk && !photo) {
      Alert.alert(
        ' Photo Required',
        'This delivery guy has a high dispute count. An AFTER photo is required before payment is released.',
        [{ text: 'Take Photo', onPress: showPickerOptions }]
      );
      return;
    }

    try {
      setSubmitting(true);

      // Upload AFTER photo if provided
      if (photo) {
        const formData = new FormData();
        formData.append('photo', { uri: photo.uri, type: 'image/jpeg', name: `after_${orderId}_${Date.now()}.jpg` });
        formData.append('orderId', orderId);
        await authFetch('/delivery/after-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/form-data' },
          body: formData,
        });
      }

      // Mark received + trigger payment
      const res = await authFetch('/delivery/mark-received', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert(
          'Delivery Confirmed!',
          `Payment of KES ${parseFloat(amount || 0).toFixed(2)} is being sent to the delivery guy.`,
          [{ text: 'Done', onPress: () => navigation.navigate('HomeTab') }]
        );
      } else {
        Alert.alert('Error', data.message || 'Could not confirm delivery.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Confirm Receipt" navigation={navigation} />
      <View style={styles.content}>

        {/* Timer */}
        <View style={[styles.timerBox, overdue && styles.timerBoxOverdue]}>
          <Text style={styles.timerLabel}>{overdue ? ' Delivery Overdue' : '⏱ Time Remaining'}</Text>
          <Text style={[styles.timerValue, overdue && styles.timerValueOverdue]}>{timeLeft}</Text>
        </View>

        {/* Order Summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount in Escrow</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
          <Text style={styles.cardLabel}>Delivery Guy</Text>
          <Text style={styles.cardValue}>{deliveryPhone}</Text>
        </View>

        {isHighRisk && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}> High Risk Delivery Guy</Text>
            <Text style={styles.warningText}>
              This delivery guy has 5+ disputes. An AFTER photo is required before payment is released.
            </Text>
          </View>
        )}

        {/* OTP Entry */}
        {!otpConfirmed ? (
          <>
            <Text style={styles.sectionTitle}>Step 1 — Enter Your Receipt OTP</Text>
            <Text style={styles.sectionHint}>Check your SMS for the 6-digit OTP.</Text>
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
            {loading && <ActivityIndicator style={{ marginBottom: 12 }} color={colors.primary} />}
            <LipaButton
              title={loading ? 'Verifying...' : 'Verify OTP'}
              onPress={verifyOtp}
              disabled={enteredOtp.length !== 6 || loading}
            />
          </>
        ) : (
          <>
            <View style={styles.otpSuccess}>
              <Text style={styles.otpSuccessText}> OTP Verified</Text>
            </View>

            {/* Step 2 — After Photo */}
            <Text style={styles.sectionTitle}>
              Step 2 — {isHighRisk ? 'After Photo (Required)' : 'After Photo (Optional)'}
            </Text>
            <Text style={styles.sectionHint}>
              {isHighRisk
                ? 'Required because this delivery guy has a high dispute count.'
                : 'Take a photo of the goods as received. Useful if a dispute arises later.'}
            </Text>

            <TouchableOpacity style={styles.photoBox} onPress={showPickerOptions}>
              {photo ? (
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoIcon}>📷</Text>
                  <Text style={styles.photoHint}>Tap to take or pick a photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {photo && (
              <TouchableOpacity style={styles.retakeBtn} onPress={showPickerOptions}>
                <Text style={styles.retakeText}>Retake / Change Photo</Text>
              </TouchableOpacity>
            )}

            {submitting && <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />}

            <LipaButton
              title={submitting ? 'Processing Payment...' : ' Mark as Received & Release Payment'}
              onPress={markReceived}
              disabled={submitting}
            />
          </>
        )}

        <TouchableOpacity
          style={styles.disputeBtn}
          onPress={() => navigation.navigate('Dispute', {
            orderId,
            type: 'delivery',
            claimerType: 'BUYER',
          })}
        >
          <Text style={styles.disputeBtnText}> Something Wrong? Open Dispute</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#ffffff' },
  content:          { padding: 20 },
  timerBox:         { backgroundColor: '#e8f5e9', borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center', borderWidth: 2, borderColor: '#4caf50' },
  timerBoxOverdue:  { backgroundColor: '#fff3e0', borderColor: '#f59e0b' },
  timerLabel:       { fontSize: 13, color: '#1b5e20', fontWeight: '600', marginBottom: 6 },
  timerValue:       { fontSize: 36, fontWeight: '800', color: '#1b5e20', letterSpacing: 3 },
  timerValueOverdue:{ color: '#e65100' },
  card:             { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 20 },
  cardLabel:        { fontSize: 12, color: '#666666', marginTop: 10 },
  cardValue:        { fontSize: 15, fontWeight: '600', color: '#000000', marginTop: 2 },
  amount:           { fontSize: 18, color: colors.primary },
  warningBox:       { backgroundColor: '#fff3e0', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  warningTitle:     { fontWeight: '700', fontSize: 14, color: '#92400e', marginBottom: 6 },
  warningText:      { fontSize: 13, color: '#92400e', lineHeight: 20 },
  sectionTitle:     { fontSize: 15, fontWeight: '700', color: '#000000', marginBottom: 4 },
  sectionHint:      { fontSize: 13, color: '#666666', marginBottom: 16 },
  otpRow:           { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  otpBox:           { width: 48, height: 56, borderWidth: 2, borderColor: '#dddddd', borderRadius: 12, textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#000000', backgroundColor: '#f9f9f9' },
  otpBoxFilled:     { borderColor: colors.primary, backgroundColor: '#ffffff' },
  otpSuccess:       { backgroundColor: '#e8f5e9', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 20 },
  otpSuccessText:   { color: '#1b5e20', fontWeight: '700', fontSize: 15 },
  photoBox:         { borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 2, borderColor: '#dddddd', borderStyle: 'dashed', height: 240 },
  photoPreview:     { width: '100%', height: '100%', resizeMode: 'cover' },
  disputeBtn:       { marginTop: 12, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e53e3e' },
  disputeBtnText:   { color: '#e53e3e', fontWeight: '600', fontSize: 15 },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9f9f9' },
  photoIcon:        { fontSize: 48, marginBottom: 12 },
  photoHint:        { fontSize: 14, color: '#999999' },
  retakeBtn:        { alignItems: 'center', marginBottom: 16 },
  retakeText:       { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
