
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';
import { calcFeesGeneric } from '../utils/feeCalculator';

const PURPOSES = [
  { key: 'RENT', label: 'Rent', icon: 'home-outline' },
  { key: 'SALARY', label: 'Salary', icon: 'cash-outline' },
  { key: 'SCHOOL_FEES', label: 'School Fees', icon: 'school-outline' },
  { key: 'PURCHASE', label: 'Purchase', icon: 'cart-outline' },
  { key: 'LOAN', label: 'Loan Repayment', icon: 'repeat-outline' },
  { key: 'GIFT', label: 'Gift', icon: 'gift-outline' },
  { key: 'OTHER', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export default function RequestMoneyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPurposePicker, setShowPurposePicker] = useState(false);

  const parsedAmount = parseFloat(amount) || 0;
  const { platformFee, b2cCost, buyerTotal } = parsedAmount > 0 ? calcFeesGeneric(parsedAmount) : { platformFee: 0, b2cCost: 0, buyerTotal: 0 };
  
  const totalDue = buyerTotal;
  const canRequest = phone.length >= 9 && parsedAmount >= 10 && purpose !== '';

  const selectedPurposeLabel = PURPOSES.find(p => p.key === purpose)?.label || '';

  const onRequest = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authFetch('/request-money', {
        method: 'POST',
        body: JSON.stringify({
          recipientPhone: phone,
          amount: parsedAmount,
          purpose,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || 'Request failed');
        setLoading(false);
        return;
      }

      // Success — navigate to confirmation
      navigation.navigate('RequestSuccess', {
        requestId: data.request.id,
        recipientPhone: phone,
        amount: parsedAmount,
        purpose: selectedPurposeLabel,
      });
    } catch (e) {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Request Money</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

          {/* Info Banner */}
          <View style={styles.infoBox}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="information-circle" size={16} color={colors.primary} />
            </View>
            <Text style={styles.infoText}>
              Enter their phone and amount. They'll get an SMS with a link to pay or reject within 24 hours.
            </Text>
          </View>

          {/* Recipient Phone */}
          <View style={styles.card}>
            <View style={styles.cardIconCircle}>
              <Ionicons name="call" size={16} color={colors.primary} />
            </View>
            <View style={styles.cardFieldWrap}>
              <Text style={styles.cardLabel}>Recipient Phone</Text>
              <TextInput
                style={styles.cardInput}
                placeholder="07XX XXX XXX"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={v => { setPhone(v); setError(''); }}
                maxLength={12}
              />
            </View>
          </View>

          {/* Amount */}
          <View style={styles.card}>
            <View style={styles.cardIconCircle}>
              <Text style={styles.kesIconText}>KES</Text>
            </View>
            <View style={styles.cardFieldWrap}>
              <Text style={styles.cardLabel}>Amount</Text>
              <TextInput
                style={styles.cardInput}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={amount}
                onChangeText={v => { setAmount(v); setError(''); }}
              />
            </View>
            <View style={styles.kesBadge}>
              <Text style={styles.kesBadgeText}>KES</Text>
            </View>
          </View>

          {/* Purpose Dropdown */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => setShowPurposePicker(!showPurposePicker)}
          >
            <View style={styles.cardIconCircle}>
              <Ionicons
                name={PURPOSES.find(p => p.key === purpose)?.icon || 'list-outline'}
                size={16}
                color={colors.primary}
              />
            </View>
            <View style={styles.cardFieldWrap}>
              <Text style={styles.cardLabel}>Purpose</Text>
              <Text style={purpose ? styles.purposeTextSelected : styles.purposeTextPlaceholder}>
                {purpose ? selectedPurposeLabel : 'Choose a purpose'}
              </Text>
            </View>
            <Ionicons
              name={showPurposePicker ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.grayDark}
            />
          </TouchableOpacity>

          {/* Purpose Options */}
          {showPurposePicker && (
            <View style={styles.purposeOptions}>
              {PURPOSES.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[
                    styles.purposeOption,
                    purpose === p.key && styles.purposeOptionActive
                  ]}
                  onPress={() => {
                    setPurpose(p.key);
                    setShowPurposePicker(false);
                    setError('');
                  }}
                >
                  <Ionicons
                    name={p.icon}
                    size={16}
                    color={purpose === p.key ? colors.primary : colors.grayDark}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[
                    styles.purposeOptionText,
                    purpose === p.key && styles.purposeOptionTextActive
                  ]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Optional Note */}
          <View style={[styles.card, { alignItems: 'flex-start' }]}>
            <View style={[styles.cardIconCircle, { marginTop: 2 }]}>
              <Ionicons name="document-text" size={16} color={colors.primary} />
            </View>
            <View style={styles.cardFieldWrap}>
              <Text style={styles.cardLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.cardInput, { height: 50, textAlignVertical: 'top' }]}
                placeholder="e.g. Rent June"
                placeholderTextColor="#999"
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={100}
              />
              <Text style={styles.charCount}>{note.length} / 100</Text>
            </View>
          </View>

          {/* Summary */}
          {parsedAmount >= 1 && (
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>You request</Text>
                <Text style={styles.summaryValue}>KES {parsedAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Platform fee</Text>
                <Text style={styles.summaryValue}>KES {platformFee.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>M-Pesa charge</Text>
                <Text style={styles.summaryValue}>KES {b2cCost.toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#e0e0e0' }]}>
                <Text style={[styles.summaryLabel, { fontWeight: '700' }]}>They pay</Text>
                <Text style={[styles.summaryValue, { fontWeight: '700', color: colors.primary }]}>
                  KES {totalDue.toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          {/* Error */}
          {!!error && (
            <View style={styles.errorRow}>
              <Ionicons name="warning-outline" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.sendBtn, !canRequest && styles.sendBtnDisabled]}
            disabled={!canRequest || loading}
            onPress={onRequest}
          >
            {loading
              ? <ActivityIndicator size="small" color={colors.white} />
              : <>
                  <Ionicons name="paper-plane-outline" size={18} color={colors.white} />
                  <Text style={styles.sendBtnText}>Send Request</Text>
                </>
            }
          </TouchableOpacity>

          <View style={styles.trustBox}>
            <View style={styles.trustIconCircle}>
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>Secure. Fast. Reliable.</Text>
              <Text style={styles.trustSub}>The recipient gets an SMS with a secure link. Requests expire after 24 hours.</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray || '#eee',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.black },
  content: { padding: 20 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0FBF6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 13, color: '#444', lineHeight: 18 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border || '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: colors.gray || '#f5f5f5',
  },
  kesPrefix: { fontSize: 16, fontWeight: '700', color: colors.black, marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: colors.black },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border || '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: colors.gray || '#f5f5f5',
  },
  purposeTextSelected: { fontSize: 16, color: colors.black },
  purposeTextPlaceholder: { fontSize: 16, color: '#999' },
  purposeOptions: {
    borderWidth: 1,
    borderColor: colors.border || '#ddd',
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  purposeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  purposeOptionActive: { backgroundColor: '#F0FBF6' },
  purposeOptionText: { fontSize: 15, color: '#444' },
  purposeOptionTextActive: { color: colors.primary, fontWeight: '600' },
  summaryBox: {
    backgroundColor: '#F0FBF6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: { fontSize: 14, color: '#666' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: colors.black },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  errorText: { fontSize: 12, color: colors.error, flex: 1 },
  sendBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },

  infoIconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, marginBottom: 12, gap: 12 },
  cardIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0FBF6', alignItems: 'center', justifyContent: 'center' },
  cardFieldWrap: { flex: 1 },
  cardLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  cardInput: { fontSize: 16, fontWeight: '600', color: colors.black, padding: 0 },
  kesIconText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  kesBadge: { backgroundColor: '#f3f4f6', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  kesBadgeText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  charCount: { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 2 },

  trustBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FBF6', borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 12 },
  trustIconCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  trustTitle: { fontSize: 13, fontWeight: '700', color: '#14532d' },
  trustSub: { fontSize: 12, color: '#166534', marginTop: 2, lineHeight: 16 },
});