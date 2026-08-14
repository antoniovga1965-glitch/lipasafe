import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, RefreshControl
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';
import { useLang } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationContext';

const services = [
  { name: 'bundles',    icon: 'phone-portrait-outline', color: '#007AFF', bg: '#EAF3FF', bgDark: '#1A2A3A' },
  { name: 'secondhand', icon: 'basket-outline',         color: '#10B981', bg: '#E8FFF3', bgDark: '#1A2E25' },
  { name: 'fundi',      icon: 'hammer-outline',         color: '#FF9500', bg: '#FFF4E5', bgDark: '#2E2310' },
  { name: 'delivery',   icon: 'bicycle-outline',        color: '#FF6B35', bg: '#FFF0EA', bgDark: '#2E1E14' },
  { name: 'house',      icon: 'home-outline',           color: '#00A86B', bg: '#E5F7F1', bgDark: '#0E2A20' },
  { name: 'custom',     icon: 'create-outline',         color: '#9B59B6', bg: '#F5EEFB', bgDark: '#1E1228' },
];

const serviceRoutes = {
  bundles:    'BundlePayment',
  secondhand: 'SecondHandMarket',
  fundi:      'Contractor',
  delivery:   'Delivery',
  house:      'HouseHunting',
  custom:     'CustomEscrowList',
};

const statusColor = {
  pending:   { bg: '#FFF4E5', text: '#FF9500' },
  completed: { bg: '#E5F7F1', text: '#00A86B' },
  disputed:  { bg: '#FFE5E5', text: '#FF3B30' },
};

