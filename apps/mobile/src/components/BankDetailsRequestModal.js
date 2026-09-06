import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNotifications } from '../context/NotificationContext';
import { authFetch } from '../utils/api';
import { colors } from '../theme/colors';

export default function BankDetailsRequestModal() {
  const { bankDetailsRequest, clearBankDetailsRequest } = useNotifications();
  const [bankName, setBankName]   = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState(null);

  const visible = !!bankDetailsRequest;

  // Mirrors server validation exactly (diaspora.controller.js: z.object({ bankName: min(2), accountNo: min(5) }))
  // so the user sees the same error client-side instead of a 400 with no context.
  const validate = () => {
    if (bankName.trim().length < 2) return 'Bank name must be at least 2 characters';
    if (accountNo.trim().length < 5) return 'Account number must be at least 5 characters';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(
        `/diaspora/disputes/${bankDetailsRequest.disputeId}/submit-bank-details`,
        {
          method: 'POST',
          body: JSON.stringify({ bankName: bankName.trim(), accountNo: accountNo.trim() }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to submit bank details');
      }
      setBankName('');
      setAccountNo('');
      clearBankDetailsRequest();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Bank Details Needed</Text>
          <Text style={styles.message}>
            {bankDetailsRequest?.message || 'LipaSafe needs your bank details to process your refund'}
          </Text>

          <Text style={styles.label}>Bank Name</Text>
          <TextInput
            style={styles.input}
            value={bankName}
            onChangeText={setBankName}
            placeholder="e.g. Equity Bank"
            placeholderTextColor={colors.subtext}
            editable={!submitting}
          />

          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            value={accountNo}
            onChangeText={setAccountNo}
            placeholder="e.g. 0123456789"
            placeholderTextColor={colors.subtext}
            keyboardType="number-pad"
            editable={!submitting}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.submitText}>Submit</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  message: {
    fontSize: 13,
    color: colors.subtext,
    marginBottom: 16,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  error: {
    color: colors.error,
    fontSize: 12,
    marginTop: 10,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
