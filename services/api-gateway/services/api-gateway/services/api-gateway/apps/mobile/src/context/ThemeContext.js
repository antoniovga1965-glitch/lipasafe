import React, { createContext, useContext, useState, useEffect } from 'react';
import { lightColors, darkColors } from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const defaultValue = {
  theme:       lightColors,
  colors:      lightColors,
  isDark:      false,
  toggleTheme: () => {},
};

const ThemeContext = createContext(defaultValue);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  // Load saved preference on startup
  useEffect(() => {
    AsyncStorage.getItem('theme').then((val) => {
      if (val === 'dark') setIsDark(true);
    });
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const theme = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, colors: theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
