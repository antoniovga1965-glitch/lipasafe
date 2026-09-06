import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HardHat, Wrench, Package, FileEdit } from 'lucide-react-native';
import { COLORS, SPACING, SHARED_STYLES } from './diasporaTheme';

const DEAL_TYPES = [
  {
    key: 'construction',
    title: 'Construction / Renovation',
    desc: 'Building, repairs, or renovation projects with staged payments.',
    icon: HardHat,
  },
  {
    key: 'custom',
    title: 'Custom Deal',
    desc: 'Any other agreement — you define the milestones and terms.',
    icon: FileEdit,
  },
];

export default function DiasporaDealTypeScreen({ navigation }) {
  const [selected, setSelected] = useState(null);

  const handleContinue = () => {
    if (!selected) return;
    navigation.navigate('DiasporaDealForm', { dealType: selected });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headerTitle}>What kind of deal is this?</Text>
        <Text style={styles.headerSubtitle}>
          Select the category that best describes your transaction.
        </Text>

        <View style={styles.cardsWrap}>
          {DEAL_TYPES.map((type) => {
            const isSelected = selected === type.key;
            return (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                ]}
                activeOpacity={0.8}
                onPress={() => setSelected(type.key)}
              >
                <type.icon size={28} color={COLORS.primary} style={styles.cardIcon} />
                <Text style={styles.cardTitle}>{type.title}</Text>
                <Text style={styles.cardDesc}>{type.desc}</Text>
                {isSelected && <View style={styles.selectedIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.ctaButton, !selected && styles.ctaButtonDisabled]}
          activeOpacity={0.8}
          disabled={!selected}
          onPress={handleContinue}
        >
          <Text style={styles.ctaButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...SHARED_STYLES.container,
  },
  scroll: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 24,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  cardsWrap: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    position: 'relative',
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  cardIcon: {
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  footer: {
    ...SHARED_STYLES.footer,
  },
  ctaButton: {
    ...SHARED_STYLES.ctaButton,
  },
  ctaButtonDisabled: {
    ...SHARED_STYLES.ctaButtonDisabled,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});