import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RequestSuccessScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { recipientPhone, amount, purpose } = route.params || {};

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={80} color={colors.primary} />
      </View>
      <Text style={styles.title}>Request Sent!</Text>
      <Text style={styles.sub}>
        You requested <Text style={styles.bold}>KES {amount}</Text> from{' '}
        <Text style={styles.bold}>{recipientPhone}</Text> for{' '}
        <Text style={styles.bold}>{purpose}</Text>.
      </Text>
      <Text style={styles.note}>
        We've notified them via SMS. You'll receive a push notification once they pay or reject your request.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('HomeMain')}>
        <Text style={styles.btnText}>Back to Home</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnOutline} onPress={() => navigation.navigate('ActivityTab', { screen: 'TransactionsList' })}>
        <Text style={styles.btnOutlineText}>View Activity</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 30 },
  iconWrap: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 12 },
  sub: { fontSize: 16, color: '#444', textAlign: 'center', lineHeight: 24, marginBottom: 10 },
  bold: { fontWeight: '700', color: '#111' },
  note: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 40, lineHeight: 20 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 12, width: '100%', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline: { borderWidth: 1, borderColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  btnOutlineText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});
