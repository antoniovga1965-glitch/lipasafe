import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const REASONS = [
  'Item not delivered',
  'Service not completed',
  'Wrong item/service',
  'Fraud concern',
  'Other',
];

const MAX_PHOTOS = 4;

export default function CustomEscrowDisputeScreen({ route, navigation }) {
  const { escrowId } = route.params;
  const [reason,      setReason]      = useState('');
  const [description, setDescription] = useState('');
  const [photos,      setPhotos]      = useState([]);
  const [loading,     setLoading]     = useState(false);

  const valid = reason && description.trim().length >= 10;

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Max photos', `You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload evidence.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.7,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.slice(0, MAX_PHOTOS - photos.length);
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const takePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Max photos', `You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take evidence photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setPhotos(prev => [...prev, result.assets[0]]);
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const showPhotoOptions = () => {
    Alert.alert('Add Evidence Photo', 'Choose source', [
      { text: 'Camera',       onPress: takePhoto },
      { text: 'Photo Library', onPress: pickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('reason',      reason);
      formData.append('description', description.trim());

      photos.forEach((photo, i) => {
        const ext = photo.uri.split('.').pop() || 'jpg';
        formData.append('evidence', {
          uri:  photo.uri,
          name: `evidence_${i}.${ext}`,
          type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        });
      });

      const res  = await authFetch(`/custom/${escrowId}/dispute`, {
        method:  'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body:    formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to open dispute');

      Alert.alert(
        'Dispute Opened',
        'Funds are frozen. Our team will review the evidence and resolve this within 24–48 hours.',
        [{ text: 'OK', onPress: () => navigation.replace('CustomEscrowDetail', { escrowId }) }],
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Open Dispute</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Warning */}
        <View style={styles.warningBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.warningText}>
            Opening a dispute freezes the funds until our team reviews and resolves the issue.
          </Text>
        </View>

        <View style={styles.form}>

          {/* Reason */}
          <Text style={styles.label}>Reason *</Text>
          {REASONS.map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.reasonBtn, reason === r && styles.reasonActive]}
              onPress={() => setReason(r)}
            >
              <Ionicons
                name={reason === r ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={reason === r ? colors.error : colors.grayDark}
              />
              <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}

          {/* Description */}
          <Text style={styles.label}>Describe what happened *</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Explain clearly what went wrong — what was agreed vs what happened..."
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            maxLength={1000}
          />
          <Text style={styles.hint}>{description.length}/1000 — minimum 10 characters</Text>

          {/* Evidence Photos */}
          <Text style={styles.label}>Evidence Photos <Text style={styles.optional}>(optional, up to {MAX_PHOTOS})</Text></Text>
          <Text style={styles.evidenceHint}>
            Upload photos of what you received. These will be compared against the seller's original deal photos.
          </Text>

          {/* Photo Grid */}
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, i) => (
                <View key={i} style={styles.photoWrapper}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(i)}>
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={showPhotoOptions}>
                  <Ionicons name="add" size={28} color={colors.grayDark} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {photos.length === 0 && (
            <TouchableOpacity style={styles.uploadBox} onPress={showPhotoOptions}>
              <Ionicons name="camera-outline" size={32} color={colors.grayDark} />
              <Text style={styles.uploadBoxText}>Tap to add evidence photos</Text>
              <Text style={styles.uploadBoxSub}>Camera or photo library</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.btn, (!valid || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!valid || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : (
              <>
                <Ionicons name="alert-circle" size={18} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Submit Dispute</Text>
              </>
            )
          }
        </TouchableOpacity>

        <Text style={styles.footer}>
          Both parties will be notified. Admin will review evidence and resolve within 24–48 hours.
        </Text>
        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:          { padding: 8 },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: colors.black },
  warningBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0', marginHorizontal: 16, borderRadius: 10, padding: 12, gap: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.error + '40' },
  warningText:      { flex: 1, fontSize: 13, color: colors.error, fontWeight: '500', lineHeight: 18 },
  form:             { paddingHorizontal: 16, paddingTop: 4 },
  label:            { fontSize: 13, fontWeight: '600', color: colors.black, marginBottom: 8, marginTop: 18 },
  optional:         { fontWeight: '400', color: colors.grayDark },
  reasonBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8, backgroundColor: colors.gray },
  reasonActive:     { borderColor: colors.error, backgroundColor: '#FFF0F0' },
  reasonText:       { fontSize: 14, color: colors.grayDark },
  reasonTextActive: { color: colors.error, fontWeight: '600' },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.black, backgroundColor: colors.gray },
  textarea:         { height: 130 },
  hint:             { fontSize: 11, color: colors.grayDark, marginTop: 6 },
  evidenceHint:     { fontSize: 12, color: colors.grayDark, marginBottom: 12, lineHeight: 17 },

  // Photo grid
  photoGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrapper:     { position: 'relative' },
  photoThumb:       { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.gray },
  removeBtn:        { position: 'absolute', top: -6, right: -6, backgroundColor: colors.white, borderRadius: 10 },
  addPhotoBtn:      { width: 80, height: 80, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray },

  // Upload box (empty state)
  uploadBox:        { borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 28, alignItems: 'center', gap: 6, backgroundColor: colors.gray },
  uploadBoxText:    { fontSize: 14, fontWeight: '600', color: colors.grayDark },
  uploadBoxSub:     { fontSize: 12, color: colors.grayDark },

  btn:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  btnDisabled:      { opacity: 0.5 },
  btnText:          { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer:           { textAlign: 'center', fontSize: 12, color: colors.grayDark, marginTop: 12, paddingHorizontal: 24, lineHeight: 18 },
});