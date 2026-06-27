import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, StyleSheet,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

function useCountdown(timerEnd) {
  const [timeLeft, setTimeLeft] = useState('');
  const [overdue, setOverdue]   = useState(false);

  useEffect(() => {
    if (!timerEnd) return;
    const tick = () => {
      const diff = new Date(timerEnd) - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setOverdue(true);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
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
  const [photo, setPhoto]     = useState(null);
  const [uploading, setUploading] = useState(false);

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
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });

    if (!result.canceled && result.assets?.[0]) {
      setPhoto(result.assets[0]);
    }
  };

  const showPickerOptions = () => {
    Alert.alert('Upload DURING Photo', 'Take a photo showing goods at the delivery location.', [
      { text: 'Use Camera',   onPress: () => pickPhoto(true)  },
      { text: 'From Gallery', onPress: () => pickPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async () => {
    if (!photo) return;
    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('photo', {
        uri:  photo.uri,
        type: 'image/jpeg',
        name: `during_${orderId}_${Date.now()}.jpg`,
      });
      formData.append('orderId',       orderId);
      formData.append('deliveryGuyPhone', deliveryPhone);

      const res = await authFetch('/delivery/during-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert(
          '📸 Photo Submitted',
          'DURING photo sent. Wait for the buyer to confirm receipt and enter their OTP.',
          [{ text: 'OK', onPress: () => navigation.navigate('HomeTab') }]
        );
      } else {
        Alert.alert('Upload Failed', data.message || 'Could not upload photo. Try again.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Delivery In Progress" navigation={navigation} />
      <View style={styles.content}>

        {/* Countdown Timer */}
        <View style={[styles.timerBox, overdue && styles.timerBoxOverdue]}>
          <Text style={styles.timerLabel}>{overdue ? ' Delivery Overdue' : '⏱ Time Remaining'}</Text>
          <Text style={[styles.timerValue, overdue && styles.timerValueOverdue]}>{timeLeft}</Text>
          {overdue && (
            <Text style={styles.overdueHint}>Contact the buyer to extend delivery time.</Text>
          )}
        </View>

        {/* Order Summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount (held in escrow)</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📸 DURING Photo</Text>
          <Text style={styles.infoText}>
            Take a photo of the goods at the delivery location — with the buyer present if possible.
            This proves you delivered the correct item.
          </Text>
        </View>

        <TouchableOpacity style={styles.photoBox} onPress={showPickerOptions}>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoIcon}>📷</Text>
              <Text style={styles.photoHint}>Tap to take or pick a photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {photo && (
          <TouchableOpacity style={styles.retakeBtn} onPress={showPickerOptions}>
            <Text style={styles.retakeText}>Retake / Change Photo</Text>
          </TouchableOpacity>
        )}

        {uploading && <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />}

        <LipaButton
          title={uploading ? 'Uploading...' : 'Submit DURING Photo'}
          onPress={uploadPhoto}
          disabled={!photo || uploading}
        />

      </View>
    </ScrollView>
  );
}

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
  cardLabel:        { fontSize: 12, color: '#666666', marginTop: 10 },
  cardValue:        { fontSize: 15, fontWeight: '600', color: '#000000', marginTop: 2 },
  amount:           { fontSize: 18, color: colors.primary },
  infoBox:          { backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  infoTitle:        { fontWeight: '700', fontSize: 14, color: '#92400e', marginBottom: 6 },
  infoText:         { fontSize: 13, color: '#92400e', lineHeight: 20 },
  photoBox:         { borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 2, borderColor: '#dddddd', borderStyle: 'dashed', height: 260 },
  photoPreview:     { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9f9f9' },
  photoIcon:        { fontSize: 48, marginBottom: 12 },
  photoHint:        { fontSize: 14, color: '#999999' },
  retakeBtn:        { alignItems: 'center', marginBottom: 16 },
  retakeText:       { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
