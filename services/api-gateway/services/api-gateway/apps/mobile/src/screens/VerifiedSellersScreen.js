import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '../utils/api';

const PRIMARY = '#00A86B';
const GOLD    = '#F5A623';
const BG      = '#F7F8FA';
const WHITE   = '#FFFFFF';
const BLACK   = '#1A1A1A';
const GRAY    = '#9E9E9E';
const BORDER  = '#E8E8E8';

const CATEGORIES = [
  { key: '',            label: 'All' },
  { key: 'second_hand', label: 'Second Hand' },
  { key: 'fundi',       label: 'Fundi' },
  { key: 'delivery',    label: 'Delivery' },
  { key: 'house_agent', label: 'House Agent' },
  { key: 'freelancer',  label: 'Freelancer' },
  { key: 'goods_seller',label: 'Goods Seller' },
  { key: 'bundles',     label: 'Bundles' },
  { key: 'other',       label: 'Other' },
];

function SellerCard({ seller, onPress }) {
  const profile    = seller.sellerProfile;
  const isTrusted  = profile?.trustedSeller;
  const rating     = parseFloat(profile?.rating || 5).toFixed(1);
  const badgeColor = isTrusted ? GOLD : PRIMARY;
  const badgeIcon  = isTrusted ? 'star' : 'shield-checkmark';
  const badgeLabel = isTrusted ? 'Trusted' : 'Verified';

  const categoryLabel = CATEGORIES.find(c => c.key === profile?.category)?.label || profile?.category || '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardLeft}>
        {seller.avatarUrl
          ? <Image source={{ uri: seller.avatarUrl }} style={styles.avatar} />
          : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: badgeColor + '20' }]}>
              <Text style={[styles.avatarInitial, { color: badgeColor }]}>
                {seller.fullName?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )
        }
        <View style={[styles.badgeDot, { backgroundColor: badgeColor }]}>
          <Ionicons name={badgeIcon} size={10} color={WHITE} />
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.sellerName}>{seller.fullName}</Text>
          <View style={[styles.badgePill, { backgroundColor: badgeColor + '18', borderColor: badgeColor }]}>
            <Ionicons name={badgeIcon} size={11} color={badgeColor} />
            <Text style={[styles.badgePillText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
        </View>

        {profile?.businessName && (
          <Text style={styles.businessName}>{profile.businessName}</Text>
        )}

        <Text style={styles.categoryTag}>{categoryLabel}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="star" size={13} color={GOLD} />
            <Text style={styles.statText}>{rating}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle-outline" size={13} color={PRIMARY} />
            <Text style={styles.statText}>{seller.totalCompleted} trades</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function VerifiedSellersScreen({ navigation }) {
  const [sellers, setSellers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory]   = useState('');
  const [tier, setTier]           = useState('');
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(true);
  const [search, setSearch]       = useState('');

  const fetchSellers = useCallback(async (reset = false) => {
    const currentPage = reset ? 1 : page;
    try {
      const params = new URLSearchParams({ page: currentPage, limit: 20 });
      if (category) params.append('category', category);
      if (tier)     params.append('tier', tier);
      const res  = await authFetch(`/kyc/sellers?${params}`);
      const data = await res.json();
      if (data.success) {
        const newSellers = data.data.sellers;
        setSellers(prev => reset ? newSellers : [...prev, ...newSellers]);
        setHasMore(currentPage < data.data.pages);
        if (!reset) setPage(p => p + 1);
      }
    } catch (e) {
      console.error('fetchSellers error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, tier, page]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    setSellers([]);
    setHasMore(true);
    fetchSellers(true);
  }, [category, tier]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchSellers(true);
  };

  const filteredSellers = search.trim()
    ? sellers.filter(s =>
        s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        s.sellerProfile?.businessName?.toLowerCase().includes(search.toLowerCase())
      )
    : sellers;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={BLACK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Verified Sellers</Text>
          <Text style={styles.headerSub}>SafePay-protected sellers</Text>
        </View>
        {/* Trusted filter toggle */}
        <TouchableOpacity
          style={[styles.trustedToggle, tier === 'trusted' && styles.trustedToggleActive]}
          onPress={() => setTier(t => t === 'trusted' ? '' : 'trusted')}
        >
          <Ionicons name="star" size={14} color={tier === 'trusted' ? WHITE : GOLD} />
          <Text style={[styles.trustedToggleText, tier === 'trusted' && { color: WHITE }]}>Trusted</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={GRAY} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search seller or business..."
          placeholderTextColor={GRAY}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={GRAY} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={{ maxHeight: 52 }}
      >
        {CATEGORIES.map(item => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tab, category === item.key && styles.tabActive]}
            onPress={() => setCategory(item.key)}
          >
            <Text style={[styles.tabText, category === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sellers list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={filteredSellers}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={() => { if (hasMore && !loading) fetchSellers() }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={GRAY} />
              <Text style={styles.emptyText}>No verified sellers found</Text>
              <Text style={styles.emptySub}>Try a different category or filter</Text>
            </View>
          }
          ListFooterComponent={hasMore && !loading
            ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 16 }} />
            : null
          }
          renderItem={({ item }) => (
            <SellerCard
              seller={item}
              onPress={() => navigation.navigate('SellerDetail', { seller: item })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:             { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle:         { fontSize: 17, fontWeight: '700', color: BLACK },
  headerSub:           { fontSize: 12, color: GRAY },
  trustedToggle:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: GOLD, backgroundColor: WHITE },
  trustedToggleActive: { backgroundColor: GOLD, borderColor: GOLD },
  trustedToggleText:   { fontSize: 12, fontWeight: '700', color: GOLD },
  searchWrap:          { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, margin: 12, marginBottom: 4, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:         { flex: 1, fontSize: 14, color: BLACK },
  tabs:                { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  tab:                 { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: WHITE, borderWidth: 1.5, borderColor: BORDER, height: 36, justifyContent: 'center', alignItems: 'center' },
  tabActive:           { backgroundColor: PRIMARY, borderColor: PRIMARY },
  tabText:             { fontSize: 13, color: GRAY, fontWeight: '500' },
  tabTextActive:       { color: WHITE, fontWeight: '700' },
  card:                { flexDirection: 'row', backgroundColor: WHITE, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardLeft:            { position: 'relative', marginRight: 12 },
  avatar:              { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder:   { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarInitial:       { fontSize: 22, fontWeight: '700' },
  badgeDot:            { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: WHITE },
  cardBody:            { flex: 1 },
  cardRow:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sellerName:          { fontSize: 15, fontWeight: '700', color: BLACK, flex: 1, marginRight: 8 },
  businessName:        { fontSize: 12, color: GRAY, marginBottom: 2 },
  categoryTag:         { fontSize: 11, color: PRIMARY, fontWeight: '600', marginBottom: 6 },
  badgePill:           { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  badgePillText:       { fontSize: 11, fontWeight: '700' },
  statsRow:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statItem:            { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText:            { fontSize: 12, color: GRAY },
  statDivider:         { width: 1, height: 12, backgroundColor: BORDER },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:               { alignItems: 'center', paddingTop: 60 },
  emptyText:           { fontSize: 16, fontWeight: '600', color: BLACK, marginTop: 12 },
  emptySub:            { fontSize: 13, color: GRAY, marginTop: 4 },
});
