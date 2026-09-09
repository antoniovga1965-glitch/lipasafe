import React, { useRef, useEffect } from 'react';
import * as Updates from 'expo-updates';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LanguageProvider } from './src/context/LanguageContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { NotificationProvider } from './src/context/NotificationContext';
import BankDetailsRequestModal from './src/components/BankDetailsRequestModal';
import AppNavigator from './src/navigation/AppNavigator';
import { setNavigator } from './src/utils/api';

export default function App() {
  const navRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // silently ignore in dev or if updates not configured
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <ThemeProvider>
        <LanguageProvider>
          <NotificationProvider>
            <StatusBar style="dark" backgroundColor="#fff" />
            <AppNavigator navRef={navRef} onReady={() => setNavigator(navRef.current)} />
            <BankDetailsRequestModal />
          </NotificationProvider>
        </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
