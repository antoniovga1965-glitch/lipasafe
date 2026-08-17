import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import LipaHeader from '../components/LipaHeader';
import { useNotifications } from '../context/NotificationContext';
import { authFetch } from '../utils/api';
import { useLang } from '../context/LanguageContext';
import { Swipeable } from 'react-native-gesture-handler';

const TYPE_CONFIG = {
  money_sent:              { icon: 'arrow-up-circle',   color: '#F59E0B' },
  money_received:          { icon: 'arrow-down-circle', color: '#22C55E' },
  payment_received:        { icon: 'arrow-down-circle', color: '#22C55E' },
  deliver_now:             { icon: 'cube',              color: '#3B82F6' },
  confirm_delivery:        { icon: 'checkmark-circle',  color: '#22C55E' },
  money_released:          { icon: 'cash',              color: '#22C55E' },
  refund_sent:             { icon: 'refresh-circle',    color: '#3B82F6' },
  dispute_opened:          { icon: 'alert-circle',      color: '#EF4444' },
  dispute_resolved:        { icon: 'shield-checkmark',  color: '#22C55E' },
  auto_release_warning:    { icon: 'time',              color: '#F59E0B' },
  account_frozen:          { icon: 'snow',              color: '#6B7280' },
  house_payment_held:      { icon: 'home',              color: '#3B82F6' },
  house_confirmed:         { icon: 'home',              color: '#22C55E' },
  house_disputed:          { icon: 'home',              color: '#EF4444' },
  house_auto_released:     { icon: 'home',              color: '#F59E0B' },
  house_refunded:          { icon: 'home',              color: '#3B82F6' },
  house_payout_sent:       { icon: 'home',              color: '#22C55E' },
};

const HOUSE_TYPES = new Set([
  'house_payment_held',
  'house_confirmed',
  'house_disputed',
  'house_auto_released',
  'house_refunded',
  'house_payout_sent',
  'house_deal_accepted',
  'house_deal_rejected',
]);

