import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { authApi } from '../src/utils/api';
import { useAuth } from '../src/context/AuthContext';
import { theme } from '../src/theme';
import * as SecureStore from 'expo-secure-store';

export default function CompleteSignupScreen() {
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [fuelCapacity, setFuelCapacity] = useState('');
  const [loading, setLoading] = useState(false);
  const [tempSession, setTempSession] = useState(null);
  const { signIn } = useAuth();

  // Load temporary session data on component mount
  useEffect(() => {
    const loadTempSession = async () => {
      try {
        const sessionData = await SecureStore.getItemAsync('temp_session');
        if (sessionData) {
          setTempSession(JSON.parse(sessionData));
        } else {
          console.warn('[SIGNUP] No temporary session found');
          // If no temp session, redirect back to signup
          Alert.alert('Error', 'Session data not found. Please try signing up again.', [
            { text: 'OK', onPress: () => router.replace('/signup') }
          ]);
        }
      } catch (error) {
        console.error('[SIGNUP] Error loading temp session:', error);
      }
    };

    loadTempSession();
  }, []);

  const handleCompleteSignup = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }

    if (!dateOfBirth.trim()) {
      Alert.alert('Error', 'Please enter your date of birth (YYYY-MM-DD)');
      return;
    }

    if (!fuelCapacity.trim() || isNaN(parseFloat(fuelCapacity))) {
      Alert.alert('Error', 'Please enter a valid fuel capacity in kilometers');
      return;
    }

    try {
      setLoading(true);

      const userData = {
        name: name.trim(),
        date_of_birth: dateOfBirth.trim(),
        fuel_capacity_km: parseFloat(fuelCapacity)
      };

      // If we have a temporary session, include the tokens
      if (tempSession) {
        userData.access_token = tempSession.access_token;
        userData.refresh_token = tempSession.refresh_token;
      }

      console.log('[SIGNUP] Completing signup with data:', userData);
      
      const response = await authApi.signup(userData);
      console.log('[SIGNUP] Signup response:', response);

      if (response && response.session) {
        // Store the session in secure storage
        await SecureStore.setItemAsync('user', JSON.stringify(response.session.user));
        
        // Clean up temporary session
        await SecureStore.deleteItemAsync('temp_session');
        
        // Show success message and navigate to home
        Alert.alert('Success', 'Your account has been created successfully!', [
          { text: 'OK', onPress: () => router.replace('/home') }
        ]);
      } else {
        Alert.alert('Error', 'Failed to complete signup. Please try again.');
      }
    } catch (error) {
      console.error('[SIGNUP] Error completing signup:', error);
      Alert.alert('Error', `Failed to complete signup: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>
          Please provide some additional information to complete your account setup.
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Date of Birth</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Fuel Capacity (km)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your vehicle's fuel capacity in km"
            value={fuelCapacity}
            onChangeText={setFuelCapacity}
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity 
          style={styles.button}
          onPress={handleCompleteSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Complete Signup</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  backButton: {
    marginTop: theme.spacing.xl,
  },
  header: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  title: {
    ...theme.typography.h1,
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  form: {
    marginTop: theme.spacing.xl,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    fontSize: 16,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
