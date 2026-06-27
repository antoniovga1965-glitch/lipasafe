import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator
} from 'react-native';
import { colors } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';

const STATUS_META = {
  PENDING_PAYMENT:                  { label: 'Awaiting Payment',        color: '#FF9500', bg: '#FFF4E5', icon: 'time-outline' },
  PENDING_PHOTO_UPLOAD:             { label: 'Upload Before Photo',     color: '#007AFF', bg: '#EAF3FF', icon: 'camera-outline' },
  PHOTO_WAITING_BUYER_CONFIRMATION: { label: 'Buyer Confirming Photo',  color: '#9B59B6', bg: '#F5EEFB', icon: 'eye-outline' },
  PHOTO_CONFIRMED_BY_BUYER:         { label: 'Enter Pickup OTP',        color: '#FF6B35', bg: '#FFF0EA', icon: 'key-outline' },
  IN_TRANSIT:                       { label: 'In Transit',              color: '#10B981', bg: '#E8FFF3', icon: 'bicycle-outline' },
  DELIVERY_PHOTO_UPLOADED:          { label: 'Photo Uploaded',          color: '#10B981', bg: '#E8FFF3', icon: 'camera-outline' },
  RECEIPT_OTP_ISSUED:               { label: 'Enter Receipt OTP',       color: '#FF6B35', bg: '#FFF0EA', icon: 'key-outline' },
  AWAITING_RECEIPT:                 { label: 'Delivered — Confirm',     color: '#00A86B', bg: '#E5F7F1', icon: 'checkmark-circle-outline' },
  PAYMENT_PROCESSING:               { label: 'Payment Processing',      color: '#FF9500', bg: '#FFF4E5', icon: 'card-outline' },
  COMPLETED:                        { label: 'Completed',               color: '#00A86B', bg: '#E5F7F1', icon: 'checkmark-done-outline' },
  REFUNDED:                         { label: 'Refunded',                color: '#EF4444', bg: '#FFE5E5', icon: 'return-down-back-outline' },
  DISPUTED:                         { label: 'Disputed',                color: '#EF4444', bg: '#FFE5E5', icon: 'alert-circle-outline' },
};

const RIDER_ACTIONS = {
  PENDING_PHOTO_UPLOAD:             { label: 'Upload Before Photo',         screen: 'DeliveryBeforePhoto' },
  PHOTO_WAITING_BUYER_CONFIRMATION: { label: 'Waiting for buyer to confirm...' },
  PHOTO_CONFIRMED_BY_BUYER:         { label: 'Enter Pickup OTP',            screen: 'DeliveryPickupOTP' },
  IN_TRANSIT:                       { label: 'Upload During Photo',         screen: 'DeliveryDuringPhoto' },
  DELIVERY_PHOTO_UPLOADED:          { label: 'Waiting for buyer receipt...' },
  RECEIPT_OTP_ISSUED:               { label: 'Waiting for buyer receipt...' },
  AWAITING_RECEIPT:                 { label: 'Waiting for payment release...' },
  PAYMENT_PROCESSING:               { label: 'Payment processing...' },
};

const BUYER_ACTIONS = {
  PENDING_PAYMENT:                  { label: 'Pay to Start Delivery',       screen: 'Delivery', usePayTab: true },
  PHOTO_WAITING_BUYER_CONFIRMATION: { label: 'Confirm Before Photo',        screen: 'DeliveryBuyerPhotoConfirm' },
  RECEIPT_OTP_ISSUED:               { label: 'Enter Receipt OTP',           screen: 'DeliveryReceipt' },
  AWAITING_RECEIPT:                 { label: 'Mark as Received',            screen: 'DeliveryReceipt', usePayTab: true },
  PAYMENT_PROCESSING:               { label: 'Payment processing...' },
};

// states where buyer can raise a dispute (payment made, something went wrong)
const DISPUTABLE_STATUSES = [
  'DELIVERY_PHOTO_UPLOADED', 'AWAITING_RECEIPT',
  'PHOTO_CONFIRMED_BY_BUYER', 'PHOTO_WAITING_BUYER_CONFIRMATION',
]

const getAction = (order) => {
  if (order._role === 'rider') return RIDER_ACTIONS[order.status];
  if (order._role === 'buyer') return BUYER_ACTIONS[order.status];
  return null;
};

