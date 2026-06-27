import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { authFetch } from '../utils/api';

const PURPOSE_LABELS = {
  RENT: 'Rent', SALARY: 'Salary', SCHOOL_FEES: 'School Fees',
  PURCHASE: 'Purchase', LOAN: 'Loan Repayment', GIFT: 'Gift', OTHER: 'Other',
};

export default function RequestDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { requestId } = route.params || {};
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await authFetch(`/request-money/${requestId}`);
        const data = await res.json();
        if (data.success) setRequest(data.request);
        else setError(data.message || 'Failed to load request');
      } catch { setError('Network error'); }
      finally  { setLoading(false); }
    };
    if (requestId) load();
  }, [requestId]);

  const handlePay = () => {
    Alert.alert(
      'Confirm Payment',
      `Pay KES ${request.recipientPays} to ${request.requester?.fullName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: async () => {
          setActing(true);
          try {
            const res  = await authFetch(`/request-money/${requestId}/pay`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              Alert.alert('✅ STK Push Sent', 'Check your M-Pesa prompt to complete payment.');
              navigation.navigate('HomeTab', { screen: 'HomeMain' });
            } else setError(data.message || 'Payment failed');
          } catch { setError('Network error'); }
          finally { setActing(false); }
        }},
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Request',
      `Reject ${request.requester?.fullName}'s payment request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: async () => {
          setActing(true);
          try {
            const res  = await authFetch(`/request-money/${requestId}/reject`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              Alert.alert('Request Rejected', 'The requester has been notified.');
              navigation.navigate('HomeTab', { screen: 'HomeMain' });
            } else setError(data.message || 'Reject failed');
          } catch { setError('Network error'); }
          finally { setActing(false); }
        }},
      ]
    );
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  if (error && !request) return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={48} color="#f44" />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );

  const requester = request?.requester || {};
  const initials  = (requester.fullName || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const purposeLabel = PURPOSE_LABELS[request?.purpose] || request?.purpose;
  const expires = new Date(request?.expiresAt);
  const timeLeft = Math.max(0, Math.floor((expires - Date.now()) / 1000 / 60 / 60));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Request</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          {requester.avatarUrl
            ? <Image source={{ uri: requester.avatarUrl }} style={styles.avatar} />
            : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )
          }
          <View style={styles.profileVerifiedRow}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
            <Text style={styles.profileVerified}>Verified LipaSafe User</Text>
          </View>
          <Text style={styles.profileName}>{requester.fullName || 'Unknown'}</Text>
          <Text style={styles.profilePhone}>{requester.phone}</Text>
        </View>

        {/* Amount Card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountCardLabel}>Requesting from you</Text>
          <Text style={styles.amountCardValue}>KES {Number(request.amount).toLocaleString()}</Text>
          <View style={styles.amountDivider} />
          <View style={styles.amountRow}>
            <Text style={styles.amountRowLabel}>Platform fee</Text>
            <Text style={styles.amountRowValue}>KES {(Number(request.recipientPays) - Number(request.amount)).toLocaleString()}</Text>
          </View>
          <View style={[styles.amountRow, { marginTop: 4 }]}>
            <Text style={[styles.amountRowLabel, { fontWeight: '700', color: '#111' }]}>You pay total</Text>
            <Text style={[styles.amountRowValue, { fontWeight: '800', color: colors.primary, fontSize: 17 }]}>KES {Number(request.recipientPays).toLocaleString()}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="pricetag-outline" size={17} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Purpose</Text>
              <Text style={styles.detailValue}>{purposeLabel}</Text>
            </View>
          </View>
          {request.note ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="document-text-outline" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Note</Text>
                <Text style={styles.detailValue}>{request.note}</Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <View style={styles.detailIcon}>
              <Ionicons name="time-outline" size={17} color={timeLeft < 2 ? '#f44' : colors.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Expires in</Text>
              <Text style={[styles.detailValue, timeLeft < 2 && { color: '#f44' }]}>
                {timeLeft}h · {expires.toLocaleDateString()} {expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </View>

        {!!error && (
          <View style={styles.errorRow}>
            <Ionicons name="warning-outline" size={14} color="#f44" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* State badge if not pending */}
        {request.state !== 'PENDING' && (
          <View style={styles.stateBadge}>
            <Text style={styles.stateText}>This request is {request.state.toLowerCase()}</Text>
          </View>
        )}
      </ScrollView>

      {/* Actions pinned to bottom */}
      {request.state === 'PENDING' && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.rejectBtn, acting && { opacity: 0.5 }]}
            onPress={handleReject} disabled={acting}
          >
            <Ionicons name="close" size={18} color="#e53" />
            <Text style={styles.rejectBtnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payBtn, acting && { opacity: 0.5 }]}
            onPress={handlePay} disabled={acting}
          >
            {acting
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                  <Text style={styles.payBtnText}>Pay via M-Pesa</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f7f8fa' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn:          { padding: 6 },
  headerTitle:      { fontSize: 17, fontWeight: '700', color: '#111' },
  scroll:           { padding: 16, paddingBottom: 32 },

  profileCard:      { backgroundColor: '#fff', borderRadius: 20, alignItems: 'center', padding: 28, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  avatar:           { width: 88, height: 88, borderRadius: 44, marginBottom: 12, borderWidth: 3, borderColor: colors.primary },
  avatarFallback:   { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: colors.primary },
  avatarInitials:   { fontSize: 32, fontWeight: '800', color: colors.primary },
  profileVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  profileVerified:  { fontSize: 12, color: colors.primary, fontWeight: '600' },
  profileName:      { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 2 },
  profilePhone:     { fontSize: 14, color: '#888' },

  amountCard:       { backgroundColor: '#fff', borderRadius: 20, padding: 22, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  amountCardLabel:  { fontSize: 13, color: '#888', marginBottom: 4, textAlign: 'center' },
  amountCardValue:  { fontSize: 42, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 16 },
  amountDivider:    { height: 1, backgroundColor: '#f0f0f0', marginBottom: 12 },
  amountRow:        { flexDirection: 'row', justifyContent: 'space-between' },
  amountRowLabel:   { fontSize: 14, color: '#888' },
  amountRowValue:   { fontSize: 14, fontWeight: '600', color: '#111' },

  detailsCard:      { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  detailRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  detailIcon:       { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  detailLabel:      { fontSize: 12, color: '#aaa', marginBottom: 2 },
  detailValue:      { fontSize: 15, fontWeight: '600', color: '#111' },

  stateBadge:       { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, alignItems: 'center' },
  stateText:        { fontSize: 15, color: '#666', fontWeight: '600', textTransform: 'capitalize' },
  errorRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  errorText:        { color: '#f44', fontSize: 13, marginTop: 4 },

  actions:          { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  rejectBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#e53', borderRadius: 14, paddingVertical: 16 },
  rejectBtnText:    { fontSize: 15, fontWeight: '700', color: '#e53' },
  payBtn:           { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16 },
  payBtnText:       { fontSize: 15, fontWeight: '700', color: '#fff' },
});
