import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, BASE_URL } from '../utils/api';
import { getAccessToken } from '../utils/secureStorage';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, SHARED_STYLES } from './diasporaTheme';

const EVIDENCE_TYPES = [
  { label: 'Photo', value: 'PHOTO' },
  { label: 'Video', value: 'VIDEO' },
  { label: 'Document/Receipt', value: 'DOCUMENT_RECEIPT' },
  { label: 'Written Confirmation', value: 'WRITTEN_CONFIRMATION' },
];

export default function DiasporaMilestoneBuilderScreen({ navigation, route }) {
  const {
    dealType,
    counterpartyPhone,
    counterpartyName,
    totalAmount,
    dealDescription,
    numberOfMilestones,
    feeBreakdown,
    selectedCurrency,
    currencyRate,
    customCategory,
  } = route.params || {};

  const [milestones, setMilestones] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Initialize milestones when screen is focused
  useFocusEffect(
    useCallback(() => {
      const initial = Array.from({ length: numberOfMilestones || 1 }, (_, i) => ({
        id: i + 1,
        title: ``,
        amount: '',
        evidenceType: '',
      }));
      setMilestones(initial);
    }, [numberOfMilestones])
  );

  const updateMilestone = (index, field, value) => {
    setMilestones((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const milestoneSum = milestones.reduce(
    (sum, m) => sum + (Number(m.amount) || 0),
    0
  );

  const isBalanced = milestoneSum === Number(totalAmount);
  const allFieldsFilled = milestones.every(
    (m) => m.title.trim() !== '' && m.amount.trim() !== '' && !isNaN(Number(m.amount)) && Number(m.amount) > 0
  );

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!isBalanced) {
      Alert.alert(
        'Amount Mismatch',
        `Milestone total (KES ${milestoneSum.toLocaleString()}) must equal deal total (KES ${Number(totalAmount).toLocaleString()}).`
      );
      return;
    }

    if (!allFieldsFilled) {
      Alert.alert('Incomplete', 'Please fill in all milestone titles and amounts.');
      return;
    }

    const formData = new FormData();
    formData.append('dealType', dealType?.toUpperCase());
    formData.append('recipientPhone', counterpartyPhone);
    formData.append('recipientName', counterpartyName);
    formData.append('totalAmount', String(Number(totalAmount)));
    formData.append('description', dealDescription);
    formData.append('siteLocation', route.params?.siteLocation || '');
    if (customCategory) {
      formData.append('customCategory', customCategory);
    }
    if (route.params?.deadline) {
      formData.append('deadlineUtc', route.params.deadline);
    }
    formData.append('milestones', JSON.stringify(
      milestones.map((m, i) => ({
        title: m.title.trim(),
        amount: Number(m.amount),
        order: i + 1,
        ...(m.evidenceType && { evidenceType: m.evidenceType }),
      }))
    ));

    const photos = route.params?.photos || [];
    photos.forEach((uri, i) => {
      formData.append('referencePhotos', {
        uri,
        name: `reference_${i}.jpg`,
        type: 'image/jpeg',
      });
    });

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const token = await getAccessToken();

      const json = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE_URL}/diaspora`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.timeout = 60000;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || `Request failed (${xhr.status})`));
            }
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        };

        xhr.onerror = () => reject(new Error('Network error. Check your connection and try again.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Try again on a stronger connection.'));

        xhr.send(formData);
      });

      if (!json.success) throw new Error(json.message || 'Failed to create deal');

      navigation.navigate('DiasporaPaymentInstructions', {
        dealId: json.deal.id,
        totalAmount: json.deal.totalAmount,
        referenceCode: json.deal.reference,
        feeBreakdown,
        selectedCurrency,
        currencyRate,
      });
    } catch (err) {
      Alert.alert('Submission Failed', err.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardWrap}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.headerTitle}>Build Milestones</Text>
          <Text style={styles.headerSubtitle}>
            Break the deal into {numberOfMilestones} payment stage(s). Total must equal KES {Number(totalAmount).toLocaleString()}.
          </Text>

          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Deal Total</Text>
              <Text style={styles.summaryValue}>KES {Number(totalAmount).toLocaleString()}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Milestone Sum</Text>
              <Text style={[styles.summaryValue, !isBalanced && styles.summaryValueError]}>
                KES {milestoneSum.toLocaleString()}
              </Text>
            </View>
          </View>

          {!isBalanced && allFieldsFilled && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                {milestoneSum > Number(totalAmount)
                  ? `Over by KES ${(milestoneSum - Number(totalAmount)).toLocaleString()}`
                  : `Under by KES ${(Number(totalAmount) - milestoneSum).toLocaleString()}`}
              </Text>
            </View>
          )}

          {milestones.map((milestone, index) => (
            <View key={milestone.id} style={styles.milestoneCard}>
              <View style={styles.milestoneHeader}>
                <View style={styles.milestoneNumberWrap}>
                  <Text style={styles.milestoneNumber}>{index + 1}</Text>
                </View>
                <Text style={styles.milestoneHeaderTitle}>Milestone {index + 1}</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Title</Text>
                <TextInput
              placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  placeholder="e.g. Foundation complete"
                  value={milestone.title}
                  onChangeText={(text) => updateMilestone(index, 'title', text)}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Amount (KES)</Text>
                <TextInput
              placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  placeholder="e.g. 50000"
                  keyboardType="numeric"
                  value={milestone.amount}
                  onChangeText={(text) => updateMilestone(index, 'amount', text)}
                />
              </View>

              {dealType?.toUpperCase() === 'CUSTOM' && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Evidence Type</Text>
                  <View style={styles.chipRow}>
                    {EVIDENCE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[styles.chip, milestone.evidenceType === type.value && styles.chipActive]}
                        onPress={() => updateMilestone(index, 'evidenceType', type.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, milestone.evidenceType === type.value && styles.chipTextActive]}>
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>

        <View style={styles.footer}>
          {isSubmitting && (
            <View style={{ marginBottom: 10 }}>
              <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: `${uploadProgress}%`,
                    backgroundColor: '#16a34a',
                  }}
                />
              </View>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
                {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : 'Finalizing...'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.ctaButton, (!isBalanced || !allFieldsFilled || isSubmitting) && styles.ctaButtonDisabled]}
            activeOpacity={0.8}
            disabled={!isBalanced || !allFieldsFilled || isSubmitting}
            onPress={handleSubmit}
          >
            <Text style={styles.ctaButtonText}>
              {isSubmitting ? 'Creating Deal...' : 'Create Deal & Get Payment Details'}
            </Text>
          </TouchableOpacity>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '18',
  },
  chipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },
  container: {
    ...SHARED_STYLES.container,
  },
  keyboardWrap: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: 100,
    paddingTop: 24,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  summaryValueError: {
    color: '#EF4444',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  milestoneCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  milestoneNumberWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  milestoneNumber: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  milestoneHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  footer: { ...SHARED_STYLES.footer, position: 'absolute', bottom: 0, left: 0, right: 0 },
  ctaButton: {
    ...SHARED_STYLES.ctaButton,
  },
  ctaButtonDisabled: {
    ...SHARED_STYLES.ctaButtonDisabled,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});