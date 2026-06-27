import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';
import { authFetch } from '../utils/api';

const STATE_LABELS = {
  initiated:       'Initiated',
  payment_pending: 'Payment Pending',
  held:            'Held in safepay',
  delivered:       'Delivered — Awaiting Confirmation',
  confirmed:       'Confirmed',
  releasing:       'Releasing Funds',
  payout_pending:  'Payout Pending',
  released:        'Completed',
  refunded:        'Refunded',
  disputed:        'Disputed',
  expired:         'Expired',
  cancelled:       'Cancelled',
};

const STATE_COLOR = {
  held:      '#f59e0b',
  delivered: '#3b82f6',
  confirmed: '#10b981',
  released:  '#10b981',
  disputed:  '#ef4444',
  refunded:  '#6b7280',
  expired:   '#6b7280',
};

export default function TransactionDetailScreen({ navigation, route }) {
  const { t } = useLang();
  const { tx: initialTx } = route.params || {};
  const [tx, setTx] = useState(initialTx);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [countdown, setCountdown]   = useState('');

  useEffect(() => {
    if (initialTx?.id) fetchLatest();
  }, []);

  useEffect(() => {
    if (!tx?.autoReleaseAt && !tx?.inspectionDeadline) return;
    let pollInterval;
    const tick = () => {
      const diff = new Date(tx.inspectionDeadline || tx.autoReleaseAt) - new Date();
      if (diff <= 0) {
        setCountdown('Releasing funds...');
        // Poll backend every 3s until state flips to released
        pollInterval = setInterval(() => fetchLatest(), 3000);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => { clearInterval(interval); clearInterval(pollInterval); };
  }, [tx?.autoReleaseAt]);



  const handleRecall = async () => {
    Alert.alert(
      'Recall Money',
      'The recipient never joined LipaSafe. Recall your money? Note: the platform fee is non-refundable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recall', style: 'default',
          onPress: async () => {
            try {
              setRecalling(true);
              const ref = tx?.reference || tx?.referenceNo;
              const res  = await authFetch(`/wallet/recall/${ref}`, { method: 'POST' });
              const data = await res.json();
              if (data.success) {
                Alert.alert(
                  'Recalled',
                  `KES ${data.recallAmount} returned to your wallet.${data.feeRetained !== '0.00' ? ` Platform fee of KES ${data.feeRetained} is non-refundable.` : ''}`,
                  [{ text: 'OK', onPress: () => { fetchLatest(); } }]
                );
              } else {
                Alert.alert('Recall Failed', data.message || 'Something went wrong.');
              }
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setRecalling(false);
            }
          }
        }
      ]
    );
  };

  const handleDelete = async () => {
    Alert.alert('Delete Transaction', 'Remove this from your history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const res = await authFetch(`/transactions/bundle/${tx.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) navigation.goBack();
            else Alert.alert('Error', data.message || 'Could not delete.');
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  const fetchLatest = async () => {
    try {
      const isSecondHand = initialTx?.type === 'second_hand' || initialTx?.category === 'second_hand';
      const url = isSecondHand
        ? `/second-hand/order/${initialTx.id}`
        : `/transactions/bundle/status/${initialTx.id}`;
      const res = await authFetch(url);
      const data = await res.json();
      const fresh = data.transaction || data.order;
      if (fresh) setTx({ ...initialTx, ...fresh });
    } catch (e) {
      console.warn('fetchLatest error', e.message);
    }
  };

  const handleConfirm = async (confirmed) => {
    const action = confirmed ? 'approve' : 'reject';
    Alert.alert(
      confirmed ? 'Confirm Delivery' : 'Reject Delivery',
      confirmed
        ? 'Confirm you received the service? Funds will be released to the seller.'
        : 'Reject delivery? A dispute will be opened and admin will review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirmed ? 'Approve' : 'Reject',
          style: confirmed ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setConfirming(true);
              const res = await authFetch(`/transactions/bundle/${tx.id}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmed }),
              });
              const data = await res.json();
              if (data.success) {
                if (confirmed) {
                  // OTP was sent to buyer's phone — navigate to entry screen
                  navigation.navigate('OTPConfirm', {
                    transactionId: tx.id,
                    referenceNo:   tx.referenceNo || tx.reference,
                    category:      tx.category,
                    tx,
                  });
                } else {
                  Alert.alert('Disputed', data.message, [
                    { text: 'OK', onPress: () => { fetchLatest(); navigation.goBack(); } }
                  ]);
                }
              } else {
                Alert.alert('Error', data.message || 'Something went wrong.');
              }
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setConfirming(false);
            }
          }
        }
      ]
    );
  };


  const state = tx?.state || tx?.status;
  const stateLabel = STATE_LABELS[state] || state?.toUpperCase();
  const stateColor = STATE_COLOR[state] || colors.primary;

  const isDirectSend = tx?.type === 'send' || tx?.type === 'transfer' || tx?.type === 'quick_send';
  const isGhostSend  = isDirectSend && tx?.isGhost === true && tx?.status !== 'recalled';
  const canRecall    = isGhostSend && tx?.recallAt && new Date() >= new Date(tx.recallAt);
  const recallDate   = tx?.recallAt ? new Date(tx.recallAt).toLocaleDateString() : null;

  const steps = isDirectSend
    ? [
        { label: 'Transfer Initiated', done: true },
        { label: 'Funds Released',     done: ['completed','released','success'].includes(state) },
      ]
    : [
        { label: 'Payment Made',       done: true },
        { label: 'Held in safepay',     done: ['held','delivered','confirmed','releasing','payout_pending','released'].includes(state) },
        { label: 'Seller Dispatched',  done: ['delivered','confirmed','releasing','payout_pending','released'].includes(state) },
        { label: 'Delivery Confirmed', done: ['confirmed','releasing','payout_pending','released'].includes(state) },
        { label: 'Funds Released',     done: ['released'].includes(state) },
      ];

  return (
    <View style={styles.container}>
      <LipaHeader title={t.transactionDetails} navigation={navigation} />
      <View style={styles.content}>

        {/* Status Card */}
        <View style={styles.card}>
          <View style={[styles.stateBadge, { backgroundColor: stateColor + '20' }]}>
            <Text style={[styles.stateText, { color: stateColor }]}>{stateLabel}</Text>
          </View>
          <Text style={styles.amount}>KES {parseFloat(tx?.amount || 0).toFixed(2)}</Text>
          <Text style={styles.ref}>Ref: {tx?.referenceNo || tx?.reference}</Text>
          {tx?.description && <Text style={styles.desc}>{tx.description}</Text>}
        </View>

        {/* Timeline */}
        <Text style={styles.section}>{t.timeline}</Text>
        <View style={styles.timeline}>
          {steps.map((step, i) => (
            <View key={i}>
              <View style={styles.step}>
                <View style={[styles.dot, step.done ? styles.dotDone : styles.dotEmpty]} />
                <Text style={[styles.stepText, !step.done && styles.stepTextDim]}>{step.label}</Text>
              </View>
              {i < steps.length - 1 && <View style={[styles.line, step.done && styles.lineDone]} />}
            </View>
          ))}
        </View>

        {/* Buyer Confirm/Reject — only shown when state is delivered */}
        {state === 'delivered' && (
          <View style={styles.actionBox}>
            <Text style={styles.actionTitle}>Did you receive your service?</Text>
            <Text style={styles.actionSub}>Confirm to release funds to seller or reject to open a dispute.</Text>
            {confirming
              ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
              : <>
                  <LipaButton
                    title=" Yes, I received it"
                    onPress={() => handleConfirm(true)}
                  />
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleConfirm(false)}>
                    <Text style={styles.rejectText}> No, I did not receive it</Text>
                  </TouchableOpacity>
                </>
            }
          </View>
        )}

        {/* Confirmed state — inspection window countdown + dispute */}
        {state === 'held' && tx?.inspectionDeadline && (
          <View style={styles.timerBox}>
            <Text style={styles.timerLabel}>Inspection window — funds auto-release in</Text>
            <Text style={styles.timerValue}>{countdown || '--:--:--'}</Text>
            <Text style={styles.timerSub}>If the item is not as described, raise a dispute before time runs out.</Text>
            {new Date(tx.inspectionDeadline) > new Date() && (
              <TouchableOpacity
                style={styles.disputeBtn}
                onPress={() => navigation.navigate('Dispute', { transactionId: tx.id, referenceNo: tx.referenceNo || tx.reference, type: 'second_hand' })}
              >
                <Text style={styles.disputeBtnText}>⚠ Raise a Dispute</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Dispute button for held state */}
        {state === 'held' && (
          <LipaButton
            title={t.dispute}
            onPress={() => navigation.navigate('Dispute', { tx })}
            secondary
          />
        )}


        {/* Ghost send — recall notice or recall button */}
        {isGhostSend && !canRecall && recallDate && (
          <View style={styles.recallNotice}>
            <Text style={styles.recallNoticeText}>
              ⏳ Recipient hasn't joined LipaSafe yet. You can recall this money from {recallDate} if unclaimed.
            </Text>
          </View>
        )}
        {canRecall && (
          <View style={styles.recallBox}>
            <Text style={styles.recallTitle}> Money Unclaimed</Text>
            <Text style={styles.recallSub}>
              The recipient never joined LipaSafe. You can recall your money. Platform fee is non-refundable.
            </Text>
            {recalling
              ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              : <TouchableOpacity style={styles.recallBtn} onPress={handleRecall}>
                  <Text style={styles.recallBtnText}>Recall Money</Text>
                </TouchableOpacity>
            }
          </View>
        )}

        {['released', 'refunded', 'expired', 'cancelled'].includes(state) && (
          <TouchableOpacity style={styles.deleteHistoryBtn} onPress={handleDelete}>
            <Text style={styles.deleteHistoryText}> Delete from History</Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timerBox:       { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#10b98133' },
  timerLabel:     { fontSize: 12, color: '#6b7280', marginBottom: 6, textAlign: 'center' },
  timerValue:     { fontSize: 36, fontWeight: '700', color: '#10b981', letterSpacing: 2, marginBottom: 6 },
  timerSub:       { fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 14 },
  disputeBtn:     { backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: '#FECACA' },
  disputeBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  deleteHistoryBtn: { marginTop: 12, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#6b7280' },
  deleteHistoryText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  container: { flex: 1, backgroundColor: colors.gray },
  content: { padding: 20 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
  stateBadge: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 12 },
  stateText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  amount: { fontSize: 32, fontWeight: 'bold', color: colors.black, marginVertical: 8 },
  ref: { fontSize: 12, color: colors.grayDark },
  desc: { fontSize: 13, color: colors.grayDark, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: colors.black },
  timeline: { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 20 },
  step: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  dotDone: { backgroundColor: colors.primary || '#1a9e5c' },
  dotEmpty: { borderWidth: 2, borderColor: colors.grayDark || '#ccc', backgroundColor: 'transparent' },
  line: { width: 2, height: 28, backgroundColor: colors.border || '#eee', marginLeft: 6, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary || '#1a9e5c' },
  stepText: { fontSize: 14, color: colors.black },
  stepTextDim: { color: colors.grayDark || '#999' },
  actionBox: { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 16 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: colors.black, marginBottom: 6 },
  actionSub: { fontSize: 13, color: colors.grayDark, marginBottom: 16, lineHeight: 18 },
  rejectBtn: { marginTop: 10, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#ef4444' },
  rejectText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
  recallNotice:     { backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FED7AA' },
  recallNoticeText: { fontSize: 13, color: '#92400E', lineHeight: 18 },
  recallBox:        { backgroundColor: '#FFF7ED', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#F97316' },
  recallTitle:      { fontSize: 15, fontWeight: '700', color: '#C2410C', marginBottom: 6 },
  recallSub:        { fontSize: 13, color: '#92400E', lineHeight: 18, marginBottom: 14 },
  recallBtn:        { backgroundColor: '#F97316', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  recallBtnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  deleteHistoryBtn: { marginTop: 8, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#6b7280' },
  deleteHistoryText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
});
