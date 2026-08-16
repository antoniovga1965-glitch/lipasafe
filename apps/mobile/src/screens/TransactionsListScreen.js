import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';
import { useLang } from '../context/LanguageContext';

const FILTERS = ['all', 'completed', 'pending', 'failed'];

const TYPE_ICON = {
  send: { name: 'arrow-up-circle', color: '#EF4444' },
  receive: { name: 'arrow-down-circle', color: '#22C55E' },
  top_up: { name: 'wallet', color: '#3B82F6' },
  withdrawal: { name: 'cash', color: '#F59E0B' },
  escrow_lock: { name: 'lock-closed', color: '#F59E0B' },
  escrow_release: { name: 'lock-open', color: '#22C55E' },
  refund: { name: 'refresh-circle', color: '#3B82F6' },
  recall: { name: 'return-up-back', color: '#6B7280' },
};

const STATUS_COLOR = {
  completed: '#22C55E',
  pending: '#F59E0B',
  failed: '#EF4444',
  reversed: '#EF4444',
  recalled: '#6B7280',
  disputed: '#F59E0B',
};

const BUNDLE_STATE_CONFIG = {
  held: { label: 'Awaiting Delivery', color: '#F59E0B', icon: 'time-outline' },
  delivered: { label: 'Confirm Receipt', color: '#3B82F6', icon: 'checkmark-circle-outline' },
  payment_pending: { label: 'Payment Processing', color: '#6B7280', icon: 'hourglass-outline' },
  released: { label: 'Complete', color: '#22C55E', icon: 'checkmark-done-circle' },
  refunded: { label: 'Refunded', color: '#3B82F6', icon: 'refresh-circle' },
  disputed: { label: 'Disputed', color: '#EF4444', icon: 'warning-outline' },
  initiated: { label: 'Initiated', color: '#6B7280', icon: 'ellipsis-horizontal-circle-outline' },
};

