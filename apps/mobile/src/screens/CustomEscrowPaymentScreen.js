import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

export default function CustomEscrowPaymentScreen({ route, navigation }) {
  const { escrowId } = route.params;
  const [escrow,   setEscrow]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [paying,   setPaying]   = useState(false);
  const [polling,  setPolling]  = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchEscrow();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchEscrow = async () => {
    try {
      const res  = await authFetch(`/custom/${escrowId}`);
      const data = await res.json();
      if (data.success) setEscrow(data.escrow);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await authFetch(`/custom/${escrowId}`);
        const data = await res.json();
        if (data.success && data.escrow.status === 'PAYMENT_HELD') {
          clearInterval(pollRef.current);
          setPolling(false);
          navigation.replace('CustomEscrowDetail', { escrowId, role: 'buyer' });
        }
      } catch {}
    }, 4000);
    setTimeout(() => {
      if (pollRef.current) { clearInterval(pollRef.current); setPolling(false); }
    }, 120000);
  };

  const handlePay = async () => {
    if (paying) return;
    setPaying(true);
    try {
      const res  = await authFetch('/custom/' + escrowId + '/pay', {
        method: 'POST',
        body: JSON.stringify({ escrowId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Payment initiation failed');
      Alert.alert('M-Pesa Prompt Sent', 'Check your phone and enter your M-Pesa PIN to complete payment.');
      startPolling();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!escrow)  return <View style={styles.center}><Text>Deal not found</Text></View>;

  const amount      = Number(escrow.amount);
  const fee         = Number(escrow.platformFee);
  const total       = amount + fee;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fund Escrow</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Ionicons name="shield-checkmark" size={32} color={colors.primary} style={{ alignSelf: 'center', marginBottom: 12 }} />
        <Text style={styles.dealTitle}>{escrow.title}</Text>
        <Text style={styles.dealDesc}>{escrow.description}</Text>
        {escrow.isRisky && (
          <View style={styles.riskBadge}>
            <Ionicons name="warning" size={14} color="#FF9500" />
            <Text style={styles.riskText}>Flagged as high-risk</Text>
          </View>
        )}
      </View>

      {escrow.photos?.length > 0 && (
        <View style={styles.confirmPhotos}>
          <Text style={styles.confirmPhotosLabel}>📸 You're paying for:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {escrow.photos.map((photo, idx) => (
              <Image key={idx} source={{ uri: photo.url || photo }} style={styles.confirmPhoto} resizeMode="cover" />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.breakdown}>
        <Text style={styles.breakdownTitle}>Payment Summary</Text>
        <View style={styles.bRow}>
          <Text style={styles.bLabel}>Deal amount</Text>
          <Text style={styles.bValue}>KES {amount.toLocaleString()}</Text>
        </View>
        <View style={styles.bRow}>
          <Text style={styles.bLabel}>LipaSafe fee (2%)</Text>
          <Text style={styles.bValue}>KES {fee.toLocaleString()}</Text>
        </View>
        <View style={[styles.bRow, styles.bTotal]}>
          <Text style={styles.bTotalLabel}>Total you pay</Text>
          <Text style={styles.bTotalValue}>KES {total.toLocaleString()}</Text>
        </View>
        <View style={[styles.bRow, { marginTop: 8 }]}>
          <Text style={styles.bLabel}>To: {escrow.counterpartyPhone}</Text>
          <Text style={styles.bLabel}>On completion: KES {Number(escrow.counterpartyReceives).toLocaleString()}</Text>
        </View>
      </View>

      {polling && (
        <View style={styles.pollingBanner}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.pollingText}>Waiting for payment confirmation...</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.btn, (paying || polling) && styles.btnDisabled]}
        onPress={handlePay}
        disabled={paying || polling}
      >
        {paying
          ? <ActivityIndicator color={colors.white} />
          : <><Ionicons name="phone-portrait" size={18} color={colors.white} style={{ marginRight: 8 }} /><Text style={styles.btnText}>Pay KES {total.toLocaleString()} via M-Pesa</Text></>
        }
      </TouchableOpacity>

      <Text style={styles.footer}>
        Funds go into escrow — not released until you confirm the deal is complete.
      </Text>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.white },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:        { padding: 8 },
  headerTitle:    { fontSize: 18, fontWeight: '700', color: colors.black },
  card:           { margin: 16, backgroundColor: '#E8F5EE', borderRadius: 14, padding: 20 },
  dealTitle:      { fontSize: 18, fontWeight: '700', color: colors.black, textAlign: 'center', marginBottom: 8 },
  dealDesc:       { fontSize: 14, color: colors.grayDark, textAlign: 'center', lineHeight: 20 },
  riskBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3DC', borderRadius: 8, padding: 8, marginTop: 12, alignSelf: 'center' },
  riskText:       { fontSize: 12, color: '#FF9500', fontWeight: '600' },
  breakdown:      { marginHorizontal: 16, backgroundColor: colors.gray, borderRadius: 12, padding: 14 },
  breakdownTitle: { fontSize: 14, fontWeight: '700', color: colors.black, marginBottom: 12 },
  bRow:           { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bLabel:         { fontSize: 13, color: colors.grayDark },
  bValue:         { fontSize: 13, color: colors.black, fontWeight: '500' },
  bTotal:         { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2, marginBottom: 0 },
  bTotalLabel:    { fontSize: 14, color: colors.black, fontWeight: '700' },
  bTotalValue:    { fontSize: 14, color: colors.primary, fontWeight: '700' },
  pollingBanner:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, backgroundColor: '#E8F5EE', borderRadius: 10, padding: 12 },
  pollingText:    { fontSize: 13, color: colors.primary, fontWeight: '500' },
  btn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  btnDisabled:    { backgroundColor: colors.grayDark },
  btnText:        { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer:         { textAlign: 'center', fontSize: 12, color: colors.grayDark, marginTop: 12, paddingHorizontal: 24, lineHeight: 18 },
  confirmPhotos:  { marginHorizontal: 16, marginBottom: 14 },
  confirmPhotosLabel: { fontSize: 13, fontWeight: '700', color: colors.black, marginBottom: 8 },
  confirmPhoto:   { width: 100, height: 100, borderRadius: 12, backgroundColor: colors.gray },
});
