import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Modal,
  StyleSheet, Alert, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const STATUS_META = {
  PENDING_ACCEPTANCE: { label: 'Awaiting Acceptance', color: '#FF9500', icon: 'time-outline' },
  REJECTED:           { label: 'Rejected',            color: colors.error, icon: 'close-circle' },
  ACCEPTED:           { label: 'Accepted',            color: '#007AFF', icon: 'checkmark-circle' },
  PENDING_PAYMENT:    { label: 'Pending Payment',     color: '#FF9500', icon: 'card-outline' },
  PAYMENT_INITIATING: { label: 'Payment Initiating',  color: '#FF9500', icon: 'hourglass-outline' },
  PAYMENT_HELD:       { label: 'Funds in Escrow',     color: colors.primary, icon: 'lock-closed' },
  BUYER_CONFIRMED:    { label: 'Buyer Confirmed Done',color: '#007AFF', icon: 'checkmark-done' },
  COMPLETED:          { label: 'Completed',           color: colors.primary, icon: 'trophy' },
  DISPUTED:           { label: 'Disputed',            color: colors.error, icon: 'alert-circle' },
  REFUNDED:           { label: 'Refunded',            color: colors.grayDark, icon: 'return-down-back' },
  CANCELLED:          { label: 'Cancelled',           color: colors.grayDark, icon: 'ban' },
};