export default function TransactionsListScreen({ navigation }) {
  const { t } = useLang();

  // Bundle orders state
  const [bundleTxs, setBundleTxs] = useState([]);
  const [bundleLoading, setBundleLoading] = useState(true);
  const [secondHandTxs, setSecondHandTxs] = useState([]);
  const [fundiJobs, setFundiJobs] = useState([]);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [houseEscrows, setHouseEscrows] = useState([]);
  const [customEscrows, setCustomEscrows] = useState([]);
  const [safeSendTxs, setSafeSendTxs] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const [ratingTx, setRatingTx] = useState(null);
  const [rating, setRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  // Wallet ledger state
  const [txs, setTxs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Selection state
  const [typeTab, setTypeTab] = useState('all');
  const [selectedItems, setSelectedItems] = useState(new Map());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchBundleTxs = useCallback(async () => {
    try {
      setBundleLoading(true);
      const res = await authFetch('/transactions/bundle/my');
      const data = await res.json();
      if (data.success) setBundleTxs(data.transactions || []);
    } catch (_) { }
    finally { setBundleLoading(false); }
  }, []);

  const fetchDeliveryOrders = useCallback(async () => {
    try {
      const [buyerRes, riderRes] = await Promise.all([
        authFetch('/delivery/history?type=buyer'),
        authFetch('/delivery/history?type=rider'),
      ])
      const b = await buyerRes.json()
      const r = await riderRes.json()
      const merged = [
        ...(b.success ? b.orders || [] : []).map(o => ({ ...o, _role: 'buyer' })),
        ...(r.success ? r.orders || [] : []).map(o => ({ ...o, _role: 'rider' })),
      ]
      const seen = new Set()
      setDeliveryOrders(merged.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true }))
    } catch (_) { }
  }, [])

  const fetchFundiJobs = useCallback(async () => {
    try {
      const res = await authFetch('/fundi/');
      const data = await res.json();
      if (data.success) setFundiJobs(data.jobs || []);
    } catch (_) { }
  }, []);

  const fetchSecondHandTxs = useCallback(async () => {
    try {
      const res = await authFetch('/second-hand/transactions?role=buyer');
      const data = await res.json();
      if (data.success) setSecondHandTxs(data.transactions || []);
    } catch (_) { }
  }, []);

  const fetchHouseEscrows = useCallback(async () => {
    try {
      const res = await authFetch('/house/my-escrows');
      const data = await res.json();
      if (data.success) setHouseEscrows(data.escrows || []);
    } catch (_) { }
  }, []);

  const fetchCustomEscrows = useCallback(async () => {
    try {
      const [bRes, cRes] = await Promise.all([
        authFetch('/custom/my/buyer'),
        authFetch('/custom/my/counterparty'),
      ])
      const bData = await bRes.json()
      const cData = await cRes.json()
      const all = [
        ...(bData.escrows || []).map(e => ({ ...e, _customRole: 'buyer' })),
        ...(cData.escrows || []).map(e => ({ ...e, _customRole: 'counterparty' })),
      ]
      setCustomEscrows(all)
    } catch { e } {
      console.error(e)
    }
  }, [])

  const fetchSafeSendTxs = useCallback(async () => {
    try {
      const res = await authFetch('/transfer/')
      const data = await res.json()
      if (data.success) setSafeSendTxs(data.transfers || [])
    } catch (_) { }
  }, [])

  const fetchTxs = useCallback(async ({ reset = false, nextPage = 1, currentFilter = filter } = {}) => {
    try {
      if (reset) { setLoading(true); setError(null); }
      else if (nextPage > 1) { setLoadingMore(true); }

      const params = new URLSearchParams({ page: nextPage, limit: 20 });
      if (currentFilter !== 'all') params.append('status', currentFilter);

      const res = await authFetch(`/wallet/transactions?${params}`);
      const data = await res.json();

      if (data.success) {
        const newTxs = data.transactions || [];
        setTxs(prev => (reset || nextPage === 1) ? newTxs : [...prev, ...newTxs]);
        setPage(nextPage);
        setHasMore(newTxs.length === 20);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => {
    fetchBundleTxs();
    fetchSecondHandTxs();
    fetchFundiJobs();
    fetchDeliveryOrders();
    fetchHouseEscrows();
    fetchCustomEscrows();
    fetchSafeSendTxs();
    fetchTxs({ reset: true, nextPage: 1 });
  }, []));


  useEffect(() => {
    const hasHeld = bundleTxs.some(tx => tx.state === 'held');
    if (!hasHeld) return;
    const interval = setInterval(fetchBundleTxs, 5000);
    return () => clearInterval(interval);
  }, [bundleTxs.length]);

  useEffect(() => {
    const hasDelivered = secondHandTxs.some(tx => tx.state === 'delivered');
    if (!hasDelivered) return;
    const interval = setInterval(fetchSecondHandTxs, 5000);
    return () => clearInterval(interval);
  }, [secondHandTxs.length]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBundleTxs();
    fetchSecondHandTxs();
    fetchSafeSendTxs();
    fetchFundiJobs();
    fetchDeliveryOrders();
    fetchHouseEscrows();
    fetchTxs({ reset: true, nextPage: 1 });
  };

  const onEndReached = () => {
    if (!loadingMore && hasMore) fetchTxs({ nextPage: page + 1 });
  };

  const onFilterChange = (f) => {
    setFilter(f);
    fetchTxs({ reset: true, nextPage: 1, currentFilter: f });
  };

  // ─── Bundle actions ─────────────────────────────────────────────────────

  const handleConfirmReceipt = async (tx) => {
    setConfirmingId(tx.id);
    try {
      const res = await authFetch(`/transactions/bundle/${tx.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (data.success) {
        navigation.navigate('OTPConfirm', {
          transactionId: tx.id,
          referenceNo: tx.referenceNo,
          category: tx.category,
          tx,
        });
      } else {
        Alert.alert('Error', data.message || 'Could not confirm receipt');
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleConfirmSecondHand = (tx) => {
    navigation.navigate('OTPConfirm', {
      transactionId: tx.id,
      referenceNo: tx.referenceNo,
      category: 'second_hand',
      tx,
    });
  };

  const submitRating = async () => {
    if (!ratingTx) return;
    setSubmittingRating(true);
    try {
      if (rating > 0) {
        await authFetch(`/transactions/bundle/${ratingTx.id}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
        });
      }
    } catch (_) { }
    finally {
      setSubmittingRating(false);
      setRatingTx(null);
      setRating(0);
    }
  };

  // ─── Selection + delete ─────────────────────────────────────────────────

  const toggleSelectItem = (item) => {
    const next = new Map(selectedItems);

    const itemKey = item._isBundleTx ? `bundle-${item.id}`
    : item._isSecondHandTx ? `sh-${item.id}`
      : item._isFundiJob ? `fundi-${item.id}`
        : item._isDeliveryOrder ? `delivery-${item.id}`
          : item._isHouseEscrow ? `house-${item.id}`
            : item._isCustomEscrow ? `custom-${item.id}`
              : item._isSafeSend ? `safesend-${item.id}`
                : `tx-${item.id}`;

  if (next.has(itemKey)) {
    next.delete(itemKey);
  } else {
    next.set(itemKey, {
      id: item.id,
      _isBundleTx: !!item._isBundleTx,
      _isSecondHandTx: !!item._isSecondHandTx,
      _isFundiJob: !!item._isFundiJob,
      _isDeliveryOrder: !!item._isDeliveryOrder,
      _isHouseEscrow: !!item._isHouseEscrow,
      _isCustomEscrow: !!item._isCustomEscrow,
      _isSafeSend: !!item._isSafeSend,
    });
  }

  setSelectedItems(next);

  if (next.size === 0) {
    setIsSelectMode(false);
  }
};

const clearSelection = () => {
  setSelectedItems(new Map());
  setIsSelectMode(false);
};

const handleDeleteSelected = () => {
  if (selectedItems.size === 0) return;

  Alert.alert(
    'Delete Transactions',
    `Delete ${selectedItems.size} transaction(s)? This cannot be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const selectedArray = Array.from(selectedItems.values());

            // Fire all DELETEs concurrently — collect results with context
            const results = await Promise.all(
              selectedArray.map(async tx => {
                let endpoint;
                if (tx._isBundleTx) endpoint = `/transactions/bundle/${tx.id}`;
                else if (tx._isSecondHandTx) endpoint = `/second-hand/transactions/${tx.id}`;
                else if (tx._isFundiJob) endpoint = `/fundi/${tx.id}`;
                else if (tx._isDeliveryOrder) endpoint = `/delivery/${tx.id}`;
                else if (tx._isHouseEscrow) endpoint = `/house/${tx.id}`;
                else if (tx._isCustomEscrow) endpoint = `/custom/${tx.id}`;
                else if (tx._isSafeSend) endpoint = `/transfer/${tx.id}`;
                else endpoint = `/wallet/transactions/${tx.id}`;
                const r = await authFetch(endpoint, { method: 'DELETE' });
                const body = await r.json().catch(() => ({}));
                return { tx, ok: r.ok || r.status === 404, message: body.message || '' };
              })
            );

            const failed = results.filter(r => !r.ok);
            const success = results.filter(r => r.ok);

            if (failed.length > 0 && success.length === 0) {
              // All failed
              throw new Error(failed[0].message || 'Deletion failed. Please try again.');
            }

            if (failed.length > 0) {
              // Some failed — tell user which and why
              Alert.alert(
                'Partially Deleted',
                `${success.length} deleted. ${failed.length} could not be deleted:\n${failed.map(f => f.message).join('\n')}`
              );
            }

            // Clean local state for successful deletes only
            const deletedIds = new Set(success.map(r => r.tx.id));

            setBundleTxs(prev => prev.filter(t => !deletedIds.has(t.id)));
            setTxs(prev => prev.filter(t => !deletedIds.has(t.id)));
            setSecondHandTxs(prev => prev.filter(t => !deletedIds.has(t.id)));
            setFundiJobs(prev => prev.filter(t => !deletedIds.has(t.id)));
            setDeliveryOrders(prev => prev.filter(t => !deletedIds.has(t.id)));
            setHouseEscrows(prev => prev.filter(t => !deletedIds.has(t.id)));
            setCustomEscrows(prev => prev.filter(t => !deletedIds.has(t.id)));
            clearSelection();

            // NO refetch on success — you already know what was deleted

          } catch (err) {
            Alert.alert('Error', err.message);
            // Only refetch on failure to restore real server state
            fetchBundleTxs();
            fetchTxs({ reset: true, nextPage: 1 });
          }
        },
      },
    ]
  );
};

// ─── Unified data ───────────────────────────────────────────────────────

const allData = useMemo(() => [
  ...bundleTxs.map(tx => ({ ...tx, _isBundleTx: true })),
  ...deliveryOrders.map(o => ({ ...o, _isDeliveryOrder: true })),
  ...secondHandTxs.map(tx => ({ ...tx, _isSecondHandTx: true })),
  ...fundiJobs.map(job => ({ ...job, _isFundiJob: true })),
  ...houseEscrows.map(e => ({ ...e, _isHouseEscrow: true })),
  ...customEscrows.map(e => ({ ...e, _isCustomEscrow: true })),
  ...safeSendTxs.map(t => ({ ...t, _isSafeSend: true })),
  ...txs,
], [bundleTxs, deliveryOrders, secondHandTxs, fundiJobs, houseEscrows, customEscrows, safeSendTxs, txs])

const combinedData = useMemo(() => {
  if (typeTab === 'all') return allData
  if (typeTab === 'bundle') return allData.filter(i => i._isBundleTx)
  if (typeTab === 'delivery') return allData.filter(i => i._isDeliveryOrder)
  if (typeTab === 'fundi') return allData.filter(i => i._isFundiJob)
  if (typeTab === 'second-hand') return allData.filter(i => i._isSecondHandTx)
  if (typeTab === 'house') return allData.filter(i => i._isHouseEscrow)
  if (typeTab === 'custom') return allData.filter(i => i._isCustomEscrow)
  if (typeTab === 'wallet') return allData.filter(i => !i._isBundleTx && !i._isDeliveryOrder && !i._isSecondHandTx && !i._isFundiJob)
  if (typeTab === 'safe-send') return allData.filter(i => i._isSafeSend)
  return allData
}, [allData, typeTab])

// ─── Render helpers ─────────────────────────────────────────────────────

const renderItem = ({ item }) => {
  const itemKey = item._isBundleTx ? `bundle-${item.id}`
    : item._isSecondHandTx ? `sh-${item.id}`
      : item._isFundiJob ? `fundi-${item.id}`
        : item._isDeliveryOrder ? `delivery-${item.id}`
          : item._isHouseEscrow ? `house-${item.id}`
            : item._isCustomEscrow ? `custom-${item.id}`
              : item._isSafeSend ? `safesend-${item.id}`
                : `tx-${item.id}`;
  const isSelected = selectedItems.has(itemKey);

  // ── SafeSend row ────────────────────────────────────────────────────
  if (item._isSafeSend) {
    const STATE_CFG = {
      PENDING:   { label: 'Pending',   color: '#F59E0B', icon: 'time-outline' },
      RELEASING: { label: 'Releasing', color: '#3B82F6', icon: 'sync-outline' },
      REFUNDING: { label: 'Refunding', color: '#F97316', icon: 'refresh-outline' },
      ACCEPTED:  { label: 'Accepted',  color: '#22C55E', icon: 'checkmark-circle-outline' },
      DECLINED:  { label: 'Declined',  color: '#EF4444', icon: 'close-circle-outline' },
      CANCELLED: { label: 'Cancelled', color: '#6B7280', icon: 'ban-outline' },
      EXPIRED:   { label: 'Expired',   color: '#9CA3AF', icon: 'alert-circle-outline' },
    }
    const cfg = STATE_CFG[item.state] || STATE_CFG.PENDING
    const isSender = item.role === 'sender'
    const subLabel = isSender
      ? `To: ${item.recipientPhone}`
      : `From: ${item.sender?.fullName || item.sender?.phone || 'Unknown'}`
    return (
      <TouchableOpacity
        style={[styles.item, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onPress={() => {
          if (isSelectMode) { toggleSelectItem(item); }
          else { navigation.navigate('SafeSendDetail', { transferId: item.id }); }
        }}
        onLongPress={() => { setIsSelectMode(true); toggleSelectItem(item); }}
      >
        <View style={styles.itemRow}>
          {isSelectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
            <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          </View>
          <View style={styles.info}>
            <Text style={styles.type}>SafeSend</Text>
            <Text style={styles.note} numberOfLines={1}>{subLabel}</Text>
            {item.description ? <Text style={styles.note} numberOfLines={1}>{item.description}</Text> : null}
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.amount, { color: cfg.color }]}>KES {Number(item.amount).toLocaleString()}</Text>
            <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
              <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  // ── Bundle row ──────────────────────────────────────────────────────
  if (item._isBundleTx) {
    const cfg = BUNDLE_STATE_CONFIG[item.state] || { label: item.state, color: '#6B7280', icon: 'swap-horizontal' };
    const isDelivered = item.state === 'delivered';
    const isConfirming = confirmingId === item.id;

    return (
      <TouchableOpacity
        style={[styles.item, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onPress={() => {
          if (isSelectMode) {
            toggleSelectItem(item);
          } else {
            navigation.navigate('TransactionDetail', {
              tx: { ...item, type: 'bundle' },
            });
          }
        }}
        onLongPress={() => {
          setIsSelectMode(true);
          toggleSelectItem(item);
        }}
      >
        <View style={styles.itemRow}>
          {isSelectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}

          <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
            <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          </View>

          <View style={styles.info}>
            <View style={styles.bundleTitleRow}>
              <Text style={[styles.type, { flex: 1 }]} numberOfLines={1}>{item.description}</Text>
              <View style={styles.bundleTag}>
                <Text style={styles.bundleTagText}>Bundle</Text>
              </View>
            </View>
            <Text style={styles.note} numberOfLines={1}>Ref: {item.referenceNo}</Text>
            <Text style={styles.date}>Seller: {item.seller?.phone}</Text>
          </View>

          <View style={styles.right}>
            <Text style={[styles.amount, { color: '#111' }]}>KES {item.amount}</Text>
            <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
              <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

        </View>
        {isDelivered && (
          <View style={styles.bundleActions}>
            <TouchableOpacity
              style={[styles.confirmBtn, { flex: 1 }, isConfirming && { opacity: 0.6 }]}
              onPress={() => handleConfirmReceipt(item)}
              disabled={isConfirming}
            >
              {isConfirming
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmBtnText}>✓ Received</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.disputeBtn}
              onPress={() => navigation.navigate('Dispute', { transactionId: item.id, referenceNo: item.referenceNo })}
              disabled={isConfirming}
            >
              <Text style={styles.disputeBtnText}>⚠ Dispute</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Second-hand transaction row ────────────────────────────────────────
  if (item._isSecondHandTx) {
    const isDelivered = item.state === 'delivered';
    const stateColor = isDelivered ? '#3B82F6' : '#6B7280';
    const stateLabel = isDelivered ? 'Delivered' : (item.state || 'pending').replace('_', ' ');
    return (
      <TouchableOpacity
        style={[styles.item, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onPress={() => { if (isSelectMode) { toggleSelectItem(item); } else { navigation.navigate('TransactionDetail', { tx: { ...item, type: 'second_hand' } }); } }}
        onLongPress={() => { setIsSelectMode(true); toggleSelectItem(item); }}
      >
        <View style={styles.itemRow}>
          {isSelectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          <View style={[styles.iconWrap, { backgroundColor: stateColor + '1A' }, isSelectMode && styles.iconWrapHidden]}>
            <Ionicons name="cube-outline" size={22} color={stateColor} />
          </View>
          <View style={styles.info}>
            <Text style={styles.type} numberOfLines={1}>{item.listing?.title || item.description || 'Second-hand item'}</Text>
            <Text style={styles.note} numberOfLines={1}>Ref: {item.referenceNo}</Text>
            <Text style={styles.date}>Seller: {item.seller?.phone}</Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.amount, { color: '#111' }]}>KES {item.amount}</Text>
            <View style={[styles.badge, { backgroundColor: stateColor + '22' }]}>
              <Text style={[styles.badgeText, { color: stateColor }]}>{stateLabel}</Text>
            </View>
          </View>
        </View>
        {isDelivered && (
          <View style={styles.bundleActions}>
            <TouchableOpacity
              style={[styles.confirmBtn, { flex: 1 }]}
              onPress={() => handleConfirmSecondHand(item)}
            >
              <Text style={styles.confirmBtnText}>✓ Confirm Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.disputeBtn}
              onPress={() => navigation.navigate('Dispute', { transactionId: item.id, referenceNo: item.referenceNo })}
            >
              <Text style={styles.disputeBtnText}>⚠ Dispute</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Delivery order row ──────────────────────────────────────────────────
  if (item._isDeliveryOrder) {
    const STATUS_CFG = {
      PENDING_PAYMENT: { label: 'Awaiting Payment', color: '#FF9500', icon: 'time-outline' },
      IN_TRANSIT: { label: 'In Transit', color: '#10B981', icon: 'bicycle-outline' },
      AWAITING_RECEIPT: { label: 'Confirm Receipt', color: '#3B82F6', icon: 'checkmark-circle-outline' },
      COMPLETED: { label: 'Completed', color: '#00A86B', icon: 'checkmark-done-circle' },
      REFUNDED: { label: 'Refunded', color: '#EF4444', icon: 'return-down-back-outline' },
      DISPUTED: { label: 'Disputed', color: '#EF4444', icon: 'alert-circle-outline' },
    }
    const cfg = STATUS_CFG[item.status] || { label: item.status, color: '#6B7280', icon: 'bicycle-outline' }
    const canDisp = item._role === 'buyer' && !['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(item.status)
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.item, styles.itemRow, { flexWrap: 'wrap' }, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onPress={() => { if (isSelectMode) { toggleSelectItem(item); } else { navigation.navigate('PayTab', { screen: 'DeliveryOrders' }); } }}
        onLongPress={() => { setIsSelectMode(true); toggleSelectItem(item); }}
      >
        {isSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={styles.info}>
          <View style={styles.bundleTitleRow}>
            <Text style={[styles.type, { flexShrink: 1 }]} numberOfLines={1}>{item.goods || 'Delivery'}</Text>
            <View style={[styles.bundleTag, { backgroundColor: '#FFF4E5' }]}>
              <Text style={[styles.bundleTagText, { color: '#FF9500' }]}>DELIVERY</Text>
            </View>
          </View>
          <Text style={styles.note} numberOfLines={1}>#{item.id.slice(-8).toUpperCase()}</Text>
          <Text style={styles.date}>{item.createdAt?.slice(0, 10)} · {item._role}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: '#111' }]}>KES {parseFloat(item.amount).toLocaleString()}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {canDisp && (
          <View style={styles.bundleActions}>
            <TouchableOpacity
              style={styles.disputeBtn}
              onPress={() => navigation.navigate('Dispute', {
                type: 'delivery', orderId: item.id, claimerType: 'BUYER',
              })}
            >
              <Text style={styles.disputeBtnText}>Dispute</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  // ── House escrow row ────────────────────────────────────────────────────
  if (item._isHouseEscrow) {
    const HOUSE_CFG = {
      PENDING_PAYMENT: { label: 'Awaiting Payment', color: '#FF9500', icon: 'time-outline' },
      PAYMENT_HELD: { label: 'Held — Inspect', color: '#007AFF', icon: 'home' },
      CONFIRMED: { label: 'Released', color: '#22C55E', icon: 'checkmark-done-circle' },
      DISPUTED: { label: 'Disputed', color: '#EF4444', icon: 'alert-circle-outline' },
      ESCALATED: { label: 'Escalated', color: '#EF4444', icon: 'alert-circle-outline' },
      REFUNDED: { label: 'Refunded', color: '#3B82F6', icon: 'refresh-circle' },
      COMPLETED: { label: 'Completed', color: '#22C55E', icon: 'checkmark-done-circle' },
      AUTO_RELEASED: { label: 'Auto-Released', color: '#6B7280', icon: 'timer-outline' },
      CANCELLED: { label: 'Cancelled', color: '#6B7280', icon: 'close-circle-outline' },
    };
    const cfg = HOUSE_CFG[item.status] || { label: item.status, color: '#6B7280', icon: 'home-outline' };
    const isActive = item.status === 'PAYMENT_HELD';

    return (
      <TouchableOpacity
        style={[styles.item, styles.itemRow, { flexWrap: 'wrap' }, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onLongPress={() => { setIsSelectMode(true); toggleSelectItem(item); }}
        onPress={() => {
          if (isSelectMode) { toggleSelectItem(item); return; }
          if (isActive) {
            navigation.navigate('HouseEscrowActive', {
              escrowId: item.id,
              amount: item.amount,
              sellerPhone: item.sellerPhone,
              description: item.description,
              inspectionHours: item.inspectionHours,
              inspectionDeadline: item.inspectionDeadline,
            });
          } else {
            navigation.navigate('HouseEscrowDetail', { escrowId: item.id });
          }
        }}
      >
        {isSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={styles.info}>
          <View style={styles.bundleTitleRow}>
            <Text style={[styles.type, { flex: 1 }]} numberOfLines={1}>{item.description}</Text>
            <View style={[styles.bundleTag, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.bundleTagText, { color: '#007AFF' }]}>HOUSE</Text>
            </View>
          </View>
          <Text style={styles.note} numberOfLines={1}>Seller: {item.sellerPhone}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: '#111' }]}>KES {Number(item.amount).toLocaleString()}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {isActive && (
          <View style={styles.bundleActions}>
            <TouchableOpacity
              style={[styles.confirmBtn, { flex: 1 }]}
              onPress={() => navigation.navigate('HouseEscrowActive', {
                escrowId: item.id,
                amount: item.amount,
                sellerPhone: item.sellerPhone,
                description: item.description,
                inspectionHours: item.inspectionHours,
                inspectionDeadline: item.inspectionDeadline,
              })}
            >
              <Text style={styles.confirmBtnText}> Inspect & Release</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Custom escrow row ──────────────────────────────────────────────────
  if (item._isCustomEscrow) {
    const STATUS_CFG = {
      PENDING_ACCEPTANCE: { label: 'Awaiting Acceptance', color: '#FF9500', icon: 'time-outline' },
      REJECTED: { label: 'Rejected', color: '#EF4444', icon: 'close-circle-outline' },
      ACCEPTED: { label: 'Accepted', color: '#3B82F6', icon: 'checkmark-circle-outline' },
      PAYMENT_HELD: { label: 'In Escrow', color: '#00A86B', icon: 'lock-closed' },
      BUYER_CONFIRMED: { label: 'Buyer Confirmed', color: '#3B82F6', icon: 'checkmark-done' },
      COMPLETED: { label: 'Completed', color: '#00A86B', icon: 'trophy' },
      DISPUTED: { label: 'Disputed', color: '#EF4444', icon: 'alert-circle-outline' },
      REFUNDED: { label: 'Refunded', color: '#6B7280', icon: 'return-down-back-outline' },
      CANCELLED: { label: 'Cancelled', color: '#6B7280', icon: 'ban-outline' },
    }
    const cfg = STATUS_CFG[item.status] || { label: item.status, color: '#6B7280', icon: 'ellipse-outline' }
    return (
      <TouchableOpacity
        style={[styles.item, styles.itemRow, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onPress={() => { if (isSelectMode) { toggleSelectItem(item); } else { navigation.navigate('PayTab', { screen: 'CustomEscrowDetail', params: { escrowId: item.id } }); } }}
        onLongPress={() => { setIsSelectMode(true); toggleSelectItem(item); }}
      >
        {isSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={[styles.checkmark, { color: '#fff' }]}>✓</Text>}
          </View>
        )}
        <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={styles.info}>
          <View style={styles.bundleTitleRow}>
            <Text style={styles.type} numberOfLines={1}>{item.title}</Text>
            <View style={[styles.bundleTag, { backgroundColor: '#F5EEFB' }]}>
              <Text style={[styles.bundleTagText, { color: '#9B59B6' }]}>CUSTOM</Text>
            </View>
          </View>
          <Text style={styles.note} numberOfLines={1}>{item._customRole === 'buyer' ? 'Counterparty' : 'Buyer'}: {item.counterpartyPhone}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: '#111' }]}>KES {Number(item.amount).toLocaleString()}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {item.isRisky && (
            <View style={[styles.badge, { backgroundColor: '#FFF3DC', marginTop: 3 }]}>
              <Text style={[styles.badgeText, { color: '#FF9500' }]}>⚠ High Risk</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ── Fundi job row ──
  if (item._isFundiJob) {
    const STATUS_CFG = {
      PENDING_PAYMENT: { label: 'Awaiting Payment', color: '#6B7280', icon: 'hourglass-outline' },
      WAITING_FOR_FUNDI_ACCEPTANCE: { label: 'Awaiting Fundi', color: '#F59E0B', icon: 'time-outline' },
      ACTIVE: { label: 'In Progress', color: '#3B82F6', icon: 'construct-outline' },
      AWAITING_BUYER_REVIEW: { label: 'Review Now', color: '#F59E0B', icon: 'eye-outline' },
      OVERDUE: { label: 'Overdue', color: '#EF4444', icon: 'warning-outline' },
      COMPLETED: { label: 'Complete', color: '#22C55E', icon: 'checkmark-done-circle' },
      DISPUTED: { label: 'Disputed', color: '#EF4444', icon: 'alert-circle-outline' },
      CANCELLED: { label: 'Cancelled', color: '#6B7280', icon: 'close-circle-outline' },
      RESOLVED: { label: 'Resolved', color: '#22C55E', icon: 'checkmark-circle-outline' },
    };
    const cfg = STATUS_CFG[item.status] || { label: item.status, color: '#6B7280', icon: 'construct-outline' };
    return (
      <TouchableOpacity
        style={[styles.item, styles.itemRow, isSelected && styles.itemSelected]}
        activeOpacity={0.7}
        onPress={() => { if (isSelectMode) { toggleSelectItem(item); } else { navigation.navigate('ProfileTab', { screen: 'FundiJob', params: { jobId: item.id } }); } }}
        onLongPress={() => { setIsSelectMode(true); toggleSelectItem(item); }}
      >
        {isSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={styles.info}>
          <View style={styles.bundleTitleRow}>
            <Text style={styles.type} numberOfLines={1}>{item.category || 'Fundi Job'}</Text>
            <View style={[styles.bundleTag, { backgroundColor: '#F0FDF4' }]}>
              <Text style={[styles.bundleTagText, { color: '#16A34A' }]}>FUNDI</Text>
            </View>
          </View>
          <Text style={styles.note} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.note} numberOfLines={1}>Fundi: {item.fundiPhone}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: '#111' }]}>KES {item.amount}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Wallet transaction row ───────────────────────────────────────────
  const icon = TYPE_ICON[item.type] || { name: 'swap-horizontal', color: colors.primary };
  const isOut = item.direction === 'out';
  const sign = isOut ? '- ' : '+ ';
  const amtClr = isOut ? '#EF4444' : '#22C55E';
  const stClr = STATUS_COLOR[item.status] || '#6B7280';
  const label = item.type.replace(/_/g, ' ');

  // ── Wallet transaction row ───────────────────────────────────────────
  return (
    <TouchableOpacity
      style={[styles.item, isSelected && styles.itemSelected]}
      activeOpacity={0.7}
      onPress={() => {
        if (isSelectMode) toggleSelectItem(item);
        else navigation.navigate('TransactionDetail', { tx: item });
      }}
      onLongPress={() => {
        setIsSelectMode(true);
        toggleSelectItem(item);
      }}
    >
      <View style={styles.itemRow}>
        {isSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        <View style={[styles.iconWrap, { backgroundColor: icon.color + '1A' }, isSelectMode && styles.iconWrapHidden]}>
          <Ionicons name={icon.name} size={22} color={icon.color} />
        </View>
        <View style={styles.info}>
          <Text style={styles.type}>{label}</Text>
          <Text style={styles.note} numberOfLines={1}>{item.note || item.reference}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: amtClr }]}>{sign}KES {item.amount}</Text>
          <View style={[styles.badge, { backgroundColor: stClr + '22' }]}>
            <Text style={[styles.badgeText, { color: stClr }]}>{item.status}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const TYPE_TABS = ['all', 'bundle', 'delivery', 'fundi', 'second-hand', 'house', 'custom', 'wallet', 'safe-send']

const ListHeader = () => (
  <View>
    {/* type tabs */}
    <View style={styles.typeTabs}>
      {TYPE_TABS.map(t => (
        <TouchableOpacity
          key={t}
          style={[styles.typeTab, typeTab === t && styles.typeTabActive]}
          onPress={() => setTypeTab(t)}
        >
          <Text style={[styles.typeTabText, typeTab === t && styles.typeTabTextActive]}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>

    {/* wallet status filters — only shown on wallet tab */}
    {typeTab === 'wallet' && (
      <View style={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterActive]}
            onPress={() => onFilterChange(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
  </View>
);


const isInitialLoading = (loading || bundleLoading) && combinedData.length === 0;

// ─── Main render ─────────────────────────────────────────────────────────

return (
  <View style={styles.container}>
    {/* ── Header ── */}
    <View style={styles.header}>
      {isSelectMode ? (
        <View style={styles.selectionHeader}>
          <TouchableOpacity onPress={clearSelection} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.title}>{selectedItems.size} selected</Text>
          <TouchableOpacity
            style={[styles.deleteBtn, selectedItems.size === 0 && styles.deleteBtnDisabled]}
            onPress={handleDeleteSelected}
            disabled={selectedItems.size === 0}
          >
            <Ionicons name="trash" size={16} color="#fff" />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.normalHeader}>
          <Text style={styles.title}>Transaction History</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsSelectMode(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}
    </View>

    {/* ── Body ── */}
    {isInitialLoading ? (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    ) : error ? (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchTxs({ reset: true, nextPage: 1 })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <FlatList
        data={combinedData}
        renderItem={renderItem}
        keyExtractor={item => `${item._isBundleTx ? 'bundle' : 'tx'}-${item.id}`}
        contentContainerStyle={combinedData.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
            : null
        }
      />
    )}

    {/* ── Rating modal ── */}
    <Modal visible={!!ratingTx} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Rate your seller</Text>
          <Text style={styles.modalSub}>How was your experience?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map(s => (
              <TouchableOpacity key={s} onPress={() => setRating(s)}>
                <Text style={[styles.star, s <= rating && styles.starActive]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, { marginTop: 16 }]}
            onPress={submitRating}
            disabled={submittingRating}
          >
            {submittingRating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.confirmBtnText}>{rating === 0 ? 'Skip' : 'Submit Rating'}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>
);

}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  // Header
  header: { paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  normalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111', flex: 1 },
  iconBtn: { padding: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Filter tabs
  typeTabs: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  typeTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  typeTabActive: { backgroundColor: colors.primary },
  typeTabText: { fontSize: 11, fontWeight: '600', color: '#6B7280', textTransform: 'capitalize' },
  typeTabTextActive: { color: '#fff' },
  filters: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8, backgroundColor: '#F3F4F6' },
  filterActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 12, color: '#111' },
  filterTextActive: { color: '#fff', fontWeight: '600' },

  // Shared row card
  item: { flexDirection: 'column', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  itemSelected: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  iconWrapHidden: { width: 0, height: 0, overflow: 'hidden', marginRight: 0 },
  info: { flex: 1 },
  type: { fontSize: 13, fontWeight: '600', color: '#111', textTransform: 'capitalize' },
  note: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  date: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  right: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 6 },
  amount: { fontSize: 14, fontWeight: '700' },
  badge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  // Bundle extras
  bundleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  bundleTag: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  bundleTagText: { fontSize: 9, fontWeight: '700', color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.3 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  bundleActions: { flexDirection: 'row', gap: 8, marginTop: 10, width: '100%' },
  confirmBtn: { backgroundColor: '#3B82F6', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  disputeBtn: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  disputeBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },

  // Selection checkbox
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 10, flexShrink: 0 },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontWeight: 'bold', fontSize: 14, lineHeight: 18 },

  // List layout
  list: { padding: 16 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#6B7280', fontSize: 14 },

  // States
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#EF4444', fontSize: 14, marginBottom: 12, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#fff', fontWeight: '600' },

  // Rating modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 16 },
  stars: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 36, color: '#D1D5DB' },
  starActive: { color: '#F59E0B' },
});