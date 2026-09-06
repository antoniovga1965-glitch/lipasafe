import React from 'react';
import { Clipboard } from 'react-native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, StatusBar, Linking,Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#00A86B';
const GOLD    = '#F5A623';
const BG      = '#F7F8FA';
const WHITE   = '#FFFFFF';
const BLACK   = '#1A1A1A';
const GRAY    = '#9E9E9E';
const BORDER  = '#E8E8E8';

const CATEGORY_ROUTES = {
  second_hand:  { screen: 'PayTab',  params: { screen: 'SecondHandMarket' },    label: 'Buy via SafeEscrow',  icon: 'bag-handle-outline' },
  fundi:        { screen: 'PayTab',  params: { screen: 'Contractor' },          label: 'Hire via SafeEscrow', icon: 'hammer-outline' },
  delivery:     { screen: 'PayTab',  params: { screen: 'Delivery' },            label: 'Book Delivery',       icon: 'bicycle-outline' },
  house_agent:  { screen: 'PayTab',  params: { screen: 'HouseHunting' },        label: 'Browse Listings',     icon: 'home-outline' },
  freelancer:   { screen: 'PayTab',  params: { screen: 'CustomEscrowCreate' },  label: 'Hire via SafeEscrow', icon: 'laptop-outline' },
  goods_seller: { screen: 'PayTab',  params: { screen: 'SecondHandMarket' },    label: 'Buy via SafeEscrow',  icon: 'storefront-outline' },
  bundles:      { screen: 'PayTab',  params: { screen: 'BundlePayment' },       label: 'Buy Bundle',          icon: 'phone-portrait-outline' },
  other:        { screen: 'PayTab',  params: { screen: 'CustomEscrowCreate' },  label: 'Transact Safely',     icon: 'shield-checkmark-outline' },
};

const CATEGORY_LABELS = {
  second_hand: 'Second Hand', fundi: 'Fundi / Contractor',
  delivery: 'Delivery', house_agent: 'House Agent',
  freelancer: 'Freelancer', goods_seller: 'Goods Seller',
  bundles: 'Bundles', other: 'Other',
};

function StarRating({ rating }) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : (i === full && half ? 'star-half' : 'star-outline')}
          size={16}
          color={GOLD}
        />
      ))}
    </View>
  );
}

