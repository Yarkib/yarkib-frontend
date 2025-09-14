import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { authApi } from '../utils/api';
import { OAUTH_CONFIG, getRedirectUri } from '../config/oauth';
import { getApiBaseUrl } from '../config/config';
import { AuthContextType } from '../types/auth';

// Import MOCK_MODE from api.js
import { MOCK_MODE } from '../utils/api';

// Initialize Supabase client if not already done
// You may need to create this file or import from your existing setup
let supabase = null;
try {
  // Try to import from existing setup
  const { supabase: existingSupabase } = require('../utils/supabase');
  supabase = existingSupabase;
} catch (error) {
  console.log('[AUTH] No existing Supabase client found, will use authApi');
}

// Initialize WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

// Helper functions for SecureStore
const saveToStorage = async (key, value) => {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving ${key} to storage:`, error);
    // Fallback to localStorage for web or if SecureStore fails
    if (Platform.OS === 'web') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
};

const getFromStorage = async (key) => {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`Error getting ${key} from storage:`, error);
    // Fallback to localStorage for web or if SecureStore fails
    if (Platform.OS === 'web') {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    }
    return null;
  }
};

const removeFromStorage = async (key) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error(`Error removing ${key} from storage:`, error);
    // Fallback to localStorage for web or if SecureStore fails
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [oauthUrl, setOAuthUrl] = useState(null);

  useEffect(() => {
    loadStoredSession();

    // Listen for auth state changes if Supabase is available
    if (supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        console.log('[AUTH] Auth state change:', event);
        if (newSession) {
          await storeSession(newSession);
          setSession(newSession);
          setUser(newSession.user);
          setIsAuthenticated(!!newSession.access_token);
        } else {
          await clearSession();
          setSession(null);
          setUser(null);
          setIsAuthenticated(false);
        }
      });

      return () => authListener.subscription?.unsubscribe();
    }
  }, []);

  // Load stored session with full token data
  const loadStoredSession = async () => {
    try {
      console.log('[AUTH] Loading session...');
      let storedSession = null;
      
      if (Platform.OS !== 'web') {
        storedSession = await SecureStore.getItemAsync('supabase.auth.token');
        console.log('[AUTH] Mobile: SecureStore session:', storedSession ? 'Found' : 'Missing');
      } else {
        storedSession = localStorage.getItem('supabase.auth.token');
        console.log('[AUTH] Web: localStorage session:', storedSession ? 'Found' : 'Missing');
      }

      if (storedSession) {
        const parsedSession = JSON.parse(storedSession);
        console.log('[AUTH] Access token:', parsedSession.access_token ? 'Present' : 'Missing');
        console.log('[AUTH] Full session data:', parsedSession);
        
        setSession(parsedSession);
        setUser(parsedSession.user);
        setIsAuthenticated(!!parsedSession.access_token);
      } else {
        console.log('[AUTH] No session found');
        
        // Try to get current session from Supabase if available
        if (supabase) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              console.log('[AUTH] Current Supabase session:', session ? 'Found' : 'Missing');
              await storeSession(session);
              setSession(session);
              setUser(session.user);
              setIsAuthenticated(!!session.access_token);
            }
          } catch (supabaseError) {
            console.log('[AUTH] Supabase session check failed:', supabaseError.message);
          }
        }
        
        // Try to load old user format for backward compatibility
        const oldUser = await getFromStorage('user');
        if (oldUser) {
          console.log('[AUTH] Found old user format, converting...');
          setUser(oldUser);
          setIsAuthenticated(false); // No token means not fully authenticated
        }
      }
    } catch (error) {
      console.error('[AUTH] Error loading session:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Store full session with tokens
  const storeSession = async (newSession) => {
    try {
      console.log('[AUTH] Storing session:', newSession ? 'Yes' : 'No');
      if (newSession) {
        console.log('[AUTH] Access token:', newSession.access_token ? 'Present' : 'Missing');
        console.log('[AUTH] Refresh token:', newSession.access_token ? 'Present' : 'Missing');
      }
      
      const sessionString = JSON.stringify(newSession);
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync('supabase.auth.token', sessionString);
        console.log('[AUTH] Stored in SecureStore');
      } else {
        localStorage.setItem('supabase.auth.token', sessionString);
        console.log('[AUTH] Stored in localStorage');
      }
      console.log('[AUTH] Session stored successfully');
    } catch (error) {
      console.error('[AUTH] Error storing session:', error.message);
    }
  };

  // Clear session
  const clearSession = async () => {
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync('supabase.auth.token');
        console.log('[AUTH] Cleared SecureStore');
      } else {
        localStorage.removeItem('supabase.auth.token');
        console.log('[AUTH] Cleared localStorage');
      }
      console.log('[AUTH] Session cleared');
    } catch (error) {
      console.error('[AUTH] Error clearing session:', error.message);
    }
  };

  // Handle deep links for OAuth callbacks
  useEffect(() => {
    const handleDeepLink = (url) => {
      console.log('[DEEP LINK] Received deep link:', url);
      
      if (url.includes('yarkib://oauth/callback')) {
        console.log('[DEEP LINK] OAuth callback detected');
        
        // Parse the URL parameters
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const session = urlParams.get('session');
        const error = urlParams.get('error');
        
        if (error) {
          console.log('[DEEP LINK] OAuth error:', error);
          Alert.alert('OAuth Error', decodeURIComponent(error));
        } else if (session) {
          console.log('[DEEP LINK] Session data received');
          try {
            const sessionData = JSON.parse(decodeURIComponent(session));
            handleAuthSuccess(sessionData);
          } catch (parseError) {
            console.error('[DEEP LINK] Error parsing session data:', parseError);
            Alert.alert('Error', 'Failed to parse authentication data');
          }
        } else {
          console.log('[DEEP LINK] No session or error in deep link');
        }
      }
    };

    // Listen for incoming links
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[DEEP LINK] Initial URL:', url);
        handleDeepLink(url);
      }
    });
    
    return () => subscription?.remove();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedUser = await getFromStorage('user');
      if (storedUser) {
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleEmailSignUp = async (email, password, name) => {
    try {
      console.log(`[AUTH] Starting email signup for ${email}...`);
      
      if (MOCK_MODE) {
        console.log('[AUTH] Mock email signup');
        
        // Simulate successful signup with full session
        setTimeout(() => {
          const mockSession = {
            access_token: 'mock-access-token-' + Date.now(),
            refresh_token: 'mock-refresh-token-' + Date.now(),
            user: {
              id: 'mock-user-id',
              email: email,
              name: name || 'Mock User'
            }
          };
          
          console.log('[AUTH] Creating mock session with token:', mockSession.access_token);
          storeSession(mockSession);
          setSession(mockSession);
          setUser(mockSession.user);
          setIsAuthenticated(true);
          
          // Navigate to complete signup screen for new users
          router.replace('/complete-signup');
        }, 1000);
        
        return true;
      }
      
      // Real signup process
      const userData = {
        email,
        password,
        name
      };
      
      try {
        const response = await authApi.signup(userData);
        
        console.log('[AUTH] Signup response:', response);
        
        if (response && response.session) {
          // For email signup with session, handle accordingly
          console.log('[AUTH] Signup successful with session');
          // Store full session with tokens
          await storeSession(response.session);
          setSession(response.session);
          setUser(response.session.user);
          setIsAuthenticated(!!response.session.access_token);
          
          console.log('[AUTH] Session stored, access token available:', !!response.session.access_token);
          
          // Navigate to home screen after successful authentication
          router.replace('/home');
          return true;
        } else if (response && response.message === 'Email verification required') {
          // For email signup that requires verification
          console.log('[AUTH] Signup successful, showing email confirmation notice');
          // Clear any temporary session data
          await removeFromStorage('temp_session');
          
          // Show email confirmation alert
          Alert.alert(
            'Email Verification Required', 
            'Please check your email and click the verification link before logging in.',
            [{ text: 'OK', onPress: () => router.replace('/login') }]
          );
          
          // Navigate to login screen
          router.replace('/login');
          return true;
        } else if (MOCK_MODE) {
          // In mock mode, simulate email verification flow
          console.log('[AUTH] Mock mode: simulating email verification flow');
          
          // Show email confirmation alert
          Alert.alert(
            'Email Verification Required', 
            'Please check your email and click the verification link before logging in.',
            [{ text: 'OK', onPress: () => router.replace('/login') }]
          );
          
          // Navigate to login screen
          router.replace('/login');
          return true;
        } else {
          console.error('[AUTH] Invalid response structure:', response);
          throw new Error('Invalid response from server');
        }
      } catch (error) {
        console.error('[AUTH] Error during signup API call:', error);
        throw error;
      }
    } catch (error) {
      console.error(`Error signing up with email:`, error);
      alert(`Error signing up: ${error.message}`);
      throw error;
    }
  };
  
  const handleEmailLogin = async (email, password) => {
    try {
      console.log(`[AUTH] Starting email login for ${email}...`);
      
      // Real login process
      const userData = {
        email,
        password
      };
      
      const response = await authApi.login(userData);
      console.log('[AUTH] Login response:', response);
      
      // Check if email is not verified
      if (response.message === 'Email not verified' || response.error === 'Email not verified') {
        Alert.alert(
          'Email Not Verified',
          'Please check your email and click the verification link before logging in.',
          [{ text: 'OK' }]
        );
        return false;
      }
      
      if (response && response.session) {
        console.log('[AUTH] Email login successful, storing full session');
        // Store full session with tokens
        await storeSession(response.session);
        setSession(response.session);
        setUser(response.session.user);
        setIsAuthenticated(!!response.session.access_token);
        
        console.log('[AUTH] Session stored, access token available:', !!response.session.access_token);
        
        // Navigate to home screen after successful authentication
        router.replace('/home');
        return true;
      } else {
        console.error('[AUTH] Invalid login response:', response);
        throw new Error(response.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error(`Error logging in with email:`, error);
      Alert.alert('Login Failed', error.message);
      throw error;
    }
  };

  const handleOAuthSignIn = async (provider) => {
    try {
      setLoading(true);
      console.log(`[MOBILE OAUTH] Starting ${provider} OAuth flow for mobile...`);
      
      // Call your mobile-specific endpoint
      const response = await authApi.signIn(provider, null, 'mobile'); // Add platform parameter
      
      if (!response.url) {
        throw new Error('No OAuth URL received from server');
      }

      console.log(`[MOBILE OAUTH] Received OAuth URL from backend:`, response.url);
      console.log(`[MOBILE OAUTH] Opening OAuth URL in Custom Tabs...`);
      
      // Use Custom Tabs (expo-web-browser) instead of WebView to comply with Google's policy
      const redirectUri = getRedirectUri(provider);
      console.log(`[MOBILE OAUTH] Using redirect URI:`, redirectUri);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OAuth timeout - please try again')), 30000); // 30 seconds
      });
      
      // Open OAuth URL with Custom Tabs
      const result = await Promise.race([
        WebBrowser.openAuthSessionAsync(response.url, redirectUri),
        timeoutPromise
      ]);
      
      console.log(`[MOBILE OAUTH] Custom Tabs result:`, result);
      console.log(`[MOBILE OAUTH] Result type:`, result.type);
      console.log(`[MOBILE OAUTH] Result URL:`, result.url);
      
      if (result.type === 'success') {
        console.log(`[MOBILE OAUTH] OAuth success, processing redirect URL...`);
        
        // Check if the redirect URL contains session data
        if (result.url.includes('/auth/mobile/callback')) {
          console.log(`[MOBILE OAUTH] Mobile callback detected, checking auth status...`);
          
          // The callback should have processed the OAuth flow
          // Let's check the authentication status
          await checkAuthStatus();
          return;
        }
        
        // Fallback: Check with backend for current session
        console.log(`[MOBILE OAUTH] No specific callback detected, falling back to checkAuthStatus`);
        await checkAuthStatus();
        
      } else if (result.type === 'cancel') {
        console.log(`[MOBILE OAUTH] User cancelled the OAuth flow`);
        Alert.alert('Cancelled', 'Authentication was cancelled');
      } else {
        console.log(`[MOBILE OAUTH] OAuth failed with type:`, result.type);
        throw new Error(`Authentication failed: ${result.type}`);
      }
      
    } catch (error) {
      console.error(`[MOBILE OAUTH] Sign in error:`, error);
      Alert.alert('Error', `Sign in failed: ${error.message}`);
    } finally {
      setLoading(false);
      console.log(`[MOBILE OAUTH] OAuth flow completed`);
    }
  };

  // Handle WebView messages from OAuth callback
  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[WEBVIEW] Received message:', data);
      
      if (data.type === 'AUTH_SUCCESS') {
        console.log('[WEBVIEW] OAuth successful:', data.session);
        await handleAuthSuccess(data.session);
        setShowWebView(false);
        setOAuthUrl(null);
      } else if (data.type === 'AUTH_ERROR') {
        console.error('[WEBVIEW] OAuth error:', data.error);
        Alert.alert('OAuth Error', data.error);
        setShowWebView(false);
        setOAuthUrl(null);
      }
    } catch (error) {
      console.error('[WEBVIEW] Failed to parse message:', error);
      Alert.alert('Error', 'Failed to process authentication response');
      setShowWebView(false);
      setOAuthUrl(null);
    } finally {
      setLoading(false);
    }
  };

  // Close WebView
  const closeWebView = () => {
    setShowWebView(false);
    setOAuthUrl(null);
    setLoading(false);
  };

  // Helper function to handle successful authentication
  const handleAuthSuccess = async (session) => {
    try {
      console.log('[AUTH] Handling auth success with session:', session);
      
      // Store full session with tokens
      if (session?.user) {
        await storeSession(session);
        setSession(session);
        setUser(session.user);
        setIsAuthenticated(!!session.access_token);
        
        console.log('[AUTH] Authentication successful, session stored');
        console.log('[AUTH] Access token available:', !!session.access_token);
        
        // Navigate to home screen after successful authentication
        router.replace('/home');
      }
    } catch (error) {
      console.error('[AUTH] Error handling auth success:', error);
    }
  };

  // Update checkAuthStatus to handle mobile sessions
  const checkAuthStatus = async () => {
    try {
      console.log('Checking authentication status with backend...');
      
      // Try mobile-specific session endpoint first
      let response = await fetch(`${getApiBaseUrl()}/auth/mobile/session`, {
        method: 'GET',
        credentials: 'include', // Include cookies
      });
      
      // If mobile endpoint doesn't exist, fall back to regular session endpoint
      if (response.status === 404) {
        console.log('Mobile session endpoint not found, trying regular session endpoint');
        response = await fetch(`${getApiBaseUrl()}/auth/session`, {
          method: 'GET',
          credentials: 'include', // Include cookies
        });
      }
      
      console.log('Auth status response:', response.status);
      
      if (response.ok) {
        const sessionData = await response.json();
        console.log('Session data received:', sessionData);
        
        if (sessionData.user) {
          setUser(sessionData.user);
          // Navigate to home screen after successful authentication
          router.replace('/home');
          } else {
          console.log('No user data in session response');
          // Try to get user info from a different endpoint
          await checkUserInfo();
        }
      } else {
        console.log('Auth status check failed:', response.status);
        // Try alternative user info endpoint
        await checkUserInfo();
      }
    } catch (error) {
      console.error('Check auth status error:', error);
      // Try alternative user info endpoint
      await checkUserInfo();
    }
  };

  // Alternative method to check user authentication
  const checkUserInfo = async () => {
    try {
      console.log('Trying alternative user info endpoint...');
      
      const response = await fetch(`${getApiBaseUrl()}/auth/user`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('User data received:', userData);
        
        if (userData.id || userData.email) {
          setUser(userData);
          router.replace('/home');
        }
      }
    } catch (error) {
      console.error('Check user info error:', error);
    }
  };

  const signOut = async () => {
    try {
      console.log('[AUTH] Signing out...');
      await clearSession();
      await removeFromStorage('user'); // Keep for backward compatibility
      setSession(null);
      setUser(null);
      setIsAuthenticated(false);
      console.log('[AUTH] Sign out successful');
      // Navigate back to welcome screen after sign out
      router.replace('/');
    } catch (error) {
      console.error('[AUTH] Error signing out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isAuthenticated,
        signIn: handleOAuthSignIn,
        signOut,
        logout: signOut, // Alias for signOut to maintain compatibility
        emailSignUp: handleEmailSignUp,
        emailLogin: handleEmailLogin,
        showWebView,
        oauthUrl,
        handleWebViewMessage,
        closeWebView,
        storeSession,
        clearSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};