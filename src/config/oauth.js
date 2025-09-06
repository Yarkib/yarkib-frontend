import { Platform } from 'react-native';
import { getApiBaseUrl } from './config.js';

export const OAUTH_CONFIG = {
  google: {
    // Use web client ID - no need for platform-specific IDs
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id',
    redirectUri: Platform.select({
      // For Custom Tabs, use HTTP callback that redirects to deep link
      ios: `${getApiBaseUrl()}/auth/mobile/callback`,
      android: `${getApiBaseUrl()}/auth/mobile/callback`,
      web: `${getApiBaseUrl()}/auth/callback`
    }),
    scopes: ['profile', 'email'],
  },
  apple: {
    clientId: process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || 'your-apple-client-id',
    redirectUri: Platform.select({
      // For Custom Tabs, use HTTP callback that redirects to deep link
      ios: `${getApiBaseUrl()}/auth/mobile/callback`,
      android: `${getApiBaseUrl()}/auth/mobile/callback`,
      web: `${getApiBaseUrl()}/auth/callback`
    }),
    scopes: ['email', 'name'],
  },
};

export const getRedirectUri = (provider) => {
  return OAUTH_CONFIG[provider].redirectUri;
};