import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

const SEND_POINTS = [
  'Avoid wrong number mistakes',
  'Money stays protected until accepted',
  'Includes purpose and note',
  'Clear proof and paper trail',
  'Auto refund if not accepted',
];

const RECEIVE_POINTS = [
  'No need to ask people to send',
  'Share request with purpose',
  'They pay securely via LipaSafe',
  'Track status in real time',
  'Expires if not paid',
];

export default function SafeSendExplainerModal({ visible, onClose, onConfirm, showCloseButton = true, mode = 'send' }) {
  const insets = useSafeAreaInsets();
  const isSend = mode === 'send';
  const points = isSend ? SEND_POINTS : RECEIVE_POINTS;
  const ctaText = isSend ? 'Send with Confidence' : 'Request with Ease';
  const ctaIcon = isSend ? 'shield-checkmark' : 'arrow-down-circle';
  const iconName = isSend ? 'paper-plane' : 'arrow-down-circle';
  const title = isSend ? 'Send' : 'Receive';
  const badge = isSend ? 'SafeSend' : 'Request Money';
  const accentColor = isSend ? colors.primary : '#6B4EFF';
  const tintColor = isSend ? '#EAF8F1' : '#F1ECFF';
  const blurb = isSend
    ? "You send money, but it's not released until the other person accepts."
    : 'You request money from someone. They pay you directly.';

  const handleCta = () => {
    if (onConfirm) onConfirm();
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => showCloseButton && onClose()}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { borderTopColor: accentColor }]}>
          {showCloseButton && (
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.grayDark} />
            </TouchableOpacity>
          )}

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.iconCircle, { backgroundColor: accentColor }]}>
              <Ionicons name={iconName} size={32} color={colors.white} />
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
              <View style={[styles.badge, { backgroundColor: accentColor }]}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            </View>

            <Text style={styles.blurb}>{blurb}</Text>

            <View style={styles.whyWrap}>
              <Text style={styles.whyTitle}>Why use it?</Text>
              <View style={[styles.whyUnderline, { backgroundColor: accentColor }]} />
            </View>

            {points.map((p, i) => (
              <View key={i} style={[styles.pointRow, { backgroundColor: tintColor }]}>
                <Ionicons name="checkmark-circle" size={22} color={accentColor} />
                <Text style={styles.pointText}>{p}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: accentColor, marginBottom: insets.bottom + 16 }]}
            onPress={handleCta}
            activeOpacity={0.85}
          >
            <Ionicons name={ctaIcon} size={18} color={colors.white} style={styles.ctaIcon} />
            <Text style={styles.ctaText}>{ctaText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 3,
    maxHeight: '85%', paddingTop: 24, paddingHorizontal: 24, flexDirection: 'column',
  },
  scrollArea: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 12 },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 4 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { fontSize: 23, fontWeight: '800', color: colors.black },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.white },
  blurb: { fontSize: 14, color: colors.grayDark, marginBottom: 22, lineHeight: 20 },
  whyWrap: { marginBottom: 14 },
  whyTitle: { fontSize: 13, fontWeight: '800', color: colors.grayDark, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  whyUnderline: { width: 28, height: 3, borderRadius: 2 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  pointText: { fontSize: 14, color: '#1A1A1A', fontWeight: '500', flex: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, borderRadius: 14, marginTop: 14 },
  ctaIcon: { position: 'absolute', left: 18 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
