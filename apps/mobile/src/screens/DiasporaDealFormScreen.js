import React, { useState, useCallback, useEffect } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, SHARED_STYLES } from './diasporaTheme';
import { calcBreakdown, toForeignCurrency, CURRENCY_SYMBOLS } from './diasporaFees';

const FUNDI_TYPES = ['Electrician', 'Plumber', 'Painter', 'Tiler', 'Carpenter', 'Mason', 'Other'];
const CUSTOM_CATEGORIES = ['Land/Property', 'Education', 'Vehicle', 'Business/Stock', 'Livestock/Agriculture', 'Event', 'Medical', 'Goods Purchase', 'Other'];

const getDealCategory = (dealType) => {
  if (!dealType) return 'custom';
  const d = dealType.toLowerCase();
  if (d.includes('construct') || d.includes('renov')) return 'construction';
  if (d.includes('fundi')) return 'fundi';
  if (d.includes('good') || d.includes('material')) return 'goods';
  return 'custom';
};

const HEADER = {
  construction: {
    title: 'Construction Deal',
    subtitle: 'Enter your contractor details and project info. Funds release only when milestones are verified.',
  },
  fundi: {
    title: 'Hire a Fundi',
    subtitle: "Enter the fundi's details and job info. Payment releases only after job completion is confirmed.",
  },
  goods: {
    title: 'Buy Goods / Materials',
    subtitle: 'Enter the supplier details and what you are buying. Funds release only on delivery proof.',
  },
  custom: {
    title: 'Custom Deal',
    subtitle: 'You define the terms. Set milestones and release funds on your schedule.',
  },
};

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.100:4000';

