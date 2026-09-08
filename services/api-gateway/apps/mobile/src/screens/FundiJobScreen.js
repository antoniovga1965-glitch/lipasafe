import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, FlatList, Alert,
  ActivityIndicator, TextInput, Modal, Pressable,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch, BASE_URL } from '../utils/api';
import { getAccessToken } from '../utils/secureStorage';
import { Buffer } from 'buffer';

export default function FundiJobScreen({ navigation, route }) {
  const { tx: seedTx, jobId: seedJobId } = route.params || {};

  const [job, setJob]           = useState(seedTx || null);
  const [fetching, setFetching] = useState(!seedTx);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [viewerUri, setViewerUri] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isOverdue, setIsOverdue] = useState(false);

  const [isBuyer, setIsBuyer] = useState(null);

  // Extension-request form state
  const [extraHours, setExtraHours] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionPhotos, setExtensionPhotos] = useState([]);
  const [submittingExtension, setSubmittingExtension] = useState(false);
  const [respondingExtension, setRespondingExtension] = useState(false);

  useEffect(() => {
    if (!job) return;
    getAccessToken().then(token => {
      if (!token) return;
      try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        setIsBuyer(payload.userId === job.buyerId);
      } catch (_) {}
    });
  }, [job]);

  // OTP acceptance state
  const [otp, setOtp]             = useState('');
  const [accepting, setAccepting] = useState(false);

  // Fetch fresh job on mount
  const fetchJob = useCallback(async () => {
    const id = seedJobId || seedTx?.id;
    if (!id) { setFetching(false); return; }
    try {
      setFetching(true);
      const res  = await authFetch(`/fundi/${id}`);
      const data = await res.json();
      if (data.success && data.job) setJob(data.job);
    } catch (e) {}
    finally { setFetching(false); }
  }, [seedJobId, seedTx?.id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);


  // Redirect buyer to review screen when fundi marks job done
  useEffect(() => {
    if (job?.status === 'AWAITING_BUYER_REVIEW' && isBuyer === true) {
      navigation.replace('FundiReview', { jobId: job.id });
    }
  }, [job?.status, isBuyer]);

  // Countdown timer — only active when job is ACTIVE or OVERDUE
  useEffect(() => {
    if (!job?.deadlineAt) return;
    const tick = () => {
      const diff = new Date(job.deadlineAt) - new Date();
      if (diff <= 0) { setIsOverdue(true); setTimeLeft('OVERDUE'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(d > 0 ? `${d}d ${h}h ${m}m`
        : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [job?.deadlineAt]);

  // ── In-app OTP acceptance ──────────────────────────────────────────────
  const handleAccept = async () => {
    if (!otp.trim()) {
      Alert.alert('Required', 'Enter the OTP from the SMS you received');
      return;
    }
    try {
      setAccepting(true);
      const res  = await authFetch(`/fundi/${job.id}/accept`, {
        method: 'POST',
        body:   JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(' Job Accepted!', 'Timer has started. Complete the job before the deadline.', [
          { text: 'OK', onPress: () => fetchJob() }
        ]);
        setOtp('');
      } else {
        Alert.alert('Error', data.message || 'Could not accept job');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed. Check connection.');
    } finally {
      setAccepting(false);
    }
  };

  // ── After photos ──────────────────────────────────────────────────────
  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission needed', 'Please allow photo access'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) setAfterPhotos([...afterPhotos, ...result.assets]);
  };

  const removePhoto = (index) => setAfterPhotos(afterPhotos.filter((_, i) => i !== index));

  // ── Extension request photos ────────────────────────────────────────────
  const pickExtensionPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission needed', 'Please allow photo access'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) setExtensionPhotos([...extensionPhotos, ...result.assets]);
  };

  const removeExtensionPhoto = (index) => setExtensionPhotos(extensionPhotos.filter((_, i) => i !== index));

  const submitExtensionRequest = async () => {
    const hoursNum = parseInt(extraHours, 10);
    if (!hoursNum || hoursNum < 1) {
      Alert.alert('Required', 'Enter how many extra hours you need');
      return;
    }
    if (!extensionReason.trim() || extensionReason.trim().length < 5) {
      Alert.alert('Required', 'Explain why you need more time');
      return;
    }
    if (extensionPhotos.length === 0) {
      Alert.alert('Photos Required', 'Add at least one progress photo');
      return;
    }
    try {
      setSubmittingExtension(true);
      const token = await getAccessToken();
      const uploadedUrls = [];
      for (const photo of extensionPhotos) {
        const formData = new FormData();
        formData.append('photos', { uri: photo.uri, name: 'extension.jpg', type: 'image/jpeg' });
        const uploadRes = await fetch(`${BASE_URL}/fundi/upload-photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          Alert.alert('Upload Failed', uploadData.message || 'Could not upload photo.');
          setSubmittingExtension(false);
          return;
        }
        uploadedUrls.push(...uploadData.urls);
      }
      const res = await authFetch(`/fundi/${job.id}/request-extension`, {
        method: 'POST',
        body: JSON.stringify({
          extraHours:     hoursNum,
          reason:         extensionReason.trim(),
          evidencePhotos: uploadedUrls,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Request Sent', 'The buyer has been notified and will respond soon.');
        setExtraHours('');
        setExtensionReason('');
        setExtensionPhotos([]);
        fetchJob();
      } else {
        Alert.alert('Error', data.message || 'Could not send extension request');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed. Check connection.');
    } finally {
      setSubmittingExtension(false);
    }
  };

  const handleExtensionDecision = (decision) => {
    const title   = decision === 'APPROVED' ? 'Approve Extension?' : 'Reject Extension?';
    const message = decision === 'APPROVED'
      ? 'The fundi will get more time to finish the job.'
      : 'This will open a dispute for admin review. This cannot be undone.';
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: decision === 'REJECTED' ? 'destructive' : 'default', onPress: () => submitExtensionDecision(decision) },
    ]);
  };

  const submitExtensionDecision = async (decision) => {
    try {
      setRespondingExtension(true);
      const res  = await authFetch(`/fundi/${job.id}/extension-response`, {
        method: 'PATCH',
        body:   JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(
          decision === 'APPROVED' ? 'Extension Approved' : 'Dispute Opened',
          decision === 'APPROVED' ? 'The fundi has been notified.' : 'Admin will review this dispute.'
        );
        fetchJob();
      } else {
        Alert.alert('Error', data.message || 'Could not process response');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed. Check connection.');
    } finally {
      setRespondingExtension(false);
    }
  };

  const handleJobDone = async () => {
    if (afterPhotos.length === 0) {
      Alert.alert('Photos Required', 'Upload after photos before marking job done');
      return;
    }
    Alert.alert('Confirm Job Done', 'This will start the 3hr buyer inspection window. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, Done', onPress: submitJobDone }
    ]);
  };

  const submitJobDone = async () => {
    try {
      setLoading(true);
      // Upload all after photos to Cloudinary first
      const token = await getAccessToken();
      const uploadedUrls = [];
      for (const photo of afterPhotos) {
        const formData = new FormData();
        formData.append('photos', { uri: photo.uri, name: 'after.jpg', type: 'image/jpeg' });
        const uploadRes = await fetch(`${BASE_URL}/fundi/upload-photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          Alert.alert('Upload Failed', uploadData.message || 'Could not upload photo.');
          setLoading(false);
          return;
        }
        uploadedUrls.push(...uploadData.urls);
      }
      const res = await authFetch(`/fundi/${job.id}/done`, {
        method: 'POST',
        body:   JSON.stringify({ afterPhotos: uploadedUrls, notes: '' }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(' Done!', 'Buyer inspection window started. You will be paid within 3 hours.');
        navigation.navigate('SellerDashboard');
      } else {
        Alert.alert('Error', data.message || 'Something went wrong');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

    // ── WAITING_FOR_FUNDI_ACCEPTANCE ─────────────────────────────────────
    if (job?.status === 'WAITING_FOR_FUNDI_ACCEPTANCE') {
      if (isBuyer === true) {
        return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <LipaHeader title="Job Status" navigation={navigation} onBack={() => navigation.goBack()} />
            <View style={styles.content}>
              <View style={styles.pendingCard}>
                <Text style={styles.pendingIcon}>{'\u23F3'}</Text>
                <Text style={styles.pendingTitle}>Waiting for Fundi to Accept</Text>
                <Text style={styles.pendingDesc}>
                  An SMS with an OTP was sent to the fundi. Once they accept, the job timer starts and your funds are held in escrow.
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Job Details</Text>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.value}>{job.description || '---'}</Text>
                <Text style={styles.label}>Amount Paid</Text>
                <Text style={[styles.value, styles.amount]}>KES {parseFloat(job.totalCharged || job.amount || 0).toFixed(2)}</Text>
                <Text style={styles.label}>Fundi</Text>
                <Text style={styles.value}>{job.fundiPhone || '---'}</Text>
              </View>
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  Funds are securely held. You will be notified when the fundi accepts the job.
                </Text>
              </View>
            </View>
        </ScrollView>
        );
      }
      return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <LipaHeader title="Accept Job" navigation={navigation} onBack={() => navigation.goBack()} />
          <View style={styles.content}>
            <View style={styles.pendingCard}>
              <Text style={styles.pendingIcon}>{'\uD83D\uDCE8'}</Text>
              <Text style={styles.pendingTitle}>Job Waiting for Your Acceptance</Text>
              <Text style={styles.pendingDesc}>
                You received an SMS with a 4-digit OTP. Enter it below to accept this job and start the timer.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Job Details</Text>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.value}>{job.description || '---'}</Text>
              <Text style={styles.label}>You Will Receive</Text>
              <Text style={[styles.value, styles.amount]}>
                KES {parseFloat(job.fundiReceives || job.amount || 0).toFixed(2)}
              </Text>
              <Text style={styles.label}>Duration</Text>
              <Text style={styles.value}>{job.durationHours}h to complete</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Enter OTP from SMS</Text>
              <TextInput
                style={styles.otpInput}
                value={otp}
                onChangeText={setOtp}
                placeholder="Enter 4-digit OTP"
                placeholderTextColor={colors.grayDark}
                keyboardType="number-pad"
                maxLength={6}
              />
              {accepting
                ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
                : <LipaButton title="Accept Job" onPress={handleAccept} />
              }
            </View>
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                OTP expires 30 minutes after it was sent. If expired, ask the buyer to resend.
              </Text>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      );
    }


    // ── AWAITING_BUYER_REVIEW ─────────────────────────────────────────────
    if (job?.status === 'AWAITING_BUYER_REVIEW' && isBuyer === true) {
      return null;
    }


    // ── AWAITING_BUYER_REVIEW ─────────────────────────────────────────────
    if (job?.status === 'AWAITING_BUYER_REVIEW' && isBuyer === true) {
      return null;
    }

    // ── ACTIVE / OVERDUE ──────────────────────────────────────────────────
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <LipaHeader title="Fundi Job" navigation={navigation} onBack={() => navigation.goBack()} />
        <View style={styles.content}>

          {isBuyer === true && (
            <>
              <View style={[styles.timerCard, isOverdue && styles.timerOverdue]}>
                <Text style={styles.timerLabel}>{isOverdue ? 'Job Overdue' : 'Time Remaining'}</Text>
                <Text style={[styles.timerValue, isOverdue && styles.timerValueOverdue]}>
                  {timeLeft || '--:--:--'}
                </Text>
                {!isOverdue && <Text style={styles.timerSub}>Fundi is working on your job</Text>}
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Job Details</Text>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.value}>{job?.description || '---'}</Text>
                <Text style={styles.label}>Amount Paid</Text>
                <Text style={[styles.value, styles.amount]}>
                  KES {parseFloat(job?.totalCharged || job?.amount || 0).toFixed(2)}
                </Text>
                <Text style={styles.label}>Fundi</Text>
                <Text style={styles.value}>{job?.fundiPhone || '---'}</Text>
                <Text style={styles.label}>Status</Text>
                <Text style={[styles.value, { color: isOverdue ? '#EF4444' : '#16A34A' }]}>
                  {isOverdue ? 'Overdue - contact fundi' : 'In Progress'}
                </Text>
              </View>
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  Funds are held in escrow. You will be notified when the fundi marks the job done so you can inspect the work.
                </Text>
              </View>

              {job?.extensionRequestStatus === 'PENDING' && job?.extensionRequests?.[0] && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Extension Requested</Text>
                  <Text style={styles.label}>Extra Time Needed</Text>
                  <Text style={styles.value}>{job.extensionRequests[0].extraHours}h</Text>
                  <Text style={[styles.label, { marginTop: 16 }]}>Fundi's Reason</Text>
                  <Text style={styles.value}>{job.extensionRequests[0].reason}</Text>
                  {job.extensionRequests[0].evidencePhotos?.length > 0 && (
                    <>
                      <Text style={[styles.label, { marginTop: 16 }]}>Progress Photos</Text>
                      <Text style={styles.photoHint}>Tap a photo to enlarge</Text>
                      <FlatList
                        data={job.extensionRequests[0].evidencePhotos}
                        horizontal
                        keyExtractor={(_, i) => i.toString()}
                        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                        renderItem={({ item }) => (
                          <Pressable onPress={() => setViewerUri(item)}>
                            <Image source={{ uri: item }} style={styles.photoLarge} />
                          </Pressable>
                        )}
                      />
                    </>
                  )}
                  {respondingExtension
                    ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
                    : (
                      <View style={{ marginTop: 16 }}>
                        <LipaButton title="Approve Extension" onPress={() => handleExtensionDecision('APPROVED')} />
                        <LipaButton
                          title="Reject & Open Dispute"
                          onPress={() => handleExtensionDecision('REJECTED')}
                          style={{ backgroundColor: colors.error }}
                        />
                      </View>
                    )
                  }
                  <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
                    <Pressable
                      style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => setViewerUri(null)}
                    >
                      <Image
                        source={{ uri: viewerUri }}
                        style={{ width: '90%', height: '70%', borderRadius: 8 }}
                        resizeMode="contain"
                      />
                      <Text style={{ color: 'white', marginTop: 16, fontSize: 13 }}>Tap anywhere to close</Text>
                    </Pressable>
                  </Modal>
                </View>
              )}
            </>
          )}

          {isBuyer === false && (
            <>
              <View style={[styles.timerCard, isOverdue && styles.timerOverdue]}>
                <Text style={styles.timerLabel}>{isOverdue ? 'Job Overdue' : 'Time Remaining'}</Text>
                <Text style={[styles.timerValue, isOverdue && styles.timerValueOverdue]}>
                  {timeLeft || '--:--:--'}
                </Text>
                {!isOverdue && <Text style={styles.timerSub}>Complete job before timer expires</Text>}
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Job Details</Text>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.value}>{job?.description || '---'}</Text>
                <Text style={styles.label}>You Receive</Text>
                <Text style={[styles.value, styles.amount]}>
                  KES {parseFloat(job?.fundiReceives || job?.amount || 0).toFixed(2)}
                </Text>
              </View>
              {!isOverdue && (
                <>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>After Photos</Text>
                    <Text style={styles.photoHint}>Upload photos showing completed work (required)</Text>
                    <TouchableOpacity style={styles.photoBtn} onPress={pickPhotos}>
                      <Text style={styles.photoBtnText}>+ Add After Photos</Text>
                    </TouchableOpacity>
                    {afterPhotos.length > 0 && (
                      <FlatList
                        data={afterPhotos}
                        horizontal
                        keyExtractor={(_, i) => i.toString()}
                        renderItem={({ item, index }) => (
                          <View style={styles.photoWrapper}>
                            <Pressable onPress={() => setViewerUri(item.uri)}>
                              <Image source={{ uri: item.uri }} style={styles.photo} />
                            </Pressable>
                            <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(index)}>
                              <Text style={styles.removePhotoText}>X</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      />
                    )}
                  </View>
                  {loading
                    ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
                    : <LipaButton
                        title={afterPhotos.length === 0 ? 'Upload Photos First' : 'Mark Job Done'}
                        onPress={handleJobDone}
                        disabled={afterPhotos.length === 0}
                      />
                  }
                </>
              )}

              {isOverdue && job?.extensionRequestStatus === 'PENDING' && (
                <View style={styles.warningCard}>
                  <Text style={styles.warningText}>
                    Extension request sent. Waiting for buyer to respond — you'll be notified once they decide.
                  </Text>
                </View>
              )}

              {isOverdue && job?.extensionRequestStatus !== 'PENDING' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Request More Time</Text>
                  <Text style={styles.photoHint}>
                    This job is overdue — you can no longer submit after photos. Request extra hours from the buyer instead.
                  </Text>
                  <Text style={styles.label}>Extra Hours Needed</Text>
                  <TextInput
                    style={styles.extensionInput}
                    value={extraHours}
                    onChangeText={setExtraHours}
                    placeholder="e.g. 2"
                    placeholderTextColor={colors.grayDark}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.label}>Reason for Delay</Text>
                  <TextInput
                    style={[styles.extensionInput, { height: 80, textAlignVertical: 'top' }]}
                    value={extensionReason}
                    onChangeText={setExtensionReason}
                    placeholder="Explain briefly why you need more time"
                    placeholderTextColor={colors.grayDark}
                    multiline
                  />
                  <Text style={styles.photoHint}>Progress photos (at least 1, required)</Text>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickExtensionPhotos}>
                    <Text style={styles.photoBtnText}>+ Add Progress Photos</Text>
                  </TouchableOpacity>
                  {extensionPhotos.length > 0 && (
                    <FlatList
                      data={extensionPhotos}
                      horizontal
                      keyExtractor={(_, i) => i.toString()}
                      renderItem={({ item, index }) => (
                        <View style={styles.photoWrapper}>
                          <Pressable onPress={() => setViewerUri(item.uri)}>
                            <Image source={{ uri: item.uri }} style={styles.photo} />
                          </Pressable>
                          <TouchableOpacity style={styles.removePhoto} onPress={() => removeExtensionPhoto(index)}>
                            <Text style={styles.removePhotoText}>X</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  )}
                  {submittingExtension
                    ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
                    : <LipaButton title="Send Extension Request" onPress={submitExtensionRequest} />
                  }
                </View>
              )}

              <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
                <Pressable
                  style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setViewerUri(null)}
                >
                  <Image
                    source={{ uri: viewerUri }}
                    style={{ width: '90%', height: '70%', borderRadius: 8 }}
                    resizeMode="contain"
                  />
                  <Text style={{ color: 'white', marginTop: 16, fontSize: 13 }}>Tap anywhere to close</Text>
                </Pressable>
              </Modal>
            </>
          )}

          {isBuyer === null && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          )}

        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }


