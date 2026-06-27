import React, { useEffect, useRef } from 'react';
import {
  View, Text, Animated, StyleSheet,
  StatusBar, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLang } from '../context/LanguageContext';

/* ─── LS Shield Logo ─────────────────────────────────────── */
function ShieldLogo({ size = 120 }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ghost ring */}
      <View style={{
        position: 'absolute',
        width: size * 0.84,
        height: size * 0.94,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderTopLeftRadius: size * 0.24,
        borderTopRightRadius: size * 0.24,
        borderBottomLeftRadius: size * 0.52,
        borderBottomRightRadius: size * 0.52,
      }} />
      {/* Main shield */}
      <View style={{
        width: size * 0.72,
        height: size * 0.82,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: size * 0.2,
        borderTopRightRadius: size * 0.2,
        borderBottomLeftRadius: size * 0.46,
        borderBottomRightRadius: size * 0.46,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 10,
      }}>
        <Text style={{
          fontSize: size * 0.3,
          color: '#00C170',
          fontWeight: '900',
          letterSpacing: -1,
          marginTop: -2,
        }}>LS</Text>
      </View>
    </View>
  );
}

/* ─── Animated Loading Dots ──────────────────────────────── */
function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1, duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3, duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(400),
        ])
      );

    anim(dot1, 0).start();
    anim(dot2, 200).start();
    anim(dot3, 400).start();
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,0.9)',
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

/* ─── Splash Screen ──────────────────────────────────────── */
export default function SplashScreen({ navigation }) {
  const { t } = useLang();

  const logoScale       = useRef(new Animated.Value(0.5)).current;
  const logoOpacity     = useRef(new Animated.Value(0)).current;
  const titleOpacity    = useRef(new Animated.Value(0)).current;
  const titleY          = useRef(new Animated.Value(20)).current;
  const taglineOpacity  = useRef(new Animated.Value(0)).current;
  const taglineY        = useRef(new Animated.Value(15)).current;
  const pulse           = useRef(new Animated.Value(1)).current;
  const bottomOpacity   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Shield pops in
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1, tension: 35, friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Title slides up
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1, duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(titleY, {
          toValue: 0, duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // 3. Tagline fades in
        Animated.parallel([
          Animated.timing(taglineOpacity, {
            toValue: 1, duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(taglineY, {
            toValue: 0, duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(bottomOpacity, {
            toValue: 1, duration: 600,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // 4. Gentle pulse loop
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulse, {
                toValue: 1.04, duration: 1800,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(pulse, {
                toValue: 1, duration: 1800,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ])
          ).start();
        });
      });
    });

    // Navigate after 3s
    const timer = setTimeout(async () => {
      try {
        const onboarding = null; // DEV: always show onboarding
        // const onboarding = await AsyncStorage.getItem('onboardingComplete');
        const user = await AsyncStorage.getItem('user');
        if (!onboarding) {
          navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        } else if (!user) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        } else {
          const parsed = JSON.parse(user);
          const dest = parsed?.role === 'admin' ? 'AdminStack' : 'Main';
          navigation.reset({ index: 0, routes: [{ name: dest }] });
        }
      } catch {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#00C170" barStyle="light-content" />

      {/* Decorative background circles */}
      <View style={styles.circleTR} />
      <View style={styles.circleBL} />

      {/* Center content */}
      <View style={styles.content}>
        <Animated.View style={{
          opacity: logoOpacity,
          transform: [{ scale: Animated.multiply(logoScale, pulse) }],
        }}>
          <ShieldLogo size={125} />
        </Animated.View>

        <Animated.Text style={[styles.brandName, {
          opacity: titleOpacity,
          transform: [{ translateY: titleY }],
        }]}>
          LIPA SALAMA
        </Animated.Text>

        <Animated.Text style={[styles.tagline, {
          opacity: taglineOpacity,
          transform: [{ translateY: taglineY }],
        }]}>
          {t?.tagline || 'Lipa Salama. Daima.'}
        </Animated.Text>
      </View>

      {/* Bottom: animated dots + label */}
      <Animated.View style={[styles.bottom, { opacity: bottomOpacity }]}>
        <LoadingDots />
        <Text style={styles.secureLabel}>SECURE COMMERCE PLATFORM</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#00C170',
  },

  /* Decorative circles */
  circleTR: {
    position: 'absolute',
    top: -80, right: -70,
    width: 220, height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  circleBL: {
    position: 'absolute',
    bottom: -70, left: -60,
    width: 190, height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    gap: 20,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  bottom: {
    alignItems: 'center',
    paddingBottom: 44,
    gap: 6,
  },
  secureLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
});