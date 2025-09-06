import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { theme } from '../theme';
import RouteActionButtons from './RouteActionButtons';

/**
 * Test component to demonstrate RouteActionButtons functionality
 * This can be used for testing the save/complete functionality
 */
const RouteActionButtonsTest: React.FC = () => {
  const [saveStatus, setSaveStatus] = useState(false);
  const [completeStatus, setCompleteStatus] = useState(false);

  // Mock data for testing
  const mockRouteId = 'test-route-123';
  const mockUserId = 'test-user-456';
  const mockAccessToken = 'mock-access-token-789';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Route Action Buttons Test</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compact Style</Text>
          <RouteActionButtons
            routeId={mockRouteId}
            userId={mockUserId}
            accessToken={mockAccessToken}
            initialSaved={saveStatus}
            initialCompleted={completeStatus}
            style="compact"
            onSaveChange={(saved) => {
              setSaveStatus(saved);
              console.log('Save status changed:', saved);
            }}
            onCompleteChange={(completed) => {
              setCompleteStatus(completed);
              console.log('Complete status changed:', completed);
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full Style</Text>
          <RouteActionButtons
            routeId={mockRouteId}
            userId={mockUserId}
            accessToken={mockAccessToken}
            initialSaved={saveStatus}
            initialCompleted={completeStatus}
            style="full"
            onSaveChange={(saved) => {
              setSaveStatus(saved);
              console.log('Save status changed:', saved);
            }}
            onCompleteChange={(completed) => {
              setCompleteStatus(completed);
              console.log('Complete status changed:', completed);
            }}
          />
        </View>

        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>Current Status:</Text>
          <Text style={styles.statusText}>
            Saved: {saveStatus ? '✅ Yes' : '❌ No'}
          </Text>
          <Text style={styles.statusText}>
            Completed: {completeStatus ? '✅ Yes' : '❌ No'}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Test Instructions:</Text>
          <Text style={styles.infoText}>
            1. Tap the Save button to toggle save status
          </Text>
          <Text style={styles.infoText}>
            2. Tap the Complete button to mark as completed
          </Text>
          <Text style={styles.infoText}>
            3. Check console logs for API call details
          </Text>
          <Text style={styles.infoText}>
            4. Note: Complete button becomes disabled after completion
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h1,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    ...theme.typography.h3,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  statusSection: {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: '#F0F8FF',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: '#B0D4F1',
  },
  statusTitle: {
    ...theme.typography.h4,
    marginBottom: theme.spacing.sm,
    color: '#0066CC',
  },
  statusText: {
    ...theme.typography.body,
    marginBottom: theme.spacing.xs,
    fontSize: 16,
  },
  infoSection: {
    padding: theme.spacing.lg,
    backgroundColor: '#F5F5F5',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  infoTitle: {
    ...theme.typography.h4,
    marginBottom: theme.spacing.sm,
    color: theme.colors.text,
  },
  infoText: {
    ...theme.typography.body,
    marginBottom: theme.spacing.xs,
    color: theme.colors.textSecondary,
  },
});

export default RouteActionButtonsTest;
