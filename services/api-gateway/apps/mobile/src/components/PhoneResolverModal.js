import React from 'react'
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * PhoneResolverModal
 * Shows recipient name before any payment proceeds
 * Props:
 *   visible     — bool
 *   loading     — bool (resolving in progress)
 *   found       — bool
 *   name        — string | null
 *   phone       — string
 *   amount      — number
 *   onConfirm   — fn
 *   onCancel    — fn
 */
const PhoneResolverModal = ({ visible, loading, found, name, phone, amount, onConfirm, onCancel }) => {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '85%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

          {loading ? (
            <>
              <ActivityIndicator size="large" color="#1a9c6b" />
              <Text style={styles.loadingText}>Checking recipient...</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Confirm Recipient</Text>

              <View style={styles.recipientBox}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {found && name ? name.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                <Text style={styles.name}>
                  {found && name ? name : 'Not on LipaSafe'}
                </Text>
                <Text style={styles.phone}>{phone}</Text>
                {!found && (
                  <Text style={styles.warning}>
                    This number is not registered on LipaSafe.{'\n'}Proceed only if you are sure.
                  </Text>
                )}
              </View>

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={styles.amountValue}>KES {Number(amount).toFixed(2)}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
                  <Text style={styles.confirmText}>Confirm & Proceed</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  loadingText:  { textAlign: 'center', marginTop: 16, color: '#666', fontSize: 15 },
  title:        { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 20 },
  recipientBox: { alignItems: 'center', marginBottom: 20 },
  avatar:       { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1a9c6b', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:   { color: '#fff', fontSize: 26, fontWeight: '700' },
  name:         { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  phone:        { fontSize: 14, color: '#888' },
  warning:      { marginTop: 10, fontSize: 13, color: '#e05b00', textAlign: 'center', lineHeight: 20 },
  amountRow:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 24 },
  amountLabel:  { fontSize: 15, color: '#666' },
  amountValue:  { fontSize: 15, fontWeight: '700', color: '#111' },
  actions:      { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center' },
  cancelText:   { fontSize: 15, fontWeight: '600', color: '#666' },
  confirmBtn:   { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#1a9c6b', alignItems: 'center' },
  confirmText:  { fontSize: 15, fontWeight: '600', color: '#fff' },
})

export default PhoneResolverModal
