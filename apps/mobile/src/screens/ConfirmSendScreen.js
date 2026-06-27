import React, { useState, useEffect } from 'react';
import { calcFee, calcTotal, calcFeesInstantSend, PLATFORM_RATE } from '../utils/feeCalculator'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';

const PURPOSE_LABELS = {
  RENT: 'Rent',
  PURCHASE: 'Purchase',
  SALARY: 'Salary',
  SCHOOL_FEES: 'School Fees',
  LOAN: 'Loan',
  GIFT: 'Gift',
  OTHER: 'Other',
};

export default function ConfirmSendScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { type = 'INSTANT', phone, amount, pin, purpose, note } = route.params;
  const isProtected = type === 'PROTECTED';
  const { platformFee, b2cCharge, totalDeduct } = calcFeesInstantSend(amount)
  const fee   = platformFee.toFixed ? platformFee.toFixed(2) : Number(platformFee).toFixed(2)
  const total = totalDeduct.toFixed ? totalDeduct.toFixed(2) : Number(totalDeduct).toFixed(2)

  const [recipientStatus, setRecipientStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const checkRecipient = async () => {
      try {
        const res = await authFetch(`/wallet/check-phone/${phone}`);
        const data = await res.json();
        setRecipientStatus(data.exists ? 'registered' : 'ghost');
      } catch {
        setRecipientStatus('ghost');
      } finally {
        setChecking(false);
      }
    };
    checkRecipient();
  }, [phone]);

  const handleSend = async () => {
    setSending(true);
    try {
      if (isProtected) {
        const res = await authFetch('/transfer/initiate', {
          method: 'POST',
          body: JSON.stringify({
            recipientPhone: phone,
            amount,
            purpose,
            description: note,
            type: 'PROTECTED',
          }),
        });
        const data = await res.json();
        if (data.success) {
          navigation.navigate('PaymentProcessing', {
            checkoutId: data.checkoutRequestId,
            context: 'protectedTransfer',
            transferId: data.transferId,
            amount,
          });
        } else {
          Alert.alert('SafeSend failed', data.message || 'Something went wrong');
        }
      } else {
        const res = await authFetch('/wallet/send', {
          method: 'POST',
          body: JSON.stringify({ recipientPhone: phone, amount, pin }),
        });
        const data = await res.json();
        if (data.success && data.fallback === 'stk') {
          Alert.alert(
            'M-Pesa Prompt Sent',
            'Your wallet balance was insufficient. We sent an M-Pesa prompt to complete the send.',
            [{ text: 'OK', onPress: () => navigation.navigate('HomeTab', { screen: 'HomeMain' }) }]
          );
        } else if (data.success) {
          navigation.replace('PaymentSuccess', {
            tx: { id: data.reference, total: parseFloat(amount).toFixed(2) }
          });
        } else {
          Alert.alert('Send failed', data.message || 'Something went wrong');
        }
      }
    } catch (e) {
      Alert.alert('Send failed', 'Please try again');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isProtected ? 'Confirm SafeSend' : 'Confirm Send'}</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>{isProtected ? 'You are SafeSending' : 'You are sending'}</Text>
          <Text style={styles.amountValue}>KES {parseFloat(amount).toFixed(2)}</Text>
          {isProtected && (
            <View style={styles.protectedBadge}>
              <Ionicons name="shield-checkmark" size={13} color={colors.white} />
              <Text style={styles.protectedBadgeText}>Protected until accepted</Text>
            </View>
          )}
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Recipient</Text>
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color={colors.grayDark} />
            <Text style={styles.detailText}>{phone}</Text>
          </View>
          <View style={styles.detailRow}>
            {checking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : recipientStatus === 'registered' ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#00A86B" />
                <Text style={[styles.detailText, { color: '#00A86B' }]}>
                  {isProtected ? 'LipaSafe user — will be notified to accept' : 'LipaSafe user — instant delivery'}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="information-circle-outline" size={16} color="#FF9500" />
                <Text style={[styles.detailText, { color: '#FF9500' }]}>
                  {isProtected ? 'Not on LipaSafe — will get an SMS with a claim code' : 'Not on LipaSafe — they will get an SMS to claim'}
                </Text>
              </>
            )}
          </View>
          {!checking && (isProtected || recipientStatus === 'ghost') && (
            <View style={styles.ghostNotice}>
              <Ionicons name="time-outline" size={13} color="#FF9500" />
              <Text style={styles.ghostText}>
                {isProtected
                  ? 'Recipient has 7 days to accept or decline. Full refund to you if they do neither.'
                  : 'Money held for 7 days. If unclaimed, you can recall it.'}
              </Text>
            </View>
          )}
        </View>

        {isProtected && (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>Transfer details</Text>
            <View style={styles.detailRow}>
              <Ionicons name="pricetag-outline" size={16} color={colors.grayDark} />
              <Text style={styles.detailText}>{PURPOSE_LABELS[purpose] || purpose}</Text>
            </View>
            {!!note && (
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={16} color={colors.grayDark} />
                <Text style={styles.detailText}>{note}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>KES {parseFloat(amount).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform fee</Text>
            <Text style={styles.summaryValue}>KES {fee}</Text>
          </View>
          {b2cCharge > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>M-Pesa charge</Text>
              <Text style={styles.summaryValue}>KES {Number(b2cCharge).toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.totalLabel}>Total {isProtected ? 'to pay' : 'deducted'}</Text>
            <Text style={styles.totalValue}>KES {total}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, (sending || checking) && styles.confirmBtnDisabled]}
          onPress={handleSend}
          disabled={sending || checking}
        >
          {sending
            ? <ActivityIndicator color={colors.white} />
            : <>
                <Ionicons name={isProtected ? 'shield-checkmark' : 'send'} size={16} color={colors.white} />
                <Text style={styles.confirmBtnText}>{isProtected ? 'Confirm SafeSend' : 'Confirm and Send'}</Text>
              </>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.gray },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.black },
  content: { padding: 20 },
  amountCard: { backgroundColor: colors.primary, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
  amountLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500' },
  amountValue: { color: colors.white, fontSize: 36, fontWeight: '800', marginTop: 6 },
  protectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 12 },
  protectedBadgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  detailCard: { backgroundColor: colors.gray, borderRadius: 14, padding: 16, marginBottom: 16, gap: 12 },
  detailTitle: { fontSize: 13, color: colors.grayDark, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14, color: colors.black, fontWeight: '500', flex: 1 },
  ghostNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF4E5', borderRadius: 8, padding: 10 },
  ghostText: { fontSize: 12, color: '#FF9500', flex: 1, lineHeight: 18 },
  summaryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 24, gap: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: colors.grayDark },
  summaryValue: { fontSize: 14, color: colors.black, fontWeight: '600' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  totalLabel: { fontSize: 15, color: colors.black, fontWeight: '700' },
  totalValue: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  confirmBtn: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 12 },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', marginTop: 14 },
  cancelText: { fontSize: 14, color: colors.grayDark, fontWeight: '600' },
});
