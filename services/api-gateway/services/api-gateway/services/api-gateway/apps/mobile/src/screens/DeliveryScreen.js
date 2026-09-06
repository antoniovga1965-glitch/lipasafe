import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  SafeAreaView,
  StatusBar,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { useLang } from "../context/LanguageContext";

const GREEN = "#1a9e5c";
const GREEN_LIGHT = "#f2faf5";
const GREEN_DARK = "#11693d";
const BORDER_COLOR = "#e5e7eb";
const TEXT_MUTED = "#6b7280";
const TEXT_MAIN = "#111827";

export default function DeliveryScreen({ navigation }) {
  const { t } = useLang();

  // ── STATE LOGIC ───────────────────────────────────────────────────────────
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [goods, setGoods] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 60 * 60 * 1000),
  );

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [focusedField, setFocusedField] = useState(null);

  const onDateChange = (event, selectedDate) => {
    if (event.type === "dismissed") {
      setShowDatePicker(false);
      setShowTimePicker(false);
      return;
    }
    const current = selectedDate || deadline;
    setShowDatePicker(false);
    setShowTimePicker(false);

    if (pickerMode === "date") {
      const updated = new Date(deadline);
      updated.setFullYear(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
      );
      setDeadline(updated);
      setPickerMode("time");
      setShowTimePicker(true);
    } else {
      const updated = new Date(deadline);
      updated.setHours(current.getHours(), current.getMinutes());
      setDeadline(updated);
    }
  };

  const formatDeadline = (date) =>
    date.toLocaleString("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const isValidPhone = /^(?:254|\+254|0)?([17][0-9]{8})$/.test(
    deliveryPhone.replace(/\s/g, ""),
  );
  const isValidAmount = parseFloat(amount) > 0;
  const isValid =
    isValidPhone && goods.trim() && isValidAmount && address.trim();

  const next = () => {
    navigation.navigate("ConfirmPayment", {
      service: "Delivery",
      seller: deliveryPhone,
      sellerPhone: deliveryPhone,
      deliveryGuyPhone: deliveryPhone,
      goods,
      amount,
      description: goods,
      productDescription: description,
      address,
      deadline: deadline.toISOString(),
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate("HomeTab")}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={20} color={TEXT_MAIN} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Delivery Escrow</Text>
            <Text style={styles.headerSub}>
              Hold your payment securely until delivery is complete
            </Text>
          </View>

          <View style={styles.shieldBtn}>
            <Feather name="lock" size={18} color={GREEN} />
          </View>
        </View>

        {/* ── Scrollable Form ────────────────────────────────────────────── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Field
              label="Delivery Guy Phone"
              hint="The rider's mobile contact number"
              iconName="phone"
              isFocused={focusedField === "phone"}
            >
              <TextInput
                style={styles.input}
                value={deliveryPhone}
                onChangeText={setDeliveryPhone}
                placeholder="07XX XXX XXX"
                placeholderTextColor={TEXT_MUTED}
                keyboardType="phone-pad"
                onFocus={() => setFocusedField("phone")}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            <Field
              label="Goods Description"
              hint="e.g. Electronics, Documents, Clothing"
              iconName="box"
              isFocused={focusedField === "goods"}
            >
              <TextInput
                style={styles.input}
                value={goods}
                onChangeText={setGoods}
                placeholder="What package is being delivered?"
                placeholderTextColor={TEXT_MUTED}
                onFocus={() => setFocusedField("goods")}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            <Field
              label="Product Details"
              hint="Color, size, condition, or special handling instructions"
              iconName="file-text"
              isFocused={focusedField === "desc"}
            >
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add extra delivery notes here..."
                placeholderTextColor={TEXT_MUTED}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                onFocus={() => setFocusedField("desc")}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            {/* Special Text Badge for KES Instead of an Icon */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Amount</Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === "amount" && styles.inputRowFocused,
                ]}
              >
                <View
                  style={[
                    styles.currencyBox,
                    focusedField === "amount" && styles.iconBoxFocused,
                  ]}
                >
                  <Text
                    style={[
                      styles.currencyText,
                      focusedField === "amount" && styles.currencyTextFocused,
                    ]}
                  >
                    KES
                  </Text>
                </View>
                <View style={styles.inputInner}>
                  <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="decimal-pad"
                    onFocus={() => setFocusedField("amount")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
              <Text style={styles.fieldHint}>
                Total milestone funds locked in escrow
              </Text>
            </View>

            <Field
              label="Delivery Address"
              hint="Drop-off point, house number, or landmarks"
              iconName="map-pin"
              isFocused={focusedField === "address"}
            >
              <TextInput
                style={[styles.input, styles.multiline]}
                value={address}
                onChangeText={setAddress}
                placeholder="Where should the rider deliver it?"
                placeholderTextColor={TEXT_MUTED}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                onFocus={() => setFocusedField("address")}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            {/* ── Deadline ───────────────────────────────────────────────── */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Delivery Deadline</Text>
              <TouchableOpacity
                style={[
                  styles.dateBtn,
                  focusedField === "deadline" && styles.inputRowFocused,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setPickerMode("date");
                  setShowDatePicker(true);
                  setFocusedField("deadline");
                }}
              >
                <View
                  style={[
                    styles.iconBox,
                    focusedField === "deadline" && styles.iconBoxFocused,
                  ]}
                >
                  <Feather
                    name="calendar"
                    size={18}
                    color={focusedField === "deadline" ? GREEN : TEXT_MUTED}
                  />
                </View>
                <Text style={styles.dateText}>{formatDeadline(deadline)}</Text>
                <View style={styles.chevronBox}>
                  <Feather name="chevron-right" size={20} color={TEXT_MUTED} />
                </View>
              </TouchableOpacity>
              <Text style={styles.fieldHint}>
                When must this delivery be completed?
              </Text>
            </View>

            {(showDatePicker || showTimePicker) && (
              <DateTimePicker
                value={deadline}
                mode={pickerMode}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  onDateChange(event, date);
                  if (Platform.OS !== "ios" && pickerMode === "time") {
                    setFocusedField(null);
                  }
                }}
              />
            )}
          </View>

          {/* ── Action button ────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.continueBtn, !isValid && styles.continueBtnDisabled]}
            onPress={next}
            disabled={!isValid}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.continueBtnText,
                !isValid && styles.continueBtnTextDisabled,
              ]}
            >
              Lock Funds & Continue
            </Text>
          </TouchableOpacity>

          <View style={styles.protectedRow}>
            <Feather name="shield" size={14} color={GREEN_DARK} />
            <Text style={styles.protectedText}>
              Your funds are completely secured by dynamic escrow
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Presentation field wrapper ──────────────────────────────────────────────
function Field({ label, hint, iconName, children, isFocused }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, isFocused && styles.inputRowFocused]}>
        <View style={[styles.iconBox, isFocused && styles.iconBoxFocused]}>
          <Feather
            name={iconName}
            size={18}
            color={isFocused ? GREEN : TEXT_MUTED}
          />
        </View>
        <View style={styles.inputInner}>{children}</View>
      </View>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f9fafb" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TEXT_MAIN },
  headerSub: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  shieldBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: GREEN_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },

  // Scroll Context
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Form Container
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: TEXT_MAIN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 20,
  },

  // Elegant Form Row Layout
  fieldWrap: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    borderRadius: 14,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  inputRowFocused: {
    borderColor: GREEN,
    backgroundColor: "#fff",
  },
  iconBox: {
    width: 46,
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: BORDER_COLOR,
  },
  iconBoxFocused: {
    backgroundColor: GREEN_LIGHT,
    borderRightColor: GREEN,
  },
  currencyBox: {
    width: 56,
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: BORDER_COLOR,
  },
  currencyText: { fontSize: 13, fontWeight: "700", color: TEXT_MUTED },
  currencyTextFocused: { color: GREEN },
  inputInner: { flex: 1, paddingHorizontal: 14 },
  input: {
    fontSize: 15,
    color: TEXT_MAIN,
    paddingVertical: 14,
    fontWeight: "500",
  },
  multiline: { paddingTop: 14, paddingBottom: 14, minHeight: 75 },
  fieldHint: { fontSize: 12, color: TEXT_MUTED, marginTop: 6, paddingLeft: 2 },

  // Interactive Date Picker Trigger
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    borderRadius: 14,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    color: TEXT_MAIN,
    paddingHorizontal: 14,
    fontWeight: "500",
  },
  chevronBox: { paddingHorizontal: 12, justifyContent: "center" },

  // Modern Styled Buttons
  continueBtn: {
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  continueBtnDisabled: {
    backgroundColor: "#f3f4f6",
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
  continueBtnTextDisabled: { color: "#9ca3af" },

  // Dynamic Escrow Notice Footer
  protectedRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  protectedText: { fontSize: 12, color: GREEN_DARK, fontWeight: "600" },
});
