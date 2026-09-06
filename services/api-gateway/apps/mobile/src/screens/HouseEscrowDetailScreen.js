import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';
import { useNotifications } from '../context/NotificationContext';

const STATUS_META = {
  PENDING_ACCEPTANCE: { label: 'Awaiting Acceptance', color: '#FF9500',   icon: 'time',                  bg: '#FFF3E0' },
  ACCEPTED:        { label: 'Accepted',           color: '#007AFF',       icon: 'checkmark-circle',      bg: '#E8F0FF' },
  REJECTED:        { label: 'Rejected by Seller', color: colors.error,    icon: 'close-circle',          bg: '#FFF0F0' },
  PENDING_PAYMENT: { label: 'Awaiting Payment',  color: '#FF9500',       icon: 'time',                  bg: '#FFF3E0' },
  PAYMENT_HELD:    { label: 'Payment Held',       color: '#007AFF',       icon: 'lock-closed',           bg: '#E8F0FF' },
  CONFIRMED:       { label: 'Released',           color: colors.success,  icon: 'checkmark-circle',      bg: '#E8F5EE' },
  DISPUTED:        { label: 'Disputed',           color: colors.error,    icon: 'alert-circle',          bg: '#FFF0F0' },
  ESCALATED:       { label: 'Escalated',          color: colors.error,    icon: 'alert-circle',          bg: '#FFF0F0' },
  REFUNDED:        { label: 'Refunded',           color: '#FF9500',       icon: 'arrow-undo-circle',     bg: '#FFF3E0' },
  COMPLETED:       { label: 'Completed',          color: colors.success,  icon: 'checkmark-done-circle', bg: '#E8F5EE' },
  AUTO_RELEASED:   { label: 'Auto-Released',      color: colors.grayDark, icon: 'timer',                 bg: colors.gray },
  CANCELLED:       { label: 'Cancelled',          color: colors.grayDark, icon: 'close-circle',          bg: colors.gray },
};

const DISPUTE_REASON_LABELS = {
  house_not_exist:  'House does not exist',
  not_as_described: 'Not as described',
  seller_no_show:   'Seller never showed up',
  wrong_property:   'Wrong property shown',
  fraud_suspected:  'Fraud / scam suspected',
  other:            'Other',
};