export default function DeliveryOrdersScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]             = useState('active'); // 'active' | 'completed'

  const load = async () => {
    try {
      const [buyerRes, riderRes] = await Promise.all([
        authFetch('/delivery/history?type=buyer'),
        authFetch('/delivery/history?type=rider'),
      ]);
      const buyerData = await buyerRes.json();
      const riderData = await riderRes.json();
      const buyerOrders = (buyerData.success ? buyerData.orders || [] : []).map(o => ({ ...o, _role: 'buyer' }));
      const riderOrders = (riderData.success ? riderData.orders || [] : []).map(o => ({ ...o, _role: 'rider' }));
      // merge, deduplicate by id (in case same user is both buyer and rider on an order)
      const seen = new Set();
      const merged = [...buyerOrders, ...riderOrders].filter(o => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
      setOrders(merged);
    } catch {}
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const activeOrders    = orders.filter(o => !['COMPLETED','REFUNDED'].includes(o.status));
  const completedOrders = orders.filter(o =>  ['COMPLETED','REFUNDED'].includes(o.status));
  const displayed       = tab === 'active' ? activeOrders : completedOrders;

  const handleAction = (order) => {
    const action = getAction(order);
    if (!action?.screen) return;
    const params = {
      orderId:       order.id,
      deliveryPhone: order.deliveryGuyPhone,
      goods:         order.goods,
      amount:        order.amount,
      photoUrl:      order.photos?.[0]?.cloudinaryUrl || order.photos?.[0]?.url || null,
      deadline:      order.setDeliveryTime || null,
      timerEnd:      order.setDeliveryTime || order.deadline || null,
      isHighRisk:    (order.disputeCount || 0) >= 5,
    };
    if (action.usePayTab) {
      navigation.navigate('PayTab', { screen: action.screen, params });
    } else {
      navigation.navigate(action.screen, params);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>My Deliveries</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['active', 'completed'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'active' ? `Active (${activeOrders.length})` : `Completed (${completedOrders.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {displayed.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="bicycle-outline" size={48} color={colors.grayDark} />
              <Text style={styles.emptyText}>
                {tab === 'active' ? 'No active deliveries' : 'No completed deliveries'}
              </Text>
            </View>
          ) : (
            displayed.map(order => {
              const meta   = STATUS_META[order.status] || STATUS_META.PENDING_PAYMENT;
              const action = getAction(order);
              return (
                <View key={order.id} style={styles.card}>
                  {/* Top row */}
                  <View style={styles.cardTop}>
                    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={13} color={meta.color} />
                      <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
                  </View>

                  {/* Goods */}
                  <Text style={styles.goods} numberOfLines={1}>{order.goods}</Text>
                  <Text style={styles.address} numberOfLines={1}>
                    <Ionicons name="location-outline" size={13} color={colors.grayDark} /> {order.address}
                  </Text>

                  {/* Amount + date */}
                  <View style={styles.cardMid}>
                    <Text style={styles.amount}>KES {parseFloat(order.amount).toLocaleString()}</Text>
                    <Text style={styles.date}>{order.createdAt?.slice(0, 10)}</Text>
                  </View>

                  {/* Action button */}
                  {action?.screen && (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleAction(order)}
                    >
                      <Text style={styles.actionText}>{action.label}</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.white} />
                    </TouchableOpacity>
                  )}
                  {action && !action.screen && (
                    <View style={styles.waitingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.waitingText}>{action.label}</Text>
                    </View>
                  )}
                  {order._role === 'buyer' && DISPUTABLE_STATUSES.includes(order.status) && order.status !== 'DISPUTED' && (
                    <TouchableOpacity
                      style={styles.disputeBtn}
                      onPress={() => navigation.navigate('Dispute', {
                        type:        'delivery',
                        orderId:     order.id,
                        claimerType: 'BUYER',
                      })}
                    >
                      <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
                      <Text style={styles.disputeBtnText}>Open Dispute</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#F5F6FA' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 18, fontWeight: '800', color: colors.black },
  tabs:           { flexDirection: 'row', backgroundColor: colors.white, paddingHorizontal: 16,paddingVertical:12, paddingBottom: 12, gap: 8 },
  tab:            { flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F6FA', alignItems: 'center' },
  tabActive:      { backgroundColor: colors.primary },
  tabText:        { fontSize: 13, fontWeight: '700', color: colors.grayDark },
  tabTextActive:  { color: colors.white },
  scroll:         { padding: 16, gap: 12 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:          { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText:      { color: colors.grayDark, fontSize: 15 },
  card:           { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 5 },
  statusText:     { fontSize: 12, fontWeight: '700' },
  orderId:        { fontSize: 11, color: colors.grayDark, fontWeight: '600' },
  goods:          { fontSize: 16, fontWeight: '700', color: colors.black, marginBottom: 4 },
  address:        { fontSize: 13, color: colors.grayDark, marginBottom: 10 },
  cardMid:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  amount:         { fontSize: 18, fontWeight: '800', color: colors.primary },
  date:           { fontSize: 12, color: colors.grayDark },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, gap: 8 },
  actionText:     { color: colors.white, fontWeight: '700', fontSize: 14 },
  waitingRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  waitingText:    { color: colors.grayDark, fontSize: 13 },
});
