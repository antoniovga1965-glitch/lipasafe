import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import LipaButton from '../components/LipaButton';
import LipaInput from '../components/LipaInput';
import LipaHeader from '../components/LipaHeader';
import { authFetch } from '../utils/api';

// step 1 = request otp, 2 = enter otp, 3 = old pin, 4 = new pin, 5 = confirm new pin
export default function ChangePinScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestOtp = async () => {
    setLoading(true); setError('');
    try {
      const res = await authFetch('/auth/change-pin/request-otp', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      setStep(2);
    } catch (e) {
      setError(e.message || 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return setError('Enter the 6-digit code');
    setLoading(true); setError('');
    try {
      const res = await authFetch('/auth/change-pin/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      setStep(3);
    } catch (e) {
      setError(e.message || 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const goToNewPin = () => {
    if (oldPin.length !== 4) return setError('Enter your current 4-digit PIN');
    setError('');
    setStep(4);
  };

  const goToConfirmPin = () => {
    if (newPin.length !== 4) return setError('Enter a new 4-digit PIN');
    setError('');
    setStep(5);
  };

  const submitChange = async () => {
    if (confirmPin !== newPin) {
      setError('PINs do not match');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await authFetch('/auth/change-pin/confirm', {
        method: 'POST',
        body: JSON.stringify({ oldPin, newPin }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      navigation.goBack();
    } catch (e) {
      setError(e.message || 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    1: 'Change your PIN',
    2: 'Enter the code we emailed you',
    3: 'Enter your current PIN',
    4: 'Choose a new PIN',
    5: 'Confirm your new PIN',
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={titles[step]} navigation={navigation} />
      <View style={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 1 && (
          <>
            <Text style={styles.subtext}>
              For your security, we'll send a verification code to your registered email before you can change your PIN.
            </Text>
            <LipaButton title="Send code" onPress={requestOtp} loading={loading} />
          </>
        )}

        {step === 2 && (
          <>
            <LipaInput
              label="6-digit code"
              value={otp}
              onChangeText={setOtp}
              placeholder="------"
              keyboardType="number-pad"
              maxLength={6}
            />
            <LipaButton title="Verify" onPress={verifyOtp} loading={loading} disabled={otp.length < 6} />
          </>
        )}

        {step === 3 && (
          <>
            <LipaInput
              label="Current PIN"
              value={oldPin}
              onChangeText={setOldPin}
              placeholder="****"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <LipaButton title="Continue" onPress={goToNewPin} disabled={oldPin.length < 4} />
          </>
        )}

        {step === 4 && (
          <>
            <LipaInput
              label="New PIN"
              value={newPin}
              onChangeText={setNewPin}
              placeholder="****"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <LipaButton title="Continue" onPress={goToConfirmPin} disabled={newPin.length < 4} />
          </>
        )}

        {step === 5 && (
          <>
            <LipaInput
              label="Confirm new PIN"
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder="****"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <LipaButton title="Save PIN" onPress={submitChange} loading={loading} disabled={confirmPin.length < 4} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: 24, paddingTop: 30 },
  subtext: { fontSize: 14, color: colors.grayDark, marginBottom: 24, lineHeight: 20 },
  error: { color: 'red', fontSize: 13, marginBottom: 16 },
});