export default function NotificationsScreen({ navigation }) {
  const { t } = useLang();
  const { resetUnread, notifications: liveNotifs, unreadCount } = useNotifications();
  const lastFetchRef = useRef(0);
  const [notifs, setNotifs]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);

  const fetchNotifs = useCallback(async ({ reset = false, nextPage = 1 } = {}) => {
    try {
      if (reset) { setLoading(true); setError(null); }
      const params = new URLSearchParams({ page: nextPage, limit: 20 });
      const res  = await authFetch(`/user/notifications?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      setNotifs(prev => (reset || nextPage === 1) ? data.notifications : [...prev, ...data.notifications]);
      if (reset) setPage(1);
      setHasMore(data.pagination.page < data.pagination.pages);
      setPage(nextPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    resetUnread();
    const now = Date.now();
    if (now - lastFetchRef.current > 30_000) {
      lastFetchRef.current = now;
      fetchNotifs({ reset: true, nextPage: 1 });
    }
  }, [fetchNotifs]));

  const onRefresh = () => {
    setRefreshing(true); 
    fetchNotifs({ reset: true, nextPage: 1 });
  };

  const onEndReached = () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    fetchNotifs({ nextPage: page + 1 });
  };

  const markRead = async (id) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n));
    try { await authFetch(`/user/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
  };

  const deleteNotif = async (id) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    try { await authFetch(`/user/notifications/${id}`, { method: 'DELETE' }); } catch {}
  };

  const renderRightActions = (id) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => deleteNotif(id)}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </TouchableOpacity>
  );

  const handleTap = (item) => {
    if (item.type === 'money_request_received' && item.requestId) {
      navigation.navigate('RequestDetail', { requestId: item.requestId });
      return;
    }
    
    // Handle Bundle OTP notifications
    if (item.type === 'bundle_otp' && item.transactionId) {
      markRead(item.id);
      navigation.navigate('ActivityTab', { screen: 'TransactionDetail', params: { tx: { id: item.transactionId } } });
      return;
    }
    console.log('[handleTap called]', { type: item.type, keys: Object.keys(item), fullItem: JSON.stringify(item) });
    markRead(item.id);

    const deliveryTypes = [
      'NEW_DELIVERY_ORDER', 'BEFORE_PHOTO_UPLOADED', 'BEFORE_PHOTO_REJECTED',
      'PICKUP_OTP_ISSUED', 'DELIVERY_STARTED', 'RECEIPT_OTP_ISSUED', 'PAYMENT_RELEASED',
    ];
    if (deliveryTypes.includes(item.type)) {
      navigation.navigate('DeliveryOrders');
      return;
    }

    if ((item.type === 'FUNDI_JOB_CREATED' || item.type === 'FUNDI_OTP_ISSUED' || item.type === 'FUNDI_EXTENSION_REQUESTED' || item.type === 'FUNDI_EXTENSION_APPROVED') && item.fundiJobId) {
      navigation.navigate('ProfileTab', { screen: 'FundiJob', params: { jobId: item.fundiJobId } });
      return;
    }

    if (item.type === 'FUNDI_JOB_COMPLETED' && item.fundiJobId) {
      navigation.navigate('ProfileTab', { screen: 'FundiReview', params: { jobId: item.fundiJobId } });
      return;
    }

    if (item.type === 'payment_received' && item.houseEscrowId) {
      navigation.navigate('HouseEscrowDetail', { escrowId: item.houseEscrowId });
      return;
    }
    const sellerHandoverTypes = ['payment_received', 'dispute_opened'];
    if (sellerHandoverTypes.includes(item.type) && item.transactionId && !item.houseEscrowId && !item.customEscrowId) {
      navigation.navigate('ProfileTab', {
        screen: 'SellerDashboard',
      });
      return;
    }
    const secondHandTypes = ['money_released', 'otp_handover', 'dispute_resolved'];
    if (secondHandTypes.includes(item.type) && item.transactionId && !item.houseEscrowId && !item.customEscrowId) {
      navigation.navigate('ActivityTab', {
        screen: 'TransactionDetail',
        params: { tx: { id: item.transactionId, category: 'second_hand' } },
      });
      return;
    }

    const customTypes = ['CUSTOM_DEAL_RECEIVED', 'CUSTOM_DEAL_ACCEPTED', 'CUSTOM_DEAL_REJECTED', 'CUSTOM_BUYER_CONFIRMED', 'CUSTOM_PAYMENT_RELEASED', 'dispute_opened', 'dispute_resolved'];
    if (customTypes.includes(item.type) && item.customEscrowId) {
      navigation.navigate('PayTab', {
        screen: 'CustomEscrowDetail',
        params: { escrowId: item.customEscrowId },
      });
      return;
    }
    
    // Handle transfer notifications (both old 'transfer_incoming' and new 'transfer_received')
    if (item.type === 'transfer_received' || item.type === 'TRANSFER_RECEIVED' || item.type === 'transfer_incoming') {
      const transferId = item.data?.transferId || item.transferId || item.transactionId;
      console.log('[Transfer DEBUG]', { 
        itemType: item.type, 
        itemData: item.data, 
        itemTransferId: item.transferId,
        itemTransactionId: item.transactionId,
        resolvedTransferId: transferId,
        hasTransferId: !!transferId
      });
      if (transferId) {
        console.log('[About to navigate]', { transferId });
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Main',
            state: {
              routes: [{
                name: 'HomeTab',
                state: {
                  routes: [{ name: 'SafeTransfer', params: { transferId } }]
                }
              }]
            }
          }]
        });
        return;
      } else {
        console.log('[NO TRANSFER ID FOUND]');
      }
    }
    
    // Handle house notifications
    if (HOUSE_TYPES.has(item.type) && item.houseEscrowId) {
      navigation.navigate('HouseEscrowDetail', { escrowId: item.houseEscrowId });
      return;
    }
  };

  const renderItem = ({ item }) => {
    const cfg      = TYPE_CONFIG[item.type] || { icon: 'notifications', color: colors.primary };
    const isUnread = item.status === 'pending' || item.status === 'sent';
    const message  = item.messageEn || item.type.replace(/_/g, ' ');
    const label    = item.type.replace(/_/g, ' ');

    return (
      <Swipeable renderRightActions={() => renderRightActions(item.id)}>
        <TouchableOpacity
          style={[styles.item, isUnread && styles.itemUnread]}
          onPress={() => handleTap(item)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }]}>
            <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          </View>
          <View style={styles.info}>
            <Text style={styles.typeLabel}>{label}</Text>
            <Text style={styles.body}>{message}</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          {isUnread && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.notifications} navigation={navigation} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchNotifs({ reset: true, nextPage: 1 })}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifs}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={notifs.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
              : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F5F5F5' },
  list:           { paddingVertical: 16 },
  emptyContainer: { flexGrow: 1 },
  item:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, marginHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  itemUnread:     { borderLeftWidth: 3, borderLeftColor: colors.primary },
  iconWrap:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  info:           { flex: 1 },
  typeLabel:      { fontSize: 13, fontWeight: '700', color: '#111', textTransform: 'capitalize' },
  body:           { fontSize: 12, color: '#6B7280', marginTop: 3 },
  date:           { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  unreadDot:      { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginLeft: 8 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:      { color: '#9CA3AF', fontSize: 14 },
  errorText:      { color: '#EF4444', fontSize: 14, marginBottom: 12, paddingHorizontal: 24, textAlign: 'center' },
  retryBtn:       { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText:      { color: '#fff', fontWeight: '600' },
  deleteAction:   { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 52, alignSelf: 'stretch', borderTopRightRadius: 14, borderBottomRightRadius: 14, marginBottom: 10, marginRight: 16 },
});
