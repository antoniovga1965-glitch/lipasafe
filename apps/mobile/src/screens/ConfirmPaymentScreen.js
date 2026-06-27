import React from 'react';
import { calcFee, calcTotal, PLATFORM_RATE, calcFeesFundi, calcFeesGeneric } from '../utils/feeCalculator'
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

export default function ConfirmPaymentScreen({ navigation, route }) {
  const { t } = useLang();
  const { service, sellerPhone, sellerTill, method, notifyPhone, amount, description, deadline, isFundi, durationHours, beforePhotos, fundiPhone, deliveryGuyPhone, goods, productDescription, address, category, deliverables } = route.params || {};
  
  const seller = method === 'till' ? sellerTill : sellerPhone;
  const fundiFees = isFundi ? calcFeesFundi(amount) : calcFeesGeneric(amount)
  const fee = fundiFees.platformFee
  const transferFee = fundiFees.b2cCost
  const total = fundiFees.buyerTotal

  const confirm = () => {
    navigation.navigate('PaymentProcessing', { 
      service, 
      sellerPhone, 
      sellerTill, 
      method, 
      notifyPhone, 
      amount, 
      total, 
      description, 
      isFundi, 
      durationHours, 
      beforePhotos, 
      fundiPhone, 
      deliveryGuyPhone, 
      goods, 
      productDescription, 
      address, 
      deadline,
      category,
      deliverables,
    });
  };

  return (
    <ScrollView style={styles.container}>
      <LipaHeader title={t.confirm} navigation={navigation} />
      <View style={styles.content}>
        
        <View style={styles.card}>
          <Text style={styles.label}>{t.service}</Text>
          <Text style={styles.value}>{service}</Text>
          
          <Text style={styles.label}>{t.seller}</Text>
          <Text style={styles.value}>{seller}</Text>

          {isFundi && category && (
            <>
              <Text style={styles.label}>Job Category</Text>
              <Text style={styles.value}>{category}</Text>
            </>
          )}

          {description && (
            <>
              <Text style={styles.label}>{t.description}</Text>
              <Text style={styles.value}>{description}</Text>
            </>
          )}

          {deadline && (
            <>
              <Text style={styles.label}>{t.deadline}</Text>
              <Text style={styles.value}>{deadline}</Text>
            </>
          )}

          {isFundi && durationHours && (
            <>
              <Text style={styles.label}>Completion Time</Text>
              <Text style={styles.value}>{durationHours >= 24 ? `${Math.round(durationHours/24)} day(s)` : `${durationHours} hour(s)`}</Text>
            </>
          )}

          {notifyPhone && (
            <>
              <Text style={styles.label}>Notify Seller At</Text>
              <Text style={styles.value}>{notifyPhone}</Text>
            </>
          )}
        </View>

        {isFundi && deliverables && deliverables.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Deliverables (Payment releases after)</Text>
            {deliverables.map((item, index) => (
              <View key={index} style={styles.deliverableRow}>
                <Text style={styles.checkmark}>☑</Text>
                <Text style={styles.deliverableText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t.amount}</Text>
            <Text style={styles.value}>KES {parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{isFundi ? 'Platform Fee (2%)' : t.escrowFee + ' (2%)'}</Text>
            <Text style={styles.value}>KES {fee.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
          {isFundi && (
          <View style={styles.row}>
            <Text style={styles.label}>Transfer Fee (Safaricom)</Text>
            <Text style={styles.value}>KES {transferFee.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
          )}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>{t.total}</Text>
            <Text style={styles.totalValue}>KES {total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        <LipaButton title={`${t.confirm} → STK Push`} onPress={confirm} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 16 },
  label: { fontSize: 12, color: colors.grayDark, marginTop: 8 },
  value: { fontSize: 16, fontWeight: '600', color: colors.black, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
  deliverableRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  checkmark: { fontSize: 16, color: colors.primary, marginTop: 2 },
  deliverableText: { fontSize: 14, color: colors.text, flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 12 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: colors.black },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: colors.primary },
});
