import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, TextInput
} from 'react-native';
import { colors } from '../theme/colors';
import LipaHeader from '../components/LipaHeader';
import LipaButton from '../components/LipaButton';
import { authFetch } from '../utils/api';

export default function DeliveryRatingScreen({ navigation, route }) {
  const { orderId, goods, amount, deliveryPhone } = route.params || {};
  const [rating, setRating]   = useState(0);
  const [review, setReview]   = useState('');
  const [loading, setLoading] = useState(false);

  const submitRating = async () => {
    if (rating === 0) {
      Alert.alert('Rate Required', 'Please select at least 1 star.');
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch('/delivery/rate', {
        method: 'POST',
        body: JSON.stringify({ orderId, rating, review }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(
          'Thank You!',
          'Your rating has been submitted.',
          [{ text: 'Done', onPress: () => navigation.navigate('HomeTab') }]
        );
      } else {
        Alert.alert('Error', data.message || 'Could not submit rating.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const skipRating = () => {
    Alert.alert(
      'Skip Rating?',
      'You can rate this delivery guy later from your transaction history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: () => navigation.navigate('HomeTab') },
      ]
    );
  };

  const labels = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Excellent'];

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <LipaHeader title="Rate Delivery" navigation={navigation} />
      <View style={styles.content}>

        {/* Order Summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Goods Delivered</Text>
          <Text style={styles.cardValue}>{goods}</Text>
          <Text style={styles.cardLabel}>Amount Paid</Text>
          <Text style={[styles.cardValue, styles.amount]}>KES {parseFloat(amount || 0).toFixed(2)}</Text>
          <Text style={styles.cardLabel}>Delivery Guy</Text>
          <Text style={styles.cardValue}>{deliveryPhone}</Text>
        </View>

        {/* Stars */}
        <Text style={styles.sectionTitle}>How was your delivery?</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}>
              <Text style={[styles.star, star <= rating && styles.starFilled]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && (
          <Text style={styles.ratingLabel}>{labels[rating]}</Text>
        )}

        {/* Review */}
        <Text style={styles.sectionTitle}>Leave a review (optional)</Text>
        <TextInput
          style={styles.reviewInput}
          value={review}
          onChangeText={setReview}
          placeholder="Describe your experience..."
          placeholderTextColor="#999999"
          multiline
          maxLength={300}
        />
        <Text style={styles.charCount}>{review.length}/300</Text>

        {loading && <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />}

        <LipaButton
          title={loading ? 'Submitting...' : 'Submit Rating'}
          onPress={submitRating}
          disabled={loading}
        />

        <TouchableOpacity style={styles.skipBtn} onPress={skipRating} disabled={loading}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#ffffff' },
  content:      { padding: 20 },
  card:         { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 24 },
  cardLabel:    { fontSize: 12, color: '#666666', marginTop: 10 },
  cardValue:    { fontSize: 15, fontWeight: '600', color: '#000000', marginTop: 2 },
  amount:       { fontSize: 18, color: colors.primary },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#000000', marginBottom: 12 },
  starsRow:     { flexDirection: 'row', justifyContent: 'center', marginBottom: 8, gap: 12 },
  star:         { fontSize: 48, color: '#dddddd' },
  starFilled:   { color: '#f59e0b' },
  ratingLabel:  { textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#f59e0b', marginBottom: 24 },
  reviewInput:  { borderWidth: 1, borderColor: '#dddddd', borderRadius: 12, padding: 16, fontSize: 15, color: '#000000', height: 120, textAlignVertical: 'top', backgroundColor: '#ffffff', marginBottom: 4 },
  charCount:    { fontSize: 12, color: '#999999', textAlign: 'right', marginBottom: 20 },
  skipBtn:      { marginTop: 12, padding: 16, alignItems: 'center' },
  skipText:     { color: '#999999', fontSize: 14 },
});
