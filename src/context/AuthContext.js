import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import { authApi } from '../utils/api';
import { OAUTH_CONFIG, getRedirectUri } from '../config/oauth';

// Initialize WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedUser = await SecureStore.getItemAsync('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider) => {
    try {
      // Get the OAuth URL from your backend
      const { url } = await authApi.signIn(provider);
      console.log(`[INFO] OAuth URL: ${url}`);
      
      // Configure the OAuth request
      const redirectUri = getRedirectUri(provider);
      const authRequestConfig = {
        usePKCE: true,
        redirectUri,
        clientId: OAUTH_CONFIG[provider].clientId || 'placeholder-client-id', // Fallback client ID
        scopes: OAUTH_CONFIG[provider].scopes,
      };

      console.log(`[INFO] Redirect URI: ${redirectUri}`);

      // Create and load the auth request
      const authRequest = await AuthSession.loadAsync(
        authRequestConfig,
        { authorizationEndpoint: url }
      );

      // Present the OAuth flow
      console.log('[INFO] Prompting OAuth authentication...');
      const result = await authRequest.promptAsync();
      console.log(`[INFO] OAuth result type: ${result.type}`);

      if (result.type === 'success') {
        // Exchange the code for a session
        const { code } = result.params;
        console.log('[INFO] Received auth code, exchanging for session...');
        const response = await authApi.handleOAuthCallback(code);
        
        if (response.session) {
          console.log('[INFO] Authentication successful!');
          const userData = response.session.user;
          await SecureStore.setItemAsync('user', JSON.stringify(userData));
          setUser(userData);
          
          // Navigate to home screen after successful authentication
          router.replace('/home');
          return true;
        } else {
          console.log('[WARN] No session in response:', response);
          alert('Authentication failed: No session data received');
        }
      } else {
        console.log('[WARN] OAuth flow did not complete successfully');
        alert('Authentication was cancelled or failed');
      }
      
      return false;
    } catch (error) {
      console.error(`${provider} sign in error:`, error);
      alert(`Error signing in with ${provider}: ${error.message}`);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await SecureStore.deleteItemAsync('user');
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn: handleOAuthSignIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
