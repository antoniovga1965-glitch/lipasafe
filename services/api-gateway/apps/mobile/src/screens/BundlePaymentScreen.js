
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Platform, Alert } from 'react-native';
import { authFetch } from '../utils/api';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaInput from '../components/LipaInput';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

const GREEN = colors.primary || '#1a9e5c';
const GREEN_LIGHT = '#e8f5ee';

const METHODS = [
  { key: 'pochi', label: 'Pochi / M-Pesa', placeholder: '07XX XXX XXX', keyboard: 'phone-pad', icon: 'smartphone' },
  { key: 'till', label: 'Till Number', placeholder: 'e.g. 123456', keyboard: 'number-pad', icon: 'hash' },
];

export default function BundlePaymentScreen({ navigation }) {
  const { t } = useLang();
  const [method, setMethod] = useState('pochi');
  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState('');
  const [notifyPhone, setNotifyPhone] = useState('');
  const selected = METHODS.find(m => m.key === method);

  const isValid = () => {
    if (!seller || !amount) return false;
    if (method === 'till' && !notifyPhone) return false;
    if (method === 'till' && !/^(?:254|0|\+254)?[17]\d{8}$/.test(notifyPhone)) return false;
    return true;
  };

  const next = async () => {
    const phoneToCheck = method === 'pochi' ? seller : notifyPhone;
    try {
      const res  = await authFetch(`/user/resolve-phone?phone=${phoneToCheck}`)
      const data = await res.json()
      const label = data.found ? data.name : `${phoneToCheck} (Not on LipaSafe)`
      Alert.alert(
        'Confirm Recipient',
        `You are paying:\n\n${label}\n\nKES ${amount}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: () => navigation.navigate('ConfirmPayment', {
              service: 'Bundles',
              method,
              sellerPhone: method === 'pochi' ? seller : undefined,
              sellerTill:  method === 'till'  ? seller : undefined,
              notifyPhone: method === 'till'  ? notifyPhone : undefined,
              amount,
              description: `Airtime/Data Bundle via ${selected.label}`,
            })
          }
        ]
      )
    } catch {
      navigation.navigate('ConfirmPayment', {
        service: 'Bundles',
        method,
        sellerPhone: method === 'pochi' ? seller : undefined,
        sellerTill:  method === 'till'  ? seller : undefined,
        notifyPhone: method === 'till'  ? notifyPhone : undefined,
        amount,
        description: `Airtime/Data Bundle via ${selected.label}`,
      })
    }
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.bundles} navigation={navigation} onBack={() => navigation.navigate('HomeTab')} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 80 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

        <View style={styles.card}>
          <Text style={styles.methodLabel}>Payment Method</Text>
          <View style={styles.toggle}>
            {METHODS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.toggleBtn, method === m.key && styles.toggleActive]}
                onPress={() => { setMethod(m.key); setSeller(''); setNotifyPhone(''); }}
              >
                <Feather
                  name={m.icon}
                  size={15}
                  color={method === m.key ? '#fff' : '#6b7280'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.toggleText, method === m.key && styles.toggleTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.iconBox}>
              <Feather name={selected.icon} size={16} color={GREEN} />
            </View>
            <View style={styles.inputFlex}>
              <LipaInput
                label={method === 'till' ? 'Till Number' : 'Phone Number (Pochi / M-Pesa)'}
                value={seller}
                onChangeText={setSeller}
                placeholder={selected.placeholder}
                keyboardType={selected.keyboard}
              />
            </View>
          </View>

          {method === 'till' && (
            <View style={styles.inputRow}>
              <View style={styles.iconBox}>
                <Feather name="phone" size={16} color={GREEN} />
              </View>
              <View style={styles.inputFlex}>
                <LipaInput
                  label="Seller Phone for Notification (optional)"
                  value={notifyPhone}
                  onChangeText={setNotifyPhone}
                  placeholder="07XX XXX XXX"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          )}

          <View style={styles.inputRow}>
            <View style={styles.iconBox}>
              <Feather name="credit-card" size={16} color={GREEN} />
            </View>
            <View style={styles.inputFlex}>
              <LipaInput
                label={t.amount}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.securityNote}>
          <Feather name="shield" size={16} color="#166534" />
          <Text style={styles.securityText}>Payments are secure and processed instantly</Text>
          <Feather name="lock" size={14} color="#166534" />
        </View>

        <LipaButton title={t.continue} onPress={next} disabled={!isValid()} />

        <View style={styles.featureRow}>
          <View style={styles.featureItem}>
            <View style={styles.featureIconBox}><Feather name="shield" size={16} color={GREEN} /></View>
            <Text style={styles.featureTitle}>Secure</Text>
            <Text style={styles.featureSub}>Payments protected</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureIconBox}><Feather name="zap" size={16} color={GREEN} /></View>
            <Text style={styles.featureTitle}>Instant</Text>
            <Text style={styles.featureSub}>Delivered instantly</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureIconBox}><Feather name="headphones" size={16} color={GREEN} /></View>
            <Text style={styles.featureTitle}>Support</Text>
            <Text style={styles.featureSub}>24/7 available</Text>
          </View>
        </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 16 },

  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f2f4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  methodLabel: { fontSize: 13, color: '#6b7280', marginBottom: 8, fontWeight: '500' },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: GREEN,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: { fontSize: 13, color: '#666', fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: GREEN_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  inputFlex: { flex: 1 },

  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GREEN_LIGHT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  securityText: { flex: 1, fontSize: 12.5, color: '#166534', fontWeight: '500' },

  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f2f4',
  },
  featureItem: { flex: 1, alignItems: 'center', gap: 4 },
  featureIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GREEN_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  featureTitle: { fontSize: 12.5, fontWeight: '700', color: '#1f2937' },
  featureSub: { fontSize: 10.5, color: '#9ca3af', textAlign: 'center' },
});