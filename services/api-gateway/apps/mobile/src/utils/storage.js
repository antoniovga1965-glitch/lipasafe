import AsyncStorage from '@react-native-async-storage/async-storage';

export const storeData = async (key, value) => {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
};

export const getData = async (key) => {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
};

export const removeData = async (key) => {
  try { await AsyncStorage.removeItem(key); } catch (e) {}
};
