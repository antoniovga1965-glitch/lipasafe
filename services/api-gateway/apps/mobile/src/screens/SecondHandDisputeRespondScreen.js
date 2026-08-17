import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons }  from '@expo/vector-icons';
import { colors }    from '../theme/colors';
import LipaHeader    from '../components/LipaHeader';
import LipaInput     from '../components/LipaInput';
import { authFetch } from '../utils/api';

export default function SecondHandDisputeRespondScreen({ navigation, route }) {
  const { orderId, dispute } = route.params || {};

  const [sellerNote, setSellerNote] = useState('');
  const [photos,     setPhotos]     = useState([]);
  const [loading,    setLoading]    = useState(false);

  // ── Photo picker ─────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    if (photos.length >= 4) {
      return Alert.alert('Limit reached', 'You can upload a maximum of 4 photos.');
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Permission required', 'Allow access to photos to upload evidence.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotos(prev => [...prev, ...result.assets].slice(0, 4));
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // ── Respond ───────────────────────────────────────────────────────────────
  const respond = async (accepts) => {
    if (!accepts) {
      if (sellerNote.length < 10) {
        return Alert.alert('Add more detail', 'Explain your side in at least 10 characters before rejecting.');
      }
      if (photos.length === 0) {
        return Alert.alert('Evidence required', 'Upload at least one photo as counter evidence before rejecting.');
      }
    }

    const confirmMsg = accepts
      ? 'You will accept the dispute and the buyer will be refunded. This cannot be undone.'
      : 'You will reject the dispute with your counter evidence. The system will review both sides.';

    Alert.alert(
      accepts ? 'Accept Dispute?' : 'Reject & Submit Evidence?',
      confirmMsg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: accepts ? 'Yes, Refund Buyer' : 'Yes, Submit Counter Evidence',
          style: accepts ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setLoading(true);

              let res, data;

              if (accepts) {
                // Simple JSON — no evidence needed
                res  = await authFetch(`/second-hand/disputes/${dispute.id}/respond`, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ accepts: true, sellerNote }),
                });
                data = await res.json();
              } else {
                // Multipart — counter evidence photos required
                const form = new FormData();
                form.append('accepts',    'false');
                form.append('sellerNote', sellerNote);
                photos.forEach((photo, i) => {
                  form.append('counterEvidence', {
                    uri:  photo.uri,
                    name: `counter_${i}.jpg`,
                    type: 'image/jpeg',
                  });
                });

                res  = await authFetch(`/second-hand/disputes/${dispute.id}/respond`, {
                  method:  'POST',
                  headers: { 'Content-Type': 'multipart/form-data' },
                  body:    form,
                });
                data = await res.json();
              }

              if (data.success) {
                Alert.alert(
                  accepts ? 'Resolved' : 'Evidence Submitted',
                  accepts
                    ? 'You accepted the dispute. The buyer has been refunded.'
                    : 'Your counter evidence has been submitted. The system will review both sides and notify you.',
                  [{ text: 'OK', onPress: () => navigation.navigate('SellerDashboard') }]
                );
              } else {
                Alert.alert('Error', data.message || 'Could not submit response.');
              }
            } catch (e) {
              Alert.alert('Error', e.message || 'Something went wrong.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (!dispute) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Dispute data not found.</Text>
      </View>
    );
  }

  const isEscalated = dispute.status === 'escalated';
  const buyerPhotos = dispute.evidencePhotos || [];

  return (
    <View style={styles.container}>
      <LipaHeader title="Respond to Dispute" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Status banner */}
        <View style={[styles.banner, isEscalated && styles.bannerEscalated]}>
          <Ionicons name={isEscalated ? 'information-circle' : 'warning'} size={20} color="#fff" />
          <Text style={styles.bannerText}>
            {isEscalated
              ? 'This dispute has been escalated for review.'
              : 'Buyer raised a dispute. You have 24 hours to respond before auto-refund.'}
          </Text>
        </View>

        {/* Buyer claim */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Buyer's Claim</Text>
          <Text style={styles.claimReason}>
            {dispute.reason
              ? dispute.reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
              : 'No reason provided'}
          </Text>
          {dispute.description ? (
            <Text style={styles.claimDesc}>{dispute.description}</Text>
          ) : null}
          <Text style={styles.meta}>
            Raised: {dispute.openedAt ? new Date(dispute.openedAt).toLocaleString('en-KE') : 'Unknown'}
          </Text>
        </View>

        {/* Buyer photos */}
        {buyerPhotos.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Buyer's Evidence Photos</Text>
            <View style={styles.photoGrid}>
              {buyerPhotos.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.photoThumb} />
              ))}
            </View>
          </View>
        )}

        {/* Timer warning */}
        {!isEscalated && (
          <View style={styles.timerNotice}>
            <Ionicons name="time-outline" size={16} color="#D97706" />
            <Text style={styles.timerText}>
              If you do not respond within 24 hours, the buyer will be automatically refunded.
            </Text>
          </View>
        )}

        {/* Seller response section */}
        {!isEscalated && (
          <>
            <LipaInput
              label="Your Response"
              value={sellerNote}
              onChangeText={setSellerNote}
              placeholder="Explain your side of the transaction (required if rejecting)..."
              multiline
            />

            {/* Counter evidence photos */}
            <View style={styles.evidenceSection}>
              <Text style={styles.sectionLabel}>Counter Evidence Photos</Text>
              <Text style={styles.evidenceHint}>
                Required if rejecting. Upload photos proving your side. Maximum 4 photos.
              </Text>
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <View key={index} style={styles.photoWrapper}>
                    <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                    <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(index)}>
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < 4 && (
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
                    <Ionicons name="camera-outline" size={28} color="#6B7280" />
                    <Text style={styles.addPhotoText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => respond(false)}
                >
                  <Ionicons name="shield-half-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.btnText}>Reject — Submit Counter Evidence</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => respond(true)}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.btnText}>Accept — Refund Buyer</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {isEscalated && (
          <View style={styles.escalatedNotice}>
            <Ionicons name="information-circle-outline" size={20} color="#1D4ED8" />
            <Text style={styles.escalatedText}>
              The system is reviewing both sides. You will be notified of the outcome.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f5f5f5' },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:        { color: '#EF4444', fontSize: 14 },
  content:          { padding: 20, paddingBottom: 40 },
  banner:           { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#35a089', borderRadius: 12, padding: 14, marginBottom: 16 },
  bannerEscalated:  { backgroundColor: '#6366F1' },
  bannerText:       { color: '#fff', fontWeight: '600', fontSize: 13, flex: 1, lineHeight: 18 },
  card:             { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 14 },
  cardTitle:        { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 10 },
  claimReason:      { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  claimDesc:        { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 6 },
  meta:             { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  timerNotice:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  timerText:        { fontSize: 13, color: '#92400E', flex: 1, lineHeight: 18 },
  evidenceSection:  { marginTop: 16, marginBottom: 8 },
  sectionLabel:     { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 6 },
  evidenceHint:     { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  photoGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrapper:     { position: 'relative' },
  photoThumb:       { width: 82, height: 82, borderRadius: 10, backgroundColor: '#E5E7EB' },
  removeBtn:        { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 12 },
  addPhotoBtn:      { width: 82, height: 82, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  addPhotoText:     { fontSize: 11, color: '#6B7280', marginTop: 4 },
  rejectBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 16, marginTop: 8, marginBottom: 12 },
  acceptBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  btnText:          { color: '#fff', fontSize: 15, fontWeight: '700' },
  escalatedNotice:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16 },
  escalatedText:    { fontSize: 13, color: '#1D4ED8', flex: 1, lineHeight: 20 },
});
