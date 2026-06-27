import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const PRIMARY   = '#00A86B';
const GOLD      = '#F5A623';
const BG        = '#F7F8FA';
const WHITE     = '#FFFFFF';
const BLACK     = '#1A1A1A';
const GRAY      = '#9E9E9E';
const BORDER    = '#E8E8E8';
const ERROR     = '#FF3B30';

// ─── Reusable Step Header ────────────────────────────────────────────────────
function StepBadge({ step, total, label }) {
  return (
    <View style={styles.stepBadgeRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.stepDot, i < step && styles.stepDotActive]} />
      ))}
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

// ─── Tier Card ───────────────────────────────────────────────────────────────
function TierCard({ tier, fee, perks, color, onPress, disabled, badge }) {
  return (
    <TouchableOpacity
      style={[styles.tierCard, { borderColor: color }, disabled && styles.tierCardDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <View style={styles.tierCardHeader}>
        <View style={[styles.tierBadge, { backgroundColor: color + '18' }]}>
          <Ionicons name={tier === 'verified' ? 'shield-checkmark' : 'star'} size={22} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.tierTitle, { color }]}>
            {tier === 'verified' ? 'Verified Seller' : 'Trusted Seller'}
          </Text>
          <Text style={styles.tierFee}>KES {fee} one-time fee</Text>
        </View>
        {badge && (
          <View style={[styles.tierStatus, { backgroundColor: color + '18' }]}>
            <Text style={[styles.tierStatusText, { color }]}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.tierPerks}>
        {perks.map((p, i) => (
          <View key={i} style={styles.perkRow}>
            <Ionicons name="checkmark-circle" size={15} color={color} />
            <Text style={styles.perkText}>{p}</Text>
          </View>
        ))}
      </View>
      {!disabled && (
        <View style={[styles.tierBtn, { backgroundColor: color }]}>
          <Text style={styles.tierBtnText}>Get {tier === 'verified' ? 'Verified' : 'Trusted'} →</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Photo Picker Box ─────────────────────────────────────────────────────────
function PhotoBox({ label, uri, onPress, icon }) {
  return (
    <TouchableOpacity style={styles.photoBox} onPress={onPress} activeOpacity={0.8}>
      {uri ? (
        <>
          <Image source={{ uri }} style={styles.photoPreview} />
          <View style={styles.photoOverlay}>
            <Ionicons name="checkmark-circle" size={28} color={WHITE} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.photoIconWrap}>
            <Ionicons name={icon} size={30} color={PRIMARY} />
          </View>
          <Text style={styles.photoLabel}>{label}</Text>
          <Text style={styles.photoSub}>Tap to upload</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Trusted Progress Card ──────────────────────────────────────────────────
function TrustedProgress({ isTrusted, isVerified, eligibility, kycData, onClaim, claiming }) {
  const checks = eligibility?.checks || {}
  const allPassed = eligibility?.eligible === true

  const requirements = [
    { key: 'verified',        label: 'Account verified',          hint: 'Complete Verified Seller first' },
    { key: 'completedTrades', label: '10+ completed transactions', hint: `${kycData?.totalCompleted || 0} / 10 done` },
    { key: 'goodRating',      label: '4.0+ rating',               hint: 'Build your reputation' },
    { key: 'accountAge',      label: '30+ days account age',      hint: 'Keep transacting' },
    { key: 'lowDisputes',     label: 'Max 1 dispute',             hint: `${kycData?.totalDisputed || 0} disputes` },
  ]

  return (
    <View style={tp.card}>
      <View style={tp.header}>
        <View style={[tp.iconWrap, { backgroundColor: GOLD + '18' }]}>
          <Ionicons name="star" size={22} color={GOLD} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={tp.title}>Trusted Seller</Text>
          <Text style={tp.sub}>Earned — not bought</Text>
        </View>
        {isTrusted && (
          <View style={[tp.activeBadge]}>
            <Text style={tp.activeBadgeText}>Active ✓</Text>
          </View>
        )}
      </View>

      <View style={tp.reqs}>
        {requirements.map(({ key, label, hint }) => {
          const passed = isTrusted || checks[key]
          return (
            <View key={key} style={tp.reqRow}>
              <Ionicons
                name={passed ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={passed ? PRIMARY : GRAY}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[tp.reqLabel, !passed && { color: GRAY }]}>{label}</Text>
                {!passed && <Text style={tp.reqHint}>{hint}</Text>}
              </View>
            </View>
          )
        })}
      </View>

      {!isTrusted && (
        <TouchableOpacity
          style={[tp.claimBtn, !allPassed && tp.claimBtnDisabled, claiming && { opacity: 0.7 }]}
          onPress={allPassed ? onClaim : () => Alert.alert('Keep going', 'Complete all requirements to earn your Trusted badge.')}
          disabled={claiming}
        >
          {claiming
            ? <ActivityIndicator color={WHITE} />
            : <Text style={tp.claimBtnText}>
                {allPassed ? '🏆 Claim Trusted Badge' : 'Requirements Not Met Yet'}
              </Text>
          }
        </TouchableOpacity>
      )}

      {isTrusted && (
        <View style={tp.earnedNote}>
          <Ionicons name="star" size={14} color={GOLD} />
          <Text style={[tp.claimBtnText, { color: GOLD, marginLeft: 6 }]}>Trusted badge earned</Text>
        </View>
      )}
    </View>
  )
}

const tp = StyleSheet.create({
  card:            { backgroundColor: WHITE, borderRadius: 16, borderWidth: 1.5, borderColor: GOLD, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  header:          { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconWrap:        { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title:           { fontSize: 16, fontWeight: '700', color: GOLD },
  sub:             { fontSize: 12, color: GRAY, marginTop: 2 },
  activeBadge:     { backgroundColor: GOLD + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activeBadgeText: { fontSize: 12, fontWeight: '600', color: GOLD },
  reqs:            { gap: 10, marginBottom: 16 },
  reqRow:          { flexDirection: 'row', alignItems: 'flex-start' },
  reqLabel:        { fontSize: 13, fontWeight: '600', color: BLACK },
  reqHint:         { fontSize: 11, color: GRAY, marginTop: 1 },
  claimBtn:        { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  claimBtnDisabled:{ backgroundColor: '#E0E0E0' },
  claimBtnText:    { color: WHITE, fontWeight: '700', fontSize: 14 },
  earnedNote:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
})

// ─── Service Categories ──────────────────────────────────────────────────────
const SERVICE_CATEGORIES = [
  { label: 'Bundles',      icon: 'phone-portrait-outline' },
  { label: 'Second Hand',  icon: 'basket-outline'         },
  { label: 'Fundi',        icon: 'construct-outline'      },
  { label: 'Delivery',     icon: 'bicycle-outline'        },
  { label: 'House',        icon: 'home-outline'           },
  { label: 'Custom',       icon: 'create-outline'         },
];

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function SellerVerificationScreen({ navigation }) {
  const [loading, setLoading]       = useState(true);
  const [kycData, setKycData]       = useState(null);
  const [step, setStep]             = useState('overview'); 
  const [activeTier, setActiveTier] = useState(null);
  const [polling, setPolling]       = useState(false);
  const [checkoutId, setCheckoutId] = useState(null);

  // Doc upload state
  const [idNumber, setIdNumber]   = useState('');
  const [idFront, setIdFront]     = useState(null);
  const [idBack, setIdBack]       = useState(null);
  const [selfie, setSelfie]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming]     = useState(false);
  const [businessName, setBusinessName]       = useState('');
  const [serviceCategory, setServiceCategory] = useState('');
  const [contactNumber, setContactNumber]     = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res  = await authFetch('/kyc/status');
      const data = await res.json();
      if (data.success) setKycData(data.data);
    } catch (e) {
      Alert.alert('Error', 'Could not load verification status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, []);

  const claimTrustedBadge = async () => {
    setClaiming(true);
    try {
      const res  = await authFetch('/kyc/claim-trusted', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadStatus();
        setStep('done');
        setActiveTier('trusted');
      } else {
        Alert.alert('Not Yet', data.message || 'Requirements not met');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setClaiming(false);
    }
  };

  // Poll payment status after STK push
  useEffect(() => {
    if (!polling || !checkoutId) return;
    const interval = setInterval(async () => {
      try {
        const res  = await authFetch(`/kyc-mpesa/status/${checkoutId}`);
        const data = await res.json();
        if (data.success && data.data.status === 'completed') {
          clearInterval(interval);
          setPolling(false);
          await loadStatus();
          if (activeTier === 'verified') {
            // Payment done — show uploading state then submit
            setStep('submitting');
          } else {
            setStep('done');
          }
        } else if (data.success && data.data.status === 'failed') {
          clearInterval(interval);
          setPolling(false);
          Alert.alert('Payment Failed', 'M-Pesa payment was not completed. Please try again.');
          setStep('overview');
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [polling, checkoutId, activeTier]);

  const initiatePayment = async (tier) => {
    setActiveTier(tier);
    setStep('paying');
    try {
      const res  = await authFetch('/kyc-mpesa/pay', {
        method: 'POST',
        body:   JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.success) {
        setCheckoutId(data.checkoutRequestId);
        setPolling(true);
      } else {
        Alert.alert('Error', data.message || 'Could not initiate payment');
        setStep('overview');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
      setStep('overview');
    }
  };

  const pickPhoto = async (setter) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload documents');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) setter(result.assets[0]);
  };

  const takePhoto = async (setter) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take selfie');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) setter(result.assets[0]);
  };

  const submitDocs = async () => {
    if (!idNumber.trim() || idNumber.trim().length < 6) {
      Alert.alert('Error', 'Enter a valid ID number (min 6 characters)');
      return;
    }
    if (!idFront || !idBack || !selfie) {
      Alert.alert('Error', 'Upload all 3 photos: ID front, ID back, and selfie');
      return;
    }
    setSubmitting(true);
    try {
      const res  = await authFetch('/kyc/submit-docs', {
        method: 'POST',
        body:   JSON.stringify({
          idNumber:        idNumber.trim(),
          idFrontB64:      idFront.base64,
          idBackB64:       idBack.base64,
          selfieB64:       selfie.base64,
          businessName:    businessName.trim(),
          serviceCategory: serviceCategory,
          contactNumber:   contactNumber.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadStatus();
        setStep('done');
      } else {
        Alert.alert('Error', data.message || 'Submission failed');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-submit docs when payment completes
  useEffect(() => {
    if (step === 'submitting') {
      submitDocs();
    }
  }, [step]);

  // ── Render: Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  const kycStatus    = kycData?.kycStatus || 'unverified';
  const kycTier      = kycData?.kycTier   || 'basic';
  const isVerified   = kycStatus === 'verified';
  const isPending    = kycStatus === 'pending';
  const isTrusted    = kycTier   === 'trusted';
  const eligibility  = kycData?.eligibility;

  // ── Render: Paying ───────────────────────────────────────────────────────
  if (step === 'paying') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: BG }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.payingCard}>
          <ActivityIndicator size="large" color={PRIMARY} style={{ marginBottom: 20 }} />
          <Text style={styles.payingTitle}>STK Push Sent</Text>
          <Text style={styles.payingSub}>
            Check your phone and enter your M-Pesa PIN to pay{' '}
            <Text style={{ fontWeight: '700', color: PRIMARY }}>
              KES {activeTier === 'verified' ? '150' : '300'}
            </Text>
          </Text>
          <Text style={styles.payingWait}>Waiting for confirmation...</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPolling(false); setStep('overview'); }}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Upload Docs ──────────────────────────────────────────────────
  if (step === 'uploading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {/* Header */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={BLACK} />
          </TouchableOpacity>
          <StepBadge step={2} total={2} label="Step 2 of 2 — Upload Documents" />
          <Text style={styles.pageTitle}>Upload Your ID</Text>
          <Text style={styles.pageSub}>
            Fill in your details and upload your ID photos. You'll pay KES 150 at the end to submit.
          </Text>

          {/* ID Number */}
          <Text style={styles.fieldLabel}>National ID Number</Text>
          <View style={styles.textInput}>
            <Ionicons name="card-outline" size={18} color={GRAY} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.textInputText}
              placeholder="Enter your National ID number"
              placeholderTextColor={GRAY}
              value={idNumber}
              onChangeText={setIdNumber}
              keyboardType="numeric"
              maxLength={20}
            />
          </View>

          {/* Business Name */}
          <Text style={styles.fieldLabel}>Business Name</Text>
          <View style={styles.textInput}>
            <Ionicons name="storefront-outline" size={18} color={GRAY} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.textInputText}
              placeholder="e.g. Kamau Electronics"
              placeholderTextColor={GRAY}
              value={businessName}
              onChangeText={setBusinessName}
              maxLength={60}
            />
          </View>

          {/* Service Category */}
          <Text style={styles.fieldLabel}>Category of Service</Text>
          <View style={styles.categoryGrid}>
            {SERVICE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.label}
                style={[styles.catChip, serviceCategory === cat.label && styles.catChipActive]}
                onPress={() => setServiceCategory(cat.label)}
                activeOpacity={0.8}
              >
                <Ionicons name={cat.icon} size={14} color={serviceCategory === cat.label ? WHITE : GRAY} />
                <Text style={[styles.catChipText, serviceCategory === cat.label && styles.catChipTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Contact Number */}
          <Text style={styles.fieldLabel}>Contact Number</Text>
          <View style={styles.textInput}>
            <Ionicons name="call-outline" size={18} color={GRAY} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.textInputText}
              placeholder="e.g. 0712 345 678"
              placeholderTextColor={GRAY}
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          {/* Photos */}
          <Text style={styles.fieldLabel}>ID Photos</Text>
          <View style={styles.photoRow}>
            <PhotoBox
              label="ID Front"
              uri={idFront?.uri}
              icon="card-outline"
              onPress={() => pickPhoto(setIdFront)}
            />
            <PhotoBox
              label="ID Back"
              uri={idBack?.uri}
              icon="card"
              onPress={() => pickPhoto(setIdBack)}
            />
          </View>

          <Text style={styles.fieldLabel}>Selfie with ID</Text>
          <PhotoBox
            label="Take a selfie holding your ID"
            uri={selfie?.uri}
            icon="camera-outline"
            onPress={() => Alert.alert(
              'Selfie with ID',
              'Take a photo or choose from gallery',
              [
                { text: 'Take Photo', onPress: () => takePhoto(setSelfie) },
                { text: 'Choose from Gallery', onPress: () => pickPhoto(setSelfie) },
                { text: 'Cancel', style: 'cancel' },
              ]
            )}
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={PRIMARY} />
            <Text style={styles.infoText}>
              Documents are encrypted and stored securely. Review takes up to 24 hours.
            </Text>
          </View>

          <View style={styles.payGateNote}>
            <Ionicons name="lock-closed-outline" size={16} color={PRIMARY} />
            <Text style={styles.payGateText}>
              Pay KES 150 verification fee to submit your documents for review.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={() => {
              if (!businessName.trim()) {
                Alert.alert('Error', 'Enter your business name');
                return;
              }
              if (!serviceCategory) {
                Alert.alert('Error', 'Select a category of service');
                return;
              }
              if (!contactNumber.trim() || contactNumber.trim().length < 9) {
                Alert.alert('Error', 'Enter a valid contact number');
                return;
              }
              if (!idNumber.trim() || idNumber.trim().length < 6) {
                Alert.alert('Error', 'Enter a valid ID number (min 6 characters)');
                return;
              }
              if (!idFront || !idBack || !selfie) {
                Alert.alert('Error', 'Upload all 3 photos: ID front, ID back, and selfie');
                return;
              }
              initiatePayment('verified');
            }}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={WHITE} />
              : <Text style={styles.submitBtnText}>Pay KES 150 & Submit →</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Done ─────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: BG }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.doneCard}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-circle" size={64} color={PRIMARY} />
          </View>
          <Text style={styles.doneTitle}>
            {activeTier === 'trusted' ? 'Trusted Status Active!' : 'Documents Submitted!'}
          </Text>
          <Text style={styles.doneSub}>
            {activeTier === 'trusted'
              ? 'You now have the Trusted Seller badge. It appears in the verified sellers directory.'
              : 'Your documents are under review. You\'ll be notified within 24 hours.'}
          </Text>
          <TouchableOpacity style={styles.submitBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.submitBtnText}>Back to Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Overview ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={BLACK} />
        </TouchableOpacity>

        <Text style={styles.pageTitle}>Get Verified</Text>
        <Text style={styles.pageSub}>
          Build trust with buyers. Verified sellers get more transactions and higher limits.
        </Text>

        {/* Current Status Banner */}
        <View style={[styles.statusBanner, {
          backgroundColor: isTrusted ? GOLD + '18' : isVerified ? PRIMARY + '12' : isPending ? '#FF9500' + '15' : '#F0F0F0',
          borderColor:     isTrusted ? GOLD : isVerified ? PRIMARY : isPending ? '#FF9500' : BORDER,
        }]}>
          <Ionicons
            name={isTrusted ? 'star' : isVerified ? 'shield-checkmark' : isPending ? 'time' : 'person-circle-outline'}
            size={20}
            color={isTrusted ? GOLD : isVerified ? PRIMARY : isPending ? '#FF9500' : GRAY}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.statusTitle, {
              color: isTrusted ? GOLD : isVerified ? PRIMARY : isPending ? '#FF9500' : BLACK,
            }]}>
              {isTrusted ? 'Trusted Seller' : isVerified ? 'Verified Seller' : isPending ? 'Under Review' : 'Basic Account'}
            </Text>
            <Text style={styles.statusSub}>
              {isTrusted
                ? 'Gold badge · No transaction limits'
                : isVerified
                ? 'Green badge · Up to KES 50,000 per transaction'
                : isPending
                ? 'Your documents are being reviewed'
                : 'No badge · Up to KES 500 per transaction'}
            </Text>
          </View>
        </View>

        {/* Pending notice */}
        {isPending && (
          <View style={styles.pendingBox}>
            <Ionicons name="time-outline" size={18} color="#FF9500" />
            <Text style={styles.pendingText}>
              Documents submitted. Review takes up to 24 hours. We'll notify you.
            </Text>
          </View>
        )}

        {/* Tier Cards */}
        {!isPending && (
          <>
            <Text style={styles.sectionTitle}>Verification Tiers</Text>

            <TierCard
              tier="verified"
              fee="150"
              color={PRIMARY}
              badge={isVerified || isTrusted ? 'Active ✓' : null}
              perks={[
                'Green verified badge on your profile',
                'Transaction limit up to KES 50,000',
                'Listed in Verified Sellers directory',
                'Higher buyer trust & more sales',
              ]}
              disabled={isVerified || isTrusted}
              onPress={() => {
                if (isVerified || isTrusted) return
                setStep('uploading') // Fill form first, pay at the end
              }}
            />

            {/* Trusted Seller — data driven, earned not bought */}
            <TrustedProgress
              isTrusted={isTrusted}
              isVerified={isVerified}
              eligibility={eligibility}
              kycData={kycData}
              onClaim={claimTrustedBadge}
              claiming={claiming}
            />
          </>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{kycData?.totalCompleted || 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{kycData?.totalDisputed || 0}</Text>
            <Text style={styles.statLabel}>Disputed</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: PRIMARY }]}>
              {kycStatus === 'verified' ? '✓' : kycStatus === 'pending' ? '⏳' : '—'}
            </Text>
            <Text style={styles.statLabel}>KYC Status</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered:          { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG },
  backBtn:           { marginBottom: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: WHITE, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  pageTitle:         { fontSize: 24, fontWeight: '700', color: BLACK, marginBottom: 6 },
  pageSub:           { fontSize: 14, color: GRAY, marginBottom: 20, lineHeight: 20 },
  sectionTitle:      { fontSize: 16, fontWeight: '700', color: BLACK, marginBottom: 12 },

  // Status banner
  statusBanner:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 20 },
  statusTitle:       { fontSize: 15, fontWeight: '700' },
  statusSub:         { fontSize: 12, color: GRAY, marginTop: 2 },

  // Pending
  pendingBox:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8EE', borderRadius: 10, padding: 12, marginBottom: 20, gap: 8 },
  pendingText:       { fontSize: 13, color: '#FF9500', flex: 1 },

  // Tier card
  tierCard:          { backgroundColor: WHITE, borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  tierCardDisabled:  { opacity: 0.6 },
  tierCardHeader:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tierBadge:         { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  tierTitle:         { fontSize: 16, fontWeight: '700' },
  tierFee:           { fontSize: 12, color: GRAY, marginTop: 2 },
  tierStatus:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tierStatusText:    { fontSize: 12, fontWeight: '600' },
  tierPerks:         { marginBottom: 14, gap: 6 },
  perkRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkText:          { fontSize: 13, color: BLACK },
  tierBtn:           { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  tierBtnText:       { color: WHITE, fontWeight: '700', fontSize: 14 },

  // Eligibility
  eligibilityBox:    { backgroundColor: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  eligibilityTitle:  { fontSize: 14, fontWeight: '700', color: BLACK, marginBottom: 10 },
  eligibilityRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  eligibilityText:   { fontSize: 13, color: BLACK },
  eligibleNote:      { marginTop: 10, fontSize: 13, color: PRIMARY, fontWeight: '600' },

  // Stats
  statsRow:          { flexDirection: 'row', gap: 10, marginTop: 8 },
  statBox:           { flex: 1, backgroundColor: WHITE, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  statNum:           { fontSize: 22, fontWeight: '700', color: BLACK },
  statLabel:         { fontSize: 11, color: GRAY, marginTop: 4 },

  // Paying
  payingCard:        { backgroundColor: WHITE, borderRadius: 20, padding: 28, margin: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  payingTitle:       { fontSize: 20, fontWeight: '700', color: BLACK, marginBottom: 10 },
  payingSub:         { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  payingWait:        { fontSize: 13, color: PRIMARY, fontWeight: '600', marginBottom: 20 },
  cancelBtn:         { paddingVertical: 10, paddingHorizontal: 28, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  cancelBtnText:     { fontSize: 14, color: GRAY },

  // Upload
  stepBadgeRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  stepDot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: BORDER },
  stepDotActive:     { backgroundColor: PRIMARY },
  stepLabel:         { fontSize: 12, color: GRAY, marginLeft: 4 },
  fieldLabel:        { fontSize: 13, fontWeight: '600', color: BLACK, marginBottom: 8, marginTop: 16 },
  textInput:         { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 14 },
  textInputText:     { fontSize: 14, color: BLACK, flex: 1, padding: 0 },
  photoRow:          { flexDirection: 'row', gap: 12 },
  photoBox:          { flex: 1, backgroundColor: WHITE, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed', padding: 20, alignItems: 'center', minHeight: 130, overflow: 'hidden', justifyContent: 'center' },
  photoPreview:      { width: '100%', height: 130, borderRadius: 10, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  photoOverlay:      { position: 'absolute', bottom: 8, right: 8, backgroundColor: PRIMARY, borderRadius: 14, padding: 2 },
  photoIconWrap:     { width: 52, height: 52, borderRadius: 26, backgroundColor: PRIMARY + '12', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  photoLabel:        { fontSize: 13, fontWeight: '600', color: BLACK, textAlign: 'center' },
  photoSub:          { fontSize: 11, color: GRAY, marginTop: 2 },
  infoBox:           { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: PRIMARY + '10', borderRadius: 10, padding: 12, marginTop: 20 },
  infoText:          { fontSize: 12, color: PRIMARY, flex: 1, lineHeight: 18 },
  payGateNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: PRIMARY + '10', borderRadius: 10, padding: 12, marginTop: 16 },
  payGateText:       { fontSize: 12, color: PRIMARY, flex: 1, lineHeight: 18, fontWeight: '500' },
  submitBtn:         { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  submitBtnText:     { color: WHITE, fontWeight: '700', fontSize: 16, paddingHorizontal:4},

  // Category chips
  categoryGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catChip:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE },
  catChipActive:     { backgroundColor: PRIMARY, borderColor: PRIMARY },
  catChipText:       { fontSize: 12, fontWeight: '600', color: GRAY },
  catChipTextActive: { color: WHITE },

  // Done
  doneCard:          { backgroundColor: WHITE, borderRadius: 20, padding: 28, margin: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  doneIcon:          { marginBottom: 16 },
  doneTitle:         { fontSize: 22, fontWeight: '700', color: BLACK, marginBottom: 10, textAlign: 'center' },
  doneSub:           { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
});