export default function CustomEscrowDetailScreen({ route, navigation }) {
  const { escrowId } = route.params;
  const [escrow,     setEscrow]     = useState(null);
  const [role,       setRole]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState(false);
  const [lightbox,   setLightbox]   = useState(null); // uri or null

  const fetchDeal = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await authFetch(`/custom/${escrowId}`);
      const data = await res.json();
      if (data.success) { setEscrow(data.escrow); setRole(data.role); }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [escrowId]);

  useEffect(() => { fetchDeal(); }, [fetchDeal]);

  const onRefresh = () => { setRefreshing(true); fetchDeal(true); };

  const doAction = async (path, method = 'POST', body = {}, confirmMsg = null) => {
    if (acting) return;
    if (confirmMsg) {
      await new Promise((resolve, reject) =>
        Alert.alert('Confirm', confirmMsg,
          [{ text: 'Cancel', style: 'cancel', onPress: reject }, { text: 'Yes', onPress: resolve }]
        )
      ).catch(() => { throw new Error('cancelled') });
    }
    setActing(true);
    try {
      const res  = await authFetch(path, { method, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Action failed');
      fetchDeal(true);
    } catch (err) {
      if (err.message !== 'cancelled') Alert.alert('Error', err.message);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!escrow)  return <View style={styles.center}><Text>Deal not found</Text></View>;

  const meta    = STATUS_META[escrow.status] || { label: escrow.status, color: colors.grayDark, icon: 'ellipse' };
  const amount  = Number(escrow.amount);
  const isBuyer = role === 'buyer';

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deal Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: meta.color + '18', borderColor: meta.color }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
        <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
      </View>

      {/* Deal card */}
      <View style={styles.card}>
        {escrow.isRisky && (
          <View style={styles.riskBanner}>
            <Ionicons name="warning" size={14} color="#FF9500" />
            <Text style={styles.riskText}>High-risk deal</Text>
          </View>
        )}
        <Text style={styles.dealTitle}>{escrow.title}</Text>
        <Text style={styles.dealDesc}>{escrow.description}</Text>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Amount</Text>
          <Text style={styles.metaValue}>KES {amount.toLocaleString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>{isBuyer ? 'Counterparty' : 'Buyer'}</Text>
          <Text style={styles.metaValue}>{isBuyer ? escrow.counterpartyPhone : (escrow.buyer?.phone || escrow.buyerPhone || 'N/A')}</Text>
        </View>
        {escrow.deadline && (
          <View style={styles.row}>
            <Text style={styles.metaLabel}>Deadline</Text>
            <Text style={styles.metaValue}>{new Date(escrow.deadline).toLocaleString()}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Created</Text>
          <Text style={styles.metaValue}>{new Date(escrow.createdAt).toLocaleDateString()}</Text>
        </View>
        {escrow.mpesaRef && (
          <View style={styles.row}>
            <Text style={styles.metaLabel}>M-Pesa Ref</Text>
            <Text style={styles.metaValue}>{escrow.mpesaRef}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Your role</Text>
          <Text style={[styles.metaValue, { color: colors.primary }]}>{isBuyer ? 'Buyer' : 'Counterparty'}</Text>
        </View>
      </View>

      {/* Deal photos */}
      {escrow.photos?.length > 0 && (
        <View style={styles.photosSection}>
          <Text style={styles.photosSectionTitle}>📸 Deal Photos ({escrow.photos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {escrow.photos.map((photo, idx) => (
              <TouchableOpacity key={idx} onPress={() => setLightbox(photo.url || photo)} activeOpacity={0.85}>
                <Image
                  source={{ uri: photo.url || photo }}
                  style={styles.dealPhoto}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Risk details if risky */}
      {escrow.isRisky && escrow.riskDescription && (
        <View style={styles.riskCard}>
          <Text style={styles.riskCardTitle}> Risk Notes</Text>
          <Text style={styles.riskCardText}>{escrow.riskDescription}</Text>
        </View>
      )}

      {/* Dispute info */}
      {escrow.dispute && (
        <View style={styles.disputeCard}>
          <Text style={styles.disputeTitle}> Dispute Open</Text>
          <Text style={styles.disputeReason}>{escrow.dispute.reason}</Text>
          <Text style={styles.disputeDesc}>{escrow.dispute.description}</Text>
          <Text style={styles.disputeStatus}>Status: {escrow.dispute.status}</Text>
          {escrow.dispute.resolution && (
            <Text style={styles.disputeResolution}>Resolution: {escrow.dispute.resolution}</Text>
          )}
          {escrow.dispute.evidence?.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.disputeReason, { marginBottom: 6 }]}>Buyer Evidence Photos:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {escrow.dispute.evidence.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Action buttons — role + status based */}
      <View style={styles.actions}>

        {/* Counterparty: accept/reject when pending */}
        {!isBuyer && escrow.status === 'PENDING_ACCEPTANCE' && (
          <>
            <TouchableOpacity
              style={[styles.btnPrimary, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => doAction(`/custom/${escrowId}/accept`, 'POST', {}, 'Accept this deal?')}
            >
              {acting ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="checkmark" size={18} color={colors.white} style={{ marginRight: 6 }} /><Text style={styles.btnText}>Accept Deal</Text></>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => doAction(`/custom/${escrowId}/reject`, 'POST', {}, 'Reject this deal?')}
            >
              <Text style={styles.btnSecondaryText}>Reject Deal</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Buyer: pay when accepted */}
        {isBuyer && escrow.status === 'ACCEPTED' && (
          <TouchableOpacity
            style={[styles.btnPrimary, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => navigation.navigate('CustomEscrowPayment', { escrowId })}
          >
            <Ionicons name="phone-portrait" size={18} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Pay via M-Pesa</Text>
          </TouchableOpacity>
        )}

        {/* Buyer: confirm done when payment held */}
        {isBuyer && escrow.status === 'PAYMENT_HELD' && (
          <>
            <TouchableOpacity
              style={[styles.btnPrimary, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => doAction(`/custom/${escrowId}/buyer-confirm`, 'POST', {}, 'Confirm the deal is done and notify the counterparty?')}
            >
              {acting ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="checkmark-done" size={18} color={colors.white} style={{ marginRight: 6 }} /><Text style={styles.btnText}>Confirm Deal Done</Text></>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnDanger, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => navigation.navigate('CustomEscrowDispute', { escrowId })}
            >
              <Ionicons name="alert-circle" size={18} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.btnText}>Open Dispute</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Counterparty: confirm receipt when buyer confirmed */}
        {!isBuyer && escrow.status === 'BUYER_CONFIRMED' && (
          <>
            <TouchableOpacity
              style={[styles.btnPrimary, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => doAction(`/custom/${escrowId}/seller-confirm`, 'POST', {}, `Confirm and release KES ${amount.toLocaleString()} to your M-Pesa?`)}
            >
              {acting ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="cash" size={18} color={colors.white} style={{ marginRight: 6 }} /><Text style={styles.btnText}>Confirm & Receive Payment</Text></>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnDanger, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => navigation.navigate('CustomEscrowDispute', { escrowId })}
            >
              <Ionicons name="alert-circle" size={18} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.btnText}>Open Dispute</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Counterparty: dispute when payment held */}
        {!isBuyer && escrow.status === 'PAYMENT_HELD' && (
          <TouchableOpacity
            style={[styles.btnDanger, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => navigation.navigate('CustomEscrowDispute', { escrowId })}
          >
            <Ionicons name="alert-circle" size={18} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Open Dispute</Text>
          </TouchableOpacity>
        )}

        {/* Seller: respond to dispute */}
        {!isBuyer && escrow.status === 'DISPUTED' && !escrow.dispute?.sellerResponse && (
          <TouchableOpacity
            style={[styles.btnDanger, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => navigation.navigate('CustomEscrowDisputeResponse', { escrowId, dispute: escrow.dispute })}
          >
            <Ionicons name="shield-checkmark" size={18} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Respond to Dispute</Text>
          </TouchableOpacity>
        )}

        {/* Seller: response submitted */}
        {!isBuyer && escrow.status === 'DISPUTED' && escrow.dispute?.sellerResponse && (
          <View style={[styles.completedBox, { backgroundColor: '#F0FFF4', borderRadius: 12, padding: 16 }]}>
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            <Text style={[styles.completedText, { fontSize: 14 }]}>Your response has been submitted. Admin is reviewing.</Text>
          </View>
        )}

        {/* Completed state */}
        {escrow.status === 'COMPLETED' && (
          <View style={styles.completedBox}>
            <Ionicons name="trophy" size={28} color={colors.primary} />
            <Text style={styles.completedText}>Deal completed successfully!</Text>
          </View>
        )}

      </View>

      {/* Audit log */}
      {escrow.auditLogs?.length > 0 && (
        <View style={styles.timeline}>
          <Text style={styles.timelineTitle}>Timeline</Text>
          {escrow.auditLogs.map((log, i) => (
            <View key={log.id} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineAction}>{log.action.replace(/_/g, ' ')}</Text>
                <Text style={styles.timelineDate}>{new Date(log.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 48 }} />

      {/* Lightbox */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <StatusBar backgroundColor="#000" barStyle="light-content" />
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightbox(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {lightbox && (
            <Image
              source={{ uri: lightbox }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:          { padding: 8 },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: colors.black },
  statusBadge:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  statusText:       { fontSize: 14, fontWeight: '700' },
  card:             { marginHorizontal: 16, backgroundColor: colors.gray, borderRadius: 14, padding: 16, marginBottom: 12 },
  riskBanner:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3DC', borderRadius: 8, padding: 8, marginBottom: 12 },
  riskText:         { fontSize: 12, color: '#FF9500', fontWeight: '600' },
  dealTitle:        { fontSize: 17, fontWeight: '700', color: colors.black, marginBottom: 6 },
  dealDesc:         { fontSize: 14, color: colors.grayDark, lineHeight: 20, marginBottom: 12 },
  divider:          { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  row:              { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaLabel:        { fontSize: 13, color: colors.grayDark },
  metaValue:        { fontSize: 13, color: colors.black, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  riskCard:         { marginHorizontal: 16, backgroundColor: '#FFFBF0', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FFD580', marginBottom: 12 },
  riskCardTitle:    { fontSize: 13, fontWeight: '700', color: '#FF9500', marginBottom: 6 },
  riskCardText:     { fontSize: 13, color: colors.black, lineHeight: 18 },
  disputeCard:      { marginHorizontal: 16, backgroundColor: '#FFF0F0', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.error, marginBottom: 12 },
  disputeTitle:     { fontSize: 13, fontWeight: '700', color: colors.error, marginBottom: 6 },
  disputeReason:    { fontSize: 14, fontWeight: '600', color: colors.black, marginBottom: 4 },
  disputeDesc:      { fontSize: 13, color: colors.grayDark, lineHeight: 18, marginBottom: 6 },
  disputeStatus:    { fontSize: 12, color: colors.grayDark },
  disputeResolution:{ fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 4 },
  actions:          { paddingHorizontal: 16, gap: 10, marginTop: 4 },
  btnPrimary:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15 },
  btnSecondary:     { alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 15, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.black },
  btnDanger:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error, borderRadius: 12, paddingVertical: 15 },
  btnDisabled:      { opacity: 0.5 },
  btnText:          { color: colors.white, fontSize: 15, fontWeight: '700' },
  completedBox:     { alignItems: 'center', padding: 24, gap: 8 },
  completedText:    { fontSize: 16, fontWeight: '700', color: colors.primary },
  timeline:         { marginHorizontal: 16, marginTop: 20 },
  timelineTitle:    { fontSize: 13, fontWeight: '700', color: colors.black, marginBottom: 12 },
  timelineItem:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  timelineDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 },
  timelineAction:   { fontSize: 13, fontWeight: '600', color: colors.black, textTransform: 'capitalize' },
  timelineDate:     { fontSize: 11, color: colors.grayDark, marginTop: 2 },
  photosSection:     { marginHorizontal: 16, marginBottom: 12 },
  photosSectionTitle:{ fontSize: 13, fontWeight: '700', color: colors.black, marginBottom: 8 },
  dealPhoto:         { width: 140, height: 140, borderRadius: 12, backgroundColor: colors.gray },
  lightboxOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  lightboxImage:     { width: '100%', height: '80%' },
  lightboxClose:     { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },
});
