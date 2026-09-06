import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SPACING, SHARED_STYLES } from './diasporaTheme';
import { toForeignCurrency, CURRENCY_SYMBOLS } from './diasporaFees';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.100:4000';

export default function DiasporaPaymentInstructionsScreen({ navigation, route }) {
  const { dealId, totalAmount, referenceCode, feeBreakdown, selectedCurrency, currencyRate } = route.params || {};

  const [bank, setBank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/secretary/bank-details`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setBank(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopyReference = () => {
    Clipboard.setStringAsync(referenceCode || '');
    Alert.alert('Copied', 'Reference code copied to clipboard.');
  };

  const handleSentPayment = () => {
    navigation.navigate('DiasporaUploadEvidence', { dealId, referenceCode });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headerTitle}>Payment Instructions</Text>
        <Text style={styles.headerSubtitle}>
          Send the exact amount below to complete your deal.
        </Text>


        {feeBreakdown && selectedCurrency && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}> Payment Summary</Text>
            <View style={styles.calcRow}><Text style={styles.calcLabel}>Deal Amount</Text><Text style={styles.calcValue}>KES {feeBreakdown.amount.toLocaleString()}</Text></View>
            <View style={styles.calcRow}><Text style={styles.calcLabel}>Platform Fee</Text><Text style={styles.calcValue}>KES {feeBreakdown.platFee.toLocaleString()}</Text></View>
            <View style={styles.calcRow}><Text style={styles.calcLabel}>M-Pesa Release Fee</Text><Text style={styles.calcValue}>KES {feeBreakdown.mpesaFee.toLocaleString()}</Text></View>
            <View style={styles.calcDivider} />
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { fontWeight: '700', color: '#0F172A' }]}>Total to Send</Text>
              <Text style={[styles.calcValue, { fontWeight: '700', color: '#0F172A' }]}>KES {feeBreakdown.grandTotal.toLocaleString()}</Text>
            </View>
            <Text style={styles.foreignAmount}>{CURRENCY_SYMBOLS[selectedCurrency]} {toForeignCurrency(feeBreakdown.grandTotal, currencyRate)}</Text>
          </View>
        )}

        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 24 }} />
          ) : (
            <>
              {[
                { label: 'Bank Name',       value: bank?.bankName },
                { label: 'Account Number',  value: bank?.accountNumber },
                { label: 'Account Name',    value: bank?.accountName },
                { label: 'SWIFT Code',      value: bank?.swift },
              ].map(({ label, value }) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value}>{value || '—'}</Text>
                </View>
              ))}
            </>
          )}

          <View style={[styles.detailRow, styles.referenceRow]}>
            <Text style={styles.label}>Reference Code</Text>
            <Text style={styles.referenceValue}>{referenceCode}</Text>
          </View>

          <TouchableOpacity style={styles.copyButton} activeOpacity={0.8} onPress={handleCopyReference}>
            <Text style={styles.copyButtonText}>Copy Reference</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
             Use this reference EXACTLY as shown, or your payment cannot be matched to your deal.
          </Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Can also send via WorldRemit or Western Union to the account above.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.ctaButton} activeOpacity={0.8} onPress={handleSentPayment}>
          <Text style={styles.ctaButtonText}>I've Sent the Payment</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { ...SHARED_STYLES.container },
  scroll: { paddingHorizontal: SPACING.screenPadding, paddingTop: 24, paddingBottom: 24 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 6, marginBottom: 20, lineHeight: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  detailRow: { marginBottom: 14 },
  referenceRow: { marginBottom: 16 },
  label: { fontSize: 12, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  referenceValue: { fontSize: 18, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 },
  copyButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  copyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  warningBanner: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  warningText: { fontSize: 13, color: '#92400E', lineHeight: 20, fontWeight: '500' },
  noteCard: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  noteText: { fontSize: 13, color: '#166534', lineHeight: 20 },
  breakdownCard: { backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  breakdownTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calcLabel: { fontSize: 13, color: '#64748B' },
  calcValue: { fontSize: 13, color: '#1E293B' },
  calcDivider: { height: 1, backgroundColor: '#BBF7D0', marginVertical: 8 },
  foreignAmount: { fontSize: 26, fontWeight: '700', color: '#059669', textAlign: 'center', marginTop: 10 },
  footer: { ...SHARED_STYLES.footer },
  ctaButton: { ...SHARED_STYLES.ctaButton },
  ctaButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
