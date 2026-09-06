

import React from 'react';
import { calcFee, calcTotal, PLATFORM_RATE, calcFeesFundi, calcFeesGeneric } from '../utils/feeCalculator'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, StatusBar, SafeAreaView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

const GREEN = '#1a9e5c';
const GREEN_LIGHT = '#e8f5ee';
const INK = '#111827';
const SUBTLE = '#6b7280';
const BORDER = '#e5e7eb';

const formatDeadline = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

function Row({ icon, label, value, action }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={styles.iconBox}>
        <Feather name={icon} size={16} color={SUBTLE} />
      </View>
      <View style={styles.detailTextWrap}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      {action}
    </View>
  );
}

export default function ConfirmPaymentScreen({ navigation, route }) {
  const { t } = useLang();
  const { service, sellerPhone, sellerTill, method, notifyPhone, amount, description, deadline, isFundi, durationHours, beforePhotos, fundiPhone, deliveryGuyPhone, goods, productDescription, address, category, deliverables, jobId } = route.params || {};

  const seller = method === 'till' ? sellerTill : sellerPhone;
  const fundiFees = isFundi ? calcFeesFundi(amount) : calcFeesGeneric(amount)
  const fee = fundiFees.platformFee
  const transferFee = fundiFees.b2cCost
  const total = fundiFees.buyerTotal

  const callSeller = () => {
    if (method !== 'till' && seller) Linking.openURL(`tel:${seller}`);
  };

  const confirm = () => {
    navigation.navigate('PaymentProcessing', {
      service, sellerPhone, sellerTill, method, notifyPhone, amount, total,
      description, isFundi, durationHours, beforePhotos, fundiPhone,
      deliveryGuyPhone, goods, productDescription, address, deadline,
      category, deliverables, jobId,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="chevron-left" size={20} color={INK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.confirm}</Text>
          <Text style={styles.headerSub}>Review your {service ? service.toLowerCase() : ''} escrow details</Text>
        </View>
        <View style={styles.shieldBtn}>
          <Feather name="shield" size={18} color={GREEN} />
        </View>
      </View>

      <View style={styles.content}>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleIconBox}>
              <Feather name="clipboard" size={16} color={GREEN} />
            </View>
            <Text style={styles.cardTitle}>{service} Details</Text>
          </View>

          <Row icon="package" label={t.service} value={service} />

          <Row
            icon="user"
            label={isFundi ? 'Fundi (Seller)' : 'Seller'}
            value={seller}
            action={method !== 'till' && seller ? (
              <TouchableOpacity style={styles.callBtn} onPress={callSeller}>
                <Feather name="phone" size={14} color={GREEN} />
              </TouchableOpacity>
            ) : null}
          />

          {isFundi && category && <Row icon="tool" label="Job Category" value={category} />}
          {description && <Row icon="file-text" label={t.description} value={description} />}
          {deadline && <Row icon="calendar" label={t.deadline} value={formatDeadline(deadline)} />}
          {isFundi && durationHours && (
            <Row
              icon="clock"
              label="Completion Time"
              value={durationHours >= 24 ? `${Math.round(durationHours/24)} day(s)` : `${durationHours} hour(s)`}
            />
          )}
          {notifyPhone && <Row icon="bell" label="Notify Seller At" value={notifyPhone} />}
        </View>

        {isFundi && deliverables && deliverables.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Deliverables (Payment releases after)</Text>
            {deliverables.map((item, index) => (
              <View key={index} style={styles.deliverableRow}>
                <Feather name="check-circle" size={16} color={GREEN} style={{ marginTop: 1 }} />
                <Text style={styles.deliverableText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleIconBox}>
              <Feather name="credit-card" size={16} color={GREEN} />
            </View>
            <Text style={styles.cardTitle}>Payment Summary</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.labelPlain}>{t.amount}</Text>
            <Text style={styles.valuePlain}>KES {parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.labelPlain}>{isFundi ? 'Platform Fee (2%)' : t.escrowFee + ' (2%)'}</Text>
            <Text style={styles.valuePlain}>KES {fee.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
          {transferFee > 0 && (
            <View style={styles.row}>
              <Text style={styles.labelPlain}>Transfer Fee (Safaricom)</Text>
              <Text style={styles.valuePlain}>KES {transferFee.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>{t.total}</Text>
            <Text style={styles.totalValue}>KES {total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        <View style={styles.securityNote}>
          <View style={styles.lockBox}>
            <Feather name="lock" size={16} color="#166534" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>Your payment will be held securely in escrow</Text>
            <Text style={styles.securitySub}>Funds are only released when the {service ? service.toLowerCase() : 'job'} is completed.</Text>
          </View>
        </View>

        <LipaButton title={`${t.confirm} - STK Push`} onPress={confirm} />

        <View style={styles.footerRow}>
          <Feather name="shield" size={13} color={GREEN} />
          <Text style={styles.footerText}>Secured by escrow. Your money is safe.</Text>
        </View>

      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.gray },
  container: { flex: 1, backgroundColor: colors.gray },
  content: { padding: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 4, paddingBottom: 8, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: BORDER, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: SUBTLE, marginTop: 2, textAlign: 'center' },
  shieldBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#f1f2f4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardTitleIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: GREEN_LIGHT, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: INK, letterSpacing: -0.1 },

  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  detailTextWrap: { flex: 1 },
  label: { fontSize: 11, fontWeight: '600', color: SUBTLE, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 14, fontWeight: '600', color: colors.black, marginTop: 2 },
  callBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: GREEN_LIGHT, justifyContent: 'center', alignItems: 'center' },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
  deliverableRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  deliverableText: { fontSize: 14, color: colors.text, flex: 1 },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  labelPlain: { fontSize: 14, color: colors.grayDark },
  valuePlain: { fontSize: 15, fontWeight: '600', color: colors.black },
  divider: { height: 1, backgroundColor: '#f1f2f4', marginVertical: 10 },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: GREEN_LIGHT, borderRadius: 10, padding: 14, marginTop: 4 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.black },
  totalValue: { fontSize: 16, fontWeight: '700', color: GREEN },

  securityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: GREEN_LIGHT, borderRadius: 14, padding: 16, marginBottom: 16 },
  lockBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  securityTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  securitySub: { fontSize: 12, color: colors.grayDark, marginTop: 2, lineHeight: 17 },

  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 },
  footerText: { fontSize: 13, color: GREEN, fontWeight: '500' },
});