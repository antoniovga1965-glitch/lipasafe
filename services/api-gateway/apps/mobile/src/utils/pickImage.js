import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

export async function pickImage(source) {
  let result;

  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return { error: 'Camera permission denied' };
    result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.5,
    });
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return { error: 'Gallery permission denied' };
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.5,
    });
  }



  if (!result) return { error: 'No result returned' };
  if (result.canceled) {
    console.log('USER CANCELED');
    return { canceled: true };
  }

  const asset = result.assets?.[0];
  

  if (!asset?.uri) return { error: 'No URI found in result' };

  try {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return { error: 'Empty base64' };

    return { base64, uri: asset.uri };
  } catch (e) {

    return { error: e.message };
  }
}