function Row({ label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export default function HouseEscrowDetailScreen({ navigation, route }) {
  const { escrowId } = route.params;
  const [escrow,   setEscrow]   = useState(null);
  const [isBuyer,  setIsBuyer]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [acting,   setActing]   = useState(false);

  const { notifications } = useNotifications();
  const processedNotifIds = React.useRef(new Set());

  const loadEscrow = async () => {
    try {
      const res  = await authFetch(`/house/status/${escrowId}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      setEscrow(data.escrow);
      setIsBuyer(data.isBuyer);
      console.log('[HouseDetail DEBUG] isBuyer:', data.isBuyer, 'isSeller:', data.isSeller, 'status:', data.escrow.status, 'escrowId:', escrowId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEscrow(); }, [escrowId]);

  // Re-fetch when a relevant push notification lands (accept/reject)
  useEffect(() => {
    const hit = notifications.find(n =>
      n.houseEscrowId === escrowId &&
      (n.type === 'house_deal_accepted' || n.type === 'house_deal_rejected') &&
      !processedNotifIds.current.has(n.id)
    );
    if (!hit) return;
    processedNotifIds.current.add(hit.id);
    loadEscrow();
  }, [notifications]);

  const doAction = async (path, confirmMsg) => {
    setActing(true);
    try {
      const res  = await authFetch(path, { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Action failed');
      await loadEscrow();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !escrow) {
    return (
      <View style={styles.center}>
        <Ionicons name="warning-outline" size={40} color={colors.error} />
        <Text style={styles.errorText}>{error || 'Escrow not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meta     = STATUS_META[escrow.status] || { label: escrow.status, color: colors.grayDark, icon: 'help-circle', bg: colors.gray };
  const created  = new Date(escrow.createdAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const deadline = escrow.inspectionDeadline
    ? new Date(escrow.inspectionDeadline).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Starts after payment';
  const completedAt = escrow.completedAt
    ? new Date(escrow.completedAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const canGoActive = escrow.status === 'PAYMENT_HELD';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Escrow Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Status hero */}
      <View style={[styles.heroBanner, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={40} color={meta.color} />
        <Text style={[styles.heroStatus, { color: meta.color }]}>{meta.label}</Text>
        <Text style={[styles.heroAmount, { color: meta.color }]}>
          KES {Number(escrow.amount).toLocaleString()}
        </Text>
      </View>

      {/* Property details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Property</Text>
        <Text style={styles.descText}>{escrow.description}</Text>
        {escrow.address ? (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={14} color={colors.grayDark} />
            <Text style={styles.addressText}>{escrow.address}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* Transaction details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transaction</Text>
        <Row label="Seller phone"      value={escrow.sellerPhone} />
        <Row label="Service fee"       value={`KES ${Number(escrow.amount).toLocaleString()}`} />
        {escrow.platformFee != null && (
          <Row label="LipaSafe fee"    value={`KES ${Number(escrow.platformFee).toLocaleString()}`} />
        )}
        {escrow.sellerReceives != null && (
          <Row label="Seller receives" value={`KES ${Number(escrow.sellerReceives).toLocaleString()}`} valueColor={colors.success} />
        )}
        {escrow.mpesaRef && (
          <Row label="M-Pesa ref"      value={escrow.mpesaRef} />
        )}
      </View>

      <View style={styles.divider} />

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <Row label="Created"             value={created} />
        <Row label="Inspection window"   value={`${escrow.inspectionHours} hours`} />
        <Row label="Deadline"            value={deadline} />
        {completedAt && (
          <Row label="Completed at"      value={completedAt} />
        )}
        {escrow.autoReleasedAt && (
          <Row label="Auto-released at"  value={new Date(escrow.autoReleasedAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
        )}
      </View>

      {/* Dispute section (if any) */}
      {escrow.dispute && (
        <>
          <View style={styles.divider} />
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dispute</Text>
            <Row
              label="Reason"
              value={DISPUTE_REASON_LABELS[escrow.dispute.reason] || escrow.dispute.reason}
            />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Description</Text>
            </View>
            <Text style={styles.disputeDesc}>{escrow.dispute.description}</Text>
            <Row label="Status"    value={escrow.dispute.status} />
            {escrow.dispute.decision && (
              <Row label="Decision"  value={escrow.dispute.decision} valueColor={colors.primary} />
            )}
            {escrow.dispute.adminNotes && (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Admin notes</Text>
                </View>
                <Text style={styles.disputeDesc}>{escrow.dispute.adminNotes}</Text>
              </>
            )}
          </View>
        </>
      )}

      {/* Seller: accept/reject while pending */}
      {!isBuyer && escrow.status === 'PENDING_ACCEPTANCE' && (
        <View style={{ marginHorizontal: 16, marginTop: 24, gap: 12 }}>
          <TouchableOpacity
            style={styles.ctaBtn}
            disabled={acting}
            onPress={() => doAction(`/house/accept/${escrowId}`)}
          >
            {acting ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Ionicons name="checkmark" size={18} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.ctaBtnText}>Accept Deal</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            disabled={acting}
            onPress={() => doAction(`/house/reject/${escrowId}`)}
          >
            <Text style={styles.secondaryBtnText}>Reject Deal</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Buyer: pay once seller has accepted */}
      {isBuyer && escrow.status === 'ACCEPTED' && (
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={async () => {
            let label = escrow.sellerPhone;
            try {
              const res = await authFetch(`/user/resolve-phone?phone=${escrow.sellerPhone}`)
              const data = await res.json()
              label = data.found ? `${data.name} (${escrow.sellerPhone})` : escrow.sellerPhone
            } catch {}
            Alert.alert(
              'Confirm Recipient',
              `Paying escrow to:\n\n${label}\n\nKES ${escrow.amount}`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Proceed', onPress: () => navigation.navigate('HouseEscrowPayment', {
                    escrowId:     escrow.id,
                    amount:       escrow.amount,
                    platformFee:  escrow.platformFee,
                    b2cFee:       escrow.b2cFee || 0,
                    total:        Number(escrow.amount) + Number(escrow.platformFee || 0),
                    sellerPhone:  escrow.sellerPhone,
                    description:  escrow.description,
                    protectionHours: escrow.inspectionHours,
                  })
                }
              ]
            )
          }}
        >
          <Ionicons name="phone-portrait" size={20} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.ctaBtnText}>Pay via M-Pesa</Text>
        </TouchableOpacity>
      )}

      {/* CTA — jump back to active screen if still live */}
      {canGoActive && (
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('HouseEscrowActive', {
            escrowId:           escrow.id,
            amount:             escrow.amount,
            sellerPhone:        escrow.sellerPhone,
            description:        escrow.description,
            inspectionHours:    escrow.inspectionHours,
            inspectionDeadline: escrow.inspectionDeadline,
          })}
        >
          <Ionicons name="arrow-forward-circle" size={20} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.ctaBtnText}>Go to Active Escrow</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.white },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText:    { fontSize: 15, color: colors.error, textAlign: 'center', marginTop: 12 },
  backLink:     { marginTop: 20 },
  backLinkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:      { padding: 8 },
  title:        { fontSize: 18, fontWeight: '700', color: colors.black },
  heroBanner:   { alignItems: 'center', marginHorizontal: 16, borderRadius: 16, paddingVertical: 28, marginBottom: 8, gap: 6 },
  heroStatus:   { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount:   { fontSize: 32, fontWeight: '800' },
  section:      { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.grayDark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  descText:     { fontSize: 14, color: colors.black, lineHeight: 21 },
  addressRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  addressText:  { fontSize: 13, color: colors.grayDark },
  row:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rowLabel:     { fontSize: 13, color: colors.grayDark },
  rowValue:     { fontSize: 13, color: colors.black, fontWeight: '600', flex: 1, textAlign: 'right' },
  divider:      { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  disputeDesc:  { fontSize: 13, color: colors.black, lineHeight: 19, marginBottom: 10, marginTop: -4 },
  ctaBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  ctaBtnText:   { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.error, borderRadius: 12, paddingVertical: 16 },
  secondaryBtnText: { color: colors.error, fontSize: 15, fontWeight: '700' },
});
