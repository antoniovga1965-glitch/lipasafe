import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { authFetch } from '../utils/api';

const SERVICE_TYPES = [
  { label: 'House lead',    value: 'house' },
  { label: 'Rental lead',   value: 'rental' },
  { label: 'House viewing', value: 'viewing' },
];

import { calcFeesGeneric } from '../utils/feeCalculator'

export default function HouseHuntingScreen({ navigation }) {
  const [sellerPhone,      setSellerPhone]      = useState('');
  const [serviceType,      setServiceType]      = useState('house');
  const [description,      setDescription]      = useState('');
  const [area,             setArea]             = useState('');
  const [amount,           setAmount]           = useState('');
  const [acceptDeadline,   setAcceptDeadline]   = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker,   setShowDatePicker]   = useState(false);
  const [showTimePicker,   setShowTimePicker]   = useState(false);
  const [pickerMode,       setPickerMode]       = useState('date');

  const onDeadlineChange = (event, selectedDate) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      setShowTimePicker(false);
      return;
    }
    const current = selectedDate || acceptDeadline;
    setShowDatePicker(false);
    setShowTimePicker(false);

    if (pickerMode === 'date') {
      const updated = new Date(acceptDeadline);
      updated.setFullYear(current.getFullYear(), current.getMonth(), current.getDate());
      setAcceptDeadline(updated);
      setPickerMode('time');
      setShowTimePicker(true);
    } else {
      const updated = new Date(acceptDeadline);
      updated.setHours(current.getHours(), current.getMinutes());
      setAcceptDeadline(updated);
    }
  };

  const formatDeadline = (date) =>
    date.toLocaleString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  const [loading,          setLoading]          = useState(false);

  const parsed      = parseFloat(amount) || 0;
  const { platformFee, b2cCost: b2cFee, buyerTotal: total } = calcFeesGeneric(parsed);

  const valid =
    sellerPhone.trim().length >= 9 &&
    description.trim().length >= 3 &&
    area.trim().length >= 2 &&
    parsed >= 1;

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      const rawHours = Math.ceil((acceptDeadline.getTime() - Date.now()) / (60 * 60 * 1000));
      const protectionHours = Math.min(Math.max(rawHours, 1), 168);

      const res  = await authFetch('/house/create', {
        method: 'POST',
        body: JSON.stringify({
          sellerPhone:     sellerPhone.trim(),
          serviceType,
          description:     description.trim(),
          area:            area.trim(),
          amount:          parsed,
          protectionHours,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to create escrow');

      navigation.navigate('HouseEscrowDetail', { escrowId: data.escrow.id });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.title}>Lead Escrow</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Trust banner */}
        <View style={styles.banner}>
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
          <Text style={styles.bannerText}>
            Money is held safely until you confirm the lead was delivered
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>

          <Text style={styles.label}>Seller Phone *</Text>
          <TextInput
            style={styles.input}
            placeholder="07XX XXX XXX"
            placeholderTextColor={colors.grayDark}
            keyboardType="phone-pad"
            value={sellerPhone}
            onChangeText={setSellerPhone}
            maxLength={13}
          />

          <Text style={styles.label}>What are you paying for? *</Text>
          <View style={styles.optionRow}>
            {SERVICE_TYPES.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionBtn, serviceType === opt.value && styles.optionActive]}
                onPress={() => setServiceType(opt.value)}
              >
                <Text style={[styles.optionText, serviceType === opt.value && styles.optionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Short Description *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Show buyer a vacant 2-bedroom house"
            placeholderTextColor={colors.grayDark}
            value={description}
            onChangeText={setDescription}
            maxLength={60}
          />

          <Text style={styles.label}>Area *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Kehancha Town"
            placeholderTextColor={colors.grayDark}
            value={area}
            onChangeText={setArea}
          />

          <Text style={styles.label}>Fee (KES) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 200"
            placeholderTextColor={colors.grayDark}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          {parsed > 0 && parsed < 1 && (
            <Text style={styles.error}>Minimum is KES 1</Text>
          )}

          <Text style={styles.label}>Protection Period</Text>
          <TouchableOpacity
            style={styles.input}
            activeOpacity={0.8}
            onPress={() => {
              setPickerMode('date');
              setShowDatePicker(true);
            }}
          >
            <Text style={{ fontSize: 15, color: colors.black }}>
              {formatDeadline(acceptDeadline)}
            </Text>
          </TouchableOpacity>
          {(showDatePicker || showTimePicker) && (
            <DateTimePicker
              value={acceptDeadline}
              mode={pickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date(Date.now() + 60 * 60 * 1000)}
              maximumDate={new Date(Date.now() + 168 * 60 * 60 * 1000)}
              onChange={onDeadlineChange}
            />
          )}
          <Text style={styles.hint}>
            If you don't confirm or dispute by this time, money auto-releases to seller. Max 7 days from now.
          </Text>
        </View>

        {/* Fee breakdown */}
        {parsed >= 1 && (
          <View style={styles.breakdown}>
            <View style={styles.bRow}>
              <Text style={styles.bLabel}>Amount agreed</Text>
              <Text style={styles.bValue}>KES {parsed.toLocaleString()}</Text>
            </View>
            <View style={styles.bRow}>
              <Text style={styles.bLabel}>LipaSafe fee</Text>
              <Text style={styles.bValue}>KES {platformFee.toLocaleString()}</Text>
            </View>
            <View style={styles.bRow}>
              <Text style={styles.bLabel}>M-Pesa B2C fee</Text>
              <Text style={styles.bValue}>KES {b2cFee.toLocaleString()}</Text>
            </View>
            <View style={[styles.bRow, styles.bTotal]}>
              <Text style={styles.bTotalLabel}>Total you pay</Text>
              <Text style={styles.bTotalValue}>KES {total.toLocaleString()}</Text>
            </View>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.btn, (!valid || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!valid || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <>
                <Ionicons name="lock-closed" size={18} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Hold in Escrow</Text>
              </>
          }
        </TouchableOpacity>

        <Text style={styles.footer}>
          M-Pesa prompt sent after you tap. Confirm or dispute before the window ends.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.white },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn:        { padding: 8 },
  title:          { fontSize: 18, fontWeight: '700', color: colors.black },
  banner:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5EE', marginHorizontal: 16, borderRadius: 10, padding: 12, gap: 8, marginBottom: 4 },
  bannerText:     { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '500' },
  form:           { paddingHorizontal: 16, paddingTop: 4 },
  label:          { fontSize: 13, fontWeight: '600', color: colors.black, marginBottom: 6, marginTop: 18 },
  input:          { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.black, backgroundColor: colors.gray },
  textarea:       { height: 100 },
  error:          { color: colors.error, fontSize: 12, marginTop: 4 },
  optionRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  optionBtn:      { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.gray },
  optionActive:   { borderColor: colors.primary, backgroundColor: '#E8F5EE' },
  optionText:     { fontSize: 13, color: colors.grayDark, fontWeight: '500' },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
  hint:           { fontSize: 11, color: colors.grayDark, marginTop: 8, lineHeight: 16 },
  breakdown:      { marginHorizontal: 16, marginTop: 20, backgroundColor: colors.gray, borderRadius: 12, padding: 14 },
  bRow:           { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bLabel:         { fontSize: 13, color: colors.grayDark },
  bValue:         { fontSize: 13, color: colors.black, fontWeight: '500' },
  bTotal:         { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2, marginBottom: 0 },
  bTotalLabel:    { fontSize: 14, color: colors.black, fontWeight: '700' },
  bTotalValue:    { fontSize: 14, color: colors.primary, fontWeight: '700' },
  btn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 24, borderRadius: 12, paddingVertical: 16 },
  btnDisabled:    { backgroundColor: colors.grayDark },
  btnText:        { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer:         { textAlign: 'center', fontSize: 12, color: colors.grayDark, marginTop: 12, paddingHorizontal: 24, lineHeight: 18 },
});
