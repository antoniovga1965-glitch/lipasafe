import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';
import { authFetch } from '../utils/api';

export default function DeliveryConfirmationScreen({ navigation, route }) {
  const { t } = useLang();
  const { tx } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const markDelivered = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/transactions/bundle/${tx.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Done', 'Delivery marked. OTP sent to buyer.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('Error', data.message || 'Could not mark delivery.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const rejectOrder = async () => {
    Alert.alert(
      'Reject Order',
      'Are you sure? Buyer will be refunded and order cancelled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: async () => {
            try {
              setRejecting(true);
              const res = await authFetch(`/transactions/bundle/${tx.id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert('Rejected', data.message || 'Order rejected. Buyer will be refunded.', [
                  { text: 'OK', onPress: () => navigation.goBack() }
                ]);
              } else {
                Alert.alert('Error', data.message || 'Could not reject order.');
              }
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setRejecting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.markDelivered} navigation={navigation} />
      <View style={styles.content}>

        <View style={styles.card}>
          <Text style={styles.label}>Reference</Text>
          <Text style={styles.value}>#{tx?.id?.slice(-8).toUpperCase() || 'N/A'}</Text>
          <Text style={styles.label}>From Buyer</Text>
          <Text style={styles.value}>{tx?.buyer?.phone || tx?.buyerId || 'N/A'}</Text>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.value}>{tx?.goods || tx?.description || 'Bundle Order'}</Text>
          <Text style={styles.label}>Amount You Receive</Text>
          <Text style={[styles.value, styles.amount]}>
            KES {parseFloat(tx?.sellerReceives || tx?.amount || 0).toFixed(2)}
          </Text>
        </View>

        <Text style={styles.instruction}>
          Once you mark as delivered, the buyer has 1 hour to confirm.
          Funds are automatically released if they don't respond.
        </Text>

        <LipaButton
          title={loading ? 'Marking...' : 'Mark as Dispatched'}
          onPress={markDelivered}
          disabled={loading || rejecting}
        />

        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={rejectOrder}
          disabled={loading || rejecting}
        >
          {rejecting
            ? <ActivityIndicator color={colors.error || '#e53e3e'} />
            : <Text style={styles.rejectText}>Reject Order & Refund Buyer</Text>
          }
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: 20 },
  card: { backgroundColor: colors.gray || '#f5f5f5', borderRadius: 16, padding: 20, marginBottom: 20 },
  label: { fontSize: 12, color: colors.grayDark, marginTop: 12 },
  value: { fontSize: 15, fontWeight: '600', color: colors.black, marginTop: 4 },
  amount: { fontSize: 20, color: colors.primary },
  instruction: { fontSize: 13, color: colors.grayDark, marginBottom: 24, lineHeight: 20, textAlign: 'center' },
  rejectBtn: { marginTop: 12, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.error || '#e53e3e' },
  rejectText: { color: colors.error || '#e53e3e', fontWeight: '600', fontSize: 15 },
});