export default function DiasporaDealFormScreen({ navigation, route }) {
  const { dealType } = route.params || {};
  const category = getDealCategory(dealType);
  const { title, subtitle } = HEADER[category];

  // Common fields
  const [counterpartyPhone, setCounterpartyPhone] = useState('+254 ');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [numberOfMilestones, setNumberOfMilestones] = useState(1);
  const [deadline, setDeadline] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [config, setConfig] = useState({ rates: { USD: 129, GBP: 168, EUR: 140, AED: 35, INR: 1.55 }, platformCut: 4 });
  const [selectedCurrency, setSelectedCurrency] = useState('USD');

  // Construction-only
  const [siteLocation, setSiteLocation] = useState('');

  // Fundi-only
  const [fundiWorkType, setFundiWorkType] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  // Goods-only
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  const milestoneMax = category === 'fundi' ? 3 : 10;

  useEffect(() => {
    fetch(`${API_BASE}/secretary/config`)
      .then(r => r.json())
      .then(d => { if (d.success) setConfig({ rates: d.rates, platformCut: d.platformCut }); })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      setCounterpartyPhone('+254 ');
      setCounterpartyName('');
      setTotalAmount('');
      setDealDescription('');
      setNumberOfMilestones(1);
      setPhotos([]);
      setSiteLocation('');
      setFundiWorkType('');
      setDeliveryLocation('');
      setDeliveryDate('');
    }, [])
  );

  const isValidKenyaPhone = (phone) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('254')) return digits.length === 12;
    if (digits.startsWith('0')) return digits.length === 10;
    if (digits.startsWith('7') || digits.startsWith('1')) return digits.length === 9;
    return false;
  };

  const formatPhone = (text) => {
    let digits = text.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '254' + digits.slice(1);
    else if (digits.startsWith('7') || digits.startsWith('1')) digits = '254' + digits;
    return digits;
  };

  const handlePhoneChange = (text) => {
    if (!text.startsWith('+254 ')) {
      setCounterpartyPhone('+254 ');
      return;
    }
    setCounterpartyPhone(text);
  };

  const isFormValid = () => {
    if (!counterpartyPhone.trim() || !isValidKenyaPhone(counterpartyPhone)) return false;
    if (!counterpartyName.trim()) return false;
    if (!totalAmount.trim() || isNaN(Number(totalAmount)) || Number(totalAmount) <= 0) return false;
    if (!dealDescription.trim()) return false;
    if (category === 'construction' && !siteLocation.trim()) return false;
    if (category === 'fundi' && !fundiWorkType) return false;
    if (category === 'goods' && !deliveryLocation.trim()) return false;
    if (category === 'goods' && !deliveryDate.trim()) return false;
    if ((category === 'construction' || category === 'fundi') && (numberOfMilestones < 1 || numberOfMilestones > milestoneMax)) return false;
    return true;
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to attach reference photos.');
      return;
    }
    const remaining = 3 - photos.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 3));
    }
  };

  const removePhoto = (index) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const adjustMilestones = (delta) =>
    setNumberOfMilestones((prev) => Math.max(1, Math.min(milestoneMax, prev + delta)));

  const handleNext = () => {
    if (!isFormValid()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }
    navigation.navigate('DiasporaMilestoneBuilder', {
      dealType,
      counterpartyPhone: formatPhone(counterpartyPhone),
      counterpartyName: counterpartyName.trim(),
      totalAmount: Number(totalAmount),
      dealDescription: dealDescription.trim(),
      numberOfMilestones,
        deadline: deadline ? deadline.toISOString() : null,
      photos,
      ...(category === 'construction' && { siteLocation: siteLocation.trim() }),
      ...(category === 'fundi' && { fundiWorkType }),
      ...(category === 'custom' && { customCategory }),
      ...(category === 'goods' && {
        deliveryLocation: deliveryLocation.trim(),
        deliveryDate: deliveryDate.trim(),
      }),
      feeBreakdown: calcBreakdown(totalAmount, config.platformCut),
      selectedCurrency,
      currencyRate: config.rates[selectedCurrency] || 1,
    });
  };

  const namePlaceholder =
    category === 'goods' ? 'Business or person supplying goods' : 'Full name of the person or business';
  const nameLabel =
    category === 'fundi' ? 'Fundi Name' : category === 'goods' ? 'Supplier Name' : 'Counterparty Name';
  const phoneLabel =
    category === 'fundi' ? 'Fundi Phone (Kenya)' : category === 'goods' ? 'Supplier Phone (Kenya)' : 'Phone Number (Kenya)';
  const descLabel =
    category === 'construction' ? 'Project Scope' : category === 'fundi' ? 'Job Description' : category === 'goods' ? 'Item Description' : 'Deal Description';
  const descPlaceholder =
    category === 'construction' ? 'Describe the work to be done, materials, finish quality...' :
    category === 'fundi'        ? 'Describe the job in detail — what needs fixing or installing...' :
    category === 'goods'        ? 'What items are being purchased? Quantities, specs, brand...' :
                                  'Describe what the deal is about...';
  const photoLabel = category === 'goods' ? 'Item Reference Photos' : 'Design / Reference Photos';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardWrap}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{nameLabel}</Text>
            <TextInput
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              placeholder={namePlaceholder}
              value={counterpartyName}
              onChangeText={setCounterpartyName}
              autoCapitalize="words"
            />
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{phoneLabel}</Text>
            <TextInput
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              placeholder="+254 7XX XXX XXX"
              keyboardType="phone-pad"
              value={counterpartyPhone}
              onChangeText={handlePhoneChange}
              autoComplete="tel"
            />
            {counterpartyPhone.length > 0 && !isValidKenyaPhone(counterpartyPhone) && (
              <Text style={styles.errorText}>Enter a valid Kenyan phone number.</Text>
            )}
          </View>

          {/* Construction: Site Location */}
          {category === 'construction' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Site / Plot Location</Text>
              <TextInput
              placeholderTextColor="#9CA3AF"
                style={styles.input}
                placeholder="e.g. Ruiru, off Thika Road, Plot 42"
                value={siteLocation}
                onChangeText={setSiteLocation}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* Fundi: Work Type chips */}
          {category === 'fundi' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Type of Work</Text>
              <View style={styles.chipRow}>
                {FUNDI_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.chip, fundiWorkType === type && styles.chipActive]}
                    onPress={() => setFundiWorkType(type)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, fundiWorkType === type && styles.chipTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {category === 'custom' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipRow}>
                {CUSTOM_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, customCategory === cat && styles.chipActive]}
                    onPress={() => setCustomCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, customCategory === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Amount */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Total Amount (KES)</Text>
            <TextInput
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              placeholder="e.g. 150000"
              keyboardType="numeric"
              value={totalAmount}
              onChangeText={setTotalAmount}
            />
          </View>


          {/* Fee Calculator */}
          {totalAmount && Number(totalAmount) >= 1000 && (() => {
            const bd = calcBreakdown(totalAmount, config.platformCut);
            const rate = config.rates[selectedCurrency] || 1;
            const foreign = toForeignCurrency(bd.grandTotal, rate);
            const sym = CURRENCY_SYMBOLS[selectedCurrency];
            return (
              <View style={styles.calcCard}>
                <Text style={styles.calcTitle}>Cost Breakdown</Text>
                <View style={styles.calcRow}><Text style={styles.calcLabel}>Deal Amount</Text><Text style={styles.calcValue}>KES {bd.amount.toLocaleString()}</Text></View>
                <View style={styles.calcRow}><Text style={styles.calcLabel}>Platform Fee ({config.platformCut}%)</Text><Text style={styles.calcValue}>KES {bd.platFee.toLocaleString()}</Text></View>
                <View style={styles.calcRow}><Text style={styles.calcLabel}>M-Pesa Release Fee</Text><Text style={styles.calcValue}>KES {bd.mpesaFee.toLocaleString()}</Text></View>
                <View style={styles.calcDivider} />
                <View style={styles.calcRow}><Text style={[styles.calcLabel, { fontWeight: '700', color: '#0F172A' }]}>Total to Send</Text><Text style={[styles.calcValue, { fontWeight: '700', color: '#0F172A' }]}>KES {bd.grandTotal.toLocaleString()}</Text></View>
                <View style={styles.currencyRow}>
                  {Object.keys(CURRENCY_SYMBOLS).map(cur => (
                    <TouchableOpacity key={cur} onPress={() => setSelectedCurrency(cur)}
                      style={[styles.currencyBtn, selectedCurrency === cur && styles.currencyBtnActive]}>
                      <Text style={[styles.currencyBtnText, selectedCurrency === cur && styles.currencyBtnTextActive]}>{cur}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.calcForeign}>{sym} {foreign}</Text>
              </View>
            );
          })()}
          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{descLabel}</Text>
            <TextInput
              placeholderTextColor="#9CA3AF"
              style={[styles.input, styles.textArea]}
              placeholder={descPlaceholder}
              value={dealDescription}
              onChangeText={setDealDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Goods: Delivery Location */}
          {category === 'goods' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Delivery Location</Text>
              <TextInput
              placeholderTextColor="#9CA3AF"
                style={styles.input}
                placeholder="e.g. Nakuru town, Kenyatta Avenue"
                value={deliveryLocation}
                onChangeText={setDeliveryLocation}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* Goods: Expected Delivery Date */}
          {category === 'goods' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Expected Delivery Date</Text>
              <TextInput
              placeholderTextColor="#9CA3AF"
                style={styles.input}
                placeholder="e.g. 15 Oct 2025"
                value={deliveryDate}
                onChangeText={setDeliveryDate}
              />
            </View>
          )}

          {/* Photos */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {photoLabel} <Text style={styles.optional}>(Optional)</Text>
            </Text>
            {photos.length > 0 && (
              <View style={styles.thumbnailRow}>
                {photos.map((uri, idx) => (
                  <View key={idx} style={styles.thumbnailWrap}>
                    <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.thumbnailRemove}
                      onPress={() => removePhoto(idx)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.thumbnailRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {photos.length < 3 && (
              <TouchableOpacity style={styles.photoPickerButton} onPress={pickPhoto} activeOpacity={0.7}>
                <Text style={styles.photoPickerText}>
                  📎{'  '}{photos.length === 0 ? 'Attach photos' : `Add more (${photos.length}/3)`}
                </Text>
              </TouchableOpacity>
            )}
            {photos.length === 3 && (
              <Text style={styles.photoMaxText}>3/3 photos attached</Text>
            )}
          </View>

          {/* Deadline picker — construction, fundi, and custom */}
          {(category === 'construction' || category === 'fundi' || category === 'custom') && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Job Deadline</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={{ color: deadline ? '#1E293B' : '#94A3B8', fontSize: 15 }}>
                  {deadline ? deadline.toDateString() : 'Select completion date'}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                If the job is not completed by this date, you will be eligible for a full refund.
              </Text>
              {showDatePicker && (
                <DateTimePicker
                  value={deadline || new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(e, date) => { setShowDatePicker(false); if (date) setDeadline(date); }}
                />
              )}
            </View>
          )}

          {/* Milestones — construction and fundi only */}
          {(category === 'construction' || category === 'fundi') && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Number of Milestones
                {milestoneMax < 10 && (
                  <Text style={styles.optional}> (max {milestoneMax} for this deal)</Text>
                )}
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  activeOpacity={0.7}
                  onPress={() => adjustMilestones(-1)}
                >
                  <Text style={styles.stepperButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{numberOfMilestones}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  activeOpacity={0.7}
                  onPress={() => adjustMilestones(1)}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.ctaButton, !isFormValid() && styles.ctaButtonDisabled]}
            activeOpacity={0.8}
            disabled={!isFormValid()}
            onPress={handleNext}
          >
            <Text style={styles.ctaButtonText}>Next: Build Milestones</Text>
          </TouchableOpacity>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { ...SHARED_STYLES.container },
  keyboardWrap: { flex: 1 },
  scroll: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 24,
    paddingBottom: 24,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '500', color: '#334155', marginBottom: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1E293B',
  },
  textArea: { height: 100, paddingTop: 12 },
  errorText: { fontSize: 12, color: '#EF4444', marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '18',
  },
  chipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  stepperValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: 'center',
  },

  calcCard: { backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, marginTop: 10, marginBottom: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  calcTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calcLabel: { fontSize: 13, color: '#64748B' },
  calcValue: { fontSize: 13, color: '#1E293B' },
  calcDivider: { height: 1, backgroundColor: '#BBF7D0', marginVertical: 8 },
  calcForeign: { fontSize: 22, fontWeight: '700', color: '#059669', textAlign: 'center', marginTop: 10 },
  currencyRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  currencyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#059669' },
  currencyBtnActive: { backgroundColor: '#059669' },
  currencyBtnText: { fontSize: 12, color: '#059669', fontWeight: '600' },
  currencyBtnTextActive: { color: '#FFFFFF' },
  footer: { ...SHARED_STYLES.footer },
  ctaButton: { ...SHARED_STYLES.ctaButton },
  ctaButtonDisabled: { ...SHARED_STYLES.ctaButtonDisabled },
  ctaButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  optional: { fontWeight: '400', color: '#64748B', fontSize: 13 },
  photoPickerButton: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  photoPickerText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  thumbnailRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  thumbnailWrap: {
    position: 'relative',
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumbnail: { width: 90, height: 90 },
  thumbnailRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailRemoveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  photoMaxText: { fontSize: 13, color: '#64748B', marginTop: 6, textAlign: 'center' },
});
