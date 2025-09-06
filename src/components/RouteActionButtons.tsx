import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { RouteActionButtonsProps, RouteActionState } from '../types/route';
import { userRoutesApi } from '../utils/api';

const RouteActionButtons: React.FC<RouteActionButtonsProps> = ({
  routeId,
  userId,
  accessToken,
  initialSaved = false,
  initialCompleted = false,
  onSaveChange,
  onCompleteChange,
  onRouteUpdate,
  style = 'full',
}) => {
  const [state, setState] = useState<RouteActionState>({
    isSaved: initialSaved,
    isCompleted: initialCompleted,
    savingLoading: false,
    completingLoading: false,
  });

  // Update state when initial values change
  useEffect(() => {
    setState(prev => ({
      ...prev,
      isSaved: initialSaved,
      isCompleted: initialCompleted,
    }));
  }, [initialSaved, initialCompleted]);

  const handleSaveToggle = async () => {
    if (state.savingLoading) return;

    const newSavedState = !state.isSaved;
    
    // Optimistic update
    setState(prev => ({ ...prev, isSaved: newSavedState, savingLoading: true }));

    try {
      if (newSavedState) {
        await userRoutesApi.saveRoute(routeId, accessToken, userId);
        console.log(`[ROUTE ACTIONS] Route ${routeId} saved successfully`);
      } else {
        await userRoutesApi.unsaveRoute(routeId, accessToken, userId);
        console.log(`[ROUTE ACTIONS] Route ${routeId} unsaved successfully`);
      }

      // Call callbacks if provided
      onSaveChange?.(newSavedState);
      onRouteUpdate?.({ is_saved: newSavedState });
    } catch (error) {
      console.error(`[ROUTE ACTIONS] Error toggling save for route ${routeId}:`, error);
      
      // Revert optimistic update on error
      setState(prev => ({ ...prev, isSaved: !newSavedState }));
      
      // Show error alert
      Alert.alert(
        'Error',
        newSavedState 
          ? 'Failed to save route. Please try again.' 
          : 'Failed to unsave route. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setState(prev => ({ ...prev, savingLoading: false }));
    }
  };

  const handleCompleteToggle = async () => {
    if (state.completingLoading) return;

    const newCompletedState = !state.isCompleted;
    
    // Optimistic update
    setState(prev => ({ ...prev, isCompleted: newCompletedState, completingLoading: true }));

    try {
      if (newCompletedState) {
        await userRoutesApi.completeRoute(routeId, accessToken, userId, {
          completed_at: new Date().toISOString(),
        });
        console.log(`[ROUTE ACTIONS] Route ${routeId} completed successfully`);
      } else {
        // Note: The API doesn't have an "uncomplete" endpoint, so we'll just show an error
        // In a real implementation, you might want to add this endpoint
        throw new Error('Cannot uncomplete a route');
      }

      // Call callbacks if provided
      onCompleteChange?.(newCompletedState);
      onRouteUpdate?.({ is_completed: newCompletedState });
    } catch (error) {
      console.error(`[ROUTE ACTIONS] Error toggling complete for route ${routeId}:`, error);
      
      // Revert optimistic update on error
      setState(prev => ({ ...prev, isCompleted: !newCompletedState }));
      
      // Show error alert
      Alert.alert(
        'Error',
        newCompletedState 
          ? 'Failed to mark route as complete. Please try again.' 
          : 'Cannot uncomplete a route.',
        [{ text: 'OK' }]
      );
    } finally {
      setState(prev => ({ ...prev, completingLoading: false }));
    }
  };

  const isCompact = style === 'compact';

  return (
    <View style={[styles.container, isCompact && styles.containerCompact]}>
      {/* Save Button */}
      <TouchableOpacity
        style={[
          styles.button,
          isCompact && styles.buttonCompact,
          state.isSaved && styles.buttonSaved,
          state.savingLoading && styles.buttonLoading,
        ]}
        onPress={handleSaveToggle}
        disabled={state.savingLoading}
        activeOpacity={0.7}
      >
        {state.savingLoading ? (
          <ActivityIndicator 
            size="small" 
            color={state.isSaved ? '#FFFFFF' : theme.colors.primary} 
          />
        ) : (
          <>
            <Ionicons
              name={state.isSaved ? 'bookmark' : 'bookmark-outline'}
              size={isCompact ? 16 : 18}
              color={state.isSaved ? '#FFFFFF' : theme.colors.primary}
              style={styles.icon}
            />
            {!isCompact && (
              <Text style={[
                styles.buttonText,
                state.isSaved && styles.buttonTextSaved
              ]}>
                {state.isSaved ? 'Saved' : 'Save Route'}
              </Text>
            )}
          </>
        )}
      </TouchableOpacity>

      {/* Complete Button */}
      <TouchableOpacity
        style={[
          styles.button,
          isCompact && styles.buttonCompact,
          state.isCompleted && styles.buttonCompleted,
          state.completingLoading && styles.buttonLoading,
        ]}
        onPress={handleCompleteToggle}
        disabled={state.completingLoading || state.isCompleted}
        activeOpacity={0.7}
      >
        {state.completingLoading ? (
          <ActivityIndicator 
            size="small" 
            color={state.isCompleted ? '#FFFFFF' : '#34C759'} 
          />
        ) : (
          <>
            <Ionicons
              name={state.isCompleted ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={isCompact ? 16 : 18}
              color={state.isCompleted ? '#FFFFFF' : '#34C759'}
              style={styles.icon}
            />
            {!isCompact && (
              <Text style={[
                styles.buttonText,
                state.isCompleted && styles.buttonTextCompleted
              ]}>
                {state.isCompleted ? 'Completed' : 'Mark Complete'}
              </Text>
            )}
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.sm,
  },
  containerCompact: {
    gap: theme.spacing.xs,
    marginVertical: theme.spacing.xs,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    minHeight: 44, // Touch target size
  },
  buttonCompact: {
    flex: 0,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 36,
  },
  buttonSaved: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  buttonCompleted: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  buttonLoading: {
    opacity: 0.7,
  },
  icon: {
    marginRight: theme.spacing.xs,
  },
  buttonText: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  buttonTextSaved: {
    color: '#FFFFFF',
  },
  buttonTextCompleted: {
    color: '#FFFFFF',
  },
});

export default RouteActionButtons;
