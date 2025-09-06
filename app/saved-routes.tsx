import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import RouteCard from '../src/components/RouteCard';
import { theme } from '../src/theme/index';
import { userRoutesApi, getBaseUrl } from '../src/utils/api';
import { Route } from '../src/types/route';
import { router } from 'expo-router';

const SavedRoutesScreen = () => {
  const { user, session } = useAuth() as AuthContextType;
  const [savedRoutes, setSavedRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedRoutes = useCallback(async () => {
    if (!user?.id) {
      console.log('[SAVED ROUTES] User not authenticated');
      setError('Please log in to view saved routes');
      setLoading(false);
      return;
    }

    try {
      console.log('[SAVED ROUTES] Fetching saved routes for user:', user.id);
      
      // Use the correct endpoint format as shown in your logic
      const response = await fetch(`${getBaseUrl()}/user/routes/saved/${user.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const routes = data.routes || data; // Handle both {routes: [...]} and [...] formats
      
      console.log(`[SAVED ROUTES] Received ${routes.length} saved routes`);
      setSavedRoutes(routes);
      setError(null);
    } catch (error: any) {
      console.error('[SAVED ROUTES] Error fetching saved routes:', error);
      setError('Failed to load saved routes. Please try again.');
      setSavedRoutes([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, session?.access_token]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSavedRoutes().finally(() => setRefreshing(false));
  }, [fetchSavedRoutes]);

  const handleRoutePress = (route: Route) => {
    router.push({
      pathname: '/route-details',
      params: {
        routeData: JSON.stringify(route)
      }
    });
  };

  const handleCompleteRoute = async (routeId: string, routeName: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'Please log in to manage saved routes');
      return;
    }

    Alert.alert(
      'Complete Route',
      `Mark "${routeName}" as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              const response = await fetch(`${getBaseUrl()}/user/routes/complete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
                },
                body: JSON.stringify({
                  user_id: user.id,
                  route_id: routeId
                })
              });

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              // Update local state to mark as completed
              setSavedRoutes(prev => 
                prev.map(route => 
                  route.id === routeId 
                    ? { ...route, is_completed: true }
                    : route
                )
              );
              Alert.alert('Success', 'Route marked as completed!');
            } catch (error) {
              console.error('[SAVED ROUTES] Error completing route:', error);
              Alert.alert('Error', 'Failed to complete route. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleRemoveRoute = async (routeId: string, routeName: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'Please log in to manage saved routes');
      return;
    }

    Alert.alert(
      'Remove Route',
      `Are you sure you want to remove "${routeName}" from your saved routes?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Use the correct endpoint format as shown in your logic
              const response = await fetch(`${getBaseUrl()}/user/routes/save`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
                },
                body: JSON.stringify({
                  user_id: user.id,
                  route_id: routeId
                })
              });

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              // Remove from local state
              setSavedRoutes(prev => prev.filter(route => route.id !== routeId));
              Alert.alert('Success', 'Route removed from saved routes');
            } catch (error) {
              console.error('[SAVED ROUTES] Error removing route:', error);
              Alert.alert('Error', 'Failed to remove route. Please try again.');
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    fetchSavedRoutes();
  }, [fetchSavedRoutes]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} translucent />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading saved routes...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} translucent />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Saved Routes</Text>
          <Text style={styles.headerSubtitle}>
            {savedRoutes.length} {savedRoutes.length === 1 ? 'route' : 'routes'} saved
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Routes List */}
      <FlatList
        data={savedRoutes}
        renderItem={({ item }) => (
          <View style={styles.routeItemContainer}>
            <TouchableOpacity
              style={styles.routeCard}
              onPress={() => handleRoutePress(item)}
              activeOpacity={0.7}
            >
              <RouteCard route={item} />
            </TouchableOpacity>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => handleCompleteRoute(item.id, item.name)}
              >
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.removeButton]}
                onPress={() => handleRemoveRoute(item.id, item.name)}
              >
                <Ionicons name="bookmark" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.routesList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {error ? (
              <>
                <Ionicons name="alert-circle-outline" size={60} color={theme.colors.error} />
                <Text style={styles.errorText}>Failed to load saved routes</Text>
                <Text style={styles.errorSubtext}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={fetchSavedRoutes}>
                  <Ionicons name="refresh" size={16} color="white" />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="bookmark-outline" size={60} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>No saved routes yet</Text>
                <Text style={styles.emptySubtext}>
                  Save routes you want to try later by tapping the bookmark icon
                </Text>
                <TouchableOpacity 
                  style={styles.exploreButton} 
                  onPress={() => router.push('/home')}
                >
                  <Ionicons name="search" size={16} color="white" />
                  <Text style={styles.exploreButtonText}>Explore Routes</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: StatusBar.currentHeight || 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingTop: StatusBar.currentHeight || 0,
  },
  loadingText: {
    ...theme.typography.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...theme.typography.h2,
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSubtitle: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  routesList: {
    padding: theme.spacing.md,
    paddingBottom: 80,
  },
  routeItemContainer: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  routeCard: {
    flex: 1,
  },
  actionButtons: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  completeButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  removeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    marginTop: 60,
  },
  emptyText: {
    ...theme.typography.body,
    fontSize: 18,
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  emptySubtext: {
    ...theme.typography.body,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    color: theme.colors.textSecondary,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    ...theme.typography.body,
    fontSize: 18,
    marginTop: theme.spacing.md,
    color: theme.colors.error,
    fontWeight: '500',
  },
  errorSubtext: {
    ...theme.typography.body,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    color: theme.colors.error,
    opacity: 0.8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  exploreButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  exploreButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default SavedRoutesScreen;
