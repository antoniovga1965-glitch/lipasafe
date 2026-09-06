import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Image,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { authFetch } from '../utils/api';
import { File } from 'expo-file-system';

const REASONS = [
  { key: 'house_not_exist',     label: 'House does not exist',          icon: 'home-outline' },
  { key: 'not_as_described',    label: 'Not as described',              icon: 'document-text-outline' },
  { key: 'seller_no_show',      label: 'Seller never showed up',        icon: 'person-remove-outline' },
  { key: 'wrong_property',      label: 'Wrong property shown',          icon: 'location-outline' },
  { key: 'fraud_suspected',     label: 'I suspect fraud / scam',        icon: 'warning-outline' },
  { key: 'other',               label: 'Other reason',                  icon: 'ellipsis-horizontal-circle-outline' },
];

const MAX_PHOTOS = 3;

export default function HouseEscrowDisputeScreen({ navigation, route }) {
  const { escrowId, amount, sellerPhone } = route.params;

  const [reason,      setReason]      = useState('');
  const [description, setDescription] = useState('');
  const [photos,      setPhotos]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  const valid = reason.length > 0 && description.trim().length >= 10;

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `Max ${MAX_PHOTOS} photos allowed.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow photo access in settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.length) {
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!valid || loading) return;

    Alert.alert(
      'Open Dispute',
      'Money will be frozen until admin resolves this. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Dispute', style: 'destructive', onPress: doSubmit },
      ]
    );
  };

  const doSubmit = async () => {
    setLoading(true);
    try {
      // Upload photos first if any
      let photoUrls = [];
      if (photos.length > 0) {
        const toBase64 = (bytes) => {
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        };
        const base64Photos = await Promise.all(
          photos.map(async (uri) => {
            const file = new File(uri);
            const bytes = await file.bytes();
            return `data:image/jpeg;base64,${toBase64(bytes)}`;
          })
        );
        const uploadRes  = await authFetch('/upload/dispute-photos', {
          method: 'POST',
          body: JSON.stringify({ photos: base64Photos, context: 'house_dispute' }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) throw new Error('Photo upload failed');
        photoUrls = uploadData.urls;
      }

      // Submit dispute
      const res  = await authFetch(`/house/dispute/${escrowId}`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          description: description.trim(),
          buyerPhotos: photoUrls,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to open dispute');

      setSubmitted(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ───────────────────────────────────────────────
  if (submitted) {
    return (
      <View style={styles.terminal}>
        <Ionicons name="alert-circle" size={72} color={colors.warning} />
        <Text style={styles.terminalTitle}>Dispute Opened</Text>
        <Text style={styles.terminalSub}>
          KES {Number(amount).toLocaleString()} is frozen.{'\n'}
          Admin will review and may call both parties.{'\n\n'}
          You'll be notified of the decision.
        </Text>
        <View style={styles.terminalCard}>
          <View style={styles.terminalRow}>
            <Text style={styles.terminalRowLabel}>Seller</Text>
            <Text style={styles.terminalRowValue}>{sellerPhone}</Text>
          </View>
          <View style={styles.terminalRow}>
            <Text style={styles.terminalRowLabel}>Reason</Text>
            <Text style={styles.terminalRowValue}>
              {REASONS.find(r => r.key === reason)?.label}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Form ────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Open Dispute</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Warning banner */}
      <View style={styles.banner}>
        <Ionicons name="lock-closed" size={16} color={colors.warning} />
        <Text style={styles.bannerText}>
          Money stays frozen until an admin resolves this dispute.
        </Text>
      </View>

      {/* Reason picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What went wrong? *</Text>
        {REASONS.map(r => (
          <TouchableOpacity
            key={r.key}
            style={[styles.reasonBtn, reason === r.key && styles.reasonBtnActive]}
            onPress={() => setReason(r.key)}
          >
            <Ionicons
              name={r.icon}
              size={20}
              color={reason === r.key ? colors.primary : colors.grayDark}
            />
            <Text style={[styles.reasonText, reason === r.key && styles.reasonTextActive]}>
              {r.label}
            </Text>
            {reason === r.key && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Describe what happened * <Text style={styles.sectionHint}>(min 10 chars)</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Be specific — what did you see, what was promised, what went wrong..."
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
        />
        <Text style={[styles.charCount, description.trim().length < 10 && { color: colors.error }]}>
          {description.trim().length} / 10 min
        </Text>
      </View>

      {/* Photo evidence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Evidence Photos <Text style={styles.sectionHint}>(optional, max {MAX_PHOTOS})</Text>
        </Text>
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}>
                <Ionicons name="close-circle" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addPhoto} onPress={pickPhoto}>
              <Ionicons name="camera-outline" size={28} color={colors.grayDark} />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.photoHint}>
          Screenshots, photos of the property, or any evidence that supports your claim.
        </Text>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!valid || loading) && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!valid || loading}
      >
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <>
              <Ionicons name="alert-circle-outline" size={18} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={styles.submitText}>Submit Dispute</Text>
            </>
        }
      </TouchableOpacity>

      <Text style={styles.footer}>
        Only dispute if you genuinely have an issue. False disputes affect your reputation score.
      </Text>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:          { padding: 8 },
  title:            { fontSize: 18, fontWeight: '700', color: colors.black },
  banner:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', marginHorizontal: 16, borderRadius: 10, padding: 12, gap: 8, marginBottom: 8 },
  bannerText:       { flex: 1, fontSize: 13, color: colors.warning, fontWeight: '500' },
  section:          { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle:     { fontSize: 14, fontWeight: '700', color: colors.black, marginBottom: 10, marginTop: 16 },
  sectionHint:      { fontWeight: '400', color: colors.grayDark },
  reasonBtn:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.gray, marginBottom: 8 },
  reasonBtnActive:  { borderColor: colors.primary, backgroundColor: '#E8F5EE' },
  reasonText:       { flex: 1, fontSize: 14, color: colors.grayDark },
  reasonTextActive: { color: colors.primary, fontWeight: '600' },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.black, backgroundColor: colors.gray },
  textarea:         { height: 120 },
  charCount:        { fontSize: 11, color: colors.grayDark, textAlign: 'right', marginTop: 4 },
  photoRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap:        { position: 'relative' },
  photo:            { width: 90, height: 90, borderRadius: 10 },
  removePhoto:      { position: 'absolute', top: -6, right: -6 },
  addPhoto:         { width: 90, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray },
  addPhotoText:     { fontSize: 12, color: colors.grayDark, marginTop: 2 },
  photoHint:        { fontSize: 11, color: colors.grayDark, marginTop: 8, lineHeight: 16 },
  submitBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  submitDisabled:   { backgroundColor: colors.grayDark },
  submitText:       { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer:           { textAlign: 'center', fontSize: 12, color: colors.grayDark, marginTop: 12, paddingHorizontal: 28, lineHeight: 18 },
  terminal:         { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: 36, paddingTop: 80 },
  terminalTitle:    { fontSize: 24, fontWeight: '800', color: colors.black, marginTop: 20, marginBottom: 10 },
  terminalSub:      { fontSize: 14, color: colors.grayDark, textAlign: 'center', lineHeight: 22 },
  terminalCard:     { width: '100%', backgroundColor: colors.gray, borderRadius: 12, padding: 16, marginTop: 24 },
  terminalRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  terminalRowLabel: { fontSize: 13, color: colors.grayDark },
  terminalRowValue: { fontSize: 13, color: colors.black, fontWeight: '600', flex: 1, textAlign: 'right' },
  doneBtn:          { marginTop: 32, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText:      { color: colors.white, fontSize: 16, fontWeight: '700' },
});
