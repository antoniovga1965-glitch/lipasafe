
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
  const { platformFee, buyerTotal } = parsedAmount > 0 ? calcFeesGeneric(parsedAmount) : { platformFee: 0, buyerTotal: 0 };
  
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
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.infoText}>
              Enter their phone and amount. They'll get an SMS with a link to pay or reject within 24 hours.
            </Text>
          </View>

          {/* Recipient Phone */}
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={18} color={colors.grayDark} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="Recipient phone (07XX...)"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={v => { setPhone(v); setError(''); }}
              maxLength={12}
            />
          </View>

          {/* Amount */}
          <View style={styles.inputRow}>
            <Text style={styles.kesPrefix}>KES</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="0.00"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={amount}
              onChangeText={v => { setAmount(v); setError(''); }}
            />
          </View>

          {/* Purpose Dropdown */}
          <TouchableOpacity
            style={styles.purposeRow}
            onPress={() => setShowPurposePicker(!showPurposePicker)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons
                name={PURPOSES.find(p => p.key === purpose)?.icon || 'list-outline'}
                size={18}
                color={colors.grayDark}
                style={{ marginRight: 8 }}
              />
              <Text style={purpose ? styles.purposeTextSelected : styles.purposeTextPlaceholder}>
                {purpose ? selectedPurposeLabel : 'Select purpose...'}
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
          <View style={[styles.inputRow, { alignItems: 'flex-start', paddingVertical: 10 }]}>
            <Ionicons name="document-text-outline" size={18} color={colors.grayDark} style={{ marginRight: 8, marginTop: 4 }} />
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
              placeholder="Add a note (optional) — e.g. Rent June"
              placeholderTextColor="#999"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={100}
            />
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

          <Text style={styles.disclaimer}>
            The recipient will receive an SMS with a secure link to complete payment. Requests expire after 24 hours.
          </Text>
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
});