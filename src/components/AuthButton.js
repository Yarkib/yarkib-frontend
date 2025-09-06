import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

const AuthButton = ({ provider, onSuccess, onError }) => {
  const { signIn } = useAuth();
  const isGoogle = provider === 'google';
  
  const handlePress = async () => {
    try {
      console.log(`[AUTH] Starting sign in with ${provider} using real backend...`);
      const success = await signIn(provider);
      console.log(`[AUTH] Sign in result:`, success);
      if (success && onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error(`${provider} sign in error:`, error);
      if (onError) {
        onError(error);
      }
    }
  };

  const getIconName = () => {
    return isGoogle ? 'logo-google' : 'logo-apple';
  };

  const getButtonText = () => {
    return `Continue with ${isGoogle ? 'Google' : 'Apple'}`;
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { 
          backgroundColor: isGoogle ? '#ffffff' : '#000000',
          borderColor: isGoogle ? '#dadce0' : '#000000'
        }
      ]}
      onPress={handlePress}
    >
      <Ionicons 
        name={getIconName()} 
        size={20} 
        color={isGoogle ? '#4285f4' : '#ffffff'} 
        style={styles.icon}
      />
      <Text
        style={[
          styles.text,
          { color: isGoogle ? '#000000' : '#ffffff' }
        ]}
      >
        {getButtonText()}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginVertical: theme.spacing.sm,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  icon: {
    marginRight: theme.spacing.md,
  },
  text: {
    ...theme.typography.button,
    fontWeight: '500',
  },
});

export default AuthButton;