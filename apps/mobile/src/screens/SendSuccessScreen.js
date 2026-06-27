import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { getData } from "../utils/storage";
import api from "../utils/api";

export default function ConfirmSendScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { phone, amount } = route.params;

  const [recipientStatus, setRecipientStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);

  // Check if recipient has a LipaSafe account
  useEffect(() => {
    const checkRecipient = async () => {
      try {
        const token = await getData("token");
        const res = await api.get(`/users/check-phone/${phone}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRecipientStatus(res.data.exists ? "registered" : "ghost");
      } catch {
        setRecipientStatus("ghost");
      } finally {
        setChecking(false);
      }
    };
    checkRecipient();
  }, [phone]);

  const handleSend = async () => {
    setSending(true);
    try {
      const token = await getData("token");
      const res = await api.post(
        "/wallet/send",
        { recipientPhone: phone, amount },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.data.success) {
        navigation.replace("PaymentSuccess", {
          tx: {
            id: res.data.reference,
            total: parseFloat(amount).toFixed(2),
          },
        });
      }
    } catch (e) {
      const msg =
        e?.response?.data?.message || "Transfer failed. Please try again.";
      Alert.alert("Send failed", msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Send</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        {/* Amount display */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>You are sending</Text>
          <Text style={styles.amountValue}>
            KES {parseFloat(amount).toFixed(2)}
          </Text>
        </View>

        {/* Recipient box */}
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Recipient</Text>

          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color={colors.grayDark} />
            <Text style={styles.detailText}>{phone}</Text>
          </View>

          {/* Account status */}
          <View style={styles.detailRow}>
            {checking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : recipientStatus === "registered" ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#00A86B" />
                <Text style={[styles.detailText, { color: "#00A86B" }]}>
                  LipaSafe user — instant delivery
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color="#FF9500"
                />
                <Text style={[styles.detailText, { color: "#FF9500" }]}>
                  Not on LipaSafe — they'll get an SMS to claim
                </Text>
              </>
            )}
          </View>

          {/* Ghost wallet notice */}
          {!checking && recipientStatus === "ghost" && (
            <View style={styles.ghostNotice}>
              <Ionicons name="time-outline" size={13} color="#FF9500" />
              <Text style={styles.ghostText}>
                Money will be held for 7 days. If unclaimed, you can recall it.
              </Text>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>
              KES {parseFloat(amount).toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fee</Text>
            <Text style={styles.summaryValue}>KES 0.00</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.totalLabel}>Total deducted</Text>
            <Text style={styles.totalValue}>
              KES {parseFloat(amount).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Confirm button */}
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (sending || checking) && styles.confirmBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={sending || checking}
        >
          {sending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="send" size={16} color={colors.white} />
              <Text style={styles.confirmBtnText}>Confirm & Send</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.black },
  content: { padding: 20 },
  amountCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  amountLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "500",
  },
  amountValue: {
    color: colors.white,
    fontSize: 36,
    fontWeight: "800",
    marginTop: 6,
  },
  detailCard: {
    backgroundColor: colors.gray,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  detailTitle: { fontSize: 13, color: colors.grayDark, fontWeight: "600" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 14, color: colors.black, fontWeight: "500", flex: 1 },
  ghostNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FFF4E5",
    borderRadius: 8,
    padding: 10,
  },
  ghostText: { fontSize: 12, color: "#FF9500", flex: 1, lineHeight: 18 },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14, color: colors.grayDark },
  summaryValue: { fontSize: 14, color: colors.black, fontWeight: "600" },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  totalLabel: { fontSize: 15, color: colors.black, fontWeight: "700" },
  totalValue: { fontSize: 15, color: colors.primary, fontWeight: "800" },
  confirmBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  cancelBtn: { alignItems: "center", marginTop: 14 },
  cancelText: { fontSize: 14, color: colors.grayDark, fontWeight: "600" },
});
