import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Alert, ActivityIndicator,
  TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '../utils/api';
import { colors } from '../theme/colors';

const STATE_CONFIG = {
  PENDING:   { color: '#F59E0B', bg: '#FEF3C7', icon: 'time-outline',            label: 'Pending' },
  ACCEPTED:  { color: '#10B981', bg: '#D1FAE5', icon: 'checkmark-circle-outline', label: 'Accepted' },
  DECLINED:  { color: '#EF4444', bg: '#FEE2E2', icon: 'close-circle-outline',     label: 'Declined' },
  CANCELLED: { color: '#6B7280', bg: '#F3F4F6', icon: 'ban-outline',              label: 'Cancelled' },
};

export default function SafeTransferScreen({ navigation, route }) {
  const { transferId } = route.params || {};
  const insets = useSafeAreaInsets();
  const [transfer, setTransfer] = useState(null);
  const [role,     setRole]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`/transfer/${transferId}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setTransfer(data.transfer);
      setRole(data.role);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not load transfer');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => { load(); }, [load]);

  const act = async (action) => {
    setActing(true);
    try {
      const res  = await authFetch(`/transfer/${transferId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      const messages = {
        accept:  'Money is on its way to your M-Pesa.',
        decline: 'Transfer declined. Sender will be refunded.',
        cancel:  'Transfer cancelled. You will be refunded.',
      };
      Alert.alert('Done', messages[action], [
        { text: 'OK', onPress: () => navigation.navigate('HomeTab', { screen: 'HomeMain' }) }
      ]);
    } catch (e) {
      Alert.alert('Failed', e.message || 'Something went wrong');
    } finally {
      setActing(false);
    }
  };

  const confirmAct = (action) => {
    const config = {
      accept:  { title: 'Accept Transfer',  msg: `You'll receive KES ${Number(transfer?.amount).toLocaleString()} to your M-Pesa.`, btn: 'Accept Now' },
      decline: { title: 'Decline Transfer', msg: 'The sender will be fully refunded to their wallet.',                               btn: 'Decline' },
      cancel:  { title: 'Cancel Transfer',  msg: 'You will be fully refunded to your M-Pesa.',                                      btn: 'Cancel Transfer' },
    }[action];
    Alert.alert(config.title, config.msg, [
      { text: 'Go Back', style: 'cancel' },
      { text: config.btn, style: action === 'accept' ? 'default' : 'destructive', onPress: () => act(action) },
    ]);
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  if (!transfer) return null;

  const isPending = transfer.state === 'PENDING';
  const isSender  = role === 'sender';
  const state     = STATE_CONFIG[transfer.state] || STATE_CONFIG.PENDING;
  const sender    = transfer.sender || {};
  const initials  = (sender.fullName || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('HomeTab', { screen: 'HomeMain' })} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SafeSend</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Sender Card */}
        <View style={styles.senderCard}>
          {sender.avatarUrl
            ? <Image source={{ uri: sender.avatarUrl }} style={styles.avatar} />
            : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )
          }
          <View style={styles.verifiedRow}>
            <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
            <Text style={styles.verifiedText}>Verified LipaSafe User</Text>
          </View>
          <Text style={styles.senderName}>{sender.fullName || 'Unknown'}</Text>
          <Text style={styles.senderPhone}>{sender.phone}</Text>

          {/* State pill */}
          <View style={[styles.statePill, { backgroundColor: state.bg }]}>
            <Ionicons name={state.icon} size={13} color={state.color} />
            <Text style={[styles.stateText, { color: state.color }]}>{state.label}</Text>
          </View>
        </View>

        {/* Amount Card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>{isSender ? 'You are sending' : 'Sending you'}</Text>
          <Text style={styles.amountValue}>KES {Number(transfer.amount).toLocaleString()}</Text>
          {transfer.fee ? (
            <>
              <View style={styles.amountDivider} />
              <View style={styles.amountRow}>
                <Text style={styles.amountRowLabel}>You receive</Text>
                <Text style={[styles.amountRowValue, { color: colors.primary, fontWeight: '800' }]}>
                  KES {(Number(transfer.amount) - Number(transfer.fee || 0)).toLocaleString()}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          {transfer.purpose ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.detailLabel}>Purpose</Text>
                <Text style={styles.detailValue}>{transfer.purpose}</Text>
              </View>
            </View>
          ) : null}
          {transfer.description ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Note</Text>
                <Text style={styles.detailValue}>{transfer.description}</Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Sent on</Text>
              <Text style={styles.detailValue}>
                {new Date(transfer.createdAt).toLocaleDateString()} · {new Date(transfer.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </View>

        {!isPending && (
          <View style={styles.settledBox}>
            <Ionicons name={state.icon} size={20} color={state.color} />
            <Text style={[styles.settledText, { color: state.color }]}>
              This transfer has been {transfer.state.toLowerCase()}.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Actions pinned to bottom */}
      {isPending && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          {!isSender ? (
            <>
              <TouchableOpacity
                style={[styles.declineBtn, acting && { opacity: 0.5 }]}
                onPress={() => confirmAct('decline')}
                disabled={acting}
              >
                <Ionicons name="close" size={18} color="#EF4444" />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, acting && { opacity: 0.5 }]}
                onPress={() => confirmAct('accept')}
                disabled={acting}
              >
                {acting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                      <Text style={styles.acceptBtnText}>Accept & Receive</Text>
                    </>
                }
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.cancelBtn, acting && { opacity: 0.5 }]}
              onPress={() => confirmAct('cancel')}
              disabled={acting}
            >
              {acting
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <>
                    <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                    <Text style={styles.declineBtnText}>Cancel Transfer</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f7f8fa' },
  center:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn:         { padding: 6 },
  headerTitle:     { fontSize: 17, fontWeight: '700', color: '#111' },
  scroll:          { padding: 16, paddingBottom: 32 },

  senderCard:      { backgroundColor: '#fff', borderRadius: 20, alignItems: 'center', padding: 28, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  avatar:          { width: 88, height: 88, borderRadius: 44, marginBottom: 12, borderWidth: 3, borderColor: colors.primary },
  avatarFallback:  { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: colors.primary },
  avatarInitials:  { fontSize: 32, fontWeight: '800', color: colors.primary },
  verifiedRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  verifiedText:    { fontSize: 12, color: colors.primary, fontWeight: '600' },
  senderName:      { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 2 },
  senderPhone:     { fontSize: 14, color: '#888', marginBottom: 14 },
  statePill:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  stateText:       { fontSize: 13, fontWeight: '700' },

  amountCard:      { backgroundColor: '#fff', borderRadius: 20, padding: 24, marginBottom: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  amountLabel:     { fontSize: 13, color: '#888', marginBottom: 4 },
  amountValue:     { fontSize: 42, fontWeight: '900', color: '#111' },
  amountDivider:   { height: 1, backgroundColor: '#f0f0f0', width: '100%', marginVertical: 14 },
  amountRow:       { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  amountRowLabel:  { fontSize: 14, color: '#888' },
  amountRowValue:  { fontSize: 15 },

  detailsCard:     { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  detailRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  detailIcon:      { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  detailLabel:     { fontSize: 12, color: '#aaa', marginBottom: 2 },
  detailValue:     { fontSize: 15, fontWeight: '600', color: '#111' },

  settledBox:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  settledText:     { fontSize: 15, fontWeight: '600' },

  actions:         { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  declineBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 14, paddingVertical: 16 },
  declineBtnText:  { fontSize: 15, fontWeight: '700', color: '#EF4444' },
  acceptBtn:       { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16 },
  acceptBtnText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 14, paddingVertical: 16, width: '100%' },
});
