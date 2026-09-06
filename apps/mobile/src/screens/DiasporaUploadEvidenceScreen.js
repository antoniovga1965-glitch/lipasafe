import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, SHARED_STYLES } from './diasporaTheme';
import { Camera, Clock } from 'lucide-react-native';
import { authFetch } from '../utils/api';
import { BASE_URL } from '../utils/api';

export default function DiasporaUploadEvidenceScreen({ navigation, route }) {
  const { dealId, referenceCode } = route.params || {};
  const [image, setImage]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useFocusEffect(useCallback(() => {
    setImage(null); setUploading(false); setSubmitted(false);
  }, []));

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to upload your receipt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setImage({ uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: 'proof.jpg' });
    }
  };

  const handleSubmit = async () => {
    if (!image) { Alert.alert('No Image', 'Please upload a proof-of-payment image first.'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('proof', { uri: image.uri, type: image.type, name: image.name });

      const res  = await authFetch(`/diaspora/${dealId}/proof`, {
        method:  'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body:    formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setSubmitted(true);
    } catch (err) {
      Alert.alert('Upload Failed', err.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.successIconWrap}>
            <Clock size={36} color={COLORS.primary} />
          </View>
          <Text style={styles.successTitle}>Pending Confirmation</Text>
          <Text style={styles.successBody}>
            Your proof of payment has been uploaded. We will verify the funds and update your deal status within 24 hours.
          </Text>
          <Text style={styles.referenceText}>Ref: {referenceCode}</Text>
          <TouchableOpacity style={styles.doneButton} activeOpacity={0.8}
            onPress={() => navigation.navigate('DiasporaDealTracking', { dealId })}>
            <Text style={styles.doneButtonText}>Track My Deal</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headerTitle}>Upload Proof of Payment</Text>
        <Text style={styles.headerSubtitle}>
          Upload a screenshot or photo of your transfer receipt so we can match it to your reference code.
        </Text>

        <TouchableOpacity style={styles.uploadBox} activeOpacity={0.8} onPress={handlePickImage}>
          {image ? (
            <Image source={{ uri: image.uri }} style={styles.previewImage} />
          ) : (
            <>
              <Camera size={40} color={COLORS.textSecondary} style={styles.uploadIcon} />
              <Text style={styles.uploadLabel}>Tap to upload receipt</Text>
              <Text style={styles.uploadHint}>JPG or PNG, max 5MB</Text>
            </>
          )}
        </TouchableOpacity>

        {image && (
          <TouchableOpacity style={styles.changeButton} activeOpacity={0.7} onPress={handlePickImage}>
            <Text style={styles.changeButtonText}>Change Image</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.ctaButton, (!image || uploading) && styles.ctaButtonDisabled]}
          activeOpacity={0.8} disabled={!image || uploading} onPress={handleSubmit}>
          {uploading
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.ctaButtonText}>Submit Proof of Payment</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { ...SHARED_STYLES.container },
  scroll:         { paddingHorizontal: SPACING.screenPadding, paddingTop: 24, paddingBottom: 24 },
  headerTitle:    { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 6, marginBottom: 20, lineHeight: 20 },
  uploadBox:      { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', height: 260, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  uploadIcon:     { marginBottom: 10 },
  uploadLabel:    { fontSize: 15, fontWeight: '500', color: '#334155' },
  uploadHint:     { fontSize: 12, color: '#94A3B8', marginTop: 6 },
  previewImage:   { width: '100%', height: '100%', resizeMode: 'cover' },
  changeButton:   { alignSelf: 'center', marginTop: 14, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#F1F5F9', borderRadius: 8 },
  changeButtonText: { color: COLORS.primary, fontSize: 14, fontWeight: '500' },
  footer:         { ...SHARED_STYLES.footer },
  ctaButton:      { ...SHARED_STYLES.ctaButton },
  ctaButtonDisabled: { ...SHARED_STYLES.ctaButtonDisabled },
  ctaButtonText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle:   { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  successBody:    { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  referenceText:  { fontSize: 13, color: '#94A3B8', marginBottom: 24 },
  doneButton:     { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  doneButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
