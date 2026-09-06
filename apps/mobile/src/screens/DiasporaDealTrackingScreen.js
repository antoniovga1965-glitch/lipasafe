import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  CheckCircle2, Shield, AlertTriangle, Lock, User, Calendar, ClipboardList,
} from 'lucide-react-native';
import { authFetch } from '../utils/api';
import { COLORS, SPACING } from './diasporaTheme';

// ── Live countdown ────────────────────────────────────────────────────────────
function calcTime(target) {
  const diff = new Date(target) - Date.now();
  if (diff <= 0) return { expired: true, h: 0, m: 0, s: 0 };
  return {
    expired: false,
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1_000),
  };
}
const CountdownTimer = ({ targetDate }) => {
  const [t, setT] = useState(calcTime(targetDate));
  useEffect(() => {
    const id = setInterval(() => setT(calcTime(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  if (t.expired) return <Text style={styles.timerUrgent}>Auto-release imminent</Text>;
  const pad = (n) => String(n).padStart(2, '0');
  const urgent = t.h < 4;
  return (
    <Text style={[styles.timerText, urgent && styles.timerUrgent]}>
      ⏰  Auto-releases in {pad(t.h)}:{pad(t.m)}:{pad(t.s)}
    </Text>
  );
};

// ── Step bar ──────────────────────────────────────────────────────────────────
const StepBar = ({ milestone, depositDate }) => {
  const st = milestone?.status ?? 'PENDING';
  const step = ['RELEASED','DONE'].includes(st) ? 3 : st === 'WORK_SUBMITTED' ? 2 : 1;
  const fmt  = (d) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const subs  = [
    fmt(depositDate),
    step >= 2 ? fmt(milestone?.workSubmittedAt) : 'Pending',
    step === 3 ? 'Completed' : 'You approve',
  ];
  const labels = ['Funded', 'Work submitted', 'Release'];

  return (
    <View style={styles.stepRow}>
      {[1, 2, 3].map((n, i) => (
        <React.Fragment key={n}>
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, step >= n && styles.stepCircleDone]}>
              {step >= n
                ? <CheckCircle2 size={15} color="#fff" />
                : n === 3
                  ? <Lock size={12} color="#94A3B8" />
                  : <Text style={styles.stepNum}>{n}</Text>}
            </View>
            <Text style={[styles.stepLabel, step >= n && styles.stepLabelDone]}>{labels[i]}</Text>
            <Text style={styles.stepSub}>{subs[i]}</Text>
          </View>
          {i < 2 && (
            <View style={[styles.stepLine, step > n && styles.stepLineDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DiasporaDealTrackingScreen({ navigation, route }) {
  const { dealId }        = route.params || {};
  const [deal, setDeal]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [confirmMs, setConfirmMs] = useState(null);

  const fetchDeal = useCallback(async () => {
    if (!dealId) return;
    setLoading(true); setError(null);
    try {
      const res  = await authFetch(`/diaspora/${dealId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load deal');
      setDeal(json.deal);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }, [dealId]);

  useFocusEffect(useCallback(() => { fetchDeal(); }, [fetchDeal]));

  const handleRelease = async (ms) => {
    setConfirmMs(null); setReleasing(true);
    try {
      const res  = await authFetch(`/diaspora/${deal.id}/milestones/${ms.id}/release`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Release failed');
      Alert.alert('Funds Released ', "Payment is on its way to the worker's M-Pesa.", [
        { text: 'OK', onPress: fetchDeal },
      ]);
    } catch (e) { Alert.alert('Error', e.message); }
    finally     { setReleasing(false); }
  };

  const handleDispute = (ms) =>
    navigation.navigate('CustomEscrowDispute', { dealId: deal.id, milestoneId: ms.id, context: 'diaspora' });

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>
    </SafeAreaView>
  );

  if (error || !deal) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Deal not found'}</Text>
        <TouchableOpacity onPress={fetchDeal} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const milestones     = deal.milestones ?? [];
  const activeMilestone = milestones.find(m => m.status === 'WORK_SUBMITTED')
    ?? milestones.find(m => m.status === 'ACTIVE')
    ?? milestones[0];
  const allReleased    = milestones.length > 0 && milestones.every(m => ['RELEASED','DONE'].includes(m.status));
  const anySubmitted   = milestones.some(m => m.status === 'WORK_SUBMITTED');
  const totalAmount    = deal.totalAmount ?? milestones.reduce((s, m) => s + m.amount, 0);
  const escrowBalance  = deal.amountInEscrow ?? totalAmount;
  const workerName     = deal.recipientName ?? deal.recipientPhone ?? 'Worker';

  const topBadge = allReleased
    ? { label: 'Completed',              color: '#065F46', bg: '#D1FAE5' }
    : anySubmitted
    ? { label: 'Awaiting your approval', color: '#92400E', bg: '#FEF3C7' }
    : { label: 'Funds held securely',    color: COLORS.primary, bg: COLORS.primaryLight };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Escrow balance card ── */}
        <View style={styles.topCard}>
          <Text style={styles.escrowLabel}>Escrow balance</Text>
          <Text style={styles.escrowAmount}>KES {escrowBalance.toLocaleString()}</Text>
          <View style={[styles.topBadge, { backgroundColor: topBadge.bg }]}>
            <Text style={[styles.topBadgeText, { color: topBadge.color }]}>{topBadge.label}</Text>
          </View>
        </View>

        {/* ── Step bar ── */}
        <View style={styles.stepCard}>
          <StepBar milestone={activeMilestone} depositDate={deal.deposit?.createdAt} />
        </View>

        {/* ── Milestone cards ── */}
        {milestones.map((ms) => {
          const isWork = ms.status === 'WORK_SUBMITTED';
          const isDone = ['RELEASED', 'DONE'].includes(ms.status);
          const photos = ms.workProofUrls ?? [];

          return (
            <View key={ms.id} style={styles.milestoneCard}>

              {/* header */}
              <View style={styles.msHeader}>
                <View style={styles.msIconBox}>
                  <ClipboardList size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.msTag}>Milestone</Text>
                  <Text style={styles.msTitle}>{ms.title}</Text>
                </View>
                <View style={[styles.msBadge,
                  isWork && { backgroundColor: '#FEF3C7' },
                  isDone && { backgroundColor: '#D1FAE5' },
                ]}>
                  <Text style={[styles.msBadgeText,
                    isWork && { color: '#92400E' },
                    isDone && { color: '#065F46' },
                  ]}>
                    {isWork ? 'Work submitted' : isDone ? 'Released' : ms.status}
                  </Text>
                </View>
              </View>

              {/* meta row */}
              {(isWork || isDone) && (
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <User size={13} color="#64748B" />
                    <Text style={styles.metaText}>Worker  {workerName}</Text>
                  </View>
                  {ms.workSubmittedAt && (
                    <View style={styles.metaItem}>
                      <Calendar size={13} color="#64748B" />
                      <Text style={styles.metaText}>
                        Submitted {new Date(ms.workSubmittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* evidence photos */}
              {photos.length > 0 && (
                <View style={styles.evidenceBox}>
                  <View style={styles.evidenceHeader}>
                    <Text style={styles.evidenceLabel}>
                      Evidence photo{photos.length > 1 ? 's' : ''} ({photos.length})
                    </Text>
                    <View style={styles.verifiedBadge}>
                      <Shield size={11} color={COLORS.primary} />
                      <Text style={styles.verifiedText}>Verified by Lipasafe</Text>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {photos.map((uri, idx) => (
                      <Image key={idx} source={{ uri }} style={styles.photo} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* protection banner + countdown */}
              {isWork && (
                <View style={styles.protectionCard}>
                  <Shield size={30} color={COLORS.primary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.protectionTitle}>
                      Your money is protected until you approve the work
                    </Text>
                    <Text style={styles.protectionSub}>
                      We'll hold KES {ms.amount.toLocaleString()} securely in escrow.
                    </Text>
                    {ms.autoReleaseAt && <CountdownTimer targetDate={ms.autoReleaseAt} />}
                  </View>
                </View>
              )}

              {/* action buttons */}
              {isWork && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.releaseBtn, releasing && { opacity: 0.6 }]}
                    activeOpacity={0.8}
                    disabled={releasing}
                    onPress={() => setConfirmMs(ms)}
                  >
                    {releasing
                      ? <ActivityIndicator color="#fff" />
                      : <><Lock size={16} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.releaseBtnText}>Release funds</Text></>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.disputeBtn}
                    activeOpacity={0.8}
                    onPress={() => handleDispute(ms)}
                  >
                    <AlertTriangle size={16} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={styles.disputeBtnText}>Raise dispute</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* released row */}
              {isDone && (
                <View style={styles.releasedRow}>
                  <CheckCircle2 size={15} color="#10B981" />
                  <Text style={styles.releasedText}>
                    KES {ms.amount.toLocaleString()} released to worker
                  </Text>
                </View>
              )}

            </View>
          );
        })}

      </ScrollView>

      {/* ── Confirm modal ── */}
      <Modal transparent animationType="fade" visible={!!confirmMs} onRequestClose={() => setConfirmMs(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Release Funds?</Text>
            <Text style={styles.modalBody}>
              KES {confirmMs?.amount?.toLocaleString()} will be sent to the worker's M-Pesa immediately.
              This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setConfirmMs(null)}>
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={() => handleRelease(confirmMs)}>
                <Text style={styles.modalBtnPrimaryText}>Confirm Release</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:       { padding: 16, paddingBottom: 40 },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText:    { color: '#EF4444', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn:     { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText:    { color: '#fff', fontWeight: '600' },

  // top card
  topCard:       { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  escrowLabel:   { fontSize: 13, color: '#64748B', marginBottom: 4 },
  escrowAmount:  { fontSize: 30, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  topBadge:      { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  topBadgeText:  { fontSize: 13, fontWeight: '600' },

  // step bar
  stepCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  stepRow:       { flexDirection: 'row', alignItems: 'flex-start' },
  stepItem:      { flex: 1, alignItems: 'center' },
  stepCircle:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E2E8F0',
                   alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stepCircleDone:{ backgroundColor: COLORS.primary },
  stepNum:       { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  stepLabel:     { fontSize: 11, fontWeight: '600', color: '#94A3B8', textAlign: 'center' },
  stepLabelDone: { color: COLORS.primary },
  stepSub:       { fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 2 },
  stepLine:      { height: 2, flex: 0.4, backgroundColor: '#E2E8F0', marginTop: 15 },
  stepLineDone:  { backgroundColor: COLORS.primary },

  // milestone card
  milestoneCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  msHeader:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  msIconBox:     { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primaryLight,
                   alignItems: 'center', justifyContent: 'center' },
  msTag:         { fontSize: 11, color: COLORS.primary, fontWeight: '600', marginBottom: 2 },
  msTitle:       { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  msBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: '#F1F5F9' },
  msBadgeText:   { fontSize: 11, fontWeight: '600', color: '#64748B' },

  metaRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  metaItem:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:      { fontSize: 12, color: '#64748B' },

  // evidence
  evidenceBox:    { marginBottom: 14 },
  evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  evidenceLabel:  { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  verifiedBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText:   { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  photo:          { width: 220, height: 150, borderRadius: 12, backgroundColor: '#E2E8F0', marginRight: 10 },

  // protection
  protectionCard:  { flexDirection: 'row', backgroundColor: '#F0FDF4', borderRadius: 12,
                     padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#BBF7D0',
                     alignItems: 'flex-start' },
  protectionTitle: { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 4 },
  protectionSub:   { fontSize: 12, color: '#166534', marginBottom: 4 },
  timerText:       { fontSize: 12, color: '#166534', fontWeight: '600' },
  timerUrgent:     { fontSize: 12, color: '#DC2626', fontWeight: '600' },

  // buttons
  actions:          { gap: 10 },
  releaseBtn:       { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  releaseBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  disputeBtn:       { borderRadius: 14, paddingVertical: 14, flexDirection: 'row',
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  disputeBtnText:   { color: '#EF4444', fontSize: 15, fontWeight: '700' },

  releasedRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  releasedText: { color: '#10B981', fontSize: 13, fontWeight: '600' },

  // modal
  modalOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
                           justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:              { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  modalTitle:            { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  modalBody:             { fontSize: 14, color: '#64748B', lineHeight: 21, marginBottom: 24 },
  modalActions:          { flexDirection: 'row', gap: 12 },
  modalBtn:              { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  modalBtnPrimary:       { backgroundColor: COLORS.primary },
  modalBtnSecondary:     { backgroundColor: '#F1F5F9' },
  modalBtnPrimaryText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBtnSecondaryText: { color: '#64748B', fontWeight: '600', fontSize: 15 },
});
