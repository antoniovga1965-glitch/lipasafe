import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

export default function PaymentSuccessScreen({ navigation, route }) {
  const { t } = useLang();
  const { tx } = route.params || {};
  const isFundi    = tx?.isFundi === true;
  const isSafeSend = tx?.isSafeSend === true;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.check, { transform: [{ scale }] }]}>
        <Text style={styles.checkText}>✓</Text>
      </Animated.View>
      <Text style={styles.title}>{(isFundi || isSafeSend) ? 'Payment Sent!' : t.success}</Text>
      <Text style={styles.id}>{t.transactionId}: {tx?.id}</Text>
      <Text style={styles.amount}>KES {tx?.amount || tx?.total}</Text>
      {isFundi && (
        <Text style={styles.escrowNote}>
           Waiting for fundi to accept via SMS. You will be notified once they confirm.
        </Text>
      )}
      {isSafeSend && (
        <Text style={styles.escrowNote}>
          🔒 Funds are held securely. The recipient has been notified via SMS to claim them.
        </Text>
      )}
      <View style={styles.actions}>
        {tx?.jobStatus === 'AWAITING_BUYER_REVIEW' && (
          <LipaButton
            title=" Review Job"
            onPress={() => navigation.navigate('ProfileTab', {
              screen: 'FundiReview',
              params: { jobId: tx?.jobId || tx?.id },
            })}
          />
        )}
        <LipaButton title={t.done} onPress={() => navigation.popToTop()} />
        <LipaButton title={t.home} onPress={() => navigation.navigate('HomeTab')} secondary />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: 30 },
  check: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  checkText: { fontSize: 48, color: colors.white, fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.black },
  id: { fontSize: 14, color: colors.grayDark, marginTop: 8 },
  amount: { fontSize: 28, fontWeight: 'bold', color: colors.primary, marginTop: 12 },
  actions: { width: '100%', marginTop: 40 },
  escrowNote: { fontSize: 14, color: colors.grayDark, marginTop: 16, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
});
