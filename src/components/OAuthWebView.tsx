import React, { useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';

interface OAuthWebViewProps {
  visible: boolean;
  url: string | null;
  onMessage: (event: any) => void;
  onClose: () => void;
}

const OAuthWebView: React.FC<OAuthWebViewProps> = ({ 
  visible, 
  url, 
  onMessage, 
  onClose 
}) => {
  const webViewRef = useRef<WebView>(null);

  if (!visible || !url) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sign In</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        onMessage={onMessage}
        onNavigationStateChange={(navState) => {
          console.log('[WEBVIEW] Navigation:', navState.url);
        }}
        style={styles.webview}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 16,
    color: '#666',
  },
  webview: {
    flex: 1,
  },
});

export default OAuthWebView;
