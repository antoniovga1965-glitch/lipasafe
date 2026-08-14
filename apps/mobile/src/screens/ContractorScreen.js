import React, { useState } from "react";
import { calcFee, calcTotal, PLATFORM_RATE, calcFeesFundi } from '../utils/feeCalculator'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import LipaHeader from "../components/LipaHeader";
import LipaInput from "../components/LipaInput";
import LipaButton from "../components/LipaButton";
import { getAccessToken } from "../utils/secureStorage";
import { BASE_URL } from "../utils/api";
import { useLang } from "../context/LanguageContext";
import { colors } from "../theme/colors";
import * as ImagePicker from "expo-image-picker";

const CATEGORIES = [
  'Plumbing', 'Electrical', 'Painting', 'Carpentry',
  'Welding', 'Masonry', 'Tiling', 'Roofing', 'Cleaning', 'Other',
];

export default function ContractorScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const { t } = useLang();

  const [fundiPhone, setFundiPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState("hours");
  const [description, setDescription] = useState("");
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [viewerUri, setViewerUri] = useState(null);
  const [category, setCategory] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [deliverables, setDeliverables] = useState([""]);

  const amountNum = parseFloat(amount) || 0;
  const fundiFees = calcFeesFundi(amountNum);
  const serviceFee = fundiFees.platformFee;
  const transferFee = fundiFees.b2cCost;
  const totalCharged = fundiFees.buyerTotal;

  const addDeliverable = () => {
    if (deliverables.length < 10) setDeliverables([...deliverables, ""]);
  };

  const updateDeliverable = (text, index) => {
    const updated = [...deliverables];
    updated[index] = text;
    setDeliverables(updated);
  };

  const removeDeliverable = (index) => {
    if (deliverables.length === 1) return;
    setDeliverables(deliverables.filter((_, i) => i !== index));
  };

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo access");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setBeforePhotos([...beforePhotos, ...result.assets]);
    }
  };

  const removePhoto = (index) => {
    setBeforePhotos(beforePhotos.filter((_, i) => i !== index));
  };

  const normalizePhone = (phone) => {
    let p = phone.trim().replace(/\s+/g, "");
    if (p.startsWith("+254")) return p.replace("+", "");
    if (p.startsWith("0")) return "254" + p.slice(1);
    if (p.startsWith("254")) return p;
    return null;
  };

  const isValidKenyanPhone = (phone) => {
    const normalized = normalizePhone(phone);
    return normalized && /^2547\d{8}$|^2541\d{8}$/.test(normalized);
  };

  const next = async () => {
    if (!isValidKenyanPhone(fundiPhone)) {
      Alert.alert("Invalid Phone", "Enter a valid Kenyan phone number e.g 0712345678");
      return;
    }
    if (!category) {
      Alert.alert("Category Required", "Please select a job category");
      return;
    }
    if (description.length < 30) {
      Alert.alert("Description Too Short", "Describe the job in at least 30 characters");
      return;
    }
    if (beforePhotos.length === 0) {
      Alert.alert("Photos Required", "Please take before photos as evidence");
      return;
    }

    const durationHours = durationUnit === "days" ? parseInt(duration) * 24 : parseInt(duration);
    const cleanDeliverables = deliverables.filter(d => d.trim().length > 0);

    setLoading(true);
    try {
      const formData = new FormData();
      beforePhotos.forEach((photo, i) => {
        formData.append("photos", {
          uri: photo.uri,
          name: `before_${i}.jpg`,
          type: "image/jpeg",
        });
      });
      const token = await getAccessToken();
      const uploadRes = await fetch(`${BASE_URL}/fundi/upload-photos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        Alert.alert("Upload Failed", uploadData.message || "Could not upload photos");
        return;
      }
      // Network retry — job already exists, resume straight to payment
      if (uploadData.resumed) {
        const j = uploadData;
        navigation.navigate("ConfirmPayment", {
          service:      "Fundi",
          sellerPhone:  normalizePhone(j.fundiPhone || fundiPhone),
          fundiPhone:   normalizePhone(j.fundiPhone || fundiPhone),
          amount,
          description:  j.description  || description,
          durationHours: j.durationHours || durationHours,
          beforePhotos: j.beforePhotos  || [],
          isFundi:      true,
          category:     j.category     || category,
          deliverables: j.deliverables || cleanDeliverables,
        });
        return;
      }
      console.log('[CS] uploadData =', JSON.stringify(uploadData));
      console.log('[CS] jobId being passed =', uploadData.job?.id);
      navigation.navigate("ConfirmPayment", {
        service: "Fundi",
        sellerPhone: normalizePhone(fundiPhone),
        fundiPhone: normalizePhone(fundiPhone),
        amount,
        description,
        durationHours,
        beforePhotos: uploadData.urls,
        isFundi: true,
        category,
        deliverables: cleanDeliverables,
        jobId: uploadData.job?.id,
      });
    } catch (err) {
      Alert.alert("Error", err.message || "Photo upload failed");
    } finally {
      setLoading(false);
    }
  };

  const isReady = fundiPhone && amount && duration && description.length >= 50 && category && beforePhotos.length > 0;

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? 80 : 0}
      >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <LipaHeader title={t.fundi} navigation={navigation} onBack={() => navigation.navigate("HomeTab")} />
        <View style={styles.content}>
          <LipaInput label="Fundi Phone Number" value={fundiPhone} onChangeText={setFundiPhone} placeholder="e.g. 0712345678" keyboardType="phone-pad" />
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity style={styles.categoryBtn} onPress={() => setShowCategoryModal(true)}>
            <Text style={[styles.categoryBtnText, !category && styles.placeholder]}>{category || "Select job category"}</Text>
            <Text style={styles.chevron}>▾</Text>
          </TouchableOpacity>
          <LipaInput label={t.amount} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
          {amountNum > 0 && (
            <View style={styles.feeCard}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Job Amount</Text>
                <Text style={styles.feeValue}>KES {amountNum.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Platform Fee (2%)</Text>
                <Text style={styles.feeValue}>KES {serviceFee.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Transfer Fee (Safaricom)</Text>
                <Text style={styles.feeValue}>KES {transferFee.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={[styles.feeRow, styles.feeTotalRow]}>
                <Text style={styles.feeTotalLabel}>Total Charged</Text>
                <Text style={styles.feeTotalValue}>KES {totalCharged.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          )}
          <Text style={styles.label}>Time to Complete</Text>
          <View style={styles.durationRow}>
            <View style={styles.durationInput}>
              <LipaInput value={duration} onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ""))} placeholder="e.g. 6" keyboardType="number-pad" />
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity style={[styles.unitBtn, durationUnit === "hours" && styles.unitActive]} onPress={() => setDurationUnit("hours")}>
                <Text style={[styles.unitText, durationUnit === "hours" && styles.unitTextActive]}>Hours</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.unitBtn, durationUnit === "days" && styles.unitActive]} onPress={() => setDurationUnit("days")}>
                <Text style={[styles.unitText, durationUnit === "days" && styles.unitTextActive]}>Days</Text>
              </TouchableOpacity>
            </View>
          </View>
          <LipaInput label="Job Description" value={description} onChangeText={(v) => v.length <= 500 && setDescription(v)} placeholder="Describe the work to be done in detail (min 50 chars)" multiline />
          <Text style={[styles.charCount, description.length > 0 && description.length < 50 && styles.charCountWarn]}>{description.length}/500{description.length > 0 && description.length < 50 ? "  (min 50)" : ""}</Text>
          <Text style={styles.label}>Deliverables</Text>
          <Text style={styles.sublabel}>What must be done before payment releases?</Text>
          {deliverables.map((item, index) => (
            <View key={index} style={styles.deliverableRow}>
              <Text style={styles.deliverableCheck}>☐</Text>
              <TextInput style={styles.deliverableInput} value={item} onChangeText={(v) => updateDeliverable(v, index)} placeholder={["Install cameras", "Configure DVR", "Test and handover", "Surface preparation", "Apply primer"][index % 5]} placeholderTextColor={colors.grayDark} />
              {deliverables.length > 1 && <TouchableOpacity onPress={() => removeDeliverable(index)} style={styles.removeDeliverable}><Text style={styles.removeDeliverableText}>✕</Text></TouchableOpacity>}
            </View>
          ))}
          <TouchableOpacity style={styles.addDeliverableBtn} onPress={addDeliverable}>
            <Text style={styles.addDeliverableText}>+ Add Deliverable</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Before Photos (Evidence)</Text>
          <TouchableOpacity style={styles.photoBtn} onPress={pickPhotos}>
            <Text style={styles.photoBtnText}>+ Add Photos</Text>
          </TouchableOpacity>
          {beforePhotos.length > 0 && (
            <FlatList data={beforePhotos} horizontal keyExtractor={(_, i) => i.toString()} renderItem={({ item, index }) => (
              <View style={styles.photoWrapper}>
                <Pressable onPress={() => setViewerUri(item.uri)}>
                  <Image source={{ uri: item.uri }} style={styles.photo} />
                </Pressable>
                <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(index)}><Text style={styles.removePhotoText}>✕</Text></TouchableOpacity>
              </View>
            )} style={styles.photoList} />
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
          <LipaButton title={loading ? "Uploading..." : t.continue} onPress={next} disabled={!isReady || loading} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <Modal transparent visible={loading} animationType="fade">
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.uploadText}>Uploading photos...</Text>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={showCategoryModal} animationType="slide" onRequestClose={() => setShowCategoryModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Category</Text>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat} style={[styles.catOption, category === cat && styles.catOptionActive]} onPress={() => { setCategory(cat); setShowCategoryModal(false); }}>
                <Text style={[styles.catOptionText, category === cat && styles.catOptionTextActive]}>{cat}</Text>
                {category === cat && <Text style={styles.catCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 12 },
  sublabel: { fontSize: 12, color: colors.subtext, marginBottom: 8, marginTop: -4 },
  categoryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.white, marginBottom: 4 },
  categoryBtnText: { fontSize: 15, color: colors.text },
  placeholder: { color: colors.grayDark },
  chevron: { fontSize: 16, color: colors.grayDark },
  feeCard: { backgroundColor: colors.white, borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.border },
  feeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  feeLabel: { fontSize: 13, color: colors.subtext },
  feeValue: { fontSize: 13, color: colors.text, fontWeight: "500" },
  feeTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 2, marginBottom: 0 },
  feeTotalLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  feeTotalValue: { fontSize: 14, fontWeight: "700", color: colors.primary },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  durationInput: { flex: 1 },
  unitToggle: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: colors.primary, overflow: "hidden" },
  unitBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.white },
  unitActive: { backgroundColor: colors.primary },
  unitText: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  unitTextActive: { color: colors.white },
  charCount: { fontSize: 12, color: colors.subtext, textAlign: "right", marginTop: 2, marginBottom: 4 },
  charCountWarn: { color: colors.warning },
  deliverableRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  deliverableCheck: { fontSize: 18, color: colors.grayDark, width: 22 },
  deliverableInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.text, backgroundColor: colors.white },
  removeDeliverable: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gray, alignItems: "center", justifyContent: "center" },
  removeDeliverableText: { fontSize: 11, color: colors.grayDark, fontWeight: "bold" },
  addDeliverableBtn: { paddingVertical: 10, marginBottom: 4 },
  addDeliverableText: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  photoBtn: { borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 12 },
  photoBtnText: { color: colors.primary, fontWeight: "600", fontSize: 15 },
  photoList: { marginBottom: 16 },
  photoWrapper: { marginRight: 10, position: "relative" },
  photo: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: { position: "absolute", top: -6, right: -6, backgroundColor: colors.error, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  removePhotoText: { color: colors.white, fontSize: 10, fontWeight: "bold" },
  uploadOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  uploadCard: { backgroundColor: colors.white, borderRadius: 16, padding: 32, alignItems: "center", gap: 14, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  uploadText: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  catOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  catOptionActive: { backgroundColor: colors.gray, borderRadius: 8, paddingHorizontal: 8 },
  catOptionText: { fontSize: 15, color: colors.text },
  catOptionTextActive: { color: colors.primary, fontWeight: "600" },
  catCheck: { fontSize: 16, color: colors.primary, fontWeight: "bold" },
});
