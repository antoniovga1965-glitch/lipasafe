
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, RefreshControl
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import LipaHeader from '../components/LipaHeader';
import { useLang } from '../context/LanguageContext';
import { authFetch } from '../utils/api';

const STATUS_COLOR = {
  PENDING_ACCEPTANCE: '#FF9500',
  ACCEPTED:      '#007AFF',
  REJECTED:      '#EF4444',
  PAYMENT_HELD:  '#007AFF',
  DISPUTED:      '#EF4444',
  ESCALATED:     '#EF4444',
  COMPLETED:     '#10B981',
  AUTO_RELEASED: '#6B7280',
  CANCELLED:     '#6B7280',
  REFUNDED:      '#FF9500',
};

const STATUS_LABEL = {
  PENDING_ACCEPTANCE: 'PENDING',
  ACCEPTED:      'ACCEPTED',
  REJECTED:      'REJECTED',
  PAYMENT_HELD:  'HELD',
  DISPUTED:      'DISPUTE',
  ESCALATED:     'ESCALATED',
  COMPLETED:     'DONE',
  AUTO_RELEASED: 'AUTO-RELEASED',
  CANCELLED:     'CANCELLED',
  REFUNDED:      'REFUNDED',
};

const TABS = [
  { key: 'all',         label: 'All'     },
  { key: 'bundle',      label: 'Bundle'  },
  { key: 'second_hand', label: 'S/Hand'  },
  { key: 'fundi',       label: 'Fundi'   },
  { key: 'house',       label: 'House'   },
];

