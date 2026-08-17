import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const STATUS_META = {
  PENDING_PAYMENT: { label: 'Awaiting Payment', color: '#FF9500', icon: 'time-outline' },
  PAYMENT_HELD:    { label: 'Payment Held',      color: '#007AFF', icon: 'lock-closed-outline' },
  CONFIRMED:       { label: 'Released',          color: colors.success, icon: 'checkmark-circle-outline' },
  DISPUTED:        { label: 'Disputed',          color: '#FF3B30', icon: 'alert-circle-outline' },
  ESCALATED:       { label: 'Escalated',         color: '#FF3B30', icon: 'alert-circle-outline' },
  REFUNDED:        { label: 'Refunded',          color: '#FF9500', icon: 'arrow-undo-circle-outline' },
  COMPLETED:       { label: 'Completed',         color: colors.success, icon: 'checkmark-done-circle-outline' },
  AUTO_RELEASED:   { label: 'Auto-Released',     color: colors.grayDark, icon: 'timer-outline' },
  CANCELLED:       { label: 'Cancelled',         color: colors.grayDark, icon: 'close-circle-outline' },
};

function EscrowCard({ item, onPress }) {
  const meta = STATUS_META[item.status] || { label: item.status, color: colors.grayDark, icon: 'help-circle-outline' };
  const date = new Date(item.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <View style={[styles.iconCircle, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.cardSeller}>{item.sellerPhone}</Text>
        <Text style={styles.cardDate}>{date}</Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardAmount}>KES {Number(item.amount).toLocaleString()}</Text>
        <View style={[styles.badge, { backgroundColor: meta.color + '18' }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HouseEscrowListScreen({ navigation }) {
  const [escrows,     setEscrows]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState(null);

  const fetchEscrows = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res  = await authFetch('/house/my-escrows');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      setEscrows(data.escrows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEscrows();
    const unsubscribe = navigation.addListener('focus', () => fetchEscrows());
    return unsubscribe;
  }, [navigation]);

  const handleCardPress = (item) => {
    const activeStatuses = ['PAYMENT_HELD'];
    const disputeStatuses = ['DISPUTED', 'ESCALATED'];

    if (activeStatuses.includes(item.status)) {
      navigation.navigate('HouseEscrowActive', {
        escrowId:           item.id,
        amount:             item.amount,
        sellerPhone:        item.sellerPhone,
        description:        item.description,
        inspectionHours:    item.inspectionHours,
        inspectionDeadline: item.inspectionDeadline,
      });
    } else {
      navigation.navigate('HouseEscrowDetail', { escrowId: item.id });
    }
  };

  // ── Empty ────────────────────────────────────────────────────────
  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <Ionicons name="home-outline" size={56} color={colors.border} />
        <Text style={styles.emptyTitle}>No house escrows yet</Text>
        <Text style={styles.emptySub}>
          Use the House icon on the home screen to protect your next property transaction.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>House Escrows</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchEscrows()}>
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {loading && !refreshing
        ? <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        : (
          <FlatList
            data={escrows}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <EscrowCard item={item} onPress={handleCardPress} />}
            ListEmptyComponent={renderEmpty}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchEscrows(true)}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={escrows.length === 0 ? styles.emptyContainer : { paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        )
      }

      {/* FAB — start new escrow */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('HouseHunting')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.white },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  backBtn:        { padding: 8 },
  title:          { fontSize: 18, fontWeight: '700', color: colors.black },
  errorBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0', marginHorizontal: 16, borderRadius: 10, padding: 12, gap: 8, marginBottom: 8 },
  errorText:      { flex: 1, fontSize: 13, color: colors.error },
  retryLink:      { fontSize: 13, color: colors.primary, fontWeight: '700' },
  card:           { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, backgroundColor: colors.white },
  cardLeft:       { marginRight: 12 },
  iconCircle:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardBody:       { flex: 1 },
  cardDesc:       { fontSize: 14, fontWeight: '600', color: colors.black, marginBottom: 2 },
  cardSeller:     { fontSize: 12, color: colors.grayDark, marginBottom: 2 },
  cardDate:       { fontSize: 11, color: colors.grayDark },
  cardRight:      { alignItems: 'flex-end', gap: 6 },
  cardAmount:     { fontSize: 14, fontWeight: '700', color: colors.black },
  badge:          { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText:      { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty:          { alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', color: colors.black, marginTop: 16, marginBottom: 8 },
  emptySub:       { fontSize: 13, color: colors.grayDark, textAlign: 'center', lineHeight: 20 },
  fab:            { position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
});
