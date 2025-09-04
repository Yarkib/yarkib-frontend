import { Platform } from 'react-native';

export const getBaseUrl = () => {
  if (__DEV__) {
    // Using ngrok for mobile testing
    return 'https://7477b4c1d1b3.ngrok-free.app';
  }
  return 'https://your-production-api.com'; // TODO: Replace with your production API URL
};

const BASE_URL = getBaseUrl();

// IMPORTANT: Set to false to use real backend
const MOCK_MODE = false; 

export const authApi = {
  signIn: async (provider) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log(`[MOCK] Sign in with ${provider}`);
      return {
        url: 'https://mock-oauth-url.com',
        provider: provider,
        session: null
      };
    }
    
    try {
      console.log(`[REAL] Calling backend /auth/signin for ${provider}...`);
      const response = await fetch(`${BASE_URL}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[REAL] Received response from backend:`, data);
      return data;
    } catch (error) {
      console.error('[REAL] Sign in error:', error);
      throw error;
    }
  },

  signup: async (userData) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log('[MOCK] Sign up with user data:', userData);
      return {
        message: 'Signed up',
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            email: 'mock@example.com',
            name: 'Mock User'
          }
        }
      };
    }
    
    try {
      console.log('[REAL] Calling backend /auth/signup...');
      const response = await fetch(`${BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[REAL] Received signup response:', data);
      return data;
    } catch (error) {
      console.error('[REAL] Signup error:', error);
      throw error;
    }
  },

  handleOAuthCallback: async (code) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log('[MOCK] OAuth callback with code:', code);
      return {
        message: 'Logged in',
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            email: 'mock@example.com',
            name: 'Mock User'
          }
        }
      };
    }
    
    try {
      console.log('[REAL] Calling backend /auth/callback with code:', code);
      const response = await fetch(`${BASE_URL}/auth/callback?code=${code}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[REAL] Received callback response:', data);
      return data;
    } catch (error) {
      console.error('[REAL] OAuth callback error:', error);
      throw error;
    }
  },
};