const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.gray },
  content:            { padding: 20 },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pendingCard:        { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  pendingIcon:        { fontSize: 40, marginBottom: 12 },
  pendingTitle:       { fontSize: 17, fontWeight: '700', color: '#3730A3', textAlign: 'center', marginBottom: 8 },
  pendingDesc:        { fontSize: 13, color: '#4338CA', textAlign: 'center', lineHeight: 20 },
  timerCard:          { backgroundColor: colors.primary, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  timerOverdue:       { backgroundColor: '#EF4444' },
  timerLabel:         { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  timerValue:         { fontSize: 44, fontWeight: 'bold', color: colors.white, marginVertical: 8, letterSpacing: 2 },
  timerValueOverdue:  { fontSize: 28 },
  timerSub:           { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  card:               { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 16 },
  cardTitle:          { fontSize: 16, fontWeight: '700', color: colors.black, marginBottom: 12 },
  label:              { fontSize: 12, color: colors.grayDark, marginTop: 8 },
  value:              { fontSize: 15, fontWeight: '600', color: colors.black, marginTop: 2 },
  amount:             { color: colors.primary, fontSize: 18 },
  otpInput:           { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, padding: 16, fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center', color: colors.black, marginVertical: 16 },
  extensionInput:     { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, padding: 14, fontSize: 15, fontWeight: '400', textAlign: 'left', color: colors.black, marginVertical: 10 },
  warningCard:        { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 16 },
  warningText:        { fontSize: 13, color: '#92400E', lineHeight: 20 },
  photoHint:          { fontSize: 12, color: colors.grayDark, marginBottom: 10 },
  photoBtn:           { borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  photoBtnText:       { color: colors.primary, fontWeight: '600', fontSize: 15 },
  photoWrapper:       { marginRight: 10, position: 'relative' },
  photo:              { width: 80, height: 80, borderRadius: 8 },
  photoLarge:         { width: 100, height: 100, borderRadius: 10, marginRight: 4 },
  removePhoto:        { position: 'absolute', top: -6, right: -6, backgroundColor: 'red', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  removePhotoText:    { color: 'white', fontSize: 10, fontWeight: 'bold' },
});
