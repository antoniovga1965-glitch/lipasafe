import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import LipaButton from '../components/LipaButton';
import LipaInput from '../components/LipaInput';
import { getData, storeData } from '../utils/storage';
import { saveTokens } from '../utils/secureStorage';
import { useLang } from '../context/LanguageContext';
import { API, authFetch } from '../utils/api';

export default function LoginScreen({ navigation }) {
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const logoY = useRef(new Animated.Value(-40)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const input1Opacity = useRef(new Animated.Value(0)).current;
  const input2Opacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(input1Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(input2Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const login = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message || t.wrongPIN);
      await saveTokens(data.accessToken, data.refreshToken);
      await storeData('user', data.user);
   
      const dest = data.user?.role === 'admin' ? 'AdminStack' : 'Main';
      
      navigation.reset({ index: 0, routes: [{ name: dest }] });
    } catch (e) {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.header, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
          <Text style={styles.logo}>LipaSafe</Text>
          <Text style={styles.tagline}>{t.tagline}</Text>
        </Animated.View>
        <Animated.View style={[styles.form, { opacity: cardOpacity, transform: [{ translateY: cardY }] }]}>
          <View style={styles.welcomeRow}>
            <Text style={styles.welcome}>Welcome Back</Text>
            <View style={styles.shieldBadge}>
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.sub}>Login to your secure account</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Animated.View style={{ opacity: input1Opacity }}>
            <LipaInput label={t.phone} value={phone} onChangeText={setPhone} placeholder="07XX XXX XXX" keyboardType="phone-pad" />
          </Animated.View>
          <Animated.View style={{ opacity: input2Opacity }}>
            <LipaInput label={t.pin} value={pin} onChangeText={setPin} placeholder="****" keyboardType="number-pad" secureTextEntry maxLength={4} />
          </Animated.View>
          <Animated.View style={[styles.btnWrapper, { opacity: btnOpacity }]}>
            <LipaButton title={t.login} onPress={login} loading={loading} disabled={phone.length < 9 || pin.length < 4} />
            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t.noAccount}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPIN')} style={styles.linkBtn}>
              <Text style={styles.linkText}>Forgot your PIN?</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  form: { backgroundColor: '#fff', borderRadius: 28, marginHorizontal: 16, padding: 28, elevation: 8 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  welcome: { fontSize: 24, fontWeight: '800', color: '#000' },
  shieldBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 14, color: '#888', marginBottom: 20 },
  error: { color: 'red', fontSize: 13, marginBottom: 12 },
  btnWrapper: { marginTop: 8 },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  linkText: { fontSize: 14, color: '#888', fontWeight: '500' },
});
