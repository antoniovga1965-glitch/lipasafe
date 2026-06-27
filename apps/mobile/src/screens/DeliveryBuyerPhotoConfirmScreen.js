import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, Modal,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity, Linking
} from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

export default function DeliveryBuyerPhotoConfirmScreen({ navigation, route }) {
  const { orderId, photoUrl, goods, amount, deliveryPhone } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [photoViewVisible, setPhotoViewVisible] = useState(false);

  const handlePhotoTap = () => {
    Alert.alert(
      'BEFORE Photo',
      'What would you like to do?',
      [
        { text: '👁  View Full Screen', onPress: () => setPhotoViewVisible(true) },
        { text: '⬇  Download',          onPress: () => Linking.openURL(photoUrl) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const respond = async (confirmed) => {
    try {
      setLoading(true);
      const res = await authFetch('/delivery/confirm-before-photo', {
        method: 'POST',
        body: JSON.stringify({ orderId, confirmed }),
      });
      const data = await res.json();

      if (data.success) {
        if (confirmed) {
          Alert.alert(
            ' Photo Confirmed',
            'OTP has been sent to the delivery guy. Delivery will begin once they enter it.',
            [{ text: 'OK', onPress: () => navigation.navigate('HomeTab') }]
          );
        } else {
          Alert.alert(
            ' Photo Rejected',
            'The delivery guy has been notified to upload a new photo.',
            [{ text: 'OK', onPress: () => navigation.navigate('HomeTab') }]
          );
        }
      } else {
        Alert.alert('Error', data.message || 'Something went wrong.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmReject = () => {
    Alert.alert(
      'Reject Photo?',
      'The delivery guy will have to upload a new photo before proceeding.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => respond(false) },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Confirm BEFORE Photo" navigation={navigation} />
      <View style={styles.content}>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>👀 Check carefully</Text>
          <Text style={styles.infoText}>
            This is the current condition of your goods. Confirm only if this
            matches what you ordered. This photo will be used as evidence if a dispute arises.
          </Text>
        </View>

        {/* Order Summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount in Escrow</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
          <Text style={styles.cardLabel}>Delivery Guy</Text>
          <Text style={styles.cardValue}>{deliveryPhone}</Text>
        </View>

        {/* Photo */}
        <Text style={styles.photoLabel}>BEFORE Photo</Text>
        {photoUrl ? (
          <TouchableOpacity onPress={handlePhotoTap} activeOpacity={0.85}>
            <Image source={{ uri: photoUrl }} style={styles.photo} />
          </TouchableOpacity>
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>🖼️</Text>
            <Text style={styles.photoHint}>Photo not available</Text>
          </View>
        )}

        {/* ── Full-Screen Photo Modal ── */}
        <Modal
          visible={photoViewVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoViewVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPhotoViewVisible(false)}>
              <Text style={styles.modalCloseText}>✕  Close</Text>
            </TouchableOpacity>
            <Image source={{ uri: photoUrl }} style={styles.modalImage} resizeMode="contain" />
            <TouchableOpacity style={styles.modalDownloadBtn} onPress={() => Linking.openURL(photoUrl)}>
              <Text style={styles.modalDownloadText}>⬇  Download</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {loading && <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />}

        {/* Actions */}
        <LipaButton
          title={loading ? 'Processing...' : 'Yes, This Is Correct'}
          onPress={() => respond(true)}
          disabled={loading}
        />

        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={confirmReject}
          disabled={loading}
        >
          <Text style={styles.rejectText}> No, Reject This Photo</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#ffffff' },
  content:          { padding: 20 },
  infoBox:          { backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  infoTitle:        { fontWeight: '700', fontSize: 14, color: '#92400e', marginBottom: 6 },
  infoText:         { fontSize: 13, color: '#92400e', lineHeight: 20 },
  card:             { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 20 },
  cardLabel:        { fontSize: 12, color: '#666666', marginTop: 10 },
  cardValue:        { fontSize: 15, fontWeight: '600', color: '#000000', marginTop: 2 },
  amount:           { fontSize: 18, color: colors.primary },
  photoLabel:       { fontSize: 14, fontWeight: '600', color: '#000000', marginBottom: 8 },
  photo:            { width: '100%', height: 300, borderRadius: 16, resizeMode: 'cover', marginBottom: 20 },
  photoPlaceholder: { width: '100%', height: 300, borderRadius: 16, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  photoIcon:        { fontSize: 48, marginBottom: 8 },
  photoHint:        { fontSize: 14, color: '#999999' },
  rejectBtn:        { marginTop: 12, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e53e3e' },
  rejectText:       { color: '#e53e3e', fontWeight: '600', fontSize: 15 },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  modalClose:       { position: 'absolute', top: 52, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, zIndex: 10 },
  modalCloseText:   { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  modalImage:       { width: '100%', height: '72%' },
  modalDownloadBtn: { marginTop: 24, backgroundColor: '#22c55e', paddingHorizontal: 32, paddingVertical: 13, borderRadius: 26 },
  modalDownloadText:{ color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
