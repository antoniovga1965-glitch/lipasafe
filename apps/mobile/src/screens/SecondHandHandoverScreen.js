import React, { useState, useEffect, useRef, useCallback } from 'react';
import { calcFee, calcTotal, PLATFORM_RATE } from '../utils/feeCalculator'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import LipaHeader from '../components/LipaHeader';
import { authFetch } from '../utils/api';

const CONDITION_LABELS = {
  new:         'New',
  like_new:    'Like New',
  refurbished: 'Refurbished',
  good:        'Good',
  fair:        'Fair',
  faulty:      'Faulty',
};
// ── Countdown helper ───────────────────────────────────────────────────────
const formatCountdown = (ms) => {
  if (ms <= 0) return '00:00:00';
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function SecondHandHandoverScreen({ navigation, route }) {
  const { tx } = route.params || {};

  const [order,       setOrder]       = useState(tx || null);
  const [timeLeft,    setTimeLeft]    = useState(0);
  const [releasing,   setReleasing]   = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);

  const tickRef    = useRef(null);
  const releasedRef = useRef(false);  

  // ── Fetch fresh order state on focus ──────────────────────────────────
  useFocusEffect(useCallback(() => {
    fetchOrder();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []));

  const fetchOrder = async () => {
    try {
      setRefreshing(true);
      const res  = await authFetch(`/second-hand/order/${tx.id}`);
      const data = await res.json();
      if (data.success && data.order) {
        setOrder(data.order);
        startCountdown(data.order);
      }
    } catch (e) {
      console.error('fetchOrder error', e);
    } finally {
      setRefreshing(false);
    }
  };

  const startCountdown = (o) => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!o.inspectionDeadline) return;

    const tick = () => {
      const remaining = new Date(o.inspectionDeadline).getTime() - Date.now();
      setTimeLeft(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(tickRef.current);
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
  };

  // ── Release → OTP fires to buyer ──────────────────────────────────────
  const handleRelease = async () => {
    if (releasedRef.current || releasing) return;

    Alert.alert(
      'Release Funds?',
      'An OTP will be sent to the buyer. Once they confirm, money moves to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send OTP',
          onPress: async () => {
            releasedRef.current = true;
            setReleasing(true);
            try {
              const res  = await authFetch(`/second-hand/${order.id}/handover`, { method: 'POST' });
              const data = await res.json();
              if (res.ok && data.success) {
                Alert.alert(
                  'OTP Sent',
                  'The buyer has received an OTP on their phone. Funds release once they confirm.',
                  [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
              } else {
                releasedRef.current = false;
                Alert.alert('Failed', data.message || 'Could not initiate release.');
              }
            } catch (e) {
              releasedRef.current = false;
              Alert.alert('Error', e.message || 'Something went wrong.');
            } finally {
              setReleasing(false);
            }
          },
        },
      ]
    );
  };

  if (!order) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isDisputed   = order.state === 'disputed';
  const isReleased   = ['released', 'completed'].includes(order.state);
  const isHeld       = order.state === 'held';
  const expired      = timeLeft === 0 && !!order.inspectionDeadline;
  const canRelease   = isHeld && !isDisputed;

  const fee    = calcFee(order.amount).toFixed(2);
  const payout = parseFloat(order.sellerReceives || order.amount).toFixed(2);

  return (
    <View style={styles.container}>
      <LipaHeader title="Second Hand Order" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Status Banner */}
        {isDisputed && (
          <View style={[styles.banner, styles.bannerDispute]}>
            <Ionicons name="warning" size={18} color="#fff" />
            <Text style={styles.bannerText}>Buyer raised a dispute — under review</Text>
          </View>
        )}
        {isReleased && (
          <View style={[styles.banner, styles.bannerDone]}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.bannerText}>Funds released to your account</Text>
          </View>
        )}

        {/* Item Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{order.description || 'Second Hand Item'}</Text>
          <Row label="Buyer"        value={order.buyer?.phone || '—'} />
          <Row label="Amount"       value={`KES ${parseFloat(order.amount).toFixed(2)}`} />
          <Row label="Platform Fee" value={`KES ${fee} (2%)`} />
          <Row label="You Receive"  value={`KES ${payout}`}  highlight />
          <Row label="Condition"    value={order.listing?.condition || order.condition || '—'} />
          <Row label="Ref"          value={order.referenceNo || '—'} />
        </View>

        {/* Inspection Countdown */}
        {isHeld && order.inspectionDeadline && (
          <View style={styles.card}>
            <Text style={styles.countdownLabel}>
              {expired ? 'Inspection window closed' : 'Inspection window closes in'}
            </Text>
            <Text style={[styles.countdown, expired && styles.countdownExpired]}>
              {formatCountdown(timeLeft)}
            </Text>
            <Text style={styles.countdownHint}>
              {expired
                ? 'No dispute raised — you can release now.'
                : 'Buyer can raise a dispute until this expires.'}
            </Text>
          </View>
        )}

        {/* Action */}
        {canRelease && (
          <TouchableOpacity
            style={[styles.releaseBtn, releasing && styles.releaseBtnDisabled]}
            onPress={handleRelease}
            disabled={releasing}
          >
            {releasing
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.releaseBtnText}>Release — Send OTP to Buyer</Text>
                </>
            }
          </TouchableOpacity>
        )}

        {isDisputed && (
          <TouchableOpacity
            style={styles.disputeBtn}
            onPress={() => {
              const dispute = order.disputes?.[0];
              if (dispute) {
                navigation.navigate('SecondHandDisputeRespond', { orderId: order.id, dispute });
              }
            }}
          >
            <Ionicons name="shield-half" size={18} color={colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.releaseBtnText}>View Dispute</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Reusable row ───────────────────────────────────────────────────────────
function Row({ label, value, highlight }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, highlight && rowStyles.highlight]}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  row:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  label:     { fontSize: 13, color: '#888' },
  value:     { fontSize: 13, fontWeight: '600', color: '#111' },
  highlight: { color: '#10B981', fontSize: 15, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#f5f5f5' },
  centered:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:            { padding: 20 },
  banner:             { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 14, marginBottom: 16 },
  bannerDispute:      { backgroundColor: '#EF4444' },
  bannerDone:         { backgroundColor: '#10B981' },
  bannerText:         { color: '#fff', fontWeight: '600', fontSize: 14, flex: 1 },
  card:               { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16 },
  cardTitle:          { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  countdownLabel:     { fontSize: 12, color: '#888', marginBottom: 8 },
  countdown:          { fontSize: 36, fontWeight: '800', color: '#111', letterSpacing: 2 },
  countdownExpired:   { color: '#10B981' },
  countdownHint:      { fontSize: 12, color: '#888', marginTop: 8 },
  releaseBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  releaseBtnDisabled: { opacity: 0.6 },
  releaseBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  disputeBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
});
