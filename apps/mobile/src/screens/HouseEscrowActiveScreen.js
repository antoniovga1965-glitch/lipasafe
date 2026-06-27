import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const POLL_INTERVAL = 30000;

function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(() => {
    const diff = new Date(deadline) - Date.now();
    return diff > 0 ? diff : 0;
  });

  useEffect(() => {
    if (!deadline) return;
    const tick = setInterval(() => {
      const diff = new Date(deadline) - Date.now();
      setRemaining(diff > 0 ? diff : 0);
    }, 1000);
    return () => clearInterval(tick);
  }, [deadline]);

  const hrs  = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const expired = remaining === 0;

  return { hrs, mins, secs, expired, remaining };
}

export default function HouseEscrowActiveScreen({ navigation, route }) {
  const {
    escrowId,
    amount,
    sellerPhone,
    description,
    inspectionHours,
    inspectionDeadline,
  } = route.params;

  const [phase,      setPhase]      = useState('active');
  // active | confirming | confirmed | disputed | expired | error
  const [escrow,     setEscrow]     = useState(null);
  const pollTimer                   = useRef(null);
  const shakeAnim                   = useRef(new Animated.Value(0)).current;

  const { hrs, mins, secs, expired } = useCountdown(inspectionDeadline);
  const isSeller = escrow?.isSeller === true;

  // Warn when expired
  useEffect(() => {
    if (expired && phase === 'active') setPhase('expired');
  }, [expired]);

  // Poll for backend state changes (admin resolves, auto-release, etc.)
  useEffect(() => {
    pollStatus();
    pollTimer.current = setInterval(pollStatus, POLL_INTERVAL);
    return () => clearInterval(pollTimer.current);
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res  = await authFetch(`/house/status/${escrowId}`);
      const data = await res.json();
      if (!data.success) return;
      setEscrow({ ...data.escrow, isBuyer: data.isBuyer, isSeller: data.isSeller });
      const s = data.escrow?.status;
      if (s === 'AUTO_RELEASED') { clearInterval(pollTimer.current); setPhase('expired'); }
      if (s === 'CONFIRMED')     { clearInterval(pollTimer.current); setPhase('confirmed'); }
      if (s === 'DISPUTED' || s === 'ESCALATED') { clearInterval(pollTimer.current); setPhase('disputed'); }
      if (s === 'REFUNDED')      { clearInterval(pollTimer.current); setPhase('refunded'); }
    } catch {}
  }, [escrowId]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleConfirm = () => {
    Alert.alert(
      'Release Payment',
      `Release KES ${Number(amount).toLocaleString()} to ${sellerPhone}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Release', style: 'default', onPress: doConfirm },
      ]
    );
  };

  const doConfirm = async () => {
    setPhase('confirming');
    try {
      const res  = await authFetch(`/house/confirm/${escrowId}`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to release');
      clearInterval(pollTimer.current);
      setPhase('confirmed');
    } catch (err) {
      setPhase('active');
      shake();
      Alert.alert('Error', err.message);
    }
  };

  const handleDispute = () => {
    navigation.navigate('HouseEscrowDispute', { escrowId, amount, sellerPhone });
  };

  // ── Terminal states ──────────────────────────────────────────────
  if (phase === 'confirmed') {
    return (
      <View style={styles.terminal}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        <Text style={styles.terminalTitle}>Payment Released</Text>
        <Text style={styles.terminalSub}>
          {isSeller
            ? `KES ${Number(amount).toLocaleString()} has been sent to your M-Pesa.`
            : `KES ${Number(amount).toLocaleString()} sent to ${sellerPhone}`}
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'refunded') {
    return (
      <View style={styles.terminal}>
        <Ionicons name="arrow-undo-circle" size={72} color={colors.warning} />
        <Text style={styles.terminalTitle}>{isSeller ? 'Dispute Resolved' : 'Refunded'}</Text>
        <Text style={styles.terminalSub}>
          {isSeller
            ? "The dispute was resolved in the buyer's favor. Funds were returned to them."
            : 'Your money has been returned to your wallet.'}
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'expired') {
    return (
      <View style={styles.terminal}>
        <Ionicons name="time" size={72} color={colors.grayDark} />
        <Text style={styles.terminalTitle}>Window Expired</Text>
        <Text style={styles.terminalSub}>
          {isSeller
            ? `The buyer didn't confirm or dispute within ${inspectionHours} hours.\nPayment was auto-released to you.`
            : `You didn't confirm or dispute within ${inspectionHours} hours.\nPayment was auto-released to the seller.`}
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'disputed') {
    return (
      <View style={styles.terminal}>
        <Ionicons name="alert-circle" size={72} color={colors.warning} />
        <Text style={styles.terminalTitle}>Dispute Opened</Text>
        <Text style={styles.terminalSub}>
          {isSeller
            ? "The buyer disputed this order. Money is frozen. LipaSafe support will reach out by SMS for you to submit your side."
            : 'Money is frozen. Admin will review and may contact both parties.'}
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Active / Confirming ──────────────────────────────────────────
  const timerColor = hrs === 0 && mins < 30 ? colors.error : colors.black;
  const pad = n => String(n).padStart(2, '0');

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{isSeller ? 'Payment Held — Awaiting Buyer' : 'Inspect the Property'}</Text>
      </View>

      {/* Countdown */}
      <View style={styles.timerCard}>
        <Text style={styles.timerLabel}>Inspection window closes in</Text>
        <Text style={[styles.timerText, { color: timerColor }]}>
          {pad(hrs)}:{pad(mins)}:{pad(secs)}
        </Text>
        <Text style={styles.timerSub}>{inspectionHours}-hour window • auto-releases on expiry</Text>
      </View>

      {/* Property card */}
      <View style={styles.propertyCard}>
        <View style={styles.propertyRow}>
          <Ionicons name="home-outline" size={16} color={colors.grayDark} />
          <Text style={styles.propertyLabel}>Property</Text>
        </View>
        <Text style={styles.propertyDesc}>{description}</Text>

        <View style={[styles.propertyRow, { marginTop: 14 }]}>
          <Ionicons name="person-outline" size={16} color={colors.grayDark} />
          <Text style={styles.propertyLabel}>{isSeller ? 'Buyer' : 'Seller'}</Text>
          <Text style={styles.propertyValue}>{isSeller ? (escrow?.buyerPhone || '—') : sellerPhone}</Text>
        </View>

        <View style={styles.propertyRow}>
          <Ionicons name="cash-outline" size={16} color={colors.grayDark} />
          <Text style={styles.propertyLabel}>Held in escrow</Text>
          <Text style={[styles.propertyValue, { color: colors.primary }]}>
            KES {Number(amount).toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructionCard}>
        <Text style={styles.instructionTitle}>{isSeller ? 'What happens next' : 'What to do now'}</Text>
        {(isSeller ? [
          { icon: 'walk-outline',           text: 'Buyer will physically inspect the property with you' },
          { icon: 'checkmark-done-outline',  text: 'If satisfied, buyer taps Confirm — you get paid instantly' },
          { icon: 'time-outline',           text: 'No response? Money auto-releases to you when the window closes' },
          { icon: 'alert-circle-outline',   text: "If buyer disputes, you'll be notified by SMS to submit your evidence" },
        ] : [
          { icon: 'walk-outline',          text: 'Go physically inspect the property with the seller' },
          { icon: 'eye-outline',           text: 'Check everything — rooms, condition, title docs' },
          { icon: 'checkmark-done-outline', text: "Happy? Tap Confirm — seller gets paid" },
          { icon: 'close-circle-outline',  text: "Not happy? Tap Dispute — money stays frozen" },
        ]).map((item, i) => (
          <View key={i} style={styles.instructionRow}>
            <Ionicons name={item.icon} size={18} color={colors.primary} style={{ marginRight: 10 }} />
            <Text style={styles.instructionText}>{item.text}</Text>
          </View>
        ))}
      </View>

      {!isSeller && (
        <>
          {/* Action buttons */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TouchableOpacity
              style={[styles.confirmBtn, phase === 'confirming' && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={phase === 'confirming'}
            >
              {phase === 'confirming'
                ? <ActivityIndicator color={colors.white} />
                : <>
                    <Ionicons name="checkmark-circle" size={20} color={colors.white} style={{ marginRight: 8 }} />
                    <Text style={styles.confirmBtnText}>I'm Satisfied — Release Payment</Text>
                  </>
              }
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.disputeBtn}
            onPress={handleDispute}
            disabled={phase === 'confirming'}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.error} style={{ marginRight: 8 }} />
            <Text style={styles.disputeBtnText}>Dispute — Something Is Wrong</Text>
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            Money stays frozen until you act or the window expires.
          </Text>
        </>
      )}

      {isSeller && (
        <View style={styles.waitingCard}>
          <Ionicons name="hourglass-outline" size={28} color={colors.primary} style={{ marginBottom: 8 }} />
          <Text style={styles.waitingText}>
            Sit tight — the buyer is reviewing. You'll be notified the moment they confirm, dispute, or the window auto-releases.
          </Text>
        </View>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  header:           { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, alignItems: 'center' },
  headerTitle:      { fontSize: 20, fontWeight: '800', color: colors.black },
  timerCard:        { marginHorizontal: 16, backgroundColor: colors.gray, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
  timerLabel:       { fontSize: 12, color: colors.grayDark, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  timerText:        { fontSize: 52, fontWeight: '800', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  timerSub:         { fontSize: 12, color: colors.grayDark, marginTop: 6 },
  propertyCard:     { marginHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 16 },
  propertyRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  propertyLabel:    { fontSize: 13, color: colors.grayDark, flex: 1 },
  propertyValue:    { fontSize: 13, color: colors.black, fontWeight: '600' },
  propertyDesc:     { fontSize: 14, color: colors.black, lineHeight: 20, marginTop: 4 },
  instructionCard:  { marginHorizontal: 16, backgroundColor: '#E8F5EE', borderRadius: 14, padding: 16, marginBottom: 24 },
  instructionTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 12 },
  instructionRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  instructionText:  { flex: 1, fontSize: 13, color: colors.black, lineHeight: 18 },
  confirmBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, borderRadius: 12, paddingVertical: 16, marginBottom: 12 },
  confirmBtnText:   { color: colors.white, fontSize: 15, fontWeight: '700' },
  disputeBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.error, marginHorizontal: 16, borderRadius: 12, paddingVertical: 15, marginBottom: 16 },
  disputeBtnText:   { color: colors.error, fontSize: 15, fontWeight: '700' },
  footerNote:       { textAlign: 'center', fontSize: 12, color: colors.grayDark, paddingHorizontal: 32, lineHeight: 18 },
  terminal:         { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: 40 },
  terminalTitle:    { fontSize: 24, fontWeight: '800', color: colors.black, marginTop: 20, marginBottom: 10 },
  terminalSub:      { fontSize: 14, color: colors.grayDark, textAlign: 'center', lineHeight: 22 },
  doneBtn:          { marginTop: 36, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText:      { color: colors.white, fontSize: 16, fontWeight: '700' },
  waitingCard:      { marginHorizontal: 16, backgroundColor: '#E8F5EE', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  waitingText:      { fontSize: 13, color: colors.black, textAlign: 'center', lineHeight: 20 },
});
