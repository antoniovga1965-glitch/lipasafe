import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Linking, Alert
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SUPPORT_WHATSAPP = '254727669032';
const SUPPORT_EMAIL    = 'support@lipasafe.co.ke';
const SUPPORT_PHONE    = '0727669032';

const faqs = [
  {
    q: 'How do I add money to my wallet?',
    a: 'Tap "Add Money" on the home screen. Enter the amount and confirm. You will receive an M-Pesa STK push — enter your PIN to complete.'
  },
  {
    q: 'How do I send money?',
    a: 'Tap "Send" on the home screen. Enter the recipient\'s phone number and amount. For amounts above KES 500, your PIN is required.'
  },
  {
    q: 'How does Receive work?',
    a: 'Tap "Receive", enter the sender\'s phone number and the amount you want. They will get an M-Pesa prompt on their phone to pay you directly.'
  },
  {
    q: 'What is the transaction fee?',
    a: 'LipaSafe charges a flat 2% fee on all transactions. The fee is shown clearly before you confirm any payment.'
  },
  {
    q: 'My payment is stuck on Pending. What do I do?',
    a: 'Pending transactions are automatically resolved within 5 minutes. If it stays pending longer, contact support with your transaction reference.'
  },
  {
    q: 'What are the transaction limits?',
    a: 'Minimum: KES 1. Maximum per transaction: KES 150,000. Daily deposit limit: KES 300,000.'
  },
  {
    q: 'How do I raise a dispute?',
    a: 'Go to Activity, tap the transaction, then tap "Raise Dispute". Provide details and our team will respond within 24 hours.'
  },
  {
    q: 'Is my money safe?',
    a: 'Yes. All wallet balances are backed by M-Pesa float. Transactions use bank-grade encryption and are protected by your PIN.'
  },
]

// Receives styles + colors as props so it works outside SupportScreen scope
function FAQItem({ item, styles, colors }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity style={styles.faqItem} onPress={() => setOpen(!open)} activeOpacity={0.8}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ}>{item.q}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.grayDark} />
      </View>
      {open && <Text style={styles.faqA}>{item.a}</Text>}
    </TouchableOpacity>
  )
}

export default function SupportScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const openWhatsApp = () => {
    const url = `whatsapp://send?phone=${SUPPORT_WHATSAPP}&text=Hi LipaSafe Support,`
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url)
      else Alert.alert('WhatsApp not installed', 'Please call or email us instead.')
    })
  }

  const openEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=LipaSafe Support Request`)
  }

  const openCall = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`)
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Contact Options */}
        <Text style={styles.sectionTitle}>Contact Us</Text>
        <View style={styles.contactBox}>
          <TouchableOpacity style={styles.contactRow} onPress={openWhatsApp}>
            <View style={[styles.contactIcon, { backgroundColor: '#25D366' }]}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactLabel}>WhatsApp</Text>
              <Text style={styles.contactSub}>Chat with us instantly</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.grayDark} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.contactRow} onPress={openEmail}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="mail-outline" size={20} color="#fff" />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactSub}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.grayDark} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.contactRow} onPress={openCall}>
            <View style={[styles.contactIcon, { backgroundColor: '#4A90E2' }]}>
              <Ionicons name="call-outline" size={20} color="#fff" />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactLabel}>Call Us</Text>
              <Text style={styles.contactSub}>{SUPPORT_PHONE}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.grayDark} />
          </TouchableOpacity>
        </View>

        {/* Dispute */}
        <TouchableOpacity
          style={styles.disputeBtn}
          onPress={() => navigation.navigate('ActivityTab', { screen: 'Dispute' })}
        >
          <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
          <Text style={styles.disputeText}>Raise a Transaction Dispute</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.error} />
        </TouchableOpacity>

        {/* FAQs */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <View style={styles.faqBox}>
          {faqs.map((item, i) => (
            <View key={i}>
              <FAQItem item={item} styles={styles} colors={colors} />
              {i < faqs.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Text style={styles.footer}>LipaSafe — Secure Payments Platform{'\n'}Response time: within 24 hours</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.white },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.gray },
  backBtn:      { padding: 4 },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: colors.black },
  content:      { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.grayDark, marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  contactBox:   { backgroundColor: colors.gray, borderRadius: 14, marginBottom: 16 },
  contactRow:   { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  contactIcon:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  contactText:  { flex: 1 },
  contactLabel: { fontSize: 15, fontWeight: '600', color: colors.black },
  contactSub:   { fontSize: 12, color: colors.grayDark, marginTop: 2 },
  divider:      { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  disputeBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF5F5', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#FFD5D5' },
  disputeText:  { flex: 1, fontSize: 15, fontWeight: '600', color: colors.error },
  faqBox:       { backgroundColor: colors.gray, borderRadius: 14, marginBottom: 24 },
  faqItem:      { padding: 16 },
  faqHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  faqQ:         { flex: 1, fontSize: 14, fontWeight: '600', color: colors.black },
  faqA:         { fontSize: 13, color: '#555', marginTop: 10, lineHeight: 20 },
  footer:       { fontSize: 12, color: colors.grayDark, textAlign: 'center', lineHeight: 18 },
});
