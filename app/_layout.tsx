import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import OAuthWebView from '../src/components/OAuthWebView';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Handle deep links globally
  useEffect(() => {
    const handleDeepLink = (urlOrEvent: string | { url: string }) => {
      // Handle both string and object formats
      const url = typeof urlOrEvent === 'string' ? urlOrEvent : urlOrEvent?.url || '';
      console.log('[DEEP LINK] Received in root layout:', url);
      
      if (url.includes('yarkib://oauth/callback')) {
        console.log('[DEEP LINK] OAuth callback detected, processing...');
        
        try {
          const urlObj = new URL(url);
          const session = urlObj.searchParams.get('session');
          const error = urlObj.searchParams.get('error');
          
          if (error) {
            console.error('[DEEP LINK] OAuth error:', decodeURIComponent(error));
            // The error will be handled by AuthContext
          } else if (session) {
            console.log('[DEEP LINK] OAuth success, session data received');
            // The session will be processed by AuthContext
          }
        } catch (parseError) {
          console.error('[DEEP LINK] Error parsing URL:', parseError);
        }
      }
    };

    // Listen for incoming links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[DEEP LINK] Initial URL:', url);
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="complete-signup" options={{ headerShown: false }} />
          <Stack.Screen name="home" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="group-rides" options={{ headerShown: false }} />
          <Stack.Screen name="group-ride-status" options={{ headerShown: false }} />
          <Stack.Screen name="group-ride-invitation" options={{ headerShown: false }} />
          <Stack.Screen name="group-ride-details" options={{ headerShown: false }} />
          <Stack.Screen name="group-ride-invite" options={{ headerShown: false }} />
          <Stack.Screen 
            name="navigation" 
            options={{ 
              headerShown: false,
              presentation: 'fullScreenModal',
              animation: 'none'
            }} 
          />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
        <OAuthWebViewWrapper />
      </ThemeProvider>
    </AuthProvider>
  );
}

// Wrapper component to access auth context
function OAuthWebViewWrapper() {
  const { showWebView, oauthUrl, handleWebViewMessage, closeWebView } = useAuth() as AuthContextType;
  
  return (
    <OAuthWebView
      visible={showWebView}
      url={oauthUrl}
      onMessage={handleWebViewMessage}
      onClose={closeWebView}
    />
  );
}
