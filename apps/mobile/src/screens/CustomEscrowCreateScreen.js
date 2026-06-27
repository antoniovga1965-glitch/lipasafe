import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch, Image, Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { authFetch } from '../utils/api';

const DEADLINE_OPTIONS = [
  { label: 'No deadline', value: null   },
  { label: '1 day',       value: '24'   },
  { label: '3 days',      value: '72'   },
  { label: '7 days',      value: '168'  },
  { label: '14 days',     value: '336'  },
  { label: '30 days',     value: '720'  },
];
import { PLATFORM_RATE } from '../utils/feeCalculator'
const FEE_RATE = PLATFORM_RATE;

export default function CustomEscrowCreateScreen({ navigation }) {
  const [title,             setTitle]             = useState('');
  const [description,       setDescription]       = useState('');
  const [amount,            setAmount]            = useState('');
  const [counterpartyPhone, setCounterpartyPhone] = useState('');
  const [isRisky,           setIsRisky]           = useState(false);
  const [riskDescription,   setRiskDescription]   = useState('');
  const [deadline,          setDeadline]          = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [photos,             setPhotos]             = useState([]);
  const [previewPhoto,       setPreviewPhoto]       = useState(null);
  const [uploadMsg,          setUploadMsg]          = useState('');

  const parsed      = parseFloat(amount) || 0;
  const platformFee = parsed >= 1 ? Math.ceil(parsed * FEE_RATE) : 0;
  const total       = parsed + platformFee;

  const valid =
    title.trim().length >= 3 &&
    description.trim().length >= 50 &&
    counterpartyPhone.trim().length >= 9 &&
    parsed >= 1 &&
    photos.length >= 2 &&
    (!isRisky || riskDescription.trim().length >= 10);

  const pickPhoto = async () => {
    if (photos.length >= 5) { Alert.alert('Max Photos', 'Maximum 5 photos allowed.'); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to upload evidence.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets.length > 0) setPhotos(prev => [...prev, result.assets[0]]);
  };

  const removePhoto = (index) => setPhotos(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setUploadMsg(`Uploading ${photos.length} photo${photos.length > 1 ? 's' : ''}...`);
    try {
      const formData = new FormData();
      formData.append('title',             title.trim());
      formData.append('description',       description.trim());
      formData.append('amount',            String(parsed));
      formData.append('counterpartyPhone', counterpartyPhone.trim());
      formData.append('isRisky',           String(isRisky));
      if (deadline) formData.append('completionHours', deadline);
      if (isRisky && riskDescription.trim()) formData.append('riskDescription', riskDescription.trim());
      photos.forEach((photo, idx) => {
        const ext = photo.uri.split('.').pop() || 'jpg';
        formData.append('photos', { uri: photo.uri, name: `deal_photo_${idx}.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
      });
      setUploadMsg('Creating deal...');
      const res  = await authFetch('/custom', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to create deal');

      navigation.replace('CustomEscrowDetail', { escrowId: data.escrowId, role: 'buyer' });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setUploadMsg('');
    }
  };

  return (
    <>
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.overlayBg}>
          <View style={styles.overlayBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.overlayTitle}>{uploadMsg || 'Processing...'}</Text>
            <Text style={styles.overlayHint}>Please wait, do not close the app</Text>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Custom Escrow</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.banner}>
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
          <Text style={styles.bannerText}>
            Define any deal. Money held safely until both parties confirm completion.
          </Text>
        </View>

        <View style={styles.form}>

          <Text style={styles.label}>Deal Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Website design, Car purchase, Freelance work..."
            placeholderTextColor={colors.grayDark}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          <Text style={styles.label}>Deal Description *</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Describe exactly what is being bought, sold, or the service being provided..."
            placeholderTextColor={colors.grayDark}
            multiline numberOfLines={4} textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            maxLength={1000}
          />

          <Text style={styles.label}>Amount (KES) *</Text>
          <TextInput
            style={styles.input}
            placeholder="Min KES 1"
            placeholderTextColor={colors.grayDark}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          {parsed > 0 && parsed < 1 && <Text style={styles.error}>Minimum amount is KES 1</Text>}

          <Text style={styles.label}>Counterparty Phone *</Text>
          <TextInput
            style={styles.input}
            placeholder="07XX XXX XXX"
            placeholderTextColor={colors.grayDark}
            keyboardType="phone-pad"
            value={counterpartyPhone}
            onChangeText={setCounterpartyPhone}
            maxLength={13}
          />
          <Text style={styles.hint}>They'll get an SMS to accept or reject this deal.</Text>

          <View style={styles.riskRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { marginTop: 0 }]}>⚠️  High-risk deal?</Text>
              <Text style={styles.hint}>Enable if you're dealing with a stranger or large amount.</Text>
            </View>
            <Switch
              value={isRisky}
              onValueChange={setIsRisky}
              trackColor={{ false: colors.border, true: '#FFD580' }}
              thumbColor={isRisky ? '#FF9500' : colors.grayDark}
            />
          </View>

          {isRisky && (
            <>
              <Text style={styles.label}>Describe the risk *</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Explain why this feels risky — met online, unknown seller, large amount..."
                placeholderTextColor={colors.grayDark}
                multiline numberOfLines={3} textAlignVertical="top"
                value={riskDescription}
                onChangeText={setRiskDescription}
                maxLength={500}
              />
            </>
          )}

          <Text style={styles.label}>Deal Photos * (min 2)</Text>
          <Text style={styles.hint}>Upload at least 2 photos of the item/work. Protects both parties in case of dispute.</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo, idx) => (
              <View key={idx} style={styles.photoWrapper}>
                <TouchableOpacity onPress={() => setPreviewPhoto(photo.uri)} activeOpacity={0.8}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 5 && (
              <TouchableOpacity style={[styles.photoAdd, photos.length < 2 && styles.photoAddRequired]} onPress={pickPhoto}>
                <Ionicons name="camera" size={28} color={photos.length < 2 ? colors.primary : colors.grayDark} />
                <Text style={[styles.photoAddText, photos.length < 2 && { color: colors.primary }]}>
                  {photos.length === 0 ? 'Add Photo 1' : photos.length === 1 ? 'Add Photo 2' : 'Add More'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {photos.length < 2 && <Text style={styles.error}>At least 2 photos required</Text>}

          <Text style={styles.label}>Completion Deadline</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.optionRow}>
              {DEADLINE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.optionBtn, deadline === opt.value && styles.optionActive]}
                  onPress={() => setDeadline(opt.value)}
                >
                  <Text style={[styles.optionText, deadline === opt.value && styles.optionTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.hint}>Max 30 days. Deal auto-refunds initiator if not completed in time.</Text>

        </View>

        {parsed >= 1 && (
          <View style={styles.breakdown}>
            <View style={styles.bRow}>
              <Text style={styles.bLabel}>Deal amount</Text>
              <Text style={styles.bValue}>KES {parsed.toLocaleString()}</Text>
            </View>
            <View style={styles.bRow}>
              <Text style={styles.bLabel}>LipaSafe fee (2%)</Text>
              <Text style={styles.bValue}>KES {platformFee.toLocaleString()}</Text>
            </View>
            <View style={[styles.bRow, styles.bTotal]}>
              <Text style={styles.bTotalLabel}>You pay via M-Pesa</Text>
              <Text style={styles.bTotalValue}>KES {total.toLocaleString()}</Text>
            </View>
            <Text style={styles.bNote}>Counterparty receives KES {parsed.toLocaleString()} on completion</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, (!valid || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!valid || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <><Ionicons name="send" size={18} color={colors.white} style={{ marginRight: 8 }} /><Text style={styles.btnText}>Send Deal Invite</Text></>
          }
        </TouchableOpacity>

        <Text style={styles.footer}>
          Counterparty must accept before you pay. M-Pesa prompt only sent after acceptance.
        </Text>
        <View style={{ height: 48 }} />
      </ScrollView>

        <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
          <View style={styles.previewOverlay}>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewPhoto(null)}>
              <Text style={styles.previewCloseText}>✕  Close</Text>
            </TouchableOpacity>
            <Image source={{ uri: previewPhoto }} style={styles.previewImage} resizeMode="contain" />
          </View>
        </Modal>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:          { padding: 8 },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: colors.black },
  banner:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5EE', marginHorizontal: 16, borderRadius: 10, padding: 12, gap: 8, marginBottom: 4 },
  bannerText:       { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '500' },
  form:             { paddingHorizontal: 16, paddingTop: 4 },
  label:            { fontSize: 13, fontWeight: '600', color: colors.black, marginBottom: 6, marginTop: 18 },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.black, backgroundColor: colors.gray },
  textarea:         { height: 100 },
  error:            { color: colors.error, fontSize: 12, marginTop: 4 },
  hint:             { fontSize: 12, color: colors.grayDark, marginTop: 6 },
  riskRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8EC', borderColor: '#FFD580', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 18, gap: 10 },
  optionRow:        { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  optionBtn:        { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.gray },
  optionActive:     { borderColor: colors.primary, backgroundColor: '#E8F5EE' },
  optionText:       { fontSize: 13, color: colors.grayDark, fontWeight: '500' },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
  breakdown:        { marginHorizontal: 16, marginTop: 20, backgroundColor: colors.gray, borderRadius: 12, padding: 14 },
  bRow:             { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bLabel:           { fontSize: 13, color: colors.grayDark },
  bValue:           { fontSize: 13, color: colors.black, fontWeight: '500' },
  bTotal:           { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2, marginBottom: 0 },
  bTotalLabel:      { fontSize: 14, color: colors.black, fontWeight: '700' },
  bTotalValue:      { fontSize: 14, color: colors.primary, fontWeight: '700' },
  bNote:            { fontSize: 11, color: colors.grayDark, marginTop: 8 },
  btn:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  btnDisabled:      { backgroundColor: colors.grayDark },
  btnText:          { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer:           { textAlign: 'center', fontSize: 12, color: colors.grayDark, marginTop: 12, paddingHorizontal: 24, lineHeight: 18 },
  photoGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  photoWrapper:     { width: 90, height: 90, position: 'relative' },
  photoThumb:       { width: 90, height: 90, borderRadius: 10, backgroundColor: colors.gray },
  photoRemove:      { position: 'absolute', top: -8, right: -8, zIndex: 10, backgroundColor: colors.white, borderRadius: 10 },
  photoAdd:         { width: 90, height: 90, borderRadius: 10, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray },
  photoAddRequired: { borderColor: colors.primary, backgroundColor: '#E8F5EE' },
  photoAddText:     { fontSize: 10, color: colors.grayDark, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  overlayBg:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  overlayBox:       { backgroundColor: colors.white, borderRadius: 18, padding: 32, alignItems: 'center', width: 260, gap: 12 },
  overlayTitle:     { fontSize: 16, fontWeight: '700', color: colors.black, textAlign: 'center' },
  overlayHint:      { fontSize: 12, color: colors.grayDark, textAlign: 'center' },
  previewOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  previewClose:     { position: 'absolute', top: 52, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, zIndex: 10 },
  previewCloseText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  previewImage:     { width: '100%', height: '80%' },
});