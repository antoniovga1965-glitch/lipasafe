import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const STATUS_COLOR = {
  PENDING_ACCEPTANCE: '#FF9500',
  REJECTED:           colors.error,
  ACCEPTED:           '#007AFF',
  PAYMENT_HELD:       colors.primary,
  BUYER_CONFIRMED:    '#007AFF',
  COMPLETED:          colors.primary,
  DISPUTED:           colors.error,
  REFUNDED:           colors.grayDark,
  CANCELLED:          colors.grayDark,
};

const STATUS_LABEL = {
  PENDING_ACCEPTANCE: 'Awaiting',
  REJECTED:           'Rejected',
  ACCEPTED:           'Accepted',
  PAYMENT_HELD:       'In Escrow',
  BUYER_CONFIRMED:    'Confirming',
  COMPLETED:          'Done',
  DISPUTED:           'Disputed',
  REFUNDED:           'Refunded',
  CANCELLED:          'Cancelled',
};

const DELETABLE = ['PENDING_ACCEPTANCE','REJECTED','CANCELLED','COMPLETED','REFUNDED','BUYER_CONFIRMED'];

const getTimeLeft = (deadline) => {
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  if (diff <= 0) return 'Expired';
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m left`;
};

export default function CustomEscrowListScreen({ navigation }) {
  const [tab,        setTab]        = useState('buyer');
  const [deals,      setDeals]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDeals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = tab === 'buyer' ? '/custom/my/buyer' : '/custom/my/counterparty';
      const res      = await authFetch(endpoint);
      const data     = await res.json();
      if (data.success) setDeals(data.escrows);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const onRefresh = () => { setRefreshing(true); fetchDeals(true); };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Deal',
      `Delete "${item.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const res  = await authFetch(`/custom/${item.id}`, { method: 'DELETE' });
              const data = await res.json();
              if (data.success) {
                setDeals(prev => prev.filter(d => d.id !== item.id));
              } else {
                Alert.alert('Cannot Delete', data.message || 'Try again');
              }
            } catch {
              Alert.alert('Error', 'Network error. Try again.');
            }
          }
        }
      ]
    );
  };

  const renderRightActions = (item) => {
    if (!DELETABLE.includes(item.status)) return null;
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDelete(item)}
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }) => {
    const color = STATUS_COLOR[item.status] || colors.grayDark;
    const label = STATUS_LABEL[item.status] || item.status;
    const canDelete = DELETABLE.includes(item.status);
    return (
      <Swipeable
        renderRightActions={canDelete ? () => renderRightActions(item) : null}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.item}
          onPress={() => navigation.navigate('CustomEscrowDetail', { escrowId: item.id, role: tab === 'buyer' ? 'buyer' : 'counterparty' })}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.itemTop}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
              {item.isRisky && <Ionicons name="warning" size={14} color="#FF9500" />}
            </View>
            <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
            <Text style={styles.itemDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            <View style={styles.itemMeta}>
              {item.photos?.length > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="camera" size={10} color={colors.grayDark} />
                  <Text style={styles.metaChipText}>{item.photos.length}</Text>
                </View>
              )}
              {item.deadline && !['COMPLETED','REFUNDED','CANCELLED','REJECTED'].includes(item.status) && (
                <View style={[styles.metaChip, getTimeLeft(item.deadline) === 'Expired' && { backgroundColor: colors.error + '18' }]}>
                  <Ionicons name="time-outline" size={10} color={getTimeLeft(item.deadline) === 'Expired' ? colors.error : colors.grayDark} />
                  <Text style={[styles.metaChipText, getTimeLeft(item.deadline) === 'Expired' && { color: colors.error }]}>
                    {getTimeLeft(item.deadline)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.itemRight}>
            <Text style={styles.itemAmount}>KES {Number(item.amount).toLocaleString()}</Text>
            <View style={[styles.badge, { backgroundColor: color + '18' }]}>
              <Text style={[styles.badgeText, { color }]}>{label}</Text>
            </View>
            {item.dispute && (
              <View style={[styles.badge, { backgroundColor: colors.error + '18', marginTop: 4 }]}>
                <Text style={[styles.badgeText, { color: colors.error }]}>Dispute</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Custom Deals</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('CustomEscrowCreate')}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'buyer' && styles.tabActive]} onPress={() => setTab('buyer')}>
          <Text style={[styles.tabText, tab === 'buyer' && styles.tabTextActive]}>As Buyer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'counterparty' && styles.tabActive]} onPress={() => setTab('counterparty')}>
          <Text style={[styles.tabText, tab === 'counterparty' && styles.tabTextActive]}>As Counterparty</Text>
        </TouchableOpacity>
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        : <FlatList
            data={deals}
            keyExtractor={d => d.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={deals.length === 0 ? styles.empty : { paddingBottom: 32 }}
            ListEmptyComponent={
              <View style={styles.emptyContent}>
                <Ionicons name="document-text-outline" size={48} color={colors.border} />
                <Text style={styles.emptyText}>No {tab === 'buyer' ? 'deals created' : 'deal invitations'} yet</Text>
                {tab === 'buyer' && (
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('CustomEscrowCreate')}>
                    <Text style={styles.emptyBtnText}>Create a Deal</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:          { padding: 8 },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: colors.black },
  newBtn:           { padding: 8 },
  tabs:             { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, backgroundColor: colors.gray, padding: 4 },
  tab:              { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive:        { backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText:          { fontSize: 14, color: colors.grayDark, fontWeight: '500' },
  tabTextActive:    { color: colors.black, fontWeight: '700' },
  item:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  itemTop:          { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  itemTitle:        { fontSize: 15, fontWeight: '700', color: colors.black, flex: 1 },
  itemDesc:         { fontSize: 12, color: colors.grayDark, marginBottom: 4 },
  itemDate:         { fontSize: 11, color: colors.grayDark },
  itemRight:        { alignItems: 'flex-end', gap: 4 },
  itemAmount:       { fontSize: 15, fontWeight: '700', color: colors.black },
  badge:            { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:        { fontSize: 11, fontWeight: '700' },
  empty:            { flexGrow: 1 },
  emptyContent:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:        { fontSize: 15, color: colors.grayDark },
  emptyBtn:         { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  emptyBtnText:     { color: colors.white, fontWeight: '700', fontSize: 15 },
  deleteAction:     { backgroundColor: colors.error, justifyContent: 'center', alignItems: 'center', width: 80, borderBottomWidth: 1, borderBottomColor: colors.border },
  deleteActionText: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4 },
  itemMeta:         { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  metaChip:         { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.gray, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  metaChipText:     { fontSize: 10, color: colors.grayDark, fontWeight: '600' },
});
