import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import LipaInput from '../components/LipaInput';
import { useLang } from '../context/LanguageContext';
import { API } from '../utils/api';

// const API = 'http://10.186.68.127:4000/auth';

export default function ForgotPINScreen({ navigation }) {
  const { t } = useLang();
  const [step, setStep] = useState(1); 
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    fadeAnim.setValue(0); slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [step]);

  const requestOTP = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/forgot-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      setStep(2);
    } catch { setError('Network error. Try again.'); }
    finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    setLoading(true); setError('');
    try {
      setStep(3);
    } finally { setLoading(false); }
  };

  const resetPIN = async () => {
    if (pin !== pinConfirm) return setError('PINs do not match.');
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, pin }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      setSuccess('PIN reset successfully!');
      setTimeout(() => navigation.navigate('Login'), 1500);
    } catch { setError('Network error. Try again.'); }
    finally { setLoading(false); }
  };

  const steps = [
    { title: 'Forgot PIN?', sub: 'Enter your phone number and we\'ll send a reset code to your email.' },
    { title: 'Check your email', sub: 'Enter the 6-digit code we sent to your registered email.' },
    { title: 'Set new PIN', sub: 'Choose a new 4-digit PIN for your account.' },
  ];

  return (
    <View style={styles.container}>
      <LipaHeader title="Forgot PIN" navigation={navigation} />
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.title}>{steps[step - 1].title}</Text>
        <Text style={styles.sub}>{steps[step - 1].sub}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        {step === 1 && (
          <>
            <LipaInput label="Phone Number" value={phone} onChangeText={setPhone} placeholder="07XX XXX XXX" keyboardType="phone-pad" />
            <LipaButton title="Send Reset Code" onPress={requestOTP} loading={loading} disabled={phone.length < 9} />
          </>
        )}
        {step === 2 && (
          <>
            <LipaInput label="Verification Code" value={otp} onChangeText={setOtp} placeholder="123456" keyboardType="number-pad" maxLength={6} />
            <LipaButton title="Verify Code" onPress={verifyOTP} loading={loading} disabled={otp.length < 6} />
            <LipaButton title="Back" onPress={() => setStep(1)} secondary />
          </>
        )}
        {step === 3 && (
          <>
            <LipaInput label="New PIN" value={pin} onChangeText={setPin} placeholder="****" keyboardType="number-pad" secureTextEntry maxLength={4} />
            <LipaInput label="Confirm PIN" value={pinConfirm} onChangeText={setPinConfirm} placeholder="****" keyboardType="number-pad" secureTextEntry maxLength={4} />
            <LipaButton title="Reset PIN" onPress={resetPIN} loading={loading} disabled={pin.length < 4 || pinConfirm.length < 4} />
            <LipaButton title="Back" onPress={() => setStep(2)} secondary />
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: 24, flex: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.black, marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 22 },
  error: { color: 'red', fontSize: 13, marginBottom: 12 },
  success: { color: colors.primary, fontSize: 14, fontWeight: '600', marginBottom: 12 },
});
