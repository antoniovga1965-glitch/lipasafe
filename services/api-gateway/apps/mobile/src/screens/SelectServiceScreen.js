import React, { useEffect, useState, useCallback } from 'react';
import { calcFee, calcTotal, PLATFORM_RATE } from '../utils/feeCalculator'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { authFetch } from '../utils/api';
import { useLang } from '../context/LanguageContext';

const services = [
  { key: 'bundles',  icon: 'phone-portrait-outline', color: '#007AFF', bg: '#EAF3FF', screen: 'BundlePayment' },
  { key: 'secondhand', icon: 'people-outline',        color: '#10B981', bg: '#E5F7F1', screen: 'SecondHandMarket' },
  { key: 'fundi',    icon: 'hammer-outline',           color: '#FF9500', bg: '#FFF4E5', screen: 'Contractor' },
  { key: 'delivery', icon: 'bicycle-outline',          color: '#FF6B35', bg: '#FFF0EA', screen: 'Delivery' },
  { key: 'house',    icon: 'home-outline',             color: '#00A86B', bg: '#E5F7F1', screen: 'HouseHunting' },
  { key: 'custom',   icon: 'create-outline',           color: '#9B59B6', bg: '#F5EEFB', screen: 'CustomEscrowList' },
];

const statusColor = {
  pending:   { bg: '#FFF4E5', text: '#FF9500' },
  completed: { bg: '#E5F7F1', text: '#00A86B' },
  disputed:  { bg: '#FFE5E5', text: '#FF3B30' },
};

export default function SelectServiceScreen({ navigation }) {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const [recentTxs, setRecentTxs] = useState([]);
  const [phone, setPhone]   = useState('');
  const [amount, setAmount] = useState('');

  // Pull real transactions from API on focus
  // Auto-navigate if launched with a target screen param
  useEffect(() => {
    const target = navigation.getState()?.routes?.slice(-1)[0]?.params?.screen;
    if (target && target !== 'SelectService') {
      navigation.navigate(target);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    authFetch('/wallet/transactions?limit=4')
      .then(r => r.json())
      .then(d => { if (d.success) setRecentTxs(d.transactions); })
      .catch(() => {});
  }, []));

  const canSend = phone.length >= 9 && amount.length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Pay</Text>
          <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('ActivityTab')}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.historyText}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Send Card */}
        <View style={styles.sendCard}>
          <Text style={styles.sendTitle}>Quick Send</Text>
          <Text style={styles.sendSub}>Send money instantly</Text>

          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={18} color={colors.grayDark} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Recipient phone (07XX...)"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={12}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.kesPrefix}>KES</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="0.00"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          {amount.length > 0 && (
            <View style={styles.feeRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.grayDark} />
              <Text style={styles.feeText}>
                Service fee: KES {calcFee(amount || 0).toFixed(2)} · Total: KES {calcTotal(amount || 0).toFixed(2)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={() => navigation.navigate('HomeTab', { screen: 'QuickSend', params: { prefillPhone: phone, prefillAmount: amount } })}
          >
            <Ionicons name="send" size={16} color={colors.white} />
            <Text style={styles.sendBtnText}>Send Now</Text>
          </TouchableOpacity>
        </View>

        {/* Pay via Service */}
        <Text style={styles.sectionTitle}>Pay via Service</Text>
        <View style={styles.serviceGrid}>
          {services.map((svc) => (
            <TouchableOpacity
              key={svc.key}
              style={styles.serviceCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(svc.screen)}
            >
              <View style={[styles.serviceIcon, { backgroundColor: svc.bg }]}>
                <Ionicons name={svc.icon} size={26} color={svc.color} />
              </View>
              <Text style={styles.serviceText}>{t[svc.key]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Payments — live from API */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          {recentTxs.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('ActivityTab')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentTxs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="wallet-outline" size={36} color={colors.grayDark} />
            <Text style={styles.emptyText}>No payments yet</Text>
          </View>
        ) : (
          recentTxs.map((tx, i) => {
            const sc  = statusColor[tx.status] || statusColor.completed;
            const svc = services.find(s => s.key === tx.type?.toLowerCase()) || services[5];
            return (
              <TouchableOpacity
                key={tx.id || i}
                style={styles.txItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ActivityTab', {
                  screen: 'TransactionDetail', params: { tx }
                })}
              >
                <View style={[styles.txIcon, { backgroundColor: svc.bg }]}>
                  <Ionicons name={svc.icon} size={20} color={svc.color} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txTitle}>{tx.type || 'Payment'}</Text>
                  <Text style={styles.txSub}>{tx.note || tx.createdAt?.slice(0, 10)}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: tx.direction === 'out' ? '#EF4444' : '#22C55E' }]}>
                    {tx.direction === 'out' ? '-' : '+'} KES {tx.amount}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.badgeText, { color: sc.text }]}>{tx.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.gray },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.white },
  headerTitle:    { fontSize: 24, fontWeight: '800', color: colors.black },
  historyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gray, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  historyText:    { fontSize: 13, color: colors.primary, fontWeight: '600' },
  sendCard:       { backgroundColor: colors.white, margin: 16, borderRadius: 20, padding: 20 },
  sendTitle:      { fontSize: 18, fontWeight: '800', color: colors.black },
  sendSub:        { fontSize: 13, color: colors.grayDark, marginTop: 2, marginBottom: 16 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, backgroundColor: colors.gray },
  inputIcon:      { marginRight: 8 },
  kesPrefix:      { fontSize: 16, fontWeight: '700', color: colors.black, marginRight: 8 },
  input:          { flex: 1, fontSize: 16, color: colors.black },
  feeRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, backgroundColor: '#F0FBF6', padding: 10, borderRadius: 8 },
  feeText:        { fontSize: 12, color: colors.grayDark, flex: 1 },
  sendBtn:        { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  sendBtnDisabled:{ opacity: 0.5 },
  sendBtnText:    { color: colors.white, fontSize: 16, fontWeight: '700' },
  sectionTitle:   { fontSize: 17, fontWeight: '800', color: colors.black, marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  serviceGrid:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, backgroundColor: colors.white, marginHorizontal: 16, borderRadius: 16, paddingVertical: 8 },
  serviceCard:    { width: '33.33%', alignItems: 'center', paddingVertical: 16 },
  serviceIcon:    { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  serviceText:    { fontSize: 12, fontWeight: '600', color: colors.black, textAlign: 'center' },
  recentHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginRight: 16 },
  seeAll:         { fontSize: 13, color: colors.primary, fontWeight: '600' },
  emptyBox:       { alignItems: 'center', padding: 24, backgroundColor: colors.white, marginHorizontal: 16, borderRadius: 16 },
  emptyText:      { color: colors.grayDark, marginTop: 8, fontSize: 14 },
  txItem:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 14 },
  txIcon:         { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txInfo:         { flex: 1 },
  txTitle:        { fontSize: 14, fontWeight: '700', color: colors.black, textTransform: 'capitalize' },
  txSub:          { fontSize: 12, color: colors.grayDark, marginTop: 2 },
  txRight:        { alignItems: 'flex-end', gap: 6 },
  txAmount:       { fontSize: 14, fontWeight: '800' },
  badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:      { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
