import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  Modal,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ==================== COUNTDOWN TIMER COMPONENT ====================

const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const isUrgent = timeLeft.totalMs > 0 && timeLeft.totalMs < 24 * 60 * 60 * 1000;

  const timerColor = isUrgent ? '#ea580c' : timeLeft.totalMs <= 0 ? '#dc2626' : '#16a34a';

  if (!targetDate) {
    return (
      <View style={styles.timerContainer}>
        <Text style={[styles.timerLabel, { color: '#6b7280' }]}>No Deadline Set</Text>
      </View>
    );
  }

  if (timeLeft.totalMs <= 0) {
    return (
      <View style={styles.timerContainer}>
        <Text style={[styles.timerLabel, { color: '#dc2626' }]}>Deadline Passed</Text>
        <Text style={[styles.timerValue, { color: '#dc2626' }]}>00:00:00:00</Text>
      </View>
    );
  }

  return (
    <View style={styles.timerContainer}>
      <Text style={[styles.timerLabel, { color: isUrgent ? '#ea580c' : '#374151' }]}>
        {isUrgent ? 'Time Running Out' : 'Time Remaining'}
      </Text>
      <View style={styles.timerRow}>
        <TimeUnit value={timeLeft.days} label="Days" color={timerColor} />
        <Text style={[styles.timerSeparator, { color: timerColor }]}>:</Text>
        <TimeUnit value={timeLeft.hours} label="Hours" color={timerColor} />
        <Text style={[styles.timerSeparator, { color: timerColor }]}>:</Text>
        <TimeUnit value={timeLeft.minutes} label="Mins" color={timerColor} />
        <Text style={[styles.timerSeparator, { color: timerColor }]}>:</Text>
        <TimeUnit value={timeLeft.seconds} label="Secs" color={timerColor} />
      </View>
    </View>
  );
};

const TimeUnit = ({ value, label, color }) => (
  <View style={styles.timeUnit}>
    <Text style={[styles.timeUnitValue, { color }]}>{String(value).padStart(2, '0')}</Text>
    <Text style={styles.timeUnitLabel}>{label}</Text>
  </View>
);

function calculateTimeLeft(targetDate) {
  const difference = new Date(targetDate) - new Date();
  return {
    totalMs: difference,
    days: Math.max(0, Math.floor(difference / (1000 * 60 * 60 * 24))),
    hours: Math.max(0, Math.floor((difference / (1000 * 60 * 60)) % 24)),
    minutes: Math.max(0, Math.floor((difference / 1000 / 60) % 60)),
    seconds: Math.max(0, Math.floor((difference / 1000) % 60)),
  };
}

// ==================== MAIN SCREEN COMPONENT ====================

import * as FileSystem from 'expo-file-system/legacy';
import { BASE_URL } from '../utils/api';
import { useNotifications } from '../context/NotificationContext';
import { getAccessToken } from '../utils/secureStorage';

