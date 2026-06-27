import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as LocalAuthentication from 'expo-local-authentication';
import LipaHeader from '../components/LipaHeader';
import { useLang } from '../context/LanguageContext';

export default function SettingsScreen({ navigation }) {
  const { t, lang, toggleLang } = useLang();
  const { theme } = useTheme();
  const [notif, setNotif] = useState(true);
  const [bio, setBio] = useState(false);
  const styles = makeStyles(theme);

  const toggleBio = async () => {
    if (!bio) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable biometrics' });
      if (result.success) setBio(true);
    } else {
      setBio(false);
    }
  };

  return (
    <View style={styles.container}>
      <LipaHeader title={t.settings} navigation={navigation} />
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>{t.language}</Text>
          <TouchableOpacity onPress={toggleLang} style={styles.langBtn}>
            <Text style={styles.langText}>{lang === 'en' ? t.english : t.swahili}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t.enableNotif}</Text>
          <Switch value={notif} onValueChange={setNotif} trackColor={{ true: theme.primary }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t.bioAuth}</Text>
          <Switch value={bio} onValueChange={toggleBio} trackColor={{ true: theme.primary }} />
        </View>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChangePin')}>
          <Text style={styles.label}>{t.changePIN}</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content:   { padding: 20 },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
  label:     { fontSize: 16, color: theme.text },
  langBtn:   { backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  langText:  { color: '#FFFFFF', fontWeight: '600' },
  arrow:     { fontSize: 18, color: theme.text },
});
