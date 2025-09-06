import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Simple test component to verify button functionality
const ButtonTest = () => {
  const [testState, setTestState] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTestPress = () => {
    console.log('[BUTTON_TEST] Test button pressed!');
    Alert.alert('Success', 'Button is working!');
  };

  const handleTogglePress = async () => {
    console.log('[BUTTON_TEST] Toggle button pressed!');
    setLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setTestState(!testState);
    setLoading(false);
    console.log('[BUTTON_TEST] Toggle state changed to:', !testState);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Button Test Component</Text>
      
      {/* Test Button */}
      <TouchableOpacity 
        style={styles.testButton} 
        onPress={handleTestPress}
      >
        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
        <Text style={styles.buttonText}>Test Button</Text>
      </TouchableOpacity>

      {/* Toggle Button */}
      <TouchableOpacity 
        style={[styles.toggleButton, testState && styles.toggleButtonActive]} 
        onPress={handleTogglePress}
        disabled={loading}
      >
        <Ionicons 
          name={loading ? "hourglass-outline" : (testState ? "checkmark-circle" : "ellipse-outline")} 
          size={20} 
          color={testState ? "#FFF" : "#000"} 
        />
        <Text style={[styles.buttonText, testState && styles.buttonTextActive]}>
          {loading ? 'Loading...' : (testState ? 'Active' : 'Inactive')}
        </Text>
      </TouchableOpacity>

      <Text style={styles.status}>Status: {testState ? 'Active' : 'Inactive'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    margin: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
  },
  toggleButton: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextActive: {
    color: '#FFF',
  },
  status: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default ButtonTest;
