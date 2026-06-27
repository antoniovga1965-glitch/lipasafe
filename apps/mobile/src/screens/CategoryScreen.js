import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import LipaHeader from '../components/LipaHeader';
import { useLang } from '../context/LanguageContext';

const categoryConfig = {
  bundles:  { icon: 'phone-portrait', screen: 'BundlePayment',   color: '#007AFF' },
  secondhand: { icon: 'people',         screen: 'SecondHandMarket', color: '#10B981' },
  fundi:    { icon: 'hammer',         screen: 'Contractor',       color: '#FF9500' },
  delivery: { icon: 'bicycle',        screen: 'Delivery',         color: '#FF6B35' },
  house:    { icon: 'home',           screen: 'HouseHunting',     color: '#00A86B' },
  custom:   { icon: 'create',         screen: 'ConfirmPayment',   color: '#9B59B6' },
};

const features = {
  bundles:  ['Buy airtime & data bundles', 'Safaricom, Airtel, Telkom', 'Instant delivery guaranteed'],
  secondhand: ['Pay for Secondhand  items', 'Seller gets paid on delivery', 'Dispute protection included'],
  fundi:    ['Hire verified fundis safely', 'Pay per milestone', 'Money held till job is done'],
  delivery: ['Pay delivery person safely', 'Release funds on arrival', 'Track your order'],
  house:    ['Pay viewing fees safely', 'Agent paid after viewing', 'Avoid house hunting scams'],
  custom:   ['Send money for anything', 'Buyer & seller protected', 'Set your own terms'],
};

export default function CategoryScreen({ navigation, route }) {
  const { t } = useLang();
  const category = route.params?.category || 'custom';
  const config = categoryConfig[category] || categoryConfig.custom;
  const items = features[category] || features.custom;

  return (
    <View style={styles.container}>
      <LipaHeader title={t[category] || t.custom} navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: config.color + '18' }]}>
          <Ionicons name={config.icon} size={56} color={config.color} />
        </View>
        <Text style={styles.title}>{t[category] || t.custom}</Text>

        <View style={styles.featuresBox}>
          {items.map((item, i) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.featureText}>{item}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: config.color }]}
          onPress={() => navigation.navigate('PayTab', { screen: config.screen })}
        >
          <Text style={styles.btnText}>Start Safe Payment</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: 24, alignItems: 'center' },
  iconWrap: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: colors.black, marginBottom: 24 },
  featuresBox: { width: '100%', backgroundColor: colors.gray, borderRadius: 16, padding: 20, marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  featureText: { fontSize: 15, color: colors.black, marginLeft: 10, flex: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14, width: '100%' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
