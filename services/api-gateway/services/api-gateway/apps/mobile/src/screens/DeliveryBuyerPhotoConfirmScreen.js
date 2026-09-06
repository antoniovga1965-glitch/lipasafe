import React, { useState, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, Modal, FlatList,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity,
  Linking, Dimensions, Platform, StatusBar
} from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

const { width: SCREEN_W } = Dimensions.get('window');
const GREEN = '#1a9e5c';

export default function DeliveryBuyerPhotoConfirmScreen({ navigation, route }) {
  const { orderId, photoUrls, photoUrl, goods, amount, deliveryPhone } = route.params || {};

  // backward compat — old nav passes single photoUrl
  const photos = photoUrls?.length ? photoUrls : (photoUrl ? [photoUrl] : []);

  const [loading,        setLoading]        = useState(false);
  const [activeIndex,    setActiveIndex]    = useState(0);
  const [modalVisible,   setModalVisible]   = useState(false);
  const [modalIndex,     setModalIndex]     = useState(0);
  const galleryRef  = useRef(null);
  const modalRef    = useRef(null);

  // ── swipe helpers ────────────────────────────────────────────────────────
  const onScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(idx);
  };

  const openModal = (i) => { setModalIndex(i); setModalVisible(true); };

  // ── confirm / reject ─────────────────────────────────────────────────────
  const respond = async (confirmed) => {
    try {
      setLoading(true);
      const res  = await authFetch('/delivery/confirm-before-photo', {
        method: 'POST',
        body:   JSON.stringify({ orderId, confirmed }),
      });
      const data = await res.json();
      if (data.success) {
        if (confirmed) {
          Alert.alert(
            'Photo Confirmed',
            'OTP has been sent to the delivery guy. Delivery will begin once they enter it.',
            [{ text: 'OK', onPress: () => navigation.navigate('HomeTab') }]
          );
        } else {
          Alert.alert(
            'Photo Rejected',
            'The delivery guy has been notified to upload a new photo.',
            [{ text: 'OK', onPress: () => navigation.navigate('HomeTab') }]
          );
        }
      } else {
        Alert.alert('Error', data.message || 'Something went wrong.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmReject = () => {
    Alert.alert(
      'Reject Photo?',
      'The delivery guy will have to upload new photos before proceeding.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => respond(false) },
      ]
    );
  };

  // ── render single gallery slide ──────────────────────────────────────────
  const renderSlide = ({ item, index }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.slide}
      onPress={() => openModal(index)}
    >
      <Image source={{ uri: item }} style={styles.slideImg} resizeMode="cover" />
      <View style={styles.slideTap}>
        <Text style={styles.slideTapText}> Tap to view full screen</Text>
      </View>
    </TouchableOpacity>
  );

  // ── dot indicators ───────────────────────────────────────────────────────
  const Dots = () => (
    <View style={styles.dotsRow}>
      {photos.map((_, i) => (
        <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Confirm BEFORE Photos" navigation={navigation} />
      <View style={styles.content}>

        {/* Info banner */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>👀 Check carefully</Text>
          <Text style={styles.infoText}>
            These photos show the current condition of your goods. Confirm only if
            they match what you ordered — they will be used as evidence if a dispute arises.
          </Text>
        </View>

        {/* Order summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount in Escrow</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
          <Text style={styles.cardLabel}>Delivery Guy</Text>
          <Text style={styles.cardValue}>{deliveryPhone}</Text>
        </View>

        {/* Gallery header */}
        <View style={styles.galleryHeader}>
          <Text style={styles.photoLabel}>BEFORE Photos</Text>
          <Text style={styles.photoCount}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Swipe gallery */}
        {photos.length > 0 ? (
          <>
            <FlatList
              ref={galleryRef}
              data={photos}
              renderItem={renderSlide}
              keyExtractor={(_, i) => i.toString()}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              style={styles.gallery}
            />
            {photos.length > 1 && <Dots />}
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => Linking.openURL(photos[activeIndex])}
            >
              <Text style={styles.downloadBtnText}>⬇  Download Photo {activeIndex + 1}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>🖼️</Text>
            <Text style={styles.photoHint}>No photos available</Text>
          </View>
        )}

        {/* ── Fullscreen modal ─────────────────────────────────────────── */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCloseText}>✕  Close</Text>
            </TouchableOpacity>

            <FlatList
              ref={modalRef}
              data={photos}
              keyExtractor={(_, i) => i.toString()}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={modalIndex}
              getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
              onScroll={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                setModalIndex(i);
              }}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )}
            />

            {/* modal dots */}
            {photos.length > 1 && (
              <View style={styles.dotsRow}>
                {photos.map((_, i) => (
                  <View key={i} style={[styles.dot, styles.dotLight, i === modalIndex && styles.dotActiveLight]} />
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.modalDownloadBtn}
              onPress={() => Linking.openURL(photos[modalIndex])}
            >
              <Text style={styles.modalDownloadText}>⬇  Download</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {loading && <ActivityIndicator style={{ marginVertical: 16 }} color={GREEN} />}

        <LipaButton
          title={loading ? 'Processing...' : 'Yes, This Is Correct'}
          onPress={() => respond(true)}
          disabled={loading}
        />

        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={confirmReject}
          disabled={loading}
        >
          <Text style={styles.rejectText}>No, Reject These Photos</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#ffffff' },
  content:      { padding: 20 },

  infoBox:      { backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  infoTitle:    { fontWeight: '700', fontSize: 14, color: '#92400e', marginBottom: 6 },
  infoText:     { fontSize: 13, color: '#92400e', lineHeight: 20 },

  card:         { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 20 },
  cardLabel:    { fontSize: 12, color: '#666', marginTop: 10 },
  cardValue:    { fontSize: 15, fontWeight: '600', color: '#000', marginTop: 2 },
  amount:       { fontSize: 18, color: GREEN },

  galleryHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  photoLabel:   { fontSize: 14, fontWeight: '700', color: '#000' },
  photoCount:   { fontSize: 13, color: GREEN, fontWeight: '600' },

  // swipe gallery
  gallery:      { width: SCREEN_W - 40, height: 300, borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  slide:        { width: SCREEN_W - 40, height: 300, borderRadius: 16, overflow: 'hidden' },
  slideImg:     { width: '100%', height: '100%' },
  slideTap:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)', paddingVertical: 8, alignItems: 'center' },
  slideTapText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // dots
  dotsRow:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 12 },
  dot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ccc' },
  dotActive:    { backgroundColor: GREEN, width: 18 },
  dotLight:     { backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActiveLight:{ backgroundColor: '#fff', width: 18 },

  downloadBtn:  { alignSelf: 'center', marginBottom: 20, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: GREEN },
  downloadBtnText: { color: GREEN, fontSize: 13, fontWeight: '600' },

  photoPlaceholder: { width: '100%', height: 300, borderRadius: 16, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  photoIcon:    { fontSize: 48, marginBottom: 8 },
  photoHint:    { fontSize: 14, color: '#999' },

  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalClose:   { position: 'absolute', top: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 52, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, zIndex: 10 },
  modalCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalImage:   { width: SCREEN_W, height: '72%' },
  modalDownloadBtn: { marginTop: 24, backgroundColor: GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 26 },
  modalDownloadText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  rejectBtn:    { marginTop: 12, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e53e3e' },
  rejectText:   { color: '#e53e3e', fontWeight: '600', fontSize: 15 },
});
