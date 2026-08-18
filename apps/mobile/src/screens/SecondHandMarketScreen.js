import React, { useState, useRef } from "react";
import { calcFeesGeneric, PLATFORM_RATE } from "../utils/feeCalculator";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "../theme/colors";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import LipaHeader from "../components/LipaHeader";
import LipaInput from "../components/LipaInput";
import LipaButton from "../components/LipaButton";
import { useLang } from "../context/LanguageContext";
import { BASE_URL } from "../utils/api";

const CONDITION_OPTIONS = [
  { label: "New", value: "new", desc: "Unused, sealed" },
  { label: "Like New", value: "like_new", desc: "Opened, barely used" },
  { label: "Refurbished", value: "refurbished", desc: "Restored, works fully" },
  { label: "Good", value: "good", desc: "Used, minor wear" },
  { label: "Fair", value: "fair", desc: "Visible wear, works" },
  { label: "Faulty", value: "faulty", desc: "Issues, sold as-is" },
];

// ── Kenyan phone validator ─────────────────────────────────────────────────
const isValidKenyanPhone = (phone) =>
  /^(?:254|\+254|0)?[17]\d{8}$/.test(phone.replace(/\s/g, ""));

// ── Lightweight idempotency key (no uuid dep needed) ───────────────────────
const genClientRef = () =>
  `sh_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

export default function SecondHandMarketScreen({ navigation }) {
  const { t } = useLang();

  // ── Prevent double-tap → double STK push ──────────────────────────────
  const submitting = useRef(false);

  const [itemTitle, setItemTitle] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerTill, setSellerTill] = useState("");
  const [method, setMethod] = useState("pochi");
  const [amount, setAmount] = useState("");
  const [condition, setCondition] = useState(null);
  const [inspectionDeadline, setInspectionDeadline] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker,      setShowDatePicker]      = useState(false);
  const [showTimePicker,      setShowTimePicker]      = useState(false);
  const [pickerMode,          setPickerMode]          = useState('date');

  const onInspectionDeadlineChange = (event, selectedDate) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      setShowTimePicker(false);
      return;
    }
    const current = selectedDate || inspectionDeadline;
    setShowDatePicker(false);
    setShowTimePicker(false);

    if (pickerMode === 'date') {
      const updated = new Date(inspectionDeadline);
      updated.setFullYear(current.getFullYear(), current.getMonth(), current.getDate());
      setInspectionDeadline(updated);
      setPickerMode('time');
      setShowTimePicker(true);
    } else {
      const updated = new Date(inspectionDeadline);
      updated.setHours(current.getHours(), current.getMinutes());
      setInspectionDeadline(updated);
    }
  };

  const formatInspectionDeadline = (date) =>
    date.toLocaleString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

  const inspectionWindow = Math.min(
    Math.max(Math.ceil((inspectionDeadline.getTime() - Date.now()) / (60 * 60 * 1000)), 1),
    168
  );
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]);
  const [viewerUri, setViewerUri] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(null);

  // ── Photo helpers ──────────────────────────────────────────────────────
  const pickImage = async () => {
    if (photos.length >= 3) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length > 0)
      setPhotos([...photos, result.assets[0].uri]);
  };

  const takePhoto = async () => {
    if (photos.length >= 3) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length > 0)
      setPhotos([...photos, result.assets[0].uri]);
  };

  const removePhoto = (index) =>
    setPhotos(photos.filter((_, i) => i !== index));

  // ── Validation + navigation ────────────────────────────────────────────
  const next = async () => {
    // Double-tap guard
    if (submitting.current) return;

    // Amount validation
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount < 1) {
      Alert.alert("Invalid Amount", "Enter a valid amount.");
      return;
    }

    // Phone validation (pochi)
    if (method === "pochi" && !isValidKenyanPhone(sellerPhone)) {
      Alert.alert(
        "Invalid Phone",
        "Enter a valid Kenyan phone number for the seller.",
      );
      return;
    }

    // Till validation
    if (method === "till" && !/^\d{4,10}$/.test(sellerTill.trim())) {
      Alert.alert("Invalid Till", "Enter a valid till number (4–10 digits).");
      return;
    }

    submitting.current = true;

    const clientRef = genClientRef();

    const { platformFee, b2cCost, buyerTotal } = calcFeesGeneric(parsedAmount);
    const fee = platformFee.toFixed(2);
    const b2cFee = b2cCost.toFixed(2);
    const total = buyerTotal.toFixed(2);
    const phoneToCheck = method === "pochi" ? sellerPhone.trim() : null;
    let resolvedName = null;
    if (phoneToCheck) {
      try {
        const { authFetch } = require("../utils/api");
        const r = await authFetch(`/user/resolve-phone?phone=${phoneToCheck}`);
        const d = await r.json();
        resolvedName = d.found ? d.name : null;
      } catch {}
    }
    const target = method === "pochi"
      ? (resolvedName ? `${resolvedName} (${sellerPhone.trim()})` : sellerPhone.trim())
      : `Till ${sellerTill.trim()}`;

    Alert.alert(
      "Confirm Deal",
      `Item: ${itemTitle}