export default function HomeScreen({ navigation }) {
  const { t } = useLang();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const [user, setUser]                   = useState(null);
  const [transactions, setTransactions]   = useState([]);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [wallet, setWallet]               = useState({ availableBalance: 0, escrowBalance: 0 });

  const load = async () => {
    try {
      const [userRes, walletRes, txRes] = await Promise.all([
        authFetch('/user/me'),
        authFetch('/user/wallet'),
        authFetch('/wallet/transactions?limit=3'),
      ]);
      const userData   = await userRes.json();
      const walletData = await walletRes.json();
      const txData     = await txRes.json();
      if (userData.success)   setUser(userData.user);
      if (walletData.success) setWallet(walletData.wallet);
      if (txData.success)     setTransactions(txData.transactions);
    } catch {}
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const styles = makeStyles(theme);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting} 👋</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => navigation.navigate('ProfileTab', { screen: 'Notifications' })}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.text} />
          {unreadCount > 0 && <View style={styles.notifDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 80 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <View>
              <Text style={styles.balanceLabel}>{t.balance}</Text>
              <Text style={styles.balance}>
                {balanceVisible
                  ? 'KES ' + Number(wallet.availableBalance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : 'KES ••••'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)} style={styles.eyeBtn}>
              <Ionicons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color='rgba(255,255,255,0.8)' />
            </TouchableOpacity>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceBottom}>
            <View style={styles.balanceStat}>
              <Ionicons name="lock-closed-outline" size={14} color='rgba(255,255,255,0.7)' />
              <Text style={styles.balanceStatText}>
                {t.escrowed}: KES {Number(wallet.escrowBalance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <TouchableOpacity style={styles.addMoneyBtn} onPress={() => navigation.navigate('AddMoney')}>
              <Ionicons name="add" size={16} color={theme.primary} />
              <Text style={styles.addMoneyText}>Add Money</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {[
            { icon: 'send-outline',        label: 'Send',    action: () => navigation.navigate('QuickSend') },
            { icon: 'download-outline',    label: 'Receive', action: () => navigation.navigate('Receive') },
            { icon: 'time-outline',        label: 'History', action: () => navigation.navigate('ActivityTab') },
            { icon: 'help-circle-outline', label: 'Support', action: () => navigation.navigate('Support') },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={item.action}>
              <View style={styles.quickIcon}>
                <Ionicons name={item.icon} size={22} color={theme.primary} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Verified Sellers Banner */}
        <TouchableOpacity
          style={styles.verifiedBanner}
          onPress={() => navigation.navigate('ProfileTab', { screen: 'VerifiedSellers' })}
          activeOpacity={0.88}
        >
          <View style={styles.verifiedBannerIcon}>
            <Ionicons name="shield-checkmark" size={26} color="#00A86B" />
          </View>
          <View style={styles.verifiedBannerLeft}>
            <Text style={styles.verifiedBannerTitle}>Browse Verified Sellers</Text>
            <Text style={styles.verifiedBannerSub}>KYC-verified · SafePay protected · Trusted ratings</Text>
          </View>
          <View style={styles.verifiedBannerArrow}>
            <Ionicons name="chevron-forward" size={16} color="#00A86B" />
          </View>
        </TouchableOpacity>

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.service}</Text>
        </View>
        <View style={styles.grid}>
          {services.map((svc, i) => (
            <TouchableOpacity
              key={i}
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('PayTab', { screen: serviceRoutes[svc.name] })}
            >
              <View style={[styles.iconBox, { backgroundColor: isDark ? svc.bgDark : svc.bg }]}>
                <Ionicons name={svc.icon} size={26} color={svc.color} />
              </View>
              <Text style={styles.gridText}>{svc.name === 'secondhand' ? 'Second Hand' : t[svc.name]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.recent}</Text>
          {transactions.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('ActivityTab')}>
              <Text style={styles.seeAll}>{t.seeAll}</Text>
            </TouchableOpacity>
          )}
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={40} color={theme.subtext} />
            <Text style={styles.emptyText}>{t.noTransactions}</Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => navigation.navigate('PayTab')}>
              <Text style={styles.startBtnText}>Make your first payment</Text>
            </TouchableOpacity>
          </View>
        ) : (
          transactions.map((tx, i) => {
            const sc = statusColor[tx.status] || statusColor.completed;
            return (
              <TouchableOpacity
                key={tx.id || i}
                style={styles.txItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ActivityTab', { screen: 'TransactionDetail', params: { tx } })}
              >
                <View style={[styles.txIcon, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons
                    name={tx.direction === 'out' ? 'arrow-up-outline' : 'arrow-down-outline'}
                    size={20}
                    color={tx.direction === 'out' ? '#EF4444' : '#22C55E'}
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txTitle}>{tx.type || 'Payment'}</Text>
                  <Text style={styles.txDate}>
                    {tx.counterparty
                      ? (tx.counterparty.fullName || tx.counterparty.phone || 'Unknown')
                      : tx.createdAt?.slice(0, 10) || 'Today'}
                  </Text>
                  <Text style={styles.txSubDate}>{tx.createdAt?.slice(0, 10) || ''}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: tx.direction === 'out' ? '#EF4444' : '#22C55E' }]}>
                    {tx.direction === 'out' ? '-' : '+'} KES {tx.amount}
                  </Text>
                  <View style={[styles.txBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.txStatus, { color: sc.text }]}>{tx.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  root:                { flex: 1, backgroundColor: theme.background },
  header:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.card },
  greeting:            { fontSize: 13, color: theme.subtext, fontWeight: '500' },
  name:                { fontSize: 20, fontWeight: '800', color: theme.text, marginTop: 2 },
  notifBtn:            { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.gray, alignItems: 'center', justifyContent: 'center' },
  notifDot:            { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.error, position: 'absolute', top: 8, right: 8 },
  scroll:              { paddingTop: 8 },
  balanceCard:         { marginHorizontal: 20, marginVertical: 12, backgroundColor: theme.primary, borderRadius: 20, padding: 22 },
  balanceTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  balanceLabel:        { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500' },
  balance:             { color: '#FFFFFF', fontSize: 34, fontWeight: '800', marginTop: 6, letterSpacing: 0.5 },
  eyeBtn:              { padding: 6 },
  balanceDivider:      { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 16 },
  balanceBottom:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceStat:         { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  balanceStatText:     { color: 'rgba(255,255,255,0.75)', fontSize: 12, flexShrink: 1 },
  addMoneyBtn:         { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4, flexShrink: 0 },
  addMoneyText:        { color: theme.primary, fontSize: 13, fontWeight: '700' },
  quickActions:        { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginVertical: 8, backgroundColor: theme.card, borderRadius: 16, padding: 16 },
  quickBtn:            { alignItems: 'center', gap: 8 },
  quickIcon:           { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.gray, alignItems: 'center', justifyContent: 'center' },
  quickLabel:          { fontSize: 12, fontWeight: '600', color: theme.text },
  section:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginTop: 20, marginBottom: 12 },
  sectionTitle:        { fontSize: 17, fontWeight: '800', color: theme.text },
  seeAll:              { fontSize: 13, color: theme.primary, fontWeight: '600' },
  grid:                { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, backgroundColor: theme.card, marginHorizontal: 20, borderRadius: 16, paddingVertical: 8 },
  gridItem:            { width: '33.33%', alignItems: 'center', paddingVertical: 16 },
  iconBox:             { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gridText:            { fontSize: 12, color: theme.text, fontWeight: '600', textAlign: 'center' },
  emptyBox:            { alignItems: 'center', padding: 32, backgroundColor: theme.card, marginHorizontal: 20, borderRadius: 16 },
  emptyText:           { color: theme.subtext, marginTop: 12, fontSize: 14, marginBottom: 16 },
  verifiedBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 16, marginTop: 8, marginBottom: 16, borderWidth: 1.5, borderColor: '#00A86B30', shadowColor: '#00A86B', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  verifiedBannerIcon:  { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00A86B18', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  verifiedBannerLeft:  { flex: 1 },
  verifiedBannerTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  verifiedBannerSub:   { fontSize: 12, color: theme.subtext, marginTop: 3 },
  verifiedBannerArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#00A86B18', justifyContent: 'center', alignItems: 'center' },
  startBtn:            { backgroundColor: theme.primary + '18', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  startBtnText:        { color: theme.primary, fontWeight: '700', fontSize: 13 },
  txItem:              { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, marginHorizontal: 20, marginBottom: 8, padding: 14, borderRadius: 14 },
  txIcon:              { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txInfo:              { flex: 1 },
  txTitle:             { fontSize: 14, fontWeight: '700', color: theme.text, textTransform: 'capitalize' },
  txDate:              { fontSize: 12, color: theme.subtext, marginTop: 3 },
  txSubDate:           { fontSize: 11, color: theme.subtext, marginTop: 1, opacity: 0.7 },
  txRight:             { alignItems: 'flex-end', gap: 6 },
  txAmount:            { fontSize: 14, fontWeight: '800' },
  txBadge:             { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  txStatus:            { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
