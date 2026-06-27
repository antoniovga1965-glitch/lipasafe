import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, FlatList, Alert, ActivityIndicator, TextInput, Modal, Dimensions
} from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

export default function FundiReviewScreen({ navigation, route }) {
  const { jobId, job: seedJob } = route.params || {};

  const [job, setJob]             = useState(seedJob || null);
  const [fetching, setFetching]   = useState(!seedJob);
  const [loading, setLoading]     = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason]       = useState('');
  const [description, setDescription] = useState('');
  const [error, setError]         = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // Fetch fresh job data on mount — never trust stale params
  const fetchJob = useCallback(async () => {
    const id = jobId || seedJob?.id;
    if (!id) { setError('No job ID provided'); setFetching(false); return; }
    try {
      setFetching(true);
      const res  = await authFetch(`/fundi/${id}`);
      const data = await res.json();
      if (data.success && data.job) {
        setJob(data.job);
        setError(null);
      } else {
        setError(data.message || 'Could not load job');
      }
    } catch (e) {
      setError('Network error. Check connection.');
    } finally {
      setFetching(false);
    }
  }, [jobId, seedJob?.id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  const handleApprove = () => {
    Alert.alert(
      'Release Funds?',
      `KES ${parseFloat(job?.amount || 0).toFixed(2)} will be released to the fundi. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Release', onPress: submitApprove },
      ]
    );
  };

  const submitApprove = async () => {
    try {
      setLoading(true);
      const res  = await authFetch(`/fundi/${job.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        Alert.alert(' Done!', 'Funds released to fundi.');
        navigation.navigate('HomeTab');
      } else {
        Alert.alert('Error', data.message || 'Could not approve.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitDispute = async () => {
    if (!reason.trim()) {
      Alert.alert('Required', 'Please enter a reason for the dispute.');
      return;
    }
    try {
      setDisputing(true);
      const res  = await authFetch(`/fundi/${job.id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ reason, description }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Dispute Opened', 'Admin will review within 24 hours. Funds are held safe.');
        navigation.navigate('HomeTab');
      } else {
        Alert.alert('Error', data.message || 'Could not open dispute.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed. Try again.');
    } finally {
      setDisputing(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────
  if (fetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Job not found'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchJob}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Review Job" navigation={navigation} onBack={() => navigation.goBack()} />
      <View style={styles.content}>

        {/* Job Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Details</Text>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.value}>{job.description || '—'}</Text>
          <Text style={styles.label}>Amount</Text>
          <Text style={[styles.value, styles.amount]}>KES {parseFloat(job.amount || 0).toFixed(2)}</Text>
          <Text style={styles.label}>Completed At</Text>
          <Text style={styles.value}>
            {job.completedAt ? new Date(job.completedAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : '—'}
          </Text>
        </View>

        {/* Before Photos */}
        {job.beforePhotos?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Before Photos</Text>
            <FlatList
              data={job.beforePhotos}
              horizontal
              keyExtractor={(_, i) => `before-${i}`}
              renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelectedImage(item)}>
                <Image source={{ uri: item }} style={styles.photo} />
              </TouchableOpacity>
            )}
            />
          </View>
        )}

        {/* After Photos */}
        {job.afterPhotos?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>After Photos</Text>
            <FlatList
              data={job.afterPhotos}
              horizontal
              keyExtractor={(_, i) => `after-${i}`}
              renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelectedImage(item)}>
                <Image source={{ uri: item }} style={styles.photo} />
              </TouchableOpacity>
            )}
            />
          </View>
        )}

        {/* Inspection deadline warning */}
        {job.inspectionDeadlineAt && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              ⏱ Auto-release at{' '}
              {new Date(job.inspectionDeadlineAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
              {' '}if no action taken.
            </Text>
          </View>
        )}

        {/* Approve */}
        {!showDispute && (
          loading
            ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            : <LipaButton title="✓ Approve & Release Funds" onPress={handleApprove} />
        )}

        {/* Dispute toggle */}
        {!showDispute && (
          <TouchableOpacity style={styles.disputeBtn} onPress={() => setShowDispute(true)}>
            <Text style={styles.disputeBtnText}>⚠ Open Dispute</Text>
          </TouchableOpacity>
        )}

        {/* Dispute form */}
        {showDispute && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Open Dispute</Text>
            <Text style={styles.label}>Reason *</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Work not completed as agreed"
              placeholderTextColor={colors.grayDark}
            />
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the issue in detail..."
              placeholderTextColor={colors.grayDark}
              multiline
              numberOfLines={4}
            />
            {disputing
              ? <ActivityIndicator color={colors.error || '#e53e3e'} style={{ marginTop: 16 }} />
              : (
                <>
                  <TouchableOpacity style={styles.submitDispute} onPress={submitDispute}>
                    <Text style={styles.submitDisputeText}>Submit Dispute</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelDispute} onPress={() => setShowDispute(false)}>
                    <Text style={styles.cancelDisputeText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )
            }
          </View>
        )}

        </View>
      </ScrollView>

    {/* Fullscreen Image Viewer */}
    <Modal
      visible={!!selectedImage}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setSelectedImage(null)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={1}
        onPress={() => setSelectedImage(null)}
      >
        <Image
          source={{ uri: selectedImage }}
          style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.8 }}
          resizeMode="contain"
        />
        <Text style={{ color: '#fff', marginTop: 16, opacity: 0.6 }}>Tap anywhere to close</Text>
      </TouchableOpacity>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: colors.gray },
  content:           { padding: 20 },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingText:       { marginTop: 12, color: colors.grayDark, fontSize: 14 },
  errorText:         { fontSize: 15, color: colors.error || '#e53e3e', textAlign: 'center', marginBottom: 16 },
  retryBtn:          { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryText:         { color: colors.white, fontWeight: '600' },
  card:              { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 16 },
  cardTitle:         { fontSize: 16, fontWeight: '700', color: colors.black, marginBottom: 12 },
  label:             { fontSize: 12, color: colors.grayDark, marginTop: 8 },
  value:             { fontSize: 15, fontWeight: '600', color: colors.black, marginTop: 2 },
  amount:            { color: colors.primary, fontSize: 18 },
  photo:             { width: 100, height: 100, borderRadius: 10, marginRight: 10 },
  warningCard:       { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 16 },
  warningText:       { fontSize: 13, color: '#92400E', lineHeight: 20 },
  disputeBtn:        { marginTop: 12, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: colors.error || '#e53e3e' },
  disputeBtnText:    { color: colors.error || '#e53e3e', fontWeight: '600', fontSize: 15 },
  input:             { borderWidth: 1, borderColor: colors.border || '#ddd', borderRadius: 10, padding: 12, fontSize: 14, color: colors.black, marginTop: 6 },
  inputMulti:        { height: 100, textAlignVertical: 'top' },
  submitDispute:     { backgroundColor: colors.error || '#e53e3e', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  submitDisputeText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  cancelDispute:     { padding: 14, alignItems: 'center', marginTop: 8 },
  cancelDisputeText: { color: colors.grayDark, fontSize: 14 },
});
