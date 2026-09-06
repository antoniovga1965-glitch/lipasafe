import React, { useState, useEffect } from 'react';
import { calcFee, calcTotal, calcFeesInstantSend, PLATFORM_RATE } from '../utils/feeCalculator'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../utils/api';
import SafeSendExplainerModal from '../components/SafeSendExplainerModal';
import PhoneResolverModal from '../components/PhoneResolverModal';

const PIN_THRESHOLD = 500;
const EXPLAINER_KEY = 'hasSeenSendExplainer';

const PURPOSES = [
  { value: 'RENT', label: 'Rent' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'SCHOOL_FEES', label: 'School Fees' },
  { value: 'LOAN', label: 'Loan' },
  { value: 'GIFT', label: 'Gift' },
  { value: 'OTHER', label: 'Other' },
];

const PURPOSE_CONTEXT = {
  RENT: 'Protected until your landlord confirms receipt',
  PURCHASE: 'Protected until the seller confirms delivery',
  SALARY: 'Protected until your employee confirms receipt',
  SCHOOL_FEES: 'Protected until the school confirms receipt',
  LOAN: 'Protected until the borrower confirms receipt',
  GIFT: 'Protected until they confirm they got it',
  OTHER: 'Protected until the recipient confirms receipt',
};

export default function QuickSendScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState('INSTANT'); // INSTANT | PROTECTED
  const [phone, setPhone] = useState(route?.params?.prefillPhone || '');
  const [resolverVisible, setResolverVisible] = useState(false);
  const [resolverLoading, setResolverLoading] = useState(false);
  const [resolvedName, setResolvedName]       = useState(null);
  const [resolvedFound, setResolvedFound]     = useState(false);
  const [amount, setAmount] = useState(route?.params?.prefillAmount ? String(route.params.prefillAmount) : '');
  const [pin, setPin] = useState('');
  const [purpose, setPurpose] = useState('OTHER');
  const [note, setNote] = useState('');
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [error, setError] = useState('');

  const [explainerVisible, setExplainerVisible] = useState(false);
  const [explainerDismissable, setExplainerDismissable] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await authFetch('/wallet/balance');
        const data = await res.json();
        setBalance(parseFloat(data.availableBalance) || 0);
      } catch (e) {
        setBalance(0);
      } finally {
        setLoadingBalance(false);
      }
    };
    fetchBalance();
  }, []);

  useEffect(() => {
    const checkExplainer = async () => {
      try {
        const seen = await AsyncStorage.getItem(EXPLAINER_KEY);
        if (seen !== 'true') {
          setExplainerDismissable(false);
          setExplainerVisible(true);
        }
      } catch {}
    };
    checkExplainer();
  }, []);

  const dismissExplainer = async () => {
    try { await AsyncStorage.setItem(EXPLAINER_KEY, 'true'); } catch {}
    setExplainerVisible(false);
  };

  const openExplainer = () => {
    setExplainerDismissable(true);
    setExplainerVisible(true);
  };

  // CTA inside the explainer ("Send with Confidence") -- closes the sheet

  const confirmSafeSendFromExplainer = async () => {
    try { await AsyncStorage.setItem(EXPLAINER_KEY, 'true'); } catch {}
    setExplainerVisible(false);
    setType('PROTECTED');
  };

  const parsedAmount = parseFloat(amount) || 0
  const { platformFee, b2cCharge, totalDeduct } =
    parsedAmount > 0
      ? calcFeesInstantSend(parsedAmount)
      : { platformFee: 0, b2cCharge: 0, totalDeduct: 0 }
  const fee         = platformFee
  const totalAmount = totalDeduct
  const needsPin   = type === 'INSTANT' && parsedAmount >= PIN_THRESHOLD;
  const hasEnough  = balance !== null && parsedAmount > 0 && parsedAmount <= balance;
  const pinOk      = !needsPin || pin.length >= 4;

  const canSend = type === 'INSTANT'
    ? phone.length >= 9 && parsedAmount > 0 && pinOk
    : phone.length >= 9 && parsedAmount > 0 && !!purpose;

  const onSend = async () => {
    setError('');
    if (!phone || parsedAmount <= 0) return;

    // ── Resolve recipient name before proceeding ──
    setResolverLoading(true);
    setResolverVisible(true);
    try {
      const res = await authFetch(`/user/resolve-phone?phone=${phone}`);
      const data = await res.json();
      setResolvedFound(data.found);
      setResolvedName(data.name || null);
    } catch (e) {
      setResolvedFound(false);
      setResolvedName(null);
    } finally {
      setResolverLoading(false);
    }
  };

  const proceedAfterResolve = () => {
    setResolverVisible(false);
    navigation.navigate('ConfirmSend', {
      type,
      phone,
      amount: parsedAmount,
      pin: needsPin ? pin : undefined,
      purpose: type === 'PROTECTED' ? purpose : undefined,
      note: type === 'PROTECTED' ? note.trim() : undefined,
    });
  };

  const PURPOSE_ICONS = {
    RENT: 'home-outline',
    PURCHASE: 'bag-outline',
    SALARY: 'cash-outline',
    SCHOOL_FEES: 'school-outline',
    LOAN: 'business-outline',
    GIFT: 'gift-outline',
    OTHER: 'ellipsis-horizontal-outline',
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Money</Text>
          <TouchableOpacity onPress={openExplainer} style={styles.infoBtn}>
            <Ionicons name="information-circle-outline" size={22} color={colors.grayDark} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, type === 'INSTANT' && styles.toggleBtnActive]}
              onPress={() => setType('INSTANT')}
            >
              <Ionicons name="flash" size={15} color={type === 'INSTANT' ? colors.white : colors.grayDark} />
              <Text style={[styles.toggleText, type === 'INSTANT' && styles.toggleTextActive]}>Instant Send</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, type === 'PROTECTED' && styles.toggleBtnActive]}
              onPress={() => setType('PROTECTED')}
            >
              <Ionicons name="shield-checkmark" size={15} color={type === 'PROTECTED' ? colors.white : colors.grayDark} />
              <Text style={[styles.toggleText, type === 'PROTECTED' && styles.toggleTextActive]}>SafeSend</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIconCircle}>
              <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.heroLabel}>Wallet Balance</Text>
            {loadingBalance
              ? <ActivityIndicator size="small" color={colors.white} style={{ marginVertical: 6 }} />
              : <Text style={styles.heroAmount}>KES {balance?.toFixed(2) ?? '0.00'}</Text>
            }
            <Text style={styles.heroSub}>{type === 'INSTANT' ? 'Available to send instantly' : 'Available to send'}</Text>
            <Ionicons
              name={type === 'INSTANT' ? 'paper-plane' : 'shield-checkmark'}
              size={36}
              color="rgba(255,255,255,0.35)"
              style={styles.heroDecoration}
            />
          </View>

          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Ionicons name="call-outline" size={17} color={colors.primary} />
            </View>
            <View style={styles.cardFieldWrap}>
              <Text style={styles.cardLabel}>Recipient Phone</Text>
              <TextInput
                style={styles.cardInput}
                placeholder="07XX XXX XXX"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={14}
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Text style={styles.kesIcon}>KES</Text>
            </View>
            <View style={styles.cardFieldWrap}>
              <Text style={styles.cardLabel}>Amount</Text>
              <TextInput
                style={styles.cardInput}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={amount}
                onChangeText={v => { setAmount(v); setError(''); setPin(''); }}
              />
            </View>
          </View>

          {type === 'INSTANT' && (
            <View style={styles.infoBox}>
              <View style={styles.infoIconCircle}>
                <Ionicons name="flash" size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>Instant delivery</Text>
                <Text style={styles.infoSub}>Money is sent directly to the recipient's mobile wallet.</Text>
              </View>
            </View>
          )}

          {type === 'PROTECTED' && (
            <>
              <Text style={styles.sectionLabel}>Purpose</Text>
              <View style={styles.purposeWrap}>
                {PURPOSES.map(p => (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.purposeChip, purpose === p.value && styles.purposeChipActive]}
                    onPress={() => setPurpose(p.value)}
                  >
                    <Ionicons
                      name={PURPOSE_ICONS[p.value]}
                      size={13}
                      color={purpose === p.value ? colors.white : '#4A5560'}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[styles.purposeChipText, purpose === p.value && styles.purposeChipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!!purpose && (
                <View style={styles.protectedBox}>
                  <View style={styles.infoIconCircle}>
                    <Ionicons name="shield-checkmark" size={15} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.protectedTitle}>Protected until confirmation</Text>
                    <Text style={styles.protectedSub}>{PURPOSE_CONTEXT[purpose]}</Text>
                    <TouchableOpacity onPress={openExplainer}>
                      <Text style={styles.learnMore}>Learn more ›</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.card}>
                <View style={styles.iconBox}>
                  <Ionicons name="document-text-outline" size={17} color={colors.primary} />
                </View>
                <View style={styles.cardFieldWrap}>
                  <Text style={styles.cardLabel}>Note (optional)</Text>
                  <TextInput
                    style={[styles.cardInput, { minHeight: 36 }]}
                    placeholder="e.g. Samsung A55 black 128GB"
                    placeholderTextColor="#999"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={120}
                  />
                </View>
              </View>
            </>
          )}

          {parsedAmount > 0 && (
            <View style={{ backgroundColor: '#F0FBF6', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: '#666' }}>Amount</Text>
                <Text style={{ fontSize: 13, color: '#000' }}>KES {parsedAmount.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: '#666' }}>Platform fee (2%)</Text>
                <Text style={{ fontSize: 13, color: '#666' }}>KES {fee.toFixed(2)}</Text>
              </View>
              {b2cCharge > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: '#666' }}>M-Pesa transfer charge</Text>
                  <Text style={{ fontSize: 13, color: '#666' }}>KES {b2cCharge.toFixed(2)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#000' }}>Total</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#000' }}>KES {totalAmount.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {needsPin && (
            <View style={styles.pinWrapper}>
              <View style={styles.pinHint}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.grayDark} />
                <Text style={styles.pinHintText}>PIN required for sends of KES 500 and above</Text>
              </View>
              <View style={styles.inputRow}>
                <Ionicons name="keypad-outline" size={18} color={colors.grayDark} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your PIN"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                  value={pin}
                  onChangeText={setPin}
                />
              </View>
            </View>
          )}

          {!!error && <Text style={styles.errorMsg}>{error}</Text>}

          <TouchableOpacity
            style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={onSend}
            activeOpacity={0.85}
          >
            <Ionicons name={type === 'PROTECTED' ? 'shield-checkmark' : 'send'} size={16} color={colors.white} />
            <Text style={styles.sendBtnText}>{type === 'PROTECTED' ? 'Continue with SafeSend' : 'Send Money'}</Text>
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Ionicons name="lock-closed" size={12} color="#9ca3af" />
            <Text style={styles.footerText}>Secured by LipaSafe Escrow</Text>
          </View>

        </ScrollView>
      </View>

      <SafeSendExplainerModal
        visible={explainerVisible}
        onClose={dismissExplainer}
        onConfirm={confirmSafeSendFromExplainer}
        showCloseButton={explainerDismissable}
        mode="send"
      />
      <PhoneResolverModal
        visible={resolverVisible}
        loading={resolverLoading}
        found={resolvedFound}
        name={resolvedName}
        phone={phone}
        amount={parsedAmount}
        onConfirm={proceedAfterResolve}
        onCancel={() => setResolverVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.gray },
  backBtn: { padding: 4 },
  infoBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.black },
  content: { padding: 20 },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.gray, borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.grayDark },
  toggleTextActive: { color: colors.white },
  balanceBox: { backgroundColor: '#F0FBF6', borderRadius: 14, padding: 16, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: colors.primary },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceLabel: { fontSize: 13, color: colors.grayDark, fontWeight: '600' },
  balanceAmount: { fontSize: 18, fontWeight: '800', color: colors.black },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, backgroundColor: colors.gray },
  inputRowError: { borderColor: colors.error },
  kesPrefix: { fontSize: 16, fontWeight: '700', color: colors.black, marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: colors.black },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.grayDark, marginBottom: 8, marginTop: 4 },
  purposeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  purposeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#B8C2CC', backgroundColor: colors.white },
  purposeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  purposeChipText: { fontSize: 12, fontWeight: '600', color: '#4A5560' },
  purposeChipTextActive: { color: colors.white },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, marginTop: -4 },
  contextText: { fontSize: 12, color: colors.primary, fontWeight: '600', flex: 1 },

  heroCard: { backgroundColor: colors.primary, borderRadius: 18, padding: 20, marginBottom: 16, overflow: 'hidden' },
  heroIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginBottom: 4 },
  heroAmount: { fontSize: 30, fontWeight: '900', color: colors.white },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  heroDecoration: { position: 'absolute', top: 18, right: 16 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, marginBottom: 12, gap: 12 },
  iconBox: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F0FBF6', alignItems: 'center', justifyContent: 'center' },
  kesIcon: { fontSize: 11, fontWeight: '800', color: colors.primary },
  cardFieldWrap: { flex: 1 },
  cardLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  cardInput: { fontSize: 16, fontWeight: '600', color: colors.black, padding: 0 },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FBF6', borderRadius: 12, padding: 14, marginBottom: 14 },
  infoIconCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#14532d' },
  infoSub: { fontSize: 12, color: '#166534', marginTop: 2, lineHeight: 16 },

  protectedBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FBF6', borderRadius: 12, padding: 14, marginBottom: 14 },
  protectedTitle: { fontSize: 13, fontWeight: '700', color: '#14532d' },
  protectedSub: { fontSize: 12, color: '#166534', marginTop: 2, lineHeight: 16 },
  learnMore: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 6 },

  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 12 },
  footerText: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  pinWrapper: { marginBottom: 4 },
  pinHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  pinHintText: { fontSize: 12, color: colors.grayDark },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText: { fontSize: 12, color: colors.error, flex: 1 },
  errorMsg: { fontSize: 13, color: colors.error, marginBottom: 12 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 12, marginTop: 8 },
  sendBtnActive: { backgroundColor: colors.primary, elevation: 3, shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
  sendBtnDisabled: { backgroundColor: '#AEB4BA' },
  sendBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
