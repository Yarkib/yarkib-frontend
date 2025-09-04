import { Platform } from 'react-native';

export const OAUTH_CONFIG = {
  google: {
    // Use web client ID - no need for platform-specific IDs
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id',
    redirectUri: Platform.select({
      // Mobile OAuth should use the ngrok callback URL that redirects to deep link
      ios: 'https://7477b4c1d1b3.ngrok-free.app/auth/mobile/callback',
      android: 'https://7477b4c1d1b3.ngrok-free.app/auth/mobile/callback',
      // Web OAuth can use localhost for browser testing
      web: 'https://7477b4c1d1b3.ngrok-free.app/auth/mobile/callback'
    }),
    scopes: ['profile', 'email'],
  },
  apple: {
    clientId: process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || 'your-apple-client-id',
    redirectUri: Platform.select({
      // Mobile OAuth should use the ngrok callback URL
      ios: 'https://7477b4c1d1b3.ngrok-free.app/auth/mobile/callback',
      android: 'https://7477b4c1d1b3.ngrok-free.app/auth/mobile/callback',
      // Web OAuth can use localhost
      web: 'https://7477b4c1d1b3.ngrok-free.app/auth/mobile/callback'
    }),
    scopes: ['email', 'name'],
  },
};

export const getRedirectUri = (provider) => {
  return OAUTH_CONFIG[provider].redirectUri;
};
