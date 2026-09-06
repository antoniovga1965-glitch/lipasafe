import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Platform, StatusBar, SafeAreaView
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import { authFetch } from '../utils/api';

const MAX_PHOTOS = 5;
const GREEN       = '#1a9e5c';
const GREEN_LIGHT = '#e8f5ee';

export default function DeliveryBeforePhotoScreen({ navigation, route }) {
  const { orderId, deliveryPhone, goods, amount } = route.params || {};
  const [photos, setPhotos]       = useState([]);
  const [uploading, setUploading] = useState(false);

  // ── ALL LOGIC UNCHANGED ───────────────────────────────────────────────────
  const pickPhoto = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", fromCamera
        ? "Camera access is needed." : "Gallery access is needed.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.8, allowsEditing: false,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS,
        });
    if (!result.canceled && result.assets?.length) {
      setPhotos(prev => {
        const combined = [...prev, ...result.assets];
        if (combined.length > MAX_PHOTOS) {
          Alert.alert("Max photos", `Only ${MAX_PHOTOS} photos allowed.`);
          return combined.slice(0, MAX_PHOTOS);
        }
        return combined;
      });
    }
  };

  const showPickerOptions = () => {
    Alert.alert("Add Photo", "Take a clear photo of the goods.", [
      { text: "Use Camera",   onPress: () => pickPhoto(true)  },
      { text: "From Gallery", onPress: () => pickPhoto(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const removePhoto = (index) =>
    setPhotos(prev => prev.filter((_, i) => i !== index));

  const uploadPhotos = async () => {
    if (!photos.length) return;
    try {
      setUploading(true);
      const formData = new FormData();
      photos.forEach((p, i) => {
        formData.append("photos", {
          uri: p.uri, type: "image/jpeg",
          name: `before_${orderId}_${i}_${Date.now()}.jpg`,
        });
      });
      formData.append("orderId",          orderId);
      formData.append("deliveryGuyPhone", deliveryPhone);
      const res  = await authFetch("/delivery/before-photo", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data" },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert("Photos Sent",
          "Your BEFORE photos have been sent to the buyer. Wait for their approval.",
          [{ text: "OK", onPress: () => navigation.navigate("HomeTab") }]);
      } else {
        Alert.alert("Upload Failed", data.message || "Could not upload. Try again.");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setUploading(false);
    }
  };
  // ── END LOGIC ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>&lt;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload BEFORE Photos</Text>
        <View style={styles.shieldBtn}><Text style={styles.shieldIcon}>🛡️</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Order context card */}
        <View style={styles.orderCard}>
          <View style={styles.orderCardRow}>
            <Text style={styles.orderCardLabel}>Goods</Text>
            <Text style={styles.orderCardValue} numberOfLines={2}>{goods || '—'}</Text>
          </View>
          <View style={styles.orderCardDivider} />
          <View style={styles.orderCardRow}>
            <Text style={styles.orderCardLabel}> Escrow Amount</Text>
            <Text style={[styles.orderCardValue, styles.orderCardAmount]}>KES {parseFloat(amount || 0).toLocaleString()}</Text>
          </View>
          <View style={styles.orderCardDivider} />
          <View style={styles.orderCardRow}>
            <Text style={styles.orderCardLabel}> Order ID</Text>
            <Text style={styles.orderCardValue}>#{(orderId || '').slice(-8).toUpperCase()}</Text>
          </View>
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoCamCircle}>
            <Text style={styles.infoCamIcon}>📸</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Why these photos?</Text>
            <Text style={styles.infoText}>
              Photos prove the condition of the goods BEFORE delivery.
              They protect you if a dispute is raised later.
            </Text>
          </View>
        </View>

        {/* Slots header */}
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsLabel}>Add up to {MAX_PHOTOS} photos</Text>
          <Text style={styles.slotsCounter}>{photos.length} / {MAX_PHOTOS} photos</Text>
        </View>
{/* 5 photo slots */}
        <View style={styles.slotsRow}>
          {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
            const p = photos[i];
            return (
              <View key={i} style={styles.slot}>
                {p ? (
                  <>
                    <Image source={{ uri: p.uri }} style={styles.slotImg} />
                    <TouchableOpacity style={styles.slotRemove} onPress={() => removePhoto(i)}>
                      <Text style={styles.slotRemoveX}>✕</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.slotEmpty} onPress={showPickerOptions}>
                    <Text style={styles.slotPlus}>＋</Text>
                    <Text style={styles.slotLabel}>{"Add\nPhoto"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Camera tap area */}
        <TouchableOpacity style={styles.cameraTap} onPress={() => pickPhoto(true)} activeOpacity={0.8}>
          <View style={styles.cameraCircle}>
            <Text style={styles.cameraEmoji}>📷</Text>
          </View>
          <Text style={styles.cameraTitle}>Take or choose photos</Text>
          <Text style={styles.cameraSub}>Tap to open camera or gallery</Text>
          <TouchableOpacity style={styles.galleryBtn} onPress={() => pickPhoto(false)}>
            <Text style={styles.galleryBtnIcon}>🖼️</Text>
            <Text style={styles.galleryBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Tips card */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips for good photos</Text>
          {[
            { icon: "☀️",  text: "Use good lighting"          },
            { icon: "📐",  text: "Capture all angles clearly" },
            { icon: "🔍",  text: "Show any existing defects"  },
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipIcon}>{tip.icon}</Text>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>

        {uploading && <ActivityIndicator style={{ marginVertical: 12 }} color={GREEN} />}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!photos.length || uploading) && styles.submitBtnDisabled]}
          onPress={uploadPhotos}
          disabled={!photos.length || uploading}
        >
          <Text style={styles.submitBtnText}>
            {uploading ? "Sending to Buyer..." : "Submit BEFORE Photos"}
          </Text>
        </TouchableOpacity>

        <View style={styles.secureRow}>
          <Text style={styles.secureIcon}>🛡️</Text>
          <Text style={styles.secureText}>Your photos are secure and only used for dispute protection.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f6fa" },

  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 28) + 8 : 12,
    paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: "#eee", gap: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 10,
    borderWidth: 1, borderColor: "#e0e0e0",
    justifyContent: "center", alignItems: "center", backgroundColor: "#fff",
  },
  backArrow:   { fontSize: 20, color: "#222" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111", textAlign: "center" },
  shieldBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: GREEN, justifyContent: "center", alignItems: "center",
  },
  shieldIcon: { fontSize: 18 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#fff8e1",
    borderRadius: 14, borderLeftWidth: 4, borderLeftColor: "#f59e0b",
    padding: 14, marginBottom: 20,
  },
  infoCamCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#fde68a",
    justifyContent: "center", alignItems: "center",
  },
  infoCamIcon: { fontSize: 22 },
  infoTitle:   { fontWeight: "700", fontSize: 14, color: "#92400e", marginBottom: 4 },
  infoText:    { fontSize: 13, color: "#92400e", lineHeight: 19 },

  slotsHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 10,
  },
  slotsLabel:   { fontSize: 14, fontWeight: "700", color: "#111" },
  slotsCounter: { fontSize: 13, fontWeight: "700", color: GREEN },

  slotsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  slot:     { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: "hidden", position: "relative" },
  slotEmpty: {
    flex: 1, borderWidth: 1.5, borderColor: "#ccc",
    borderStyle: "dashed", borderRadius: 10,
    justifyContent: "center", alignItems: "center", backgroundColor: "#fafafa",
  },
  slotPlus:  { fontSize: 22, color: GREEN, fontWeight: "300" },
  slotLabel: { fontSize: 9, color: "#aaa", textAlign: "center", marginTop: 2 },
  slotImg:   { width: "100%", height: "100%", resizeMode: "cover" },
  slotRemove: {
    position: "absolute", top: 3, right: 3,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 9, width: 18, height: 18,
    justifyContent: "center", alignItems: "center",
  },
  slotRemoveX: { color: "#fff", fontSize: 9, fontWeight: "700" },

  cameraTap: {
    borderWidth: 1.5, borderColor: "#c8e6d6", borderStyle: "dashed",
    borderRadius: 16, padding: 28, alignItems: "center",
    backgroundColor: "#fff", marginBottom: 16,
  },
  cameraCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: GREEN_LIGHT,
    justifyContent: "center", alignItems: "center", marginBottom: 12,
  },
  cameraEmoji: { fontSize: 30 },
  cameraTitle: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 4 },
  cameraSub:   { fontSize: 13, color: "#888", marginBottom: 16 },
  galleryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: GREEN,
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10,
  },
  galleryBtnIcon: { fontSize: 15 },
  galleryBtnText: { fontSize: 14, color: GREEN, fontWeight: "600" },

  tipsCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tipsTitle: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 12 },
  tipRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  tipIcon:   { fontSize: 18 },
  tipText:   { fontSize: 13, color: "#444" },

  submitBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: "center", marginBottom: 12,
  },
  submitBtnDisabled: { backgroundColor: "#a8d5bc" },
  submitBtnText:     { fontSize: 16, fontWeight: "700", color: "#fff" },

  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#e0e0e0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  orderCardRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 4,
  },
  orderCardDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  orderCardLabel:   { fontSize: 13, color: '#888', fontWeight: '500', flex: 1 },
  orderCardValue:   { fontSize: 13, fontWeight: '700', color: '#111', flex: 2, textAlign: 'right' },
  orderCardAmount:  { color: GREEN, fontSize: 15 },
  secureRow: {
    flexDirection: "row", justifyContent: "center",
    alignItems: "center", gap: 5,
  },
  secureIcon: { fontSize: 13 },
  secureText: { fontSize: 12, color: GREEN, fontWeight: "500", flex: 1, textAlign: "center" },
});