export default function SellerDetailScreen({ route, navigation }) {
  const { seller } = route.params;
  const profile    = seller.sellerProfile;
  const isTrusted  = profile?.trustedSeller;
  const badgeColor = isTrusted ? GOLD : PRIMARY;
  const badgeIcon  = isTrusted ? 'star' : 'shield-checkmark';
  const badgeLabel = isTrusted ? 'Trusted Seller' : 'Verified Seller';
  const rating     = parseFloat(profile?.rating || 5);
  const categoryKey = profile?.category;
  const route_cfg  = CATEGORY_ROUTES[categoryKey] || CATEGORY_ROUTES.other;

  const accountAgeMonths = seller.createdAt
    ? Math.floor((Date.now() - new Date(seller.createdAt)) / (1000 * 60 * 60 * 24 * 30))
    : null;
  const getTradeStars = (trades) => {
    if (trades >= 50) return 5;
    if (trades >= 40) return 4;
    if (trades >= 30) return 3;
    if (trades >= 20) return 2;
    if (trades >= 10) return 1;
    return 0;
  };
  const accountAgeLabel = accountAgeMonths === null
    ? '—'
    : accountAgeMonths < 1
      ? 'New'
      : accountAgeMonths < 12
        ? `${accountAgeMonths}mo`
        : `${Math.floor(accountAgeMonths / 12)}yr`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={BLACK} />
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            {seller.avatarUrl
              ? <Image source={{ uri: seller.avatarUrl }} style={styles.avatar} />
              : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: badgeColor + '20' }]}>
                  <Text style={[styles.avatarInitial, { color: badgeColor }]}>
                    {seller.fullName?.[0]?.toUpperCase()}
                  </Text>
                </View>
              )
            }
            <View style={[styles.badgeDot, { backgroundColor: badgeColor }]}>
              <Ionicons name={badgeIcon} size={12} color={WHITE} />
            </View>
          </View>

          <Text style={styles.name}>{seller.fullName}</Text>
          {profile?.businessName && (
            <Text style={styles.businessName}>{profile.businessName}</Text>
          )}

          <View style={[styles.badgePill, { backgroundColor: badgeColor + '15', borderColor: badgeColor }]}>
            <Ionicons name={badgeIcon} size={13} color={badgeColor} />
            <Text style={[styles.badgePillText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>

          <Text style={styles.categoryTag}>{CATEGORY_LABELS[categoryKey] || categoryKey}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{seller.totalCompleted}</Text>
            <Text style={styles.statLabel}>Trades</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <StarRating rating={getTradeStars(seller.totalCompleted)} />
            <Text style={styles.statLabel}>Trade Level</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{accountAgeLabel}</Text>
            <Text style={styles.statLabel}>On LipaSafe</Text>
          </View>
        </View>

        {/* Trust Signals */}
        <View style={styles.trustCard}>
          <Text style={styles.sectionTitle}>Trust & Safety</Text>
          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark" size={18} color={PRIMARY} />
            <Text style={styles.trustText}>KYC identity verified</Text>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="lock-closed" size={18} color={PRIMARY} />
            <Text style={styles.trustText}>All payments held in escrow</Text>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="chatbubble-ellipses" size={18} color={PRIMARY} />
            <Text style={styles.trustText}>Dispute protection available</Text>
          </View>
          {isTrusted && (
            <View style={styles.trustRow}>
              <Ionicons name="star" size={18} color={GOLD} />
              <Text style={[styles.trustText, { color: GOLD }]}>Earned Trusted badge — 10+ trades, 4.0+ rating</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Transact with {seller.fullName?.split(' ')[0]}</Text>

          {/* Primary — category-specific */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate(route_cfg.screen, route_cfg.params)}
            activeOpacity={0.85}
          >
            <Ionicons name={route_cfg.icon} size={20} color={WHITE} />
            <Text style={styles.primaryBtnText}>{route_cfg.label}</Text>
          </TouchableOpacity>

          {/* Secondary — direct send */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('HomeTab', { screen: 'QuickSend' })}
            activeOpacity={0.85}
          >
            <Ionicons name="send-outline" size={18} color={PRIMARY} />
            <Text style={styles.secondaryBtnText}>Send Money Directly</Text>
          </TouchableOpacity>

          {/* Contact buttons */}
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => {
                const phone = seller.phone?.replace(/\D/g, '')
                if (!phone) return Alert.alert('Unavailable', 'Phone number not available')
                Linking.openURL(`tel:+${phone}`)
              }}
            >
              <Ionicons name="call-outline" size={18} color={PRIMARY} />
              <Text style={styles.contactBtnText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => {
                const phone = seller.phone?.replace(/\D/g, '')
                if (!phone) return Alert.alert('Unavailable', 'Phone number not available')
                Linking.openURL(`sms:+${phone}`)
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color={PRIMARY} />
              <Text style={styles.contactBtnText}>SMS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => {
                const phone = seller.phone?.replace(/\D/g, '')
                if (!phone) return Alert.alert('Unavailable', 'Phone number not available')
                Linking.openURL(`whatsapp://send?phone=+${phone}`)
              }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={[styles.contactBtnText, { color: '#25D366' }]}>App</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => {
                const phone = seller.phone?.replace(/\D/g, '')
                if (!phone) return Alert.alert('Unavailable', 'Phone number not available')
               
                Clipboard.setString(`+${phone}`)
                Alert.alert('Copied', `+${phone} copied to clipboard`)
              }}
            >
              <Ionicons name="copy-outline" size={18} color={PRIMARY} />
              <Text style={styles.contactBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.safeNote}>
            <Ionicons name="information-circle-outline" size={14} color={GRAY} />
            <Text style={styles.safeNoteText}>
              We recommend using SafeEscrow — your money is only released when you confirm delivery.
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:            { paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: WHITE, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  profileCard:       { backgroundColor: WHITE, marginHorizontal: 16, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  avatarWrap:        { position: 'relative', marginBottom: 12 },
  avatar:            { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarInitial:     { fontSize: 32, fontWeight: '700' },
  badgeDot:          { position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: WHITE },
  name:              { fontSize: 22, fontWeight: '700', color: BLACK, marginBottom: 4 },
  businessName:      { fontSize: 14, color: GRAY, marginBottom: 10 },
  badgePill:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, marginBottom: 8 },
  badgePillText:     { fontSize: 13, fontWeight: '700' },
  categoryTag:       { fontSize: 13, color: GRAY },
  statsCard:         { backgroundColor: WHITE, marginHorizontal: 16, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  statItem:          { flex: 1, alignItems: 'center', gap: 6 },
  statNum:           { fontSize: 22, fontWeight: '700', color: BLACK },
  statLabel:         { fontSize: 11, color: GRAY, textAlign: 'center' },
  statDivider:       { width: 1, height: 40, backgroundColor: BORDER },
  trustCard:         { backgroundColor: WHITE, marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  sectionTitle:      { fontSize: 15, fontWeight: '700', color: BLACK, marginBottom: 14 },
  trustRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  trustText:         { fontSize: 13, color: BLACK },
  actionsCard:       { backgroundColor: WHITE, marginHorizontal: 16, borderRadius: 16, padding: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  primaryBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, marginBottom: 10 },
  primaryBtnText:    { color: WHITE, fontWeight: '700', fontSize: 16 },
  secondaryBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: WHITE, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: PRIMARY, marginBottom: 14 },
  secondaryBtnText:  { color: PRIMARY, fontWeight: '700', fontSize: 15 },
  contactRow:        { flexDirection: 'row', gap: 10, marginBottom: 14 },
  contactBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER },
  contactBtnText:    { fontSize: 13, fontWeight: '600', color: PRIMARY },
  safeNote:          { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: BG, borderRadius: 10, padding: 12 },
  safeNoteText:      { fontSize: 12, color: GRAY, flex: 1, lineHeight: 18 },
});
