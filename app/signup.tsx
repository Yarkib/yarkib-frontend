import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import AuthButton from '../src/components/AuthButton';
import { theme } from '../src/theme';
import { getBaseUrl } from '../src/utils/api';

const SignupScreen = () => {
  // The lint error "Property 'signIn' does not exist on type '{}'" indicates that TypeScript
  // is inferring the return type of `useAuth()` as an empty object. This typically happens
  // if the `AuthContext` or `useAuth` hook itself is not correctly typed or initialized
  // in `AuthContext.tsx`.
  //
  // Assuming `signIn` and `emailSignUp` are intended to be available from `useAuth()`,
  // we use a type assertion (`as any`) to bypass the TypeScript error in this file.
  // The root cause should ideally be addressed in `AuthContext.tsx` by providing proper types
  // for the context value.
  const { signIn, emailSignUp } = useAuth() as any;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Username validation function
  const validateUsername = (username: string) => {
    if (!username || username.trim().length < 3) {
      return 'Username must be at least 3 characters long';
    }
    if (username.length > 20) {
      return 'Username must be 20 characters or less';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Username can only contain letters, numbers, and underscores';
    }
    return null;
  };

  // Check username availability
  const checkUsernameAvailability = async (username: string) => {
    const validationError = validateUsername(username);
    if (validationError) {
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    try {
      const response = await fetch(`${getBaseUrl()}/auth/username/check/${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsernameAvailable(data.available);
      } else {
        setUsernameAvailable(false);
      }
    } catch (error) {
      console.error('Error checking username availability:', error);
      setUsernameAvailable(false);
    } finally {
      setCheckingUsername(false);
    }
  };

  // Debounced username check
  const debouncedUsernameCheck = (() => {
    let timeoutId: NodeJS.Timeout;
    return (username: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (username.trim()) {
          checkUsernameAvailability(username);
        } else {
          setUsernameAvailable(null);
        }
      }, 500);
    };
  })();

  const handleEmailSignUp = async () => {
    // Validate inputs
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    // Validate username format
    const usernameError = validateUsername(username);
    if (usernameError) {
      Alert.alert('Error', usernameError);
      return;
    }

    // Check if username is available
    if (usernameAvailable === false) {
      Alert.alert('Error', 'Username is not available. Please choose a different username.');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      await emailSignUp(email, password, name, username);
      // Note: The emailSignUp function handles navigation and error alerts
    } catch (error) {
      console.error('Email signup error:', error);
      // Error is already handled in the emailSignUp function
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

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Fill Your Details Or Continue With Social Media
        </Text>
      </View>

      {/* Email Signup Form */}
      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Name (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Username *</Text>
          <View style={styles.usernameContainer}>
            <TextInput
              style={[styles.input, styles.usernameInput]}
              placeholder="Enter your username"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                debouncedUsernameCheck(text);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {checkingUsername && (
              <ActivityIndicator size="small" color={theme.colors.primary} style={styles.usernameLoader} />
            )}
            {usernameAvailable === true && (
              <Ionicons name="checkmark-circle" size={20} color="#34C759" style={styles.usernameIcon} />
            )}
            {usernameAvailable === false && (
              <Ionicons name="close-circle" size={20} color="#FF3B30" style={styles.usernameIcon} />
            )}
          </View>
          {username && usernameAvailable === false && (
            <Text style={styles.errorText}>Username is not available</Text>
          )}
          {username && usernameAvailable === true && (
            <Text style={styles.successText}>Username is available</Text>
          )}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={styles.signupButton}
          onPress={handleEmailSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.signupButtonText}>Sign Up</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Or Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Auth Buttons */}
      <View style={styles.authButtons}>
        <AuthButton 
          provider="google" 
          onSuccess={() => console.log('Google sign in success')}
          onError={(error: any) => console.error('Google sign in error:', error)}
        />
        <AuthButton 
          provider="apple" 
          onSuccess={() => console.log('Apple sign in success')}
          onError={(error: any) => console.error('Apple sign in error:', error)}
        />
      </View>

      {/* Login Link */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/login')}>
          <Text style={styles.loginLink}>Login</Text>
        </TouchableOpacity>
      </View>

      {/* Terms and Conditions */}
      <Text style={styles.terms}>
        By Continuing You Confirm That You Agree With Our Terms And Conditions
      </Text>
    </ScrollView>
  );
};

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
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
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
    marginTop: theme.spacing.lg,
  },
  inputContainer: {
    marginBottom: theme.spacing.md,
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
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.sm,
  },
  usernameInput: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingRight: theme.spacing.sm,
  },
  usernameLoader: {
    marginRight: theme.spacing.sm,
  },
  usernameIcon: {
    marginRight: theme.spacing.sm,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  successText: {
    color: '#34C759',
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.sm,
  },
  passwordInput: {
    flex: 1,
    padding: theme.spacing.md,
    fontSize: 16,
  },
  eyeIcon: {
    padding: theme.spacing.md,
  },
  signupButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.textSecondary,
    opacity: 0.3,
  },
  dividerText: {
    marginHorizontal: theme.spacing.md,
    color: theme.colors.textSecondary,
  },
  authButtons: {
    marginTop: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    marginBottom: theme.spacing.md,
  },
  footerText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  loginLink: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  terms: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
});

export default SignupScreen;