To: ${target}
Amount: KES ${parsedAmount.toFixed(2)}
Fee (2%): KES ${fee}
M-Pesa charge: KES ${b2cFee}
Total you pay: KES ${total}
Inspection: ${inspectionWindow}h (starts after a 30-min payment grace period)`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            submitting.current = false;
          },
        },
        {
          text: "Pay Now",
          onPress: async () => {
            let photoUrls = [];
            if (photos.length > 0) {
              try {
                setLoadingMsg("Uploading photos...");
                const { getAccessToken } = require("../utils/secureStorage");
                const token = await getAccessToken();
                const form = new FormData();
                photos.forEach((uri, i) => {
                  const ext = uri.split(".").pop() || "jpg";
                  form.append("photos", {
                    uri,
                    name: `photo_${i}.${ext}`,
                    type: `image/${ext}`,
                  });
                });
                const res = await fetch(
                  `${BASE_URL}/second-hand/upload-photos`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: form,
                  },
                );
                const data = await res.json();
                if (!res.ok || !data.urls)
                  throw new Error(data.message || "Upload failed");
                photoUrls = data.urls;
              } catch (err) {
                setLoadingMsg(null);
                Alert.alert(
                  "Photo Upload Failed",
                  err.message ||
                    "Could not upload photos. Proceeding without them.",
                );
              }
            }
            setLoadingMsg("Preparing payment...");
            setTimeout(() => setLoadingMsg(null), 3000);
            navigation.navigate("PaymentProcessing", {
              service: "Second Hand",
              category: "second_hand",
              itemTitle,
              sellerPhone: method === "pochi" ? sellerPhone.trim() : undefined,
              sellerTill: method === "till" ? sellerTill.trim() : undefined,
              notifyPhone: method === "till" ? sellerPhone.trim() : undefined,
              method,
              amount: parsedAmount,
              condition,
              inspectionHours: inspectionWindow,
              description: note,
              clientRef,
              photoUrls,
            });
            setTimeout(() => {
              submitting.current = false;
            }, 3000);
          },
        },
      ],
    );
  };

  const valid =
    itemTitle.trim() &&
    amount &&
    condition &&
    inspectionWindow &&
    (method === "pochi" ? sellerPhone.trim() : sellerTill.trim());

  return (
    <View style={styles.container}>
      <LipaHeader
        title={t.secondhand || "Second Hand Lipasafe"}
        navigation={navigation}
        onBack={() => navigation.navigate("HomeTab")}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Item Details */}
        <LipaInput
          label="Item Title *"
          value={itemTitle}
          onChangeText={setItemTitle}
          placeholder="e.g. Samsung Galaxy A05 128GB"
        />

        {/* Payment Method Toggle */}
        <Text style={styles.label}>Payment Method *</Text>
        <View style={styles.row}>
          {["pochi", "till"].map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, method === m && styles.chipActive]}
              onPress={() => setMethod(m)}
            >
              <Text
                style={[styles.chipText, method === m && styles.chipTextActive]}
              >
                {m === "pochi" ? "Pochi / Phone" : "Till Number"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Seller Phone — always shown (notification target) */}
        <LipaInput
          label={
            method === "pochi"
              ? "Seller Phone Number *"
              : "Seller Phone (for SMS notification) *"
          }
          value={sellerPhone}
          onChangeText={setSellerPhone}
          placeholder="07XXXXXXXX"
          keyboardType="phone-pad"
        />

        {/* Till Number — only when till selected */}
        {method === "till" && (
          <LipaInput
            label="Seller Till Number *"
            value={sellerTill}
            onChangeText={setSellerTill}
            placeholder="e.g. 123456"
            keyboardType="number-pad"
          />
        )}

        <LipaInput
          label={t.amount || "Amount (KES) *"}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        {/* Condition Selector */}
        <Text style={styles.label}>Item Condition *</Text>
        <Text style={styles.hint}>
          This locks the dispute baseline. Be honest.
        </Text>
        <View style={styles.condWrap}>
          {CONDITION_OPTIONS.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[
                styles.condChip,
                condition === c.value && styles.condChipActive,
              ]}
              onPress={() => setCondition(c.value)}
            >
              <Text
                style={[
                  styles.condLabel,
                  condition === c.value && styles.condLabelActive,
                ]}
              >
                {c.label}
              </Text>
              <Text
                style={[
                  styles.condDesc,
                  condition === c.value && styles.condDescActive,
                ]}
              >
                {c.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Inspection Window */}
        <Text style={styles.label}>Inspection Window *</Text>
        <Text style={styles.hint}>
          How long buyer has to raise a dispute after receiving the item.
        </Text>
        <TouchableOpacity
          style={styles.chip}
          activeOpacity={0.8}
          onPress={() => {
            setPickerMode('date');
            setShowDatePicker(true);
          }}
        >
          <Text style={styles.chipText}>
            {formatInspectionDeadline(inspectionDeadline)}
          </Text>
        </TouchableOpacity>
        {(showDatePicker || showTimePicker) && (
          <DateTimePicker
            value={inspectionDeadline}
            mode={pickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date(Date.now() + 60 * 60 * 1000)}
            maximumDate={new Date(Date.now() + 168 * 60 * 60 * 1000)}
            onChange={onInspectionDeadlineChange}
          />
        )}

        <LipaInput
          label="Notes (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Any deal details both parties agreed on"
          multiline
        />

        {/* Condition Photos */}
        <Text style={styles.label}>Condition Photos ({photos.length}/3)</Text>
        <Text style={styles.hint}>
          Capture item state now. Used as dispute evidence baseline.
        </Text>
        <View style={styles.photoRow}>
          {photos.map((uri, index) => (
            <View key={index} style={styles.thumbWrap}>
              <Pressable onPress={() => setViewerUri(uri)}>
                <Image source={{ uri }} style={styles.thumb} />
              </Pressable>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removePhoto(index)}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.error || "#FF3B30"}
                />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 3 && (
            <View style={styles.addPhotoCol}>
              <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                <Ionicons
                  name="camera-outline"
                  size={24}
                  color={colors.primary}
                />
                <Text style={styles.photoBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                <Ionicons
                  name="images-outline"
                  size={24}
                  color={colors.primary}
                />
                <Text style={styles.photoBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
        <LipaButton
          title={t.continue || "Start Lipasafe"}
          onPress={next}
          disabled={!valid}
        />
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={!!loadingMsg} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.overlayText}>{loadingMsg}</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.9)",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => setViewerUri(null)}
        >
          <Image
            source={{ uri: viewerUri }}
            style={{ width: "90%", height: "70%", borderRadius: 8 }}
            resizeMode="contain"
          />
          <Text style={{ color: "white", marginTop: 16, fontSize: 13 }}>
            Tap anywhere to close
          </Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { padding: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.black,
    marginBottom: 6,
    marginTop: 12,
  },
  hint: { fontSize: 12, color: colors.grayDark, marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.grayDark + "40",
    backgroundColor: colors.gray,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.black },
  chipTextActive: { color: colors.white },
  condWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  condChip: {
    width: "47%",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.grayDark + "30",
    backgroundColor: colors.gray,
  },
  condChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  condLabel: { fontSize: 13, fontWeight: "700", color: colors.black },
  condLabelActive: { color: colors.white },
  condDesc: { fontSize: 11, color: colors.grayDark, marginTop: 2 },
  condDescActive: { color: "rgba(255,255,255,0.85)" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumbWrap: {
    position: "relative",
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: "hidden",
  },
  thumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: colors.gray,
  },
  removeBtn: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: colors.white,
    borderRadius: 10,
  },
  addPhotoCol: { flexDirection: "column", gap: 8 },
  photoBtn: {
    width: 90,
    height: 41,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    backgroundColor: colors.primary + "10",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  photoBtnText: { fontSize: 11, color: colors.primary, fontWeight: "600" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
  },
  overlayText: { fontSize: 15, fontWeight: "600", color: "#111", marginTop: 8 },
});
