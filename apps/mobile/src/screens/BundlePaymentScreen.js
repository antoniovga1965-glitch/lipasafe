import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaInput from '../components/LipaInput';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

const METHODS = [
  { key: 'pochi', label: 'Pochi / M-Pesa', placeholder: '07XX XXX XXX', keyboard: 'phone-pad' },
  { key: 'till', label: 'Till Number', placeholder: 'e.g. 123456', keyboard: 'number-pad' },
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

  const next = () => {
    navigation.navigate('ConfirmPayment', {
      service: 'Bundles',
      method,
      sellerPhone: method === 'pochi' ? seller : undefined,
      sellerTill:  method === 'till'  ? seller : undefined,
      notifyPhone: method === 'till'  ? notifyPhone : undefined,
      amount,
      description: `Airtime/Data Bundle via ${selected.label}`,
    });
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.bundles} navigation={navigation} onBack={() => navigation.navigate('HomeTab')} />
      <View style={styles.content}>

        {/* Payment Method Toggle */}
        <Text style={styles.methodLabel}>Payment Method</Text>
        <View style={styles.toggle}>
          {METHODS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.toggleBtn, method === m.key && styles.toggleActive]}
              onPress={() => { setMethod(m.key); setSeller(''); setNotifyPhone(''); }}
            >
              <Text style={[styles.toggleText, method === m.key && styles.toggleTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <LipaInput
          label={method === 'till' ? 'Till Number' : 'Phone Number (Pochi / M-Pesa)'}
          value={seller}
          onChangeText={setSeller}
          placeholder={selected.placeholder}
          keyboardType={selected.keyboard}
        />

        {method === 'till' && (
          <LipaInput
            label="Seller Phone for Notification (optional)"
            value={notifyPhone}
            onChangeText={setNotifyPhone}
            placeholder="07XX XXX XXX"
            keyboardType="phone-pad"
          />
        )}

        <LipaInput
          label={t.amount}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <LipaButton title={t.continue} onPress={next} disabled={!isValid()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: 20 },
  methodLabel: { fontSize: 13, color: colors.textSecondary || '#888', marginBottom: 8 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary || '#1a9e5c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: { fontSize: 14, color: '#666', fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
});