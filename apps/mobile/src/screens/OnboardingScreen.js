import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, Animated, Dimensions,
  TouchableOpacity, StyleSheet, StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '../context/LanguageContext';

const { width } = Dimensions.get('window');

const slides = [
  { key: '1', icon: 'shield-checkmark', bg: '#00C47A' },
  { key: '2', icon: 'lock-closed', bg: '#00A86B' },
  { key: '3', icon: 'ribbon', bg: '#00A86B' },
];

const COPY = {
  en: {
    titles: ['Send Money.\nGet What You Paid For.', 'Your Money,\nSafely Held.', 'Something Wrong?\nWe Got You.'],
    texts: ['Pay for goods and services with confidence. LipaSafe protects every transaction.', "Funds are locked in escrow until you confirm you're happy. No shortcuts.", 'Raise a dispute anytime. Our team steps in to make things right.'],
  },
  sw: {
    titles: ['Lipa Salama.\nPokea Ulicholipa.', 'Pesa Yako,\nInahifadhiwa Salama.', 'Kuna Tatizo?\nTuko Nawe.'],
    texts: ['Lipa kwa bidhaa na huduma kwa ujasiri. LipaSafe inalinda kila muamala.', 'Pesa inashikiliwa hadi uthibitishe kupokea. Hakuna njia za mkato.', 'Wasiliana nasi wakati wowote. Timu yetu itasuluhisha tatizo lako.'],
  },
};

function Slide({ slide, index, isActive, lang }) {
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;
  const iconScale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (isActive) {
      fade.setValue(0); translateY.setValue(30); iconScale.setValue(0.7);
      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 400, delay: 150, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, delay: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [isActive]);

  const copy = COPY[lang] || COPY.en;
  return (
    <View style={[styles.slide, { width, backgroundColor: slide.bg }]}>
      <Animated.View style={[styles.iconBox, { transform: [{ scale: iconScale }] }]}>
        <Ionicons name={slide.icon} size={72} color={slide.bg} />
      </Animated.View>
      <Animated.View style={{ opacity: fade, transform: [{ translateY }] }}>
        <Text style={styles.title}>{copy.titles[index]}</Text>
        <Text style={styles.subtitle}>{copy.texts[index]}</Text>
      </Animated.View>
    </View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { t, lang } = useLang();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const btnScale = useRef(new Animated.Value(1)).current;

  const finish = async () => {
    await AsyncStorage.setItem('onboardingComplete', 'true');
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const next = () => {
    if (current < slides.length - 1) {
      scrollRef.current?.scrollTo({ x: (current + 1) * width, animated: true });
    } else { finish(); }
  };

  return (
    <View style={[styles.container, { backgroundColor: slides[current].bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={slides[current].bg} />
      <TouchableOpacity style={styles.skipBtn} onPress={finish}>
        <Text style={styles.skipText}>{t.skip}</Text>
      </TouchableOpacity>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {slides.map((slide, index) => (
          <Slide key={slide.key} slide={slide} index={index} isActive={current === index} lang={lang || 'en'} />
        ))}
      </Animated.ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => {
            
            const o = scrollX.interpolate({ inputRange: [(i-1)*width, i*width, (i+1)*width], outputRange: [0.35,1,0.35], extrapolate: 'clamp' });
            return <Animated.View key={i} style={[styles.dot, current === i && styles.activeDot, { opacity: o }]} />;
          })}
        </View>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity style={styles.btn} onPress={next}
            onPressIn={() => Animated.spring(btnScale, { toValue: 0.94, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start()}
            activeOpacity={1}>
            <Text style={styles.btnText}>{current === slides.length - 1 ? t.getStarted : 'Next '}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: { position: 'absolute', top: 52, right: 24, zIndex: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  skipText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, paddingTop: 80 },
  iconBox: { width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', marginBottom: 48, elevation: 10 },
  title: { fontSize: 30, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16, lineHeight: 38 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 26, paddingHorizontal: 8 },
  footer: { position: 'absolute', bottom: 52, left: 0, right: 0, alignItems: 'center' },
  dots: { flexDirection: 'row', marginBottom: 28, alignItems: 'center' },
  dot: { height: 10, width: 10, borderRadius: 5, backgroundColor: '#fff', marginHorizontal: 5 },
  activeDot: { width: 28 },
  btn: { paddingVertical: 16, paddingHorizontal: 56, backgroundColor: '#fff', borderRadius: 32, elevation: 6 },
  btnText: { color: '#00A86B', fontWeight: '800', fontSize: 17 },
});
