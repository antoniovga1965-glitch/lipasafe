import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useLang } from '../context/LanguageContext';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import LipaInput from '../components/LipaInput';
import { API } from '../utils/api';
import { storeData } from '../utils/storage';

export default function RegisterScreen({ navigation }) {
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOTP = async () => {
    if (!name || phone.length < 9 || !email) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, fullName: name, email }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      setStep(2);
    } catch (e) {
      setError(e.message || 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length < 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      storeData('user', { phone, name, email });
      navigation.navigate('SetPIN', { email });
    } catch (e) {
      setError(e.message || 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.register} navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>
        {step === 1 ? (
          <>
            <Text style={styles.heading}>{t.createAccount}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <LipaInput label={t.name} value={name} onChangeText={setName} placeholder={t.enterName} />
            <LipaInput label={t.phone} value={phone} onChangeText={setPhone} placeholder="07XX XXX XXX" keyboardType="phone-pad" />
            <LipaInput label="Email" value={email} onChangeText={setEmail} placeholder="you@gmail.com" keyboardType="email-address" />
            <LipaButton title={t.continue} onPress={sendOTP} disabled={!name || phone.length < 9 || !email} loading={loading} />
            <LipaButton title={t.haveAccount} onPress={() => navigation.navigate('Login')} secondary />
          </>
        ) : (
          <>
            <Text style={styles.heading}>{t.enterOTP} {email}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <LipaInput label={t.otp} value={otp} onChangeText={setOtp} placeholder="123456" keyboardType="number-pad" secureTextEntry maxLength={6} />
            <LipaButton title={t.confirm} onPress={verifyOTP} disabled={otp.length < 4} loading={loading} />
            <LipaButton title={t.back} onPress={() => setStep(1)} secondary />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: 20 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: colors.black },
  error: { color: 'red', marginBottom: 12, fontSize: 13 },
});