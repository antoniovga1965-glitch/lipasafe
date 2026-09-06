import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import LipaButton from '../components/LipaButton';
import LipaInput from '../components/LipaInput';
import { storeData } from '../utils/storage';
import { saveTokens } from '../utils/secureStorage';
import { useLang } from '../context/LanguageContext';
import { API } from '../utils/api';

export default function SetPINScreen({ navigation, route }) {
  const { t } = useLang();
  const { email } = route.params || {};
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const savePIN = async () => {
    if (step === 1) { setStep(2); return; }
    if (pin !== confirm) { setError(t.pinMismatch); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message);
      await saveTokens(data.accessToken, data.refreshToken);
      await storeData('user', data.user);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{step === 1 ? t.setPIN : t.confirmPin}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <LipaInput
        label={step === 1 ? t.setPIN : t.confirmPin}
        value={step === 1 ? pin : confirm}
        onChangeText={step === 1 ? setPin : setConfirm}
        placeholder="****"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
      />
      <LipaButton title={t.continue} onPress={savePIN} loading={loading} disabled={(step === 1 ? pin : confirm).length < 4} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, padding: 24, paddingTop: 80 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.black, marginBottom: 30 },
  error: { color: 'red', fontSize: 13, marginBottom: 12 },
});