export default function SellerDashboardScreen({ navigation }) {
  const { t } = useLang();
  const [orders,       setOrders]       = useState([]);
  const [houseEscrows, setHouseEscrows] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [waiting,      setWaiting]      = useState(0);
  const [activeTab,    setActiveTab]    = useState('all');

  useFocusEffect(useCallback(() => { fetchOrders(); }, []));

  const fetchOrders = async () => {
    try {
      setLoading(true);

      const [bundleRes, shRes, fundiRes, houseRes] = await Promise.allSettled([
        authFetch('/transactions/bundle/seller/pending'),
        authFetch('/second-hand/seller/pending'),
        authFetch('/fundi/seller/pending'),
        authFetch('/house/seller/pending'),
      ]);

      const bundleOrders = bundleRes.status === 'fulfilled'
        ? await bundleRes.value.json().then(d => d.success ? d.orders.map(o => ({ ...o, category: 'bundle' })) : [])
        : [];

      const shOrders = shRes.status === 'fulfilled'
        ? await shRes.value.json().then(d => d.success ? d.orders.map(o => ({ ...o, category: 'second_hand' })) : [])
        : [];

      const fundiOrders = fundiRes.status === 'fulfilled'
        ? await fundiRes.value.json().then(d => d.success ? d.orders.map(o => ({ ...o, category: 'fundi' })) : [])
        : [];

      const house = houseRes.status === 'fulfilled'
        ? await houseRes.value.json().then(d => d.success ? d.escrows : [])
        : [];

      const merged = [...bundleOrders, ...shOrders, ...fundiOrders]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setOrders(merged);
      setHouseEscrows(house);

      // Exclude DISPUTED/ESCALATED from money waiting — that money is frozen
      const ordersTotal = merged
        .filter(o => !['DISPUTED', 'ESCALATED', 'REFUNDED', 'CANCELLED'].includes(o.status))
        .reduce((sum, o) => sum + parseFloat(o.sellerReceives || o.amount || 0), 0);
      const houseTotal = house
        .filter(e => !['DISPUTED', 'ESCALATED', 'REFUNDED', 'CANCELLED'].includes(e.status))
        .reduce((sum, e) => sum + parseFloat(e.sellerReceives || e.amount || 0), 0);
      setWaiting(ordersTotal + houseTotal);
    } catch (e) {
      console.error('fetchOrders error', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Same handlePress logic unchanged ──────────────────────────────────────
  const handlePress = (item) => {
    if (item.category === 'second_hand') {
      const activeDispute = item.disputes?.[0];
      if (activeDispute) {
        navigation.navigate('SecondHandDisputeRespond', { orderId: item.id, dispute: activeDispute });
      } else {
        navigation.navigate('SecondHandHandover', { tx: item });
      }
    } else if (item.category === 'fundi') {
      navigation.navigate('FundiJob', { tx: item });
    } else {
      navigation.navigate('DeliveryConfirmation', { tx: item });
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredOrders = activeTab === 'all' || activeTab === 'house'
    ? orders.filter(o => activeTab === 'all' ? true : o.category === activeTab)
    : orders.filter(o => o.category === activeTab);

  const filteredHouse = (activeTab === 'all' || activeTab === 'house') ? houseEscrows : [];

  const allEmpty = filteredOrders.length === 0 && filteredHouse.length === 0;
  const totalCount = orders.length + houseEscrows.length;

  // ── Card renderer — unified for all services ───────────────────────────────
  const renderCard = (item, isHouse = false) => {
    const isSecondHand = item.category === 'second_hand';
    const isFundi      = item.category === 'fundi';
    const hasDispute   = isSecondHand && item.disputes?.[0];
    const houseStatus  = isHouse ? (item.status || 'PAYMENT_HELD') : null;
    const statusColor  = hasDispute ? '#EF4444' : isHouse ? (STATUS_COLOR[houseStatus] || colors.primary) : colors.primary;

    const categoryLabel = isHouse ? 'HOUSE'
      : isSecondHand ? 'S/HAND'
      : isFundi ? 'FUNDI'
      : 'BUNDLE';

    const deadline = isHouse && item.inspectionDeadline
      ? new Date(item.inspectionDeadline).toLocaleString('en-KE', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
      : null;

    const onPress = isHouse
      ? () => navigation.navigate('HouseEscrowDetail', { escrowId: item.id })
      : () => handlePress(item);


      
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Left accent bar */}
        <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

        <View style={styles.cardBody}>
          {/* Top row: description + amount */}
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.description || (isSecondHand ? 'Second Hand Item' : isHouse ? 'House Escrow' : 'Bundle Order')}
            </Text>
            <Text style={styles.cardAmount}>
              KES {parseFloat(item.sellerReceives || item.amount || 0).toLocaleString()}
            </Text>
          </View>

          {/* Mid row: buyer + ref */}
          <View style={styles.cardMid}>
            <Text style={styles.cardSub}>
              {isHouse ? `Buyer: ${item.buyerPhone}` : `From: ${item.buyer?.phone}`}
            </Text>
            {!isHouse && item.referenceNo && (
              <Text style={styles.cardRef}>#{item.referenceNo}</Text>
            )}
          </View>

          {/* Extra info line */}
          {isSecondHand && item.inspectionHours && (
            <Text style={styles.cardMeta}>Inspection: {item.inspectionHours}h window</Text>
          )}
          {isFundi && item.durationHours && (
            <Text style={styles.cardMeta}>
              Complete in: {item.durationHours >= 24 ? `${item.durationHours / 24} day(s)` : `${item.durationHours}h`}
            </Text>
          )}
          {deadline && (
            <Text style={styles.cardMeta}>Window closes: {deadline}</Text>
          )}

          {/* Bottom row: badges + action hint */}
          <View style={styles.cardBottom}>
            <View style={[styles.catBadge, { backgroundColor: statusColor + '18' }]}>
              <Text style={[styles.catBadgeText, { color: statusColor }]}>{categoryLabel}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>
                {hasDispute ? 'DISPUTE' : isHouse ? (STATUS_LABEL[houseStatus] || houseStatus) : 'HELD'}
              </Text>
            </View>
            <Text style={[styles.actionHint, { color: statusColor }]}>
              {hasDispute ? 'Respond within 1hr' : 'Tap to manage'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.sellerDash || 'Seller Dashboard'} navigation={navigation} />

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totalCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statValue, styles.statMoney]}>
            KES {waiting.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Available to Earn</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            // Count per tab
            const count = tab.key === 'all' ? totalCount
              : tab.key === 'house' ? houseEscrows.length
              : orders.filter(o => o.category === tab.key).length;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchOrders} colors={[colors.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {allEmpty ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptySub}>No pending orders in this category</Text>
            </View>
          ) : (
            <>
              {filteredHouse.map(item => renderCard(item, true))}
              {filteredOrders.map(item => renderCard(item, false))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F5F6FA' },

  statsBar:    { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  statBox:     { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: '#F0F0F0' },
  statValue:   { fontSize: 22, fontWeight: '800', color: '#111' },
  statMoney:   { color: colors.primary },
  statLabel:   { fontSize: 12, color: '#888', marginTop: 2, fontWeight: '500' },

  tabBar:      { backgroundColor: '#F5F6FA', paddingTop: 14, paddingBottom: 6 },
  tabScroll:   { paddingHorizontal: 16, gap: 8 },
  tab:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  tabActive:   { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText:     { fontSize: 13, fontWeight: '600', color: '#555' },
  tabTextActive:  { color: '#fff' },
  tabCount:    { backgroundColor: '#F0F0F0', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText:   { fontSize: 10, fontWeight: '700', color: '#555' },
  tabCountTextActive: { color: '#fff' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  card:        { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardAccent:  { width: 4, backgroundColor: colors.primary },
  cardBody:    { flex: 1, padding: 14 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: '#111', flex: 1, marginRight: 8 },
  cardAmount:  { fontSize: 15, fontWeight: '800', color: '#111' },
  cardMid:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardSub:     { fontSize: 12, color: '#888' },
  cardRef:     { fontSize: 11, color: '#aaa' },
  cardMeta:    { fontSize: 11, color: colors.primary, fontWeight: '600', marginBottom: 4 },
  cardBottom:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  catBadge:    { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText:{ fontSize: 10, fontWeight: '700' },
  statusBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  actionHint:  { fontSize: 11, fontWeight: '600', marginLeft: 'auto' },

  emptyWrap:   { alignItems: 'center', marginTop: 64 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: '#374151', marginTop: 14 },
  emptySub:    { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
});