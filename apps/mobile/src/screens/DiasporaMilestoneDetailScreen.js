import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle2, RefreshCw, Clock, AlertTriangle, Info } from 'lucide-react-native';
import { authFetch } from '../utils/api';
import { COLORS, SPACING } from './diasporaTheme';

const STATUS_META = {
  DONE:           { Icon: CheckCircle2,  label: 'Done',           color: '#10B981', bg: '#ECFDF5' },
  ACTIVE:         { Icon: RefreshCw,     label: 'Active',         color: COLORS.primary, bg: COLORS.primaryLight },
  PENDING:        { Icon: Clock,         label: 'Pending',        color: '#64748B', bg: '#F1F5F9' },
  WORK_SUBMITTED: { Icon: RefreshCw,     label: 'Work Submitted', color: '#F59E0B', bg: '#FFFBEB' },
  RELEASED:       { Icon: CheckCircle2,  label: 'Released',       color: '#10B981', bg: '#ECFDF5' },
  DISPUTED:       { Icon: AlertTriangle, label: 'Disputed',       color: '#EF4444', bg: '#FEF2F2' },
};

export default function DiasporaMilestoneDetailScreen({ navigation, route }) {
  const { dealId, milestoneId } = route.params || {};
  const [milestone, setMilestone]               = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [releasing, setReleasing]               = useState(false);
  const [releaseModalVisible, setReleaseModal]  = useState(false);

  const fetchMilestone = useCallback(async () => {
    if (!dealId || !milestoneId) return;
    setLoading(true); setError(null);
    try {
      const res  = await authFetch(`/diaspora/${dealId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load deal');
      const found = json.deal?.milestones?.find(m => m.id === milestoneId);
      if (!found) throw new Error('Milestone not found');
      setMilestone(found);
    } catch (err) {
      setError(err.message || 'Failed to load milestone');
    } finally {
      setLoading(false);
    }
  }, [dealId, milestoneId]);

  useFocusEffect(useCallback(() => { fetchMilestone(); }, [fetchMilestone]));

  const handleRelease = async () => {
    setReleaseModal(false);
    setReleasing(true);
    try {
      const res  = await authFetch(`/diaspora/${dealId}/milestones/${milestoneId}/release`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Release failed');
      Alert.alert('Funds Released', `Payment is being sent to the worker's M-Pesa.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not release funds. Try again.');
    } finally {
      setReleasing(false);
    }
  };

  const handleDispute = () => {
    navigation.navigate('CustomEscrowDispute', { dealId, milestoneId, context: 'diaspora' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading milestone…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !milestone) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Milestone not found'}</Text>
          <TouchableOpacity onPress={fetchMilestone} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const meta           = STATUS_META[milestone.status] ?? STATUS_META.PENDING;
  const isWorkSubmitted = milestone.status === 'WORK_SUBMITTED';
  const isReleased      = milestone.status === 'RELEASED';
  const photos          = milestone.workProofUrls || [];

  const autoRelease = milestone.autoReleaseAt ? new Date(milestone.autoReleaseAt) : null;
  const hoursLeft   = autoRelease
    ? Math.max(0, Math.round((autoRelease - Date.now()) / 3_600_000))
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Header card ── */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={[styles.badge, { backgroundColor: meta.bg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <meta.Icon size={13} color={meta.color} />
              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <Text style={styles.amountText}>KES {milestone.amount.toLocaleString()}</Text>
          </View>
          <Text style={styles.title}>{milestone.title}</Text>
          {!!milestone.description && (
            <Text style={styles.description}>{milestone.description}</Text>
          )}
        </View>

        {/* ── Instruction banner (work submitted) ── */}
        {isWorkSubmitted && (
          <View style={styles.infoBanner}>
            <Info size={18} color="#92400E" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>Work proof submitted — your action needed</Text>
              <Text style={styles.infoBody}>
                Review the evidence photos below. If the work meets your expectations, tap
                {' '}<Text style={{ fontWeight: '700' }}>Release Funds</Text> to pay the worker.
                If not, tap <Text style={{ fontWeight: '700' }}>Raise Dispute</Text> and our team
                will review.
              </Text>
              {hoursLeft !== null && (
                <Text style={styles.infoDeadline}>
                  ⏰ Funds auto-release in {hoursLeft}h if no action is taken.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Released banner ── */}
        {isReleased && (
          <View style={[styles.infoBanner, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}>
            <CheckCircle2 size={18} color="#065F46" />
            <Text style={[styles.infoTitle, { color: '#065F46', marginLeft: 10 }]}>
              Funds have been released to the worker.
            </Text>
          </View>
        )}

        {/* ── Evidence photos ── */}
        {photos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Evidence Photos ({photos.length})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryScroll}
            >
              {photos.map((uri, index) => (
                <View key={index} style={styles.photoCard}>
                  <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {isWorkSubmitted && photos.length === 0 && (
          <View style={styles.noPhotos}>
            <Text style={styles.noPhotosText}>No photos were attached to this submission.</Text>
          </View>
        )}

        {/* ── Action buttons ── */}
        {isWorkSubmitted && (
          <View style={styles.actionsCard}>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonPrimary, releasing && { opacity: 0.6 }]}
              activeOpacity={0.8}
              disabled={releasing}
              onPress={() => setReleaseModal(true)}
            >
              {releasing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.actionButtonPrimaryText}>Release Funds</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDanger]}
              activeOpacity={0.8}
              onPress={handleDispute}
            >
              <Text style={styles.actionButtonDangerText}>Raise Dispute</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* ── Confirm release modal ── */}
      <Modal
        transparent
        animationType="fade"
        visible={releaseModalVisible}
        onRequestClose={() => setReleaseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Release Funds?</Text>
            <Text style={styles.modalBody}>
              KES {milestone.amount.toLocaleString()} will be sent to the worker's M-Pesa.
              This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                activeOpacity={0.7}
                onPress={() => setReleaseModal(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                activeOpacity={0.7}
                onPress={handleRelease}
              >
                <Text style={styles.modalButtonPrimaryText}>Confirm Release</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:      { padding: SPACING.md, paddingBottom: 40 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 12, color: '#64748B', fontSize: 14 },
  errorText:   { color: '#EF4444', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn:    { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText:   { color: '#fff', fontWeight: '600' },

  /* header */
  headerCard:  { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
                 shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText:   { fontSize: 12, fontWeight: '600' },
  amountText:  { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  title:       { fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  description: { fontSize: 14, color: '#64748B', lineHeight: 20 },

  /* info banner */
  infoBanner:  { flexDirection: 'row', backgroundColor: '#FFFBEB', borderWidth: 1,
                 borderColor: '#FCD34D', borderRadius: 12, padding: 14, marginBottom: 16 },
  infoTitle:   { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  infoBody:    { fontSize: 13, color: '#78350F', lineHeight: 19 },
  infoDeadline:{ fontSize: 12, color: '#B45309', marginTop: 6, fontWeight: '600' },

  /* gallery */
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  galleryScroll: { paddingBottom: 8, gap: 10 },
  photoCard:     { width: 200, height: 150, borderRadius: 12, overflow: 'hidden',
                   backgroundColor: '#E2E8F0', marginRight: 10 },
  photoImage:    { width: '100%', height: '100%' },
  noPhotos:      { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 16,
                   alignItems: 'center', marginBottom: 16 },
  noPhotosText:  { color: '#94A3B8', fontSize: 13 },

  /* actions */
  actionsCard:              { marginTop: 24, gap: 12 },
  actionButton:             { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  actionButtonPrimary:      { backgroundColor: COLORS.primary },
  actionButtonDanger:       { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  actionButtonPrimaryText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionButtonDangerText:   { color: '#EF4444', fontSize: 16, fontWeight: '700' },

  /* modal */
  modalOverlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center',
                            alignItems: 'center', padding: 24 },
  modalBox:               { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  modalTitle:             { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  modalBody:              { fontSize: 14, color: '#64748B', lineHeight: 21, marginBottom: 24 },
  modalActions:           { flexDirection: 'row', gap: 12 },
  modalButton:            { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  modalButtonPrimary:     { backgroundColor: COLORS.primary },
  modalButtonSecondary:   { backgroundColor: '#F1F5F9' },
  modalButtonPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalButtonSecondaryText:{ color: '#64748B', fontWeight: '600', fontSize: 15 },
});
