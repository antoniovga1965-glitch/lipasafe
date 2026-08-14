import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, StyleSheet,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity, Platform, StatusBar
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

const MAX_PHOTOS = 5;
const GREEN      = '#1a9e5c';

function useCountdown(timerEnd) {
  const [timeLeft, setTimeLeft] = useState('');
  const [overdue, setOverdue]   = useState(false);
  useEffect(() => {
    if (!timerEnd) return;
    const tick = () => {
      const diff = new Date(timerEnd) - Date.now();
      if (diff <= 0) { setTimeLeft('00:00:00'); setOverdue(true); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerEnd]);
  return { timeLeft, overdue };
}

export default function DeliveryDuringPhotoScreen({ navigation, route }) {
  const { orderId, deliveryPhone, goods, amount, deadline, timerEnd } = route.params || {};
  const { timeLeft, overdue } = useCountdown(timerEnd || deadline);
  const [photos, setPhotos]       = useState([]);
  const [uploading, setUploading] = useState(false);

  // ── pick / capture ────────────────────────────────────────────────────────
  const pickPhoto = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', fromCamera ? 'Camera access needed.' : 'Gallery access needed.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.8, allowsEditing: false,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS,
        });
    if (!result.canceled && result.assets?.length) {
      setPhotos(prev => {
        const combined = [...prev, ...result.assets];
        if (combined.length > MAX_PHOTOS) {
          Alert.alert('Max photos', `Only ${MAX_PHOTOS} photos allowed.`);
          return combined.slice(0, MAX_PHOTOS);
        }
        return combined;
      });
    }
  };

  const showPickerOptions = () => {
    Alert.alert('Add DURING Photo', 'Take a photo at the delivery location.', [
      { text: 'Use Camera',   onPress: () => pickPhoto(true)  },
      { text: 'From Gallery', onPress: () => pickPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removePhoto = (index) => setPhotos(prev => prev.filter((_, i) => i !== index));

  // ── upload ────────────────────────────────────────────────────────────────
  const uploadPhotos = async () => {
    if (!photos.length) return;
    try {
      setUploading(true);
      const formData = new FormData();
      photos.forEach((p, i) => {
        formData.append('photos', {
          uri:  p.uri,
          type: 'image/jpeg',
          name: `during_${orderId}_${i}_${Date.now()}.jpg`,
        });
      });
      formData.append('orderId',          orderId);
      formData.append('deliveryGuyPhone', deliveryPhone);

      const res  = await authFetch('/delivery/during-photo', {
        method:  'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body:    formData,
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert(
          '📸 Photos Submitted',
          'DURING photos sent. The buyer will receive their receipt OTP now.',
          [{ text: 'OK', onPress: () => navigation.navigate('HomeTab') }]
        );
      } else {
        Alert.alert('Upload Failed', data.message || 'Could not upload. Try again.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Delivery In Progress" navigation={navigation} />
      <View style={styles.content}>

        {/* Countdown */}
        <View style={[styles.timerBox, overdue && styles.timerBoxOverdue]}>
          <Text style={styles.timerLabel}>{overdue ? '⚠️ Delivery Overdue' : '⏱ Time Remaining'}</Text>
          <Text style={[styles.timerValue, overdue && styles.timerValueOverdue]}>{timeLeft}</Text>
          {overdue && <Text style={styles.overdueHint}>Contact the buyer to extend delivery time.</Text>}
        </View>

        {/* Order summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount (held in escrow)</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📸 DURING Photos</Text>
          <Text style={styles.infoText}>
            Take up to {MAX_PHOTOS} photos of the goods at the delivery location — with the buyer
            present if possible. These prove you delivered the correct item.
          </Text>
        </View>

        {/* Counter */}
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsLabel}>Add up to {MAX_PHOTOS} photos</Text>
          <Text style={styles.slotsCounter}>{photos.length} / {MAX_PHOTOS}</Text>
        </View>

        {/* 5 fixed slots */}
        <View style={styles.slotsRow}>
          {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
            const p = photos[i];
            return (
              <View key={i} style={styles.slot}>
                {p ? (
                  <>
                    <Image source={{ uri: p.uri }} style={styles.slotImg} />
                    <TouchableOpacity style={styles.slotRemove} onPress={() => removePhoto(i)}>
                      <Text style={styles.slotRemoveX}>✕</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.slotEmpty} onPress={showPickerOptions}>
                    <Text style={styles.slotPlus}>＋</Text>
                    <Text style={styles.slotLabel}>{"Add\nPhoto"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Empty state */}
        {photos.length === 0 && (
          <TouchableOpacity style={styles.emptyBox} onPress={showPickerOptions}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={styles.emptyHint}>Tap to take or pick photos</Text>
          </TouchableOpacity>
        )}

        {uploading && <ActivityIndicator style={{ marginVertical: 12 }} color={GREEN} />}

        <LipaButton
          title={uploading ? 'Uploading...' : `Submit ${photos.length || ''} DURING Photo${photos.length !== 1 ? 's' : ''}`}
          onPress={uploadPhotos}
          disabled={!photos.length || uploading}
        />

      </View>
    </ScrollView>
  );
}

const THUMB = 56;

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#ffffff' },
  content:          { padding: 20 },

  timerBox:         { backgroundColor: '#e8f5e9', borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center', borderWidth: 2, borderColor: '#4caf50' },
  timerBoxOverdue:  { backgroundColor: '#fff3e0', borderColor: '#f59e0b' },
  timerLabel:       { fontSize: 13, color: '#1b5e20', fontWeight: '600', marginBottom: 8 },
  timerValue:       { fontSize: 42, fontWeight: '800', color: '#1b5e20', letterSpacing: 4 },
  timerValueOverdue:{ color: '#e65100' },
  overdueHint:      { fontSize: 12, color: '#e65100', marginTop: 8, textAlign: 'center' },

  card:             { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 20 },
  cardLabel:        { fontSize: 12, color: '#666', marginTop: 10 },
  cardValue:        { fontSize: 15, fontWeight: '600', color: '#000', marginTop: 2 },
  amount:           { fontSize: 18, color: GREEN },

  infoBox:          { backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  infoTitle:        { fontWeight: '700', fontSize: 14, color: '#92400e', marginBottom: 6 },
  infoText:         { fontSize: 13, color: '#92400e', lineHeight: 20 },

  slotsHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  slotsLabel:       { fontSize: 14, fontWeight: '700', color: '#111' },
  slotsCounter:     { fontSize: 13, fontWeight: '700', color: GREEN },

  slotsRow:         { flexDirection: 'row', gap: 8, marginBottom: 16 },
  slot:             { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  slotEmpty:        { flex: 1, borderWidth: 1.5, borderColor: '#ccc', borderStyle: 'dashed', borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafafa' },
  slotPlus:         { fontSize: 22, color: GREEN, fontWeight: '300' },
  slotLabel:        { fontSize: 9, color: '#aaa', textAlign: 'center', marginTop: 2 },
  slotImg:          { width: '100%', height: '100%', resizeMode: 'cover' },
  slotRemove:       { position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 9, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  slotRemoveX:      { color: '#fff', fontSize: 9, fontWeight: '700' },

  emptyBox:         { borderRadius: 16, borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed', height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9f9f9', marginBottom: 16 },
  emptyIcon:        { fontSize: 48, marginBottom: 12 },
  emptyHint:        { fontSize: 14, color: '#999' },
});
