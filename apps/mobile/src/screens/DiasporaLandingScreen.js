import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, SHARED_STYLES } from './diasporaTheme';

const STEPS = [
  {
    step: '1',
    title: 'Create Your Deal',
    desc: 'Set up an escrow deal with milestones for any transaction back home.',
  },
  {
    step: '2',
    title: 'Fund the Escrow',
    desc: 'Send money via bank transfer or remittance service. We hold it safely.',
  },
  {
    step: '3',
    title: 'Release by Milestone',
    desc: 'Funds are released only when each milestone is completed and verified.',
  },
];

export default function DiasporaLandingScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Send Money Safely For Any Deal Back Home
          </Text>
          <Text style={styles.heroSubtitle}>
            Protect your hard-earned money with milestone-based escrow for
            construction, hiring, purchases, and custom deals in Kenya.
          </Text>
        </View>

        <View style={styles.stepsSection}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          {STEPS.map((item, index) => (
            <View key={index} style={styles.stepCard}>
              <View style={styles.stepNumberWrap}>
                <Text style={styles.stepNumber}>{item.step}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{item.title}</Text>
                <Text style={styles.stepDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('DiasporaDealType')}
        >
          <Text style={styles.ctaButtonText}>Start a New Deal</Text>
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
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.screenPadding,
    marginTop: 16,
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 24,
    paddingBottom: 28,
    borderRadius: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
    lineHeight: 22,
  },
  stepsSection: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  stepCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  stepNumberWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepNumber: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
  },
  footer: {
    ...SHARED_STYLES.footer,
  },
  ctaButton: {
    ...SHARED_STYLES.ctaButton,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});