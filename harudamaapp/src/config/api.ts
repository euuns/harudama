import { Platform } from 'react-native';

export const API_BASE =
  Platform.OS === 'ios'
    ? 'http://localhost:4000'
    : 'http://10.0.2.2:4000';