import * as SecureStore from 'expo-secure-store';

export const saveTokens = async (accessToken, refreshToken) => {
  await SecureStore.setItemAsync('access_token', accessToken);
  await SecureStore.setItemAsync('refresh_token', refreshToken);
};



export const getAccessToken = async () => {
  return await SecureStore.getItemAsync('access_token');
};

export const getRefreshToken = async () => {
  return await SecureStore.getItemAsync('refresh_token');
};

export const deleteTokens = async () => {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
};


export const saveToken = async (token) => saveTokens(token, '');
export const getToken = getAccessToken;
export const deleteToken = deleteTokens;

