import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, RefreshControl, Image,
} from 'react-native';
import {
  Send, Download, Shield, LayoutList,
  ArrowDownLeft, ArrowUpRight, Lock, CheckCircle2,
  Eye, EyeOff, Bell, Plus, Info, ChevronRight,
  ShoppingBag,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';
import { useLang } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationContext';
import { Ionicons } from '@expo/vector-icons';

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

const getTxMeta = (tx) => {
  if (tx.direction === 'in')
    return { Icon: ArrowDownLeft, iconColor: '#22C55E', iconBg: '#D1FAE5', amountColor: '#22C55E', prefix: '+' };
  const t = (tx.type || '').toLowerCase();
  if (t.includes('escrow') || t.includes('placed'))
    return { Icon: Lock, iconColor: '#F59E0B', iconBg: '#FEF3C7', amountColor: '#EF4444', prefix: '-' };
  if (tx.status === 'completed' || t.includes('release'))
    return { Icon: CheckCircle2, iconColor: '#22C55E', iconBg: '#D1FAE5', amountColor: '#EF4444', prefix: '-' };
  return { Icon: ArrowUpRight, iconColor: '#EF4444', iconBg: '#FEE2E2', amountColor: '#EF4444', prefix: '-' };
};

export default function HomeScreen({ navigation }) {
  const { t } = useLang();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const [user, setUser]                     = useState(null);
  const [transactions, setTransactions]     = useState([]);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [wallet, setWallet]                 = useState({ availableBalance: 0, escrowBalance: 0 });

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

  const nameParts = user?.fullName?.trim().split(' ') || [];
  const firstName = nameParts[0] || 'there';
  const initials  = nameParts.length >= 2
    ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
    : (nameParts[0]?.charAt(0) || '?').toUpperCase();
  const avatarUri = user?.profilePicture || user?.avatar || user?.photo || null;
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const s         = makeStyles(theme, isDark);

  const fmt = (val) =>
    'KES ' + Number(val || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const activeProt = transactions.filter(tx =>
    tx.status === 'pending' || (tx.type || '').toLowerCase().includes('escrow')
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />

      {/* ─── Header ─── */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting} 👋</Text>
          <Text style={s.name}>{firstName}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity
            style={s.notifBtn}
            onPress={() => navigation.navigate('ProfileTab', { screen: 'Notifications' })}
          >
            <Bell size={20} color={theme.text} strokeWidth={2} />
            {unreadCount > 0 && <View style={s.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={s.avatar} onPress={() => navigation.navigate('ProfileTab')}>
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
              : <Text style={s.avatarTxt}>{initials}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >

        {/* ─── Balance Card ─── */}
        <View style={s.card}>
          <View style={s.cardRow}>
            {/* Left */}
            <View style={s.cardCol}>
              <Text style={s.cardLbl}>Available balance</Text>
              <Text style={s.cardSub}>SafeSend & instant send only</Text>
              <Text style={s.cardAmt}>
                {balanceVisible ? fmt(wallet.availableBalance) : 'KES ••••'}
              </Text>
            </View>
            <View style={s.cardVDiv} />
            {/* Right */}
            <View style={s.cardCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.cardLbl}>Protected in escrow</Text>
                <Info size={12} color="rgba(255,255,255,0.6)" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <Lock size={15} color="rgba(255,255,255,0.85)" />
                <Text style={s.cardAmt}>
                  {balanceVisible ? fmt(wallet.escrowBalance) : 'KES ••••'}
                </Text>
              </View>
            </View>
            {/* Eye */}
            <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)} style={s.eyeBtn}>
              {balanceVisible
                ? <Eye size={20} color="rgba(255,255,255,0.8)" />
                : <EyeOff size={20} color="rgba(255,255,255,0.8)" />}
            </TouchableOpacity>
          </View>

          <View style={s.cardHDiv} />

          <View style={s.cardBottom}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Lock size={13} color="rgba(255,255,255,0.7)" />
              <Text style={s.safeTxt}>Your money is safe with LipaSafe</Text>
            </View>
            <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('AddMoney')}>
              <Plus size={16} color={theme.primary} strokeWidth={2.5} />
              <Text style={s.addBtnTxt}>Add Money</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Quick Actions ─── */}
        <View style={s.quickRow}>
          {[
            { Icon: Send,        label: 'Pay',      action: () => navigation.navigate('QuickSend') },
            { Icon: Download,    label: 'Request',  action: () => navigation.navigate('Receive') },
            { Icon: Shield,      label: 'Escrow',   action: () => navigation.navigate('ActivityTab', { screen: 'EscrowTransactions' }) },
            { Icon: LayoutList,  label: 'Activity', action: () => navigation.navigate('ActivityTab') },
          ].map(({ Icon, label, action }, i) => (
            <TouchableOpacity key={i} style={s.quickBtn} onPress={action}>
              <View style={s.quickIcon}>
                <Icon size={22} color={theme.primary} strokeWidth={1.8} />
              </View>
              <Text style={s.quickLbl}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Active Protection ─── */}
        {activeProt.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Active protection</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ActivityTab')}>
                <Text style={s.seeAll}>View all ({activeProt.length})</Text>
              </TouchableOpacity>
            </View>
            {activeProt.slice(0, 1).map((tx, i) => {
              const party = tx.counterparty?.fullName || tx.counterparty?.phone || 'Unknown';
              return (
                <View key={i} style={s.protCard}>
                  <View style={s.protLeft}>
                    <View style={s.protIconWrap}>
                      <ShoppingBag size={22} color="#00A86B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.protAmt}>KES {Number(tx.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
                      <Text style={s.protParty}>Purchase from @{party}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <View style={s.pendingDot} />
                        <Text style={s.protStatus}>Waiting for delivery</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.protRight}>
                    <View style={s.awaitBadge}>
                      <Text style={s.awaitTxt}>Awaiting delivery</Text>
                    </View>
                    <TouchableOpacity
                      style={{ marginTop: 8 }}
                      onPress={() => navigation.navigate('ActivityTab', { screen: 'TransactionDetail', params: { tx } })}
                    >
                      <Text style={s.viewTx}>View transaction  ›</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ─── Shop with Protection ─── */}
        <TouchableOpacity
          style={s.shopCard}
          onPress={() => navigation.navigate('ProfileTab', { screen: 'VerifiedSellers' })}
          activeOpacity={0.88}
        >
          <View style={s.shopLeft}>
            <View style={s.shopIconWrap}>
              <Shield size={26} color="#00A86B" fill="#00A86B18" strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.shopTitle}>Shop with protection</Text>
              <Text style={s.shopSub}>Browse KYC-verified sellers</Text>
              <Text style={s.shopSub}>Protected payments · Trusted ratings</Text>
            </View>
            <TouchableOpacity
              style={s.exploreBtn}
              onPress={() => navigation.navigate('ProfileTab', { screen: 'VerifiedSellers' })}
            >
              <Text style={s.exploreTxt}>Explore marketplace</Text>
              <ChevronRight size={14} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* ─── Services ─── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Services</Text>
          <TouchableOpacity onPress={() => navigation.navigate('PayTab')}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        <View style={s.grid}>
          {services.map((svc, i) => (
            <TouchableOpacity
              key={i}
              style={s.gridItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('PayTab', { screen: serviceRoutes[svc.name] })}
            >
              <View style={[s.iconBox, { backgroundColor: isDark ? svc.bgDark : svc.bg }]}>
                <Ionicons name={svc.icon} size={26} color={svc.color} />
              </View>
              <Text style={s.gridTxt}>
                {svc.name === 'secondhand' ? 'Second Hand' : t[svc.name]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Recent Activity ─── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Recent activity</Text>
          {transactions.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('ActivityTab')}>
              <Text style={s.seeAll}>View all</Text>
            </TouchableOpacity>
          )}
        </View>

        {transactions.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="receipt-outline" size={40} color={theme.subtext} />
            <Text style={s.emptyTxt}>{t.noTransactions}</Text>
            <TouchableOpacity style={s.startBtn} onPress={() => navigation.navigate('PayTab')}>
              <Text style={s.startTxt}>Make your first payment</Text>
            </TouchableOpacity>
          </View>
        ) : (
          transactions.map((tx, i) => {
            const { Icon, iconColor, iconBg, amountColor, prefix } = getTxMeta(tx);
            const time  = tx.createdAt
              ? new Date(tx.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
              : '';
            const party = tx.counterparty?.fullName || tx.counterparty?.phone || '';
            const dateStr = tx.createdAt
              ? (new Date(tx.createdAt).toDateString() === new Date().toDateString() ? 'Today' : 'Yesterday')
              : 'Today';
            return (
              <TouchableOpacity
                key={tx.id || i}
                style={s.txItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ActivityTab', { screen: 'TransactionDetail', params: { tx } })}
              >
                <View style={[s.txIconWrap, { backgroundColor: iconBg }]}>
                  <Icon size={20} color={iconColor} strokeWidth={2} />
                </View>
                <View style={s.txInfo}>
                  <Text style={s.txTitle}>{tx.type || 'Payment'}</Text>
                  <Text style={s.txSub}>
                    {party ? `${party} · ` : ''}{dateStr}{time ? `, ${time}` : ''}
                  </Text>
                </View>
                <Text style={[s.txAmt, { color: amountColor }]}>
                  {prefix}KES {Number(tx.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme, isDark) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: theme.background },

  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.card },
  greeting:     { fontSize: 13, color: theme.subtext, fontWeight: '500' },
  name:         { fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 2 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.gray, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', position: 'absolute', top: 7, right: 7, borderWidth: 2, borderColor: theme.card },
  avatar:       { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.gray, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:    { width: 40, height: 40, borderRadius: 20 },
  avatarTxt:    { color: theme.text, fontWeight: '800', fontSize: 16 },

  scroll:       { paddingTop: 8 },

  // Balance Card
  card:         { marginHorizontal: 20, marginVertical: 12, backgroundColor: theme.primary, borderRadius: 20, padding: 20 },
  cardRow:      { flexDirection: 'row', alignItems: 'flex-start', position: 'relative' },
  cardCol:      { flex: 1 },
  cardLbl:      { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500', marginBottom: 4 },
  cardSub:      { color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 1, marginBottom: 6 },
  cardAmt:      { color: '#fff', fontSize: 22, fontWeight: '800' },
  cardVDiv:     { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'stretch', marginHorizontal: 14 },
  eyeBtn:       { position: 'absolute', top: -2, right: -2, padding: 4 },
  cardHDiv:     { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 14 },
  cardBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  safeTxt:      { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  addBtnTxt:    { color: theme.primary, fontSize: 13, fontWeight: '700' },

  // Quick Actions
  quickRow:     { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginVertical: 8, backgroundColor: theme.card, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12 },
  quickBtn:     { alignItems: 'center', gap: 8, flex: 1 },
  quickIcon:    { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.gray, alignItems: 'center', justifyContent: 'center' },
  quickLbl:     { fontSize: 12, fontWeight: '600', color: theme.text },

  // Active Protection
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  seeAll:       { fontSize: 13, color: theme.primary, fontWeight: '600' },
  protCard:     { marginHorizontal: 20, backgroundColor: isDark ? '#0E2A20' : '#F0FDF8', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#00A86B20', flexDirection: 'row', justifyContent: 'space-between' },
  protLeft:     { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 12 },
  protIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#00A86B18', alignItems: 'center', justifyContent: 'center' },
  protAmt:      { fontSize: 16, fontWeight: '800', color: theme.text },
  protParty:    { fontSize: 12, color: theme.subtext, marginTop: 3 },
  pendingDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' },
  protStatus:   { fontSize: 12, color: theme.subtext },
  protRight:    { alignItems: 'flex-end' },
  awaitBadge:   { backgroundColor: '#E8FFF3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  awaitTxt:     { color: '#00A86B', fontSize: 11, fontWeight: '700' },
  viewTx:       { color: theme.primary, fontSize: 12, fontWeight: '600' },

  // Shop with Protection
  shopCard:     { marginHorizontal: 20, marginTop: 16, marginBottom: 4, backgroundColor: isDark ? '#0E2A20' : '#F0FDF8', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#00A86B20' },
  shopLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shopIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00A86B18', alignItems: 'center', justifyContent: 'center' },
  shopTitle:    { fontSize: 15, fontWeight: '800', color: theme.text },
  shopSub:      { fontSize: 12, color: theme.subtext, marginTop: 2 },
  exploreBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00A86B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 4, marginLeft: 'auto' },
  exploreTxt:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Services Grid
  grid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, backgroundColor: theme.card, marginHorizontal: 20, borderRadius: 16, paddingVertical: 8 },
  gridItem:     { width: '33.33%', alignItems: 'center', paddingVertical: 16 },
  iconBox:      { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gridTxt:      { fontSize: 12, color: theme.text, fontWeight: '600', textAlign: 'center' },

  // Empty
  emptyBox:     { alignItems: 'center', padding: 32, backgroundColor: theme.card, marginHorizontal: 20, borderRadius: 16 },
  emptyTxt:     { color: theme.subtext, marginTop: 12, fontSize: 14, marginBottom: 16 },
  startBtn:     { backgroundColor: theme.primary + '18', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  startTxt:     { color: theme.primary, fontWeight: '700', fontSize: 13 },

  // Transactions
  txItem:       { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, marginHorizontal: 20, marginBottom: 8, padding: 14, borderRadius: 14 },
  txIconWrap:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txInfo:       { flex: 1 },
  txTitle:      { fontSize: 14, fontWeight: '700', color: theme.text, textTransform: 'capitalize' },
  txSub:        { fontSize: 12, color: theme.subtext, marginTop: 3 },
  txAmt:        { fontSize: 14, fontWeight: '800' },
});