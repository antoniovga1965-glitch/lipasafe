import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Modal, ActivityIndicator,
  Image, Alert, Dimensions,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { removeData, getData, storeData } from '../utils/storage';
import { authFetch, BASE_URL } from '../utils/api';
import { getAccessToken } from '../utils/secureStorage';
import { useLang } from '../context/LanguageContext';
import { pickImage } from '../utils/pickImage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const KYC_COLOR = { verified: colors.success, pending: colors.warning, rejected: colors.error, unverified: colors.grayDark };
const KYC_ICON  = { verified: 'shield-checkmark', pending: 'time', rejected: 'close-circle', unverified: 'shield-outline' };

const menuItems = [
  { key: 'deliveryOrders', icon: 'bicycle',          screen: 'DeliveryOrders' },
  { key: 'sellerDash',    icon: 'briefcase',        screen: 'SellerDashboard' },
  { key: 'verifyMe',      icon: 'shield-checkmark', screen: 'SellerVerification' },
  { key: 'settings',      icon: 'settings',         screen: 'Settings' },
  { key: 'notifications', icon: 'notifications',    screen: 'Notifications' },
];

export default function ProfileScreen({ navigation }) {
  const { t } = useLang();
  const [user,            setUser]            = useState(null);
  const [stats,           setStats]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [editModal,       setEditModal]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [uploadingAv,     setUploadingAv]     = useState(false);
  const [avatarFullscreen,setAvatarFullscreen]= useState(false);
  const [form,            setForm]            = useState({ fullName: '', email: '' });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [uRes, sRes] = await Promise.all([
        authFetch('/user/me'),
        authFetch('/user/stats'),
      ]);
      const uData = await uRes.json();
      const sData = await sRes.json();
      if (uData.success) {
        setUser(uData.user);
        setForm({ fullName: uData.user.fullName || '', email: uData.user.email || '' });
      }
      if (sData.success) setStats(sData.stats);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const saveProfile = async () => {
    try {
      setSaving(true);
      const res  = await authFetch('/user/profile', { method: 'PATCH', body: JSON.stringify({ fullName: form.fullName, email: form.email }) });
      const data = await res.json();
      if (data.success) {
  
        setUser(prev => ({ ...prev, ...data.user }));
        setEditModal(false);
      } else Alert.alert('Error', data.message || 'Could not save');
    } catch { Alert.alert('Error', 'Something went wrong'); }
    finally { setSaving(false); }
  };

  const pickAvatar = () => {
    Alert.alert('Change Photo', 'Choose an option', [
      { text: 'Camera',  onPress: () => launchAvatar('camera') },
      { text: 'Gallery', onPress: () => launchAvatar('gallery') },
      { text: 'Cancel',  style: 'cancel' },
    ]);
  };

  const launchAvatar = async (source) => {
    try {
      const picked = await pickImage(source);
      if (!picked || picked.canceled) return;
      if (picked.error) return Alert.alert('Error', picked.error);

      setUploadingAv(true);
      const token = await getAccessToken();

      const res = await fetch(`${BASE_URL}/user/avatar`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image: picked.base64, mimeType: 'image/jpeg' }),
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (data.success) {
      
        setUser(prev => ({ ...prev, avatarUrl: data.user.avatarUrl }));

        // Persist to AsyncStorage so it survives navigation/reload
        try {
          const stored = await getData('user');
          const parsed = stored ? JSON.parse(stored) : {};
          await storeData('user', JSON.stringify({ ...parsed, avatarUrl: data.user.avatarUrl }));
        } catch {}
      } else {
        Alert.alert('Error', data.message || 'Could not upload');
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'Upload failed');
    } finally {
      setUploadingAv(false);
    }
  };

  const logout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await removeData('user');
        await removeData('pin');
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }},
    ]);
  };

  const kycStatus = user?.kycStatus  || 'unverified';
  const kycColor  = KYC_COLOR[kycStatus] || colors.grayDark;
  const kycIcon   = KYC_ICON[kycStatus]  || 'shield-outline';

  return (
    <View style={styles.container}>
      <View style={styles.header}>

        {/* Avatar — tap big circle = fullscreen, tap camera = upload */}
        <View style={styles.avatarWrap}>
          <TouchableOpacity
            onPress={() => user?.avatarUrl && setAvatarFullscreen(true)}
            disabled={uploadingAv}
            activeOpacity={user?.avatarUrl ? 0.8 : 1}
          >
            {user?.avatarUrl
              ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
              : <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{user?.fullName?.[0]?.toUpperCase() || 'M'}</Text>
                </View>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.avatarEdit} onPress={pickAvatar} disabled={uploadingAv}>
            {uploadingAv
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Ionicons name="camera" size={14} color={colors.white} />
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.name}>{user?.fullName || 'Mteja'}</Text>
        <Text style={styles.phone}>{user?.phone || ''}</Text>
        <View style={[styles.kycBadge, { backgroundColor: kycColor + '22' }]}>
          <Ionicons name={kycIcon} size={14} color={kycColor} />
          <Text style={[styles.kycText, { color: kycColor }]}>{kycStatus.toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={() => setEditModal(true)}>
          <Ionicons name="pencil" size={14} color={colors.white} />
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loading ? '—' : stats?.totalTransactions ?? 0}</Text>
            <Text style={styles.statLabel}>Transactions</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statValue}>{loading ? '—' : `KES ${Number(stats?.totalVolume || 0).toLocaleString()}`}</Text>
            <Text style={styles.statLabel}>Total Volume</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loading ? '—' : `KES ${Number(stats?.escrowBalance || 0).toLocaleString()}`}</Text>
            <Text style={styles.statLabel}>In Escrow</Text>
          </View>
        </View>

        <View style={styles.menu}>
          {menuItems.map(item => (
            <TouchableOpacity key={item.key} style={styles.menuItem} onPress={() => navigation.navigate(item.screen)}>
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuText}>{t[item.key]}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.grayDark} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.menuItem, styles.logout]} onPress={logout}>
            <View style={[styles.menuIconWrap, { backgroundColor: colors.error + '15' }]}>
              <Ionicons name="log-out" size={20} color={colors.error} />
            </View>
            <Text style={[styles.menuText, styles.logoutText]}>{t.logout}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Fullscreen Avatar Modal */}
      <Modal
        visible={avatarFullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarFullscreen(false)}
      >
        <TouchableOpacity
          style={styles.avatarModalOverlay}
          activeOpacity={1}
          onPress={() => setAvatarFullscreen(false)}
        >
          <Image
            source={{ uri: user?.avatarUrl }}
            style={styles.avatarModalImg}
            resizeMode="contain"
          />
          <View style={styles.avatarModalClose}>
            <Ionicons name="close" size={28} color={colors.white} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editModal} animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.black} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={form.fullName}
              onChangeText={v => setForm(p => ({ ...p, fullName: v }))}
              placeholder="Enter full name"
              placeholderTextColor={colors.grayDark}
            />
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={v => setForm(p => ({ ...p, email: v }))}
              placeholder="Enter email"
              placeholderTextColor={colors.grayDark}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: colors.gray },
  header:               { backgroundColor: colors.primary, alignItems: 'center', paddingTop: 60, paddingBottom: 30 },
  avatarWrap:           { position: 'relative' },
  avatarImg:            { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.white },
  avatarPlaceholder:    { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  avatarText:           { fontSize: 34, fontWeight: 'bold', color: colors.primary },
  avatarEdit:           { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primaryDark, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  name:                 { fontSize: 20, fontWeight: 'bold', color: colors.white, marginTop: 12 },
  phone:                { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  kycBadge:             { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 10 },
  kycText:              { fontSize: 11, fontWeight: '700', },
  editBtn:              { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  editBtnText:          { color: colors.white, fontSize: 13, fontWeight: '600' },
  statsRow:             { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', elevation: 2 },
  statCard:             { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statCardMid:          { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  statValue:            { fontSize: 15, fontWeight: '700', color: colors.black },
  statLabel:            { fontSize: 11, color: colors.grayDark, marginTop: 3 },
  menu:                 { marginTop: 16, paddingHorizontal: 16, paddingBottom: 30 },
  menuItem:             { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: 14, borderRadius: 12, marginBottom: 10 },
  menuIconWrap:         { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuText:             { flex: 1, fontSize: 15, color: colors.black },
  logout:               { marginTop: 6 },
  logoutText:           { color: colors.error },
 
  avatarModalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  avatarModalImg:       { width: SCREEN_WIDTH, height: SCREEN_WIDTH, borderRadius: 0 },
  avatarModalClose:     { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 6 },

  modalOverlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:            { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:           { fontSize: 18, fontWeight: '700', color: colors.black },
  label:                { fontSize: 13, fontWeight: '600', color: colors.black, marginBottom: 6 },
  input:                { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 15, color: colors.black, marginBottom: 16, backgroundColor: colors.gray },
  saveBtn:              { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  saveBtnText:          { color: colors.white, fontSize: 16, fontWeight: '700' },
});