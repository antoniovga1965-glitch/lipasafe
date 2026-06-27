import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import LipaHeader from '../components/LipaHeader';
import LipaInput from '../components/LipaInput';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

import { PLATFORM_RATE } from '../utils/feeCalculator'
const FEE_RATE = PLATFORM_RATE;

export default function CustomPaymentScreen({ navigation }) {
  const { t } = useLang();
  const [seller,      setSeller]      = useState('');
  const [description, setDescription] = useState('');
  const [amount,      setAmount]      = useState('');

  const parsed      = parseFloat(amount) || 0;
  const platformFee = parsed >= 10 ? Math.ceil(parsed * FEE_RATE) : 0;
  const total       = parsed + platformFee;

  const valid =
    seller.trim().length >= 9 &&
    description.trim().length >= 5 &&
    parsed >= 10;

  const next = () => {
    if (!valid) return;
    navigation.navigate('ConfirmPayment', {
      service:     'Custom',
      seller:      seller.trim(),
      amount:      parsed,
      description: description.trim(),
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LipaHeader title="Custom Payment" navigation={navigation} onBack={() => navigation.navigate('HomeTab')} />

        <View style={styles.banner}>
          <Ionicons name="flash" size={16} color={colors.primary} />
          <Text style={styles.bannerText}>Quick direct payment — no escrow holding.</Text>
        </View>

        <View style={styles.content}>
          <LipaInput
            label="Recipient Phone / Till *"
            value={seller}
            onChangeText={setSeller}
            placeholder="07XX XXX XXX or Till No."
            keyboardType="phone-pad"
          />

          <LipaInput
            label="Description *"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this payment for?"
          />
          {description.length > 0 && description.trim().length < 5 && (
            <Text style={styles.error}>Description too short</Text>
          )}

          <LipaInput
            label="Amount (KES) *"
            value={amount}
            onChangeText={setAmount}
            placeholder="Min KES 10"
            keyboardType="decimal-pad"
          />
          {parsed > 0 && parsed < 10 && (
            <Text style={styles.error}>Minimum amount is KES 10</Text>
          )}

          {parsed >= 10 && (
            <View style={styles.breakdown}>
              <View style={styles.bRow}>
                <Text style={styles.bLabel}>Amount</Text>
                <Text style={styles.bValue}>KES {parsed.toLocaleString()}</Text>
              </View>
              <View style={styles.bRow}>
                <Text style={styles.bLabel}>LipaSafe fee (2%)</Text>
                <Text style={styles.bValue}>KES {platformFee.toLocaleString()}</Text>
              </View>
              <View style={[styles.bRow, styles.bTotal]}>
                <Text style={styles.bTotalLabel}>You pay via M-Pesa</Text>
                <Text style={styles.bTotalValue}>KES {total.toLocaleString()}</Text>
              </View>
            </View>
          )}

          <LipaButton title={t.continue} onPress={next} disabled={!valid} />

          <Text style={styles.note}>
            💡 For large or risky deals, use Custom Escrow instead — funds are held until both parties confirm.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('CustomEscrowCreate')}>
            <Text style={styles.escrowLink}>Switch to Custom Escrow →</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.white },
  banner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5EE', marginHorizontal: 16, borderRadius: 10, padding: 12, gap: 8, marginBottom: 4, marginTop: 8 },
  bannerText:   { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '500' },
  content:      { padding: 16, gap: 4 },
  error:        { color: colors.error, fontSize: 12, marginTop: 2, marginBottom: 4 },
  breakdown:    { backgroundColor: colors.gray, borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 8 },
  bRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bLabel:       { fontSize: 13, color: colors.grayDark },
  bValue:       { fontSize: 13, color: colors.black, fontWeight: '500' },
  bTotal:       { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2, marginBottom: 0 },
  bTotalLabel:  { fontSize: 14, color: colors.black, fontWeight: '700' },
  bTotalValue:  { fontSize: 14, color: colors.primary, fontWeight: '700' },
  note:         { fontSize: 12, color: colors.grayDark, textAlign: 'center', marginTop: 16, lineHeight: 18, paddingHorizontal: 8 },
  escrowLink:   { fontSize: 13, color: colors.primary, fontWeight: '700', textAlign: 'center', marginTop: 6 },
});
