import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

export default function DeliveryBeforePhotoScreen({ navigation, route }) {
  const { orderId, deliveryPhone } = route.params || {};
  const [photo, setPhoto]         = useState(null);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', fromCamera
        ? 'Camera access is needed to take a photo.'
        : 'Gallery access is needed to pick a photo.');
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
    Alert.alert('Upload BEFORE Photo', 'Take a clear photo showing the current state of the goods.', [
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
        name: `before_${orderId}_${Date.now()}.jpg`,
      });
      formData.append('orderId',       orderId);
      formData.append('deliveryGuyPhone', deliveryPhone);

      const res = await authFetch('/delivery/before-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert(
          'Photo Sent',
          'Your BEFORE photo has been sent to the buyer for confirmation. Wait for their approval.',
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
      <LipaHeader title="Upload BEFORE Photo" navigation={navigation} />
      <View style={styles.content}>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📸 Why this photo?</Text>
          <Text style={styles.infoText}>
            This photo proves the condition of the goods BEFORE delivery.
            It protects you if a dispute is raised later.
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
          title={uploading ? 'Sending to Buyer...' : 'Submit BEFORE Photo'}
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
  infoBox:          { backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  infoTitle:        { fontWeight: '700', fontSize: 14, color: '#92400e', marginBottom: 6 },
  infoText:         { fontSize: 13, color: '#92400e', lineHeight: 20 },
  photoBox:         { borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 2, borderColor: '#dddddd', borderStyle: 'dashed', height: 280 },
  photoPreview:     { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9f9f9' },
  photoIcon:        { fontSize: 48, marginBottom: 12 },
  photoHint:        { fontSize: 14, color: '#999999' },
  retakeBtn:        { alignItems: 'center', marginBottom: 16 },
  retakeText:       { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
