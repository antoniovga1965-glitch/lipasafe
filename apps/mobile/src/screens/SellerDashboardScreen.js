import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import LipaHeader from '../components/LipaHeader';
import { useLang } from '../context/LanguageContext';
import { authFetch } from '../utils/api';

const STATUS_COLOR = {
  PENDING_ACCEPTANCE: '#FF9500',
  ACCEPTED:     '#007AFF',
  REJECTED:     '#EF4444',
  PAYMENT_HELD: '#007AFF',
  DISPUTED:     '#EF4444',
  ESCALATED:    '#EF4444',
  COMPLETED:    '#10B981',
  AUTO_RELEASED:'#6B7280',
  CANCELLED:    '#6B7280',
  REFUNDED:     '#FF9500',
};

const STATUS_LABEL = {
  PENDING_ACCEPTANCE: 'PENDING',
  ACCEPTED:     'ACCEPTED',
  REJECTED:     'REJECTED',
  PAYMENT_HELD: 'HELD',
  DISPUTED:     'DISPUTE',
  ESCALATED:    'ESCALATED',
  COMPLETED:    'DONE',
  AUTO_RELEASED:'AUTO-RELEASED',
  CANCELLED:    'CANCELLED',
  REFUNDED:     'REFUNDED',
};

export default function SellerDashboardScreen({ navigation }) {
  const { t } = useLang();
  const [orders,       setOrders]       = useState([]);
  const [houseEscrows, setHouseEscrows] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [waiting,      setWaiting]      = useState(0);

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

      const ordersTotal = merged.reduce((sum, o) => sum + parseFloat(o.sellerReceives || o.amount || 0), 0);
      const houseTotal  = house.reduce((sum, e)  => sum + parseFloat(e.sellerReceives || e.amount || 0), 0);
      setWaiting(ordersTotal + houseTotal);
    } catch (e) {
      console.error('fetchOrders error', e);
    } finally {
      setLoading(false);
    }
  };

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

  const renderOrder = ({ item }) => {
    const isSecondHand = item.category === 'second_hand';
    const isFundi      = item.category === 'fundi';
    return (
      <TouchableOpacity style={styles.item} onPress={() => handlePress(item)}>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.service} numberOfLines={1}>
              {item.description || (isSecondHand ? 'Second Hand Item' : 'Bundle Order')}
            </Text>
          </View>
          <Text style={styles.buyer}>From: {item.buyer?.phone}</Text>
          {isSecondHand && item.inspectionHours && (
            <Text style={styles.inspection}>Inspection: {item.inspectionHours}h window</Text>
          )}
          {isFundi && item.durationHours && (
            <Text style={styles.inspection}>
              Complete in: {item.durationHours >= 24 ? `${item.durationHours/24} day(s)` : `${item.durationHours}h`}
            </Text>
          )}
          <Text style={styles.ref}>Ref: {item.referenceNo}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>KES {parseFloat(item.sellerReceives || item.amount).toFixed(2)}</Text>
          <View style={[styles.typeBadge, isSecondHand ? styles.shBadge : isFundi ? styles.fundiBadge : styles.bundleBadge]}>
            <Text style={styles.typeBadgeText}>{isSecondHand ? 'S/HAND' : isFundi ? 'FUNDI' : 'BUNDLE'}</Text>
          </View>
          <Text style={[styles.badge, (isSecondHand && item.disputes?.[0]) && { backgroundColor: '#EF4444' }]}>
            {(isSecondHand && item.disputes?.[0]) ? 'DISPUTE' : 'HELD'}
          </Text>
          {(isSecondHand || isFundi) && (
            <Text style={[styles.actionHint, (isSecondHand && item.disputes?.[0]) && { color: '#EF4444' }]}>
              {(isSecondHand && item.disputes?.[0]) ? 'Tap to respond — 1hr' : 'Tap to manage'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderHouseEscrow = ({ item }) => {
    const statusColor = STATUS_COLOR[item.status] || colors.primary;
    const deadline    = item.inspectionDeadline
      ? new Date(item.inspectionDeadline).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <TouchableOpacity
        style={[styles.item, styles.houseItem]}
        onPress={() => navigation.navigate('HouseEscrowDetail', { escrowId: item.id })}
        activeOpacity={0.75}
      >
        <View style={[styles.houseIconWrap, { backgroundColor: statusColor + '18' }]}>
          <Ionicons name="home" size={22} color={statusColor} />
        </View>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.service} numberOfLines={1}>{item.description}</Text>
            <View style={[styles.typeBadge, { backgroundColor: statusColor, marginRight: 8 }]}>
              <Text style={styles.typeBadgeText}>
                {STATUS_LABEL[item.status] || item.status}
              </Text>
            </View>
          </View>
          <Text style={styles.buyer}>Buyer: {item.buyerPhone}</Text>
          {deadline && (
            <Text style={styles.inspection}>Window closes: {deadline}</Text>
          )}
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>KES {Number(item.sellerReceives || item.amount).toLocaleString()}</Text>
          <Text style={styles.actionHint}>Tap to view</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const allEmpty = orders.length === 0 && houseEscrows.length === 0;

  return (
    <View style={styles.container}>
      <LipaHeader title={t.sellerDash} navigation={navigation} />
      <View style={styles.summary}>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Pending</Text>
          <Text style={styles.boxValue}>{orders.length + houseEscrows.length}</Text>
        </View>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Money Waiting</Text>
          <Text style={styles.boxValue}>KES {waiting.toLocaleString()}</Text>
        </View>
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        : (
          <FlatList
            data={[]}
            renderItem={null}
            keyExtractor={() => ''}
            refreshing={loading}
            onRefresh={fetchOrders}
            ListHeaderComponent={
              <>
                {/* House Escrows */}
                {houseEscrows.length > 0 && (
                  <>
                    <View style={styles.sectionRow}>
                      <Ionicons name="home" size={16} color={colors.primary} />
                      <Text style={styles.section}>House Escrows</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{houseEscrows.length}</Text>
                      </View>
                    </View>
                    {houseEscrows.map(item => (
                      <View key={item.id}>{renderHouseEscrow({ item })}</View>
                    ))}
                  </>
                )}

                {/* Other orders */}
                {orders.length > 0 && (
                  <Text style={[styles.section, { marginTop: houseEscrows.length > 0 ? 8 : 0 }]}>
                    Pending Orders
                  </Text>
                )}
              </>
            }
            ListFooterComponent={
              <>
                {orders.map(item => (
                  <View key={item.id} style={{ paddingHorizontal: 16 }}>
                    {renderOrder({ item })}
                  </View>
                ))}
                {allEmpty && (
                  <Text style={styles.empty}>No pending orders</Text>
                )}
              </>
            }
          />
        )
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.gray },
  summary:        { flexDirection: 'row', padding: 16 },
  box:            { flex: 1, backgroundColor: colors.white, borderRadius: 16, padding: 20, margin: 8, alignItems: 'center' },
  boxLabel:       { fontSize: 12, color: colors.grayDark },
  boxValue:       { fontSize: 20, fontWeight: 'bold', color: colors.primary, marginTop: 8 },
  sectionRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 10, marginBottom: 4},
  section:        { fontSize:19, fontWeight: '700', color: colors.black ,padding:12},
  countBadge:     { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { fontSize: 11, color: colors.white, fontWeight: '700' },
  list:           { padding: 16 },
  item:           { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 10 },
  houseItem:      { marginHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  houseIconWrap:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  info:           { flex: 1 },
  titleRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  service:        { fontSize: 14, fontWeight: '600', color: colors.black, flex: 1 },
  typeBadge:      { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bundleBadge:    { backgroundColor: '#551cda' },
  shBadge:        { backgroundColor: '#10B981' },
  fundiBadge:     { backgroundColor: '#F59E0B' },
  typeBadgeText:  { fontSize: 9, fontWeight: '700', color: colors.white },
  buyer:          { fontSize: 12, color: colors.grayDark, marginTop: 2 },
  inspection:     { fontSize: 11, color: '#10B981', marginTop: 2, fontWeight: '600' },
  ref:            { fontSize: 11, color: colors.grayDark, marginTop: 2 },
  right:          { alignItems: 'flex-end' },
  amount:         { fontSize: 14, fontWeight: '700', color: colors.black },
  badge:          { fontSize: 10, color: colors.white, backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  actionHint:     { fontSize: 10, color: '#10B981', marginTop: 4, fontWeight: '600' },
  empty:          { textAlign: 'center', color: colors.grayDark, marginTop: 40 },
});
