import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../src/theme';

const WelcomeScreen = () => {
  return (
    <View style={styles.container}>
      {/* Illustration */}
      <View style={styles.illustrationContainer}>
        <Image
          source={require('../assets/illustrations/welcome.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Yarkib</Text>
        <Text style={styles.subtitle}>
          Your One Stop Solution to Adventure Riding.
        </Text>

        {/* Get Started Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.buttonText}>Let's Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    padding: theme.spacing.xl,
  },
  illustration: {
    width: '80%',
    height: '80%',
  },
  content: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  title: {
    ...theme.typography.h1,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  subtitle: {
    ...theme.typography.body,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonText: {
    ...theme.typography.button,
    color: theme.colors.background,
  },
});

export default WelcomeScreen;
