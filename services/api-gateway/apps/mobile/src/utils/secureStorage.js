import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// expo-secure-store only works on iOS/Android (native Keychain/Keystore).
// On web there is no native secure storage, so we fall back to localStorage.
// NOTE: localStorage is NOT encrypted and is readable by any JS on the page (XSS risk).
// Fine for local dev. Before shipping web to production, switch to httpOnly
// cookies set by your backend instead of localStorage.

const isWeb = Platform.OS === 'web';

export const saveTokens = async (accessToken, refreshToken) => {
  if (isWeb) {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    return;
  }
  await SecureStore.setItemAsync('access_token', accessToken);
  await SecureStore.setItemAsync('refresh_token', refreshToken);
};

export const getAccessToken = async () => {
  if (isWeb) {
    return localStorage.getItem('access_token');
  }
  return await SecureStore.getItemAsync('access_token');
};

export const getRefreshToken = async () => {
  if (isWeb) {
    return localStorage.getItem('refresh_token');
  }
  return await SecureStore.getItemAsync('refresh_token');
};

export const deleteTokens = async () => {
  if (isWeb) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    return;
  }
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
};

export const saveToken = async (token) => saveTokens(token, '');
export const getToken = getAccessToken;
export const deleteToken = deleteTokens;
