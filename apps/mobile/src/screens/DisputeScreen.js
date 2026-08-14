import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons }  from '@expo/vector-icons';
import { colors }    from '../theme/colors';
import LipaHeader    from '../components/LipaHeader';
import LipaInput     from '../components/LipaInput';
import LipaButton    from '../components/LipaButton';
import { authFetch } from '../utils/api';

const BUNDLE_REASONS = [
  { key: 'not_delivered',      label: 'Not Delivered' },
  { key: 'wrong_item',         label: 'Wrong Item' },
  { key: 'damaged_goods',      label: 'Damaged Goods' },
  { key: 'service_incomplete', label: 'Service Incomplete' },
  { key: 'fraud_suspected',    label: 'Fraud Suspected' },
  { key: 'other',              label: 'Other' },
];

const DELIVERY_REASONS = [
  { key: 'not_delivered',   label: 'Not Delivered' },
  { key: 'wrong_item',      label: 'Wrong Item' },
  { key: 'damaged_goods',   label: 'Damaged Goods' },
  { key: 'fraud_suspected', label: 'Fraud Suspected' },
  { key: 'other',           label: 'Other' },
];

const SECOND_HAND_REASONS = [
  { key: 'not_as_described', label: 'Not As Described' },
  { key: 'damaged_goods',    label: 'Damaged / Faulty' },
  { key: 'wrong_item',       label: 'Wrong Item' },
  { key: 'fake_or_clone',    label: 'Fake / Counterfeit' },
  { key: 'fraud_suspected',  label: 'Fraud Suspected' },
  { key: 'other',            label: 'Other' },
];

export default function DisputeScreen({ navigation, route }) {
  const { transactionId, referenceNo, orderId, claimerType = 'BUYER', type = 'bundle' } = route.params || {};

  const [reason,      setReason]      = useState('');
  const [description, setDescription] = useState('');
  const [photos,      setPhotos]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  const isDelivery   = type === 'delivery';
  const isSecondHand = type === 'second_hand';
  const REASONS      = isDelivery ? DELIVERY_REASONS : isSecondHand ? SECOND_HAND_REASONS : BUNDLE_REASONS;

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

  const submit = async () => {
    if (submitted) return;
    if (!reason)                 return Alert.alert('Select a reason', 'Please select why you are disputing.');
    if (description.length < 10) return Alert.alert('More detail needed', 'Describe the issue in at least 10 characters.');
    if (isSecondHand && photos.length === 0) return Alert.alert('Evidence required', 'Upload at least one photo as evidence.');

    try {
      setLoading(true);
      let res, data;

      if (isDelivery) {
        res  = await authFetch('/disputes/open', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderId, claimerType, reason, description }),
        });
        data = await res.json();
        if (data.success) {
          setSubmitted(true);
          const msg = data.autoVerdict === 'DELIVERY_GUY_FAULT'
            ? 'Photo analysis found evidence in your favor. Admin will confirm shortly.'
            : 'Admin is reviewing the photo evidence. You will be notified.';
          Alert.alert('Dispute Opened', msg, [
            { text: 'OK', onPress: () => navigation.navigate('ProfileTab', { screen: 'DeliveryOrders' }) }
          ]);
        } else {
          Alert.alert('Error', data.message || 'Could not open dispute');
        }

      } else if (isSecondHand) {
        const form = new FormData();
        form.append('reason',      reason);
        form.append('description', description);
        photos.forEach((photo, i) => {
          form.append('evidence', {
            uri:  photo.uri,
            name: `evidence_${i}.jpg`,
            type: 'image/jpeg',
          });
        });

        res  = await authFetch(`/second-hand/${transactionId}/dispute`, {
          method:  'POST',
          headers: { 'Content-Type': 'multipart/form-data' },
          body:    form,
        });
        data = await res.json();
        if (data.success) {
          setSubmitted(true);
          Alert.alert(
            'Dispute Raised',
            'Seller has been notified and has 24 hours to respond. Your funds are held safely.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert('Error', data.message || 'Could not open dispute');
        }

      } else {
        res  = await authFetch(`/transactions/bundle/${transactionId}/dispute`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ reason, description }),
        });
        data = await res.json();
        if (data.success) {
          setSubmitted(true);
          Alert.alert('Dispute Opened', 'Admin will review within 24 hours. Your funds are safe.', [
            { text: 'OK', onPress: () => navigation.navigate('TransactionsList') }
          ]);
        } else {
          Alert.alert('Error', data.message || 'Could not open dispute');
        }
      }

    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LipaHeader title="Open Dispute" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.refCard}>
          <Text style={styles.refLabel}>{isDelivery ? 'Order ID' : 'Reference'}</Text>
          <Text style={styles.refValue}>
            {isDelivery ? (orderId || '').slice(0, 8).toUpperCase() : referenceNo}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>What went wrong?</Text>
        <View style={styles.reasons}>
          {REASONS.map(r => (
            <TouchableOpacity
              key={r.key}
              style={[styles.reasonBtn, reason === r.key && styles.reasonActive]}
              onPress={() => setReason(r.key)}
            >
              <Text style={[styles.reasonText, reason === r.key && styles.reasonTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <LipaInput
          label="Describe the issue"
          value={description}
          onChangeText={setDescription}
          placeholder="Give as much detail as possible (min 10 characters)"
          multiline
        />

        {isSecondHand && (
          <View style={styles.evidenceSection}>
            <Text style={styles.sectionLabel}>Photo Evidence</Text>
            <Text style={styles.evidenceHint}>
              Upload clear photos showing the issue. Maximum 4 photos. At least 1 required.
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
        )}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Your funds are held safely. The seller will be notified and has 24 hours to respond.
          </Text>
        </View>

        {submitted ? (
          <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
            <Ionicons name="checkmark-circle" size={40} color="#10B981" />
            <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 15 }}>Dispute Submitted</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center' }}>
              You cannot submit another dispute for this order.
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <LipaButton
            title="Submit Dispute"
            onPress={submit}
            disabled={submitted || !reason || description.length < 10 || (isSecondHand && photos.length === 0)}
          />
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.white },
  content:          { padding: 20, paddingBottom: 40 },
  refCard:          { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16, marginBottom: 20 },
  refLabel:         { fontSize: 12, color: '#6B7280' },
  refValue:         { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4 },
  sectionLabel:     { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  reasons:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  reasonBtn:        { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  reasonActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  reasonText:       { fontSize: 13, color: '#374151' },
  reasonTextActive: { color: '#fff', fontWeight: '600' },
  evidenceSection:  { marginTop: 20, marginBottom: 4 },
  evidenceHint:     { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  photoGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrapper:     { position: 'relative' },
  photoThumb:       { width: 82, height: 82, borderRadius: 10, backgroundColor: '#E5E7EB' },
  removeBtn:        { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 12 },
  addPhotoBtn:      { width: 82, height: 82, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  addPhotoText:     { fontSize: 11, color: '#6B7280', marginTop: 4 },
  notice:           { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginVertical: 16 },
  noticeText:       { fontSize: 13, color: '#1D4ED8', lineHeight: 20 },
});