const DiasporaJobScreen = ({ route, navigation }) => {
  const { dealId } = route.params;

  const [deal, setDeal] = useState(null);
  const [localJobStatus, setLocalJobStatus] = useState('PENDING');
  const [loadingDeal, setLoadingDeal] = useState(true);
  const [evidenceUploadProgress, setEvidenceUploadProgress] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [bankDetailsModalVisible, setBankDetailsModalVisible] = useState(false);
  const [bankName, setBankName]     = useState('');
  const [accountNo, setAccountNo]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { bankDetailsRequest, clearBankDetailsRequest } = useNotifications();

  const fetchDeal = useCallback(async () => {
    setLoadingDeal(true);
    setLoadError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${BASE_URL}/diaspora/fundi/my-jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load job');

      const found = data.data.deals.find((d) => d.id === dealId);
      if (!found) throw new Error('Job not found');

      setDeal(found);

      const activeMilestone = found.milestones?.find((m) => m.status === 'PENDING' || m.status === 'WORK_SUBMITTED');
      if (activeMilestone?.status === 'WORK_SUBMITTED') {
        setLocalJobStatus('EVIDENCE_SUBMITTED');
      } else if (found.status === 'ACTIVE') {
        setLocalJobStatus('ACTIVE');
      } else {
        setLocalJobStatus('PENDING');
      }
    } catch (err) {
      setLoadError(err.message || 'Failed to load job');
    } finally {
      setLoadingDeal(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  // Open modal when socket fires the event for this deal
  useEffect(() => {
    if (bankDetailsRequest && bankDetailsRequest.dealId === dealId) {
      setBankDetailsModalVisible(true);
    }
  }, [bankDetailsRequest, dealId]);

  // Open modal when tapped from notification screen
  useEffect(() => {
    if (route.params?.showBankDetailsModal) {
      setBankDetailsModalVisible(true);
    }
  }, [route.params?.showBankDetailsModal]);

  const submitBankDetails = async () => {
    if (!bankName.trim() || !accountNo.trim()) {
      Alert.alert('Required', 'Please enter both bank name and account number');
      return;
    }
    setSubmitting(true);
    try {
      const dispute = deal?.disputes?.[0];
      if (!dispute) throw new Error('No dispute found');
      const token = await getAccessToken();
      const res = await fetch(`${BASE_URL}/diaspora/disputes/${dispute.id}/submit-bank-details`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName: bankName.trim(), accountNo: accountNo.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to submit');
      setBankDetailsModalVisible(false);
      clearBankDetailsRequest();
      setBankName('');
      setAccountNo('');
      await fetchDeal();
      Alert.alert('✓ Submitted', 'Your bank details have been sent to LipaSafe. We will process your refund shortly.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to submit bank details');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartJob = useCallback(() => {
    setLocalJobStatus('ACTIVE');
  }, []);

  const handleSubmitEvidence = useCallback(async ({ photos: submittedPhotos, media }) => {
    const activeMilestone = deal?.milestones?.find((m) => m.status === 'PENDING');
    if (!activeMilestone) throw new Error('No active milestone found for this job.');

    const token = await getAccessToken();
    setEvidenceUploadProgress(0);

    const compressPhoto = async (uri) => {
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri, [{ resize: { width: 900 } }],
          { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
        );
        return result.uri;
      } catch { return uri; }
    };

    const getSignedUrl = async (resourceType = 'image') => {
      const res = await fetch(
        `${BASE_URL}/diaspora/${deal.id}/milestones/${activeMilestone.id}/sign-upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceType }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error('Failed to get upload signature');
      return data;
    };

    const uploadToCloudinary = async (uri, mimeType, resourceType, attempt = 1) => {
      try {
        const sig = await getSignedUrl(resourceType);
        const uploadRes = await FileSystem.uploadAsync(sig.uploadUrl, uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType,
          parameters: {
            api_key:   sig.apiKey,
            timestamp: String(sig.timestamp),
            signature: sig.signature,
            folder:    sig.folder,
          },
        });
        const parsed = JSON.parse(uploadRes.body);
        if (!parsed.secure_url) throw new Error('Cloudinary upload failed');
        return parsed.secure_url;
      } catch (err) {
        if (attempt < 4) {
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 16000)));
          return uploadToCloudinary(uri, mimeType, resourceType, attempt + 1);
        }
        throw err;
      }
    };

    try {
      const proofUrls = [];
      const total = submittedPhotos.length + (media ? 1 : 0);
      let done = 0;

      for (let i = 0; i < submittedPhotos.length; i++) {
        const compressedUri = await compressPhoto(submittedPhotos[i].uri);
        const url = await uploadToCloudinary(compressedUri, 'image/jpeg', 'image');
        proofUrls.push(url);
        done++;
        setEvidenceUploadProgress(Math.round((done / total) * 90));
      }

      if (media) {
        const resourceType = 'video';
        const url = await uploadToCloudinary(media.uri, media.mimeType || 'video/mp4', resourceType);
        proofUrls.push(url);
        done++;
        setEvidenceUploadProgress(Math.round((done / total) * 90));
      }

      const submitRes = await fetch(
        `${BASE_URL}/diaspora/${deal.id}/milestones/${activeMilestone.id}/submit-work`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ proofUrls }),
        }
      );
      const data = await submitRes.json();
      if (!data.success) throw new Error(data.message || 'Submission failed');
      setEvidenceUploadProgress(100);
      setLocalJobStatus('EVIDENCE_SUBMITTED');
      await fetchDeal();
    } catch (err) {
      setEvidenceUploadProgress(-1);
      Alert.alert('Upload Failed', err.message || 'Please try again.');
    }
  }, [deal, fetchDeal]);

  if (loadingDeal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>Loading job...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !deal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#dc2626', textAlign: 'center', marginBottom: 16 }}>
            {loadError || 'Job not found'}
          </Text>
          <TouchableOpacity onPress={fetchDeal}>
            <Text style={{ color: '#16a34a', fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <DiasporaJobScreenInner
      deal={deal}
      jobStatus={localJobStatus}
      onStartJob={handleStartJob}
      onSubmitEvidence={handleSubmitEvidence}
      evidenceUploadProgress={evidenceUploadProgress}
      bankDetailsModalVisible={bankDetailsModalVisible}
      setBankDetailsModalVisible={setBankDetailsModalVisible}
      bankName={bankName}
      setBankName={setBankName}
      accountNo={accountNo}
      setAccountNo={setAccountNo}
      submitting={submitting}
      submitBankDetails={submitBankDetails}
    />
  );
};

const DiasporaJobScreenInner = ({
  deal,
  jobStatus,
  onStartJob,
  onSubmitEvidence,
  evidenceUploadProgress,
  bankDetailsModalVisible,
  setBankDetailsModalVisible,
  bankName,
  setBankName,
  accountNo,
  setAccountNo,
  submitting,
  submitBankDetails,
}) => {
  const [photos, setPhotos] = useState([]);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-populate evidence if already submitted
  useEffect(() => {
    if (jobStatus === 'EVIDENCE_SUBMITTED' && deal?.submittedEvidence) {
      setPhotos(deal.submittedEvidence.photos || []);
      setMediaFile(deal.submittedEvidence.media || null);
    }
  }, [jobStatus, deal]);

  const handleAddPhoto = useCallback(async () => {
    if (photos.length >= 10) {
      Alert.alert('Limit Reached', 'You can upload a maximum of 10 photos.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 10 - photos.length,
    });

    if (!result.canceled && result.assets) {
      const newPhotos = result.assets.map((asset) => ({
        uri: asset.uri,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 10));
    }
  }, [photos.length]);

  const handleRemovePhoto = useCallback((id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handlePickMedia = useCallback(async () => {
    setMediaError(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const sizeInMB = file.size / (1024 * 1024);

      if (sizeInMB > 30) {
        setMediaError(
          `File too large (${sizeInMB.toFixed(1)}MB). Maximum allowed is 30MB. Please compress or choose a smaller file.`
        );
        setMediaFile(null);
        return;
      }

      // Estimate duration if possible (simplified)
      let duration = 'Unknown';
      if (file.mimeType?.startsWith('audio')) {
        duration = 'Audio file';
      } else if (file.mimeType?.startsWith('video')) {
        duration = 'Video file';
      }

      setMediaFile({
        uri: file.uri,
        name: file.name,
        size: file.size,
        sizeMB: sizeInMB.toFixed(1),
        mimeType: file.mimeType,
        duration,
      });
    } catch (err) {
      setMediaError('Failed to pick file. Please try again.');
    }
  }, []);

  const handleRemoveMedia = useCallback(() => {
    setMediaFile(null);
    setMediaError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (photos.length === 0 && !mediaFile) return;

    setIsSubmitting(true);
    try {
      await onSubmitEvidence({
        photos,
        media: mediaFile,
        submittedAt: new Date().toISOString(),
      });
    } catch (error) {
      Alert.alert('Submission Failed', error.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [photos, mediaFile, onSubmitEvidence]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not set';
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return `KES ${Number(amount).toLocaleString('en-KE')}`;
  };

  const canSubmit = (photos.length > 0 || mediaFile !== null) && !isSubmitting;

  // ==================== RENDER HELPERS ====================

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.jobTitle}>{deal?.title || 'Job Details'}</Text>
      <Text style={styles.dealRef}>Ref: {deal?.reference || 'N/A'}</Text>
    </View>
  );

  const renderInfoCard = () => (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <Ionicons name="person-outline" size={18} color="#6b7280" />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>Funder</Text>
          <Text style={styles.infoValue}>{deal?.funder?.fullName || '—'}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.infoRow}>
        <Ionicons name="location-outline" size={18} color="#6b7280" />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>Site Location</Text>
          <Text style={styles.infoValue}>{deal?.siteLocation || '—'}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.infoRow}>
        <Ionicons name="cash-outline" size={18} color="#6b7280" />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>Total Amount</Text>
          <Text style={[styles.infoValue, styles.amountValue]}>
            {formatCurrency(deal?.totalAmount)}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.infoRow}>
        <Ionicons name="calendar-outline" size={18} color="#6b7280" />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>Deadline</Text>
          <Text style={styles.infoValue}>{formatDate(deal?.deadlineUtc)}</Text>
        </View>
      </View>

      {deal?.description && (
        <>
          <View style={styles.divider} />
          <View style={styles.descriptionContainer}>
            <Text style={styles.infoLabel}>Description</Text>
            <Text style={styles.descriptionText}>{deal.description}</Text>
          </View>
        </>
      )}

      {deal?.referencePhotoUrls && deal.referencePhotoUrls.length > 0 && (
        <>
          <View style={styles.divider} />
          <View style={styles.descriptionContainer}>
            <Text style={styles.infoLabel}>Reference Photos from Funder</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {deal.referencePhotoUrls.map((url, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setPreviewImage(url)}
                  style={{ marginRight: 8 }}
                >
                  <Image
                    source={{ uri: url }}
                    style={{ width: 90, height: 90, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );

  const renderMilestones = () => (
    <View style={styles.milestonesSection}>
      <Text style={styles.sectionTitle}>Milestones</Text>
      <View style={styles.card}>
        {deal?.milestones?.map((milestone, index) => (
          <View key={index} style={styles.milestoneItem}>
            <View style={styles.milestoneLeft}>
              <View style={styles.milestoneNumber}>
                <Text style={styles.milestoneNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.milestoneTitle}>{milestone.title}</Text>
            </View>
            <Text style={styles.milestoneAmount}>
              {formatCurrency(milestone.amount)}
            </Text>
          </View>
        ))}
        {(!deal?.milestones || deal.milestones.length === 0) && (
          <Text style={styles.emptyText}>No milestones defined</Text>
        )}
      </View>
    </View>
  );

  const renderPhotoGrid = (readOnly = false) => (
    <View style={styles.photoGrid}>
      {photos.map((photo, index) => (
        <TouchableOpacity
          key={photo.id || index}
          style={styles.photoThumbnail}
          onPress={() => setPreviewImage(photo.uri)}
          activeOpacity={0.8}
        >
          <Image source={{ uri: photo.uri }} style={styles.thumbnailImage} />
          {!readOnly && (
            <TouchableOpacity
              style={styles.removePhotoBtn}
              onPress={() => handleRemovePhoto(photo.id)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Ionicons name="close-circle" size={22} color="#dc2626" />
            </TouchableOpacity>
          )}
          {readOnly && index === 0 && photos.length > 1 && (
            <View style={styles.photoCountBadge}>
              <Text style={styles.photoCountText}>+{photos.length - 1}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {!readOnly && photos.length < 10 && (
        <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhoto}>
          <Ionicons name="add" size={32} color="#16a34a" />
          <Text style={styles.addPhotoText}>
            {photos.length === 0 ? 'Add Photos' : 'Add More'}
          </Text>
          <Text style={styles.addPhotoSubtext}>{photos.length}/10</Text>
        </TouchableOpacity>
      )}

      {photos.length === 0 && !readOnly && (
        <View style={styles.emptyPhotos}>
          <Ionicons name="images-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyPhotosText}>Tap + to add photos</Text>
        </View>
      )}
    </View>
  );

  const renderMediaSlot = () => (
    <View style={styles.mediaSlot}>
      {mediaFile ? (
        <View style={styles.mediaFileCard}>
          <View style={styles.mediaFileIcon}>
            <Ionicons
              name={mediaFile.mimeType?.startsWith('video') ? 'videocam' : 'musical-note'}
              size={28}
              color="#16a34a"
            />
          </View>
          <View style={styles.mediaFileInfo}>
            <Text style={styles.mediaFileName} numberOfLines={1}>
              {mediaFile.name}
            </Text>
            <Text style={styles.mediaFileMeta}>
              {mediaFile.duration} • {mediaFile.sizeMB} MB
            </Text>
          </View>
          <TouchableOpacity onPress={handleRemoveMedia} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="trash-outline" size={20} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.mediaUploadBtn} onPress={handlePickMedia}>
          <Ionicons name="cloud-upload-outline" size={28} color="#16a34a" />
          <Text style={styles.mediaUploadText}>Upload Audio or Video</Text>
          <Text style={styles.mediaUploadSubtext}>Max 30MB</Text>
        </TouchableOpacity>
      )}

      {mediaError && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
          <Text style={styles.errorText}>{mediaError}</Text>
        </View>
      )}
    </View>
  );

  const renderImagePreview = () => (
    <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
      <SafeAreaView style={styles.previewContainer}>
        <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewImage(null)}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        {previewImage && (
          <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />
        )}
      </SafeAreaView>
    </Modal>
  );

  // ==================== STATE RENDERS ====================

  const renderPendingState = () => (
    <View style={styles.stateContainer}>
      {renderHeader()}
      {renderInfoCard()}
      {renderMilestones()}

      <View style={styles.bottomAction}>
        <TouchableOpacity style={styles.primaryButton} onPress={onStartJob} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>Start Job</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderActiveState = () => (
    <View style={styles.stateContainer}>
      {renderHeader()}

      <CountdownTimer targetDate={deal?.deadlineUtc} />

      {renderInfoCard()}
      {renderMilestones()}

      <View style={styles.evidenceSection}>
        <Text style={styles.sectionTitle}>Upload Evidence</Text>

        <View style={styles.card}>
          <Text style={styles.evidenceLabel}>Photos ({photos.length}/10)</Text>
          {renderPhotoGrid(false)}

          <View style={styles.divider} />

          <Text style={styles.evidenceLabel}>Audio / Video (Optional)</Text>
          {renderMediaSlot()}
        </View>
      </View>

      <View style={styles.bottomAction}>
        {(isSubmitting || evidenceUploadProgress !== 0) && (
          <View style={{ marginBottom: 10 }}>
            <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(0, evidenceUploadProgress)}%`,
                  backgroundColor: evidenceUploadProgress === -1 ? '#dc2626' : '#16a34a',
                }}
              />
            </View>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
              {evidenceUploadProgress === -1
                ? 'Upload failed — please try again'
                : evidenceUploadProgress < 100
                ? `Uploading... ${evidenceUploadProgress}%`
                : 'Finalizing...'}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.primaryButton, (!canSubmit || isSubmitting) && styles.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
          </Text>
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
        {photos.length === 0 && !mediaFile && (
          <Text style={styles.helperText}>Add at least 1 photo or video to submit</Text>
        )}
      </View>
    </View>
  );

  const renderEvidenceSubmittedState = () => (
    <View style={styles.stateContainer}>
      {renderHeader()}

      <View style={styles.statusBadge}>
        <Ionicons name="time-outline" size={16} color="#b45309" />
        <Text style={styles.statusBadgeText}>Awaiting Funder Review</Text>
      </View>

      {renderInfoCard()}
      {renderMilestones()}

      <View style={styles.evidenceSection}>
        <Text style={styles.sectionTitle}>Submitted Evidence</Text>

        <View style={styles.card}>
          <Text style={styles.evidenceLabel}>Photos ({photos.length})</Text>
          {renderPhotoGrid(true)}

          {mediaFile && (
            <>
              <View style={styles.divider} />
              <Text style={styles.evidenceLabel}>Audio / Video</Text>
              <View style={styles.mediaFileCard}>
                <View style={styles.mediaFileIcon}>
                  <Ionicons
                    name={mediaFile.mimeType?.startsWith('video') ? 'videocam' : 'musical-note'}
                    size={28}
                    color="#16a34a"
                  />
                </View>
                <View style={styles.mediaFileInfo}>
                  <Text style={styles.mediaFileName} numberOfLines={1}>
                    {mediaFile.name}
                  </Text>
                  <Text style={styles.mediaFileMeta}>
                    {mediaFile.duration} • {mediaFile.sizeMB} MB
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.submittedNote}>
        <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
        <Text style={styles.submittedNoteText}>
          Submitted on {formatDate(deal?.submittedAt || new Date().toISOString())}
        </Text>
      </View>
    </View>
  );

  // ==================== MAIN RENDER ====================

  const renderContent = () => {
    switch (jobStatus) {
      case 'PENDING':
        return renderPendingState();
      case 'ACTIVE':
        return renderActiveState();
      case 'EVIDENCE_SUBMITTED':
        return renderEvidenceSubmittedState();
      default:
        return renderPendingState();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top","left","right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {(() => {
        const dispute = deal?.disputes?.[0];
        if (!dispute?.bankDetailsRequested) return null;
        if (dispute?.refundBankName) return (
          <View style={styles.bankBannerSubmitted}>
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text style={styles.bankBannerSubmittedText}>Bank details submitted — refund being processed</Text>
          </View>
        );
        return (
          <TouchableOpacity style={styles.bankBanner} onPress={() => setBankDetailsModalVisible(true)} activeOpacity={0.85}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.bankBannerText}>LipaSafe needs your bank details to refund you — Tap here</Text>
          </TouchableOpacity>
        );
      })()}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
      <Modal visible={bankDetailsModalVisible} transparent animationType="slide" onRequestClose={() => setBankDetailsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.bankModal}>
            <View style={styles.bankModalHeader}>
              <Text style={styles.bankModalTitle}>Submit Bank Details</Text>
              <TouchableOpacity onPress={() => setBankDetailsModalVisible(false)}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            <Text style={styles.bankModalSubtitle}>LipaSafe will transfer your refund to this account</Text>
            <Text style={styles.bankInputLabel}>Bank Name</Text>
            <TextInput
              style={styles.bankInput}
              placeholder="e.g. Equity Bank, KCB, Barclays"
              placeholderTextColor="#9ca3af"
              value={bankName}
              onChangeText={setBankName}
              autoCapitalize="words"
            />
            <Text style={styles.bankInputLabel}>Account Number / IBAN</Text>
            <TextInput
              style={styles.bankInput}
              placeholder="e.g. 1234567890"
              placeholderTextColor="#9ca3af"
              value={accountNo}
              onChangeText={setAccountNo}
              keyboardType="default"
            />
            <TouchableOpacity
              style={[styles.bankSubmitBtn, submitting && { opacity: 0.6 }]}
              onPress={submitBankDetails}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.bankSubmitText}>Submit Bank Details</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {renderImagePreview()}
    </SafeAreaView>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  bankBanner: { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#dc2626', paddingHorizontal:16, paddingVertical:12 },
  bankBannerText: { color:'#fff', fontSize:13, fontWeight:'600', flex:1 },
  bankBannerSubmitted: { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#f0fdf4', borderBottomWidth:1, borderBottomColor:'#bbf7d0', paddingHorizontal:16, paddingVertical:10 },
  bankBannerSubmittedText: { color:'#16a34a', fontSize:13, fontWeight:'500', flex:1 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  bankModal: { backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20, padding:24, paddingBottom:40 },
  bankModalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  bankModalTitle: { fontSize:18, fontWeight:'700', color:'#111827' },
  bankModalSubtitle: { fontSize:13, color:'#6b7280', marginBottom:20 },
  bankInputLabel: { fontSize:13, fontWeight:'600', color:'#374151', marginBottom:6 },
  bankInput: { borderWidth:1, borderColor:'#d1d5db', borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:'#111827', marginBottom:16, backgroundColor:'#f9fafb' },
  bankSubmitBtn: { backgroundColor:'#16a34a', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:4 },
  bankSubmitText: { color:'#fff', fontSize:15, fontWeight:'700' },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    paddingTop: 24,
    paddingBottom: 40,
  },
  stateContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // Header
  header: {
    marginBottom: 20,
  },
  jobTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 32,
  },
  dealRef: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#9ca3af',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // Timer
  timerContainer: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeUnit: {
    alignItems: 'center',
    minWidth: 56,
  },
  timeUnitValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timeUnitLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    fontWeight: '500',
  },
  timerSeparator: {
    fontSize: 28,
    fontWeight: '700',
    marginHorizontal: 4,
    opacity: 0.6,
  },

  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 14,
  },

  // Info Card
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    lineHeight: 22,
  },
  amountValue: {
    color: '#16a34a',
    fontSize: 17,
  },
  descriptionContainer: {
    marginTop: 2,
  },
  descriptionText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
    marginTop: 4,
  },

  // Milestones
  milestonesSection: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  milestoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  milestoneNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  milestoneNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },
  milestoneTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  milestoneAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16a34a',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Evidence Section
  evidenceSection: {
    marginBottom: 8,
  },
  evidenceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Photo Grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoThumbnail: {
    width: (SCREEN_WIDTH - 72) / 3,
    height: (SCREEN_WIDTH - 72) / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  photoCountText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  addPhotoBtn: {
    width: (SCREEN_WIDTH - 72) / 3,
    height: (SCREEN_WIDTH - 72) / 3,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bbf7d0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  addPhotoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    marginTop: 4,
  },
  addPhotoSubtext: {
    fontSize: 11,
    color: '#86efac',
    marginTop: 2,
  },
  emptyPhotos: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  emptyPhotosText: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
    fontWeight: '500',
  },

  // Media Slot
  mediaSlot: {
    marginTop: 4,
  },
  mediaUploadBtn: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#bbf7d0',
    borderStyle: 'dashed',
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  mediaUploadText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16a34a',
    marginTop: 8,
  },
  mediaUploadSubtext: {
    fontSize: 12,
    color: '#86efac',
    marginTop: 2,
  },
  mediaFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  mediaFileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mediaFileInfo: {
    flex: 1,
  },
  mediaFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  mediaFileMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    marginLeft: 6,
    flex: 1,
    lineHeight: 18,
  },

  // Buttons
  bottomAction: {
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#d1d5db',
    shadowColor: 'transparent',
    elevation: 0,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  helperText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },

  // Submitted State
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
    marginLeft: 6,
  },
  submittedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  submittedNoteText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginLeft: 8,
  },

  // Image Preview Modal
  previewContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
});

export default DiasporaJobScreen;