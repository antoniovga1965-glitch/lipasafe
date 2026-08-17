import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function LipaInput({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline, maxLength }) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType || 'default'}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        maxLength={maxLength}
        style={[styles.input, multiline && styles.multiline]}
        placeholderTextColor="#999999"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  label: { fontSize: 14, color: '#000000', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#dddddd', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#000000', backgroundColor: '#ffffff' },
  multiline: { height: 100, textAlignVertical: 'top' },
});
