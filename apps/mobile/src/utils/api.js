import { getAccessToken, getRefreshToken, saveTokens, deleteTokens } from './secureStorage';
import { removeData } from './storage';

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL 
export const API = `${BASE_URL}/auth`;

let _navigator = null;

export const getNavigator = () => _navigator;
export const setNavigator = (nav) => {
  _navigator = nav;
};

const logout = async () => {
  await deleteTokens();
  await removeData('user');
  if (_navigator) {
    _navigator.reset({ index: 0, routes: [{ name: 'Login' }] });
  }
};

const refreshAccessToken = async () => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.accessToken) {
      await saveTokens(data.accessToken, refreshToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
};

export const authFetch = async (url, options = {}, retry = true) => {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return authFetch(url, options, false);
    }
    await logout();
    throw new Error('Session expired. Please login again.');
  }

  return res;
};
