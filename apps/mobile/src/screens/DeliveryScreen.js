import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, KeyboardAvoidingView
} from 'react-native';
import { colors } from '../theme/colors';
import DateTimePicker from '@react-native-community/datetimepicker';
import LipaHeader from '../components/LipaHeader';
import LipaInput from '../components/LipaInput';
import LipaButton from '../components/LipaButton';
import { useLang } from '../context/LanguageContext';

export default function DeliveryScreen({ navigation }) {
  const { t } = useLang();

  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [goods, setGoods]               = useState('');
  const [amount, setAmount]             = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress]           = useState('');
  const [deadline, setDeadline]         = useState(new Date(Date.now() + 60 * 60 * 1000)); 

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerMode, setPickerMode]         = useState('date'); 

  const onDateChange = (event, selectedDate) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      setShowTimePicker(false);
      return;
    }
    const current = selectedDate || deadline;
    setShowDatePicker(false);
    setShowTimePicker(false);

    if (pickerMode === 'date') {
      // Keep existing time, update date
      const updated = new Date(deadline);
      updated.setFullYear(current.getFullYear(), current.getMonth(), current.getDate());
      setDeadline(updated);
      // Now show time picker
      setPickerMode('time');
      setShowTimePicker(true);
    } else {
      // Keep existing date, update time
      const updated = new Date(deadline);
      updated.setHours(current.getHours(), current.getMinutes());
      setDeadline(updated);
    }
  };

  const formatDeadline = (date) => {
    return date.toLocaleString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  const isValid = deliveryPhone.length >= 10 && goods && amount && address;

  const next = () => {
    navigation.navigate('ConfirmPayment', {
      service: 'Delivery',
      seller: deliveryPhone,
      sellerPhone: deliveryPhone,
      deliveryGuyPhone: deliveryPhone,
      goods,
      amount,
      description: goods,
      productDescription: description,
      address,
      deadline: deadline.toISOString(),
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <LipaHeader title="Delivery Escrow" navigation={navigation} onBack={() => navigation.navigate('HomeTab')} />
      <View style={styles.content}>

        <LipaInput
          label="Delivery Guy Phone"
          value={deliveryPhone}
          onChangeText={setDeliveryPhone}
          placeholder="07XX XXX XXX"
          keyboardType="phone-pad"
        />

        <LipaInput
          label="Goods Description"
          value={goods}
          onChangeText={setGoods}
          placeholder="What is being delivered?"
        />

        <LipaInput
          label="Product Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Condition, colour, quantity, any extra details..."
          multiline

        />

        <LipaInput
          label="Amount (KES)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <LipaInput
          label="Delivery Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Where should it be delivered?"
          multiline
        />

        {/* Deadline Picker */}
        <Text style={styles.label}>Delivery Deadline</Text>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => { setPickerMode('date'); setShowDatePicker(true); }}
        >
          <Text style={styles.dateText}>{formatDeadline(deadline)}</Text>
          <Text style={styles.dateIcon}>📅</Text>
        </TouchableOpacity>

        {(showDatePicker || showTimePicker) && (
          <DateTimePicker
            value={deadline}
            mode={pickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={onDateChange}
          />
        )}

        <LipaButton
          title="Continue"
          onPress={next}
          disabled={!isValid}
        />
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content:   { padding: 20 },
  label:     { fontSize: 14, color: '#000000', marginBottom: 6, fontWeight: '600', marginTop: 8 },
  dateBtn:   {
    borderWidth: 1, borderColor: '#dddddd', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#ffffff', marginBottom: 16,
  },
  dateText:  { fontSize: 16, color: '#000000' },
  dateIcon:  { fontSize: 18 },
});
