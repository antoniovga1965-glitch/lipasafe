import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function LipaHeader({ title, navigation, onBack }) {
  const canGoBack = navigation?.canGoBack();
  return (
    <View style={styles.header}>
      {canGoBack && (
        <TouchableOpacity onPress={onBack || (() => navigation.goBack())} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
      )}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, backgroundColor: colors.white },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.black, flex: 1, textAlign: 'center' },
  placeholder: { width: 32 },
});
