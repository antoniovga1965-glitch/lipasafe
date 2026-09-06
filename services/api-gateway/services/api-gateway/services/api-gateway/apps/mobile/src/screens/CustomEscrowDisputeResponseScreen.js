import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const MAX_PHOTOS = 4;

export default function CustomEscrowDisputeResponseScreen({ route, navigation }) {
  const { escrowId, dispute } = route.params;
  const [response, setResponse] = useState('');
  const [photos,   setPhotos]   = useState([]);
  const [loading,  setLoading]  = useState(false);

  const valid = response.trim().length >= 10;

  const showPhotoOptions = () => {
    Alert.alert('Add Counter-Evidence', 'Choose source', [
      { text: 'Camera',        onPress: takePhoto },
      { text: 'Photo Library', onPress: pickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.7,
    });
    if (!result.canceled) setPhotos(prev => [...prev, ...result.assets.slice(0, MAX_PHOTOS - prev.length)]);
  };

  const takePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhotos(prev => [...prev, result.assets[0]]);
  };

  const removePhoto = (i) => setPhotos(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('response', response.trim());
      photos.forEach((photo, i) => {
        const ext = photo.uri.split('.').pop() || 'jpg';
        formData.append('evidence', {
          uri:  photo.uri,
          name: `counter_evidence_${i}.${ext}`,
          type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        });
      });
      const res  = await authFetch(`/custom/${escrowId}/dispute/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body:    formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to submit response');
      Alert.alert('Response Submitted', 'Admin has been notified and will review both sides within 24–48 hours.', [
        { text: 'OK', onPress: () => navigation.replace('CustomEscrowDetail', { escrowId }) },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Respond to Dispute</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Buyer's dispute */}
        <View style={styles.buyerCard}>
          <Text style={styles.sectionLabel}> Buyer's Complaint</Text>
          <Text style={styles.reasonTag}>{dispute.reason}</Text>
          <Text style={styles.buyerDesc}>{dispute.description}</Text>
          {dispute.evidence?.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.evidenceLabel}>Buyer's Evidence Photos:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
                {dispute.evidence.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.buyerPhoto} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Your Response *</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Explain your side — what was delivered, what was agreed, any context..."
            multiline numberOfLines={5} textAlignVertical="top"
            value={response}
            onChangeText={setResponse}
            maxLength={1000}
          />
          <Text style={styles.hint}>{response.length}/1000 — minimum 10 characters</Text>

          <Text style={styles.label}>Counter-Evidence Photos <Text style={styles.optional}>(optional, up to {MAX_PHOTOS})</Text></Text>
          <Text style={styles.evidenceHint}>Upload photos proving delivery or showing what was actually provided.</Text>

          {photos.length > 0 ? (
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
          ) : (
            <TouchableOpacity style={styles.uploadBox} onPress={showPhotoOptions}>
              <Ionicons name="camera-outline" size={32} color={colors.grayDark} />
              <Text style={styles.uploadBoxText}>Tap to add counter-evidence</Text>
              <Text style={styles.uploadBoxSub}>Camera or photo library</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.btn, (!valid || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!valid || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <><Ionicons name="shield-checkmark" size={18} color={colors.white} style={{ marginRight: 8 }} /><Text style={styles.btnText}>Submit Response</Text></>
          }
        </TouchableOpacity>

        <Text style={styles.footer}>Admin will review both sides and resolve within 24–48 hours.</Text>
        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.white },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:        { padding: 8 },
  headerTitle:    { fontSize: 18, fontWeight: '700', color: colors.black },
  buyerCard:      { marginHorizontal: 16, backgroundColor: '#FFF0F0', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.error + '50', marginBottom: 8 },
  sectionLabel:   { fontSize: 13, fontWeight: '700', color: colors.error, marginBottom: 8 },
  reasonTag:      { fontSize: 13, fontWeight: '700', color: colors.black, marginBottom: 4 },
  buyerDesc:      { fontSize: 13, color: colors.grayDark, lineHeight: 18 },
  evidenceLabel:  { fontSize: 12, fontWeight: '600', color: colors.grayDark },
  buyerPhoto:     { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.gray },
  form:           { paddingHorizontal: 16 },
  label:          { fontSize: 13, fontWeight: '600', color: colors.black, marginBottom: 8, marginTop: 18 },
  optional:       { fontWeight: '400', color: colors.grayDark },
  input:          { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.black, backgroundColor: colors.gray },
  textarea:       { height: 130 },
  hint:           { fontSize: 11, color: colors.grayDark, marginTop: 6 },
  evidenceHint:   { fontSize: 12, color: colors.grayDark, marginBottom: 12, lineHeight: 17 },
  photoGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrapper:   { position: 'relative' },
  photoThumb:     { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.gray },
  removeBtn:      { position: 'absolute', top: -6, right: -6, backgroundColor: colors.white, borderRadius: 10 },
  addPhotoBtn:    { width: 80, height: 80, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray },
  uploadBox:      { borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 28, alignItems: 'center', gap: 6, backgroundColor: colors.gray },
  uploadBoxText:  { fontSize: 14, fontWeight: '600', color: colors.grayDark },
  uploadBoxSub:   { fontSize: 12, color: colors.grayDark },
  btn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  btnDisabled:    { opacity: 0.5 },
  btnText:        { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer:         { textAlign: 'center', fontSize: 12, color: colors.grayDark, marginTop: 12, paddingHorizontal: 24, lineHeight: 18 },
});
