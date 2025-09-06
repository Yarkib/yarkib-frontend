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
import { getBaseUrl } from '../src/utils/api';
import { Route } from '../src/types/route';
import { router } from 'expo-router';

const CompletedRoutesScreen = () => {
  const { user, session } = useAuth() as AuthContextType;
  const [completedRoutes, setCompletedRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompletedRoutes = useCallback(async () => {
    if (!user?.id) {
      console.log('[COMPLETED ROUTES] User not authenticated');
      setError('Please log in to view completed routes');
      setLoading(false);
      return;
    }

    try {
      console.log('[COMPLETED ROUTES] Fetching completed routes for user:', user.id);
      
      // Use the correct endpoint format for completed routes
      const response = await fetch(`${getBaseUrl()}/user/routes/completed/${user.id}`, {
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
      
      console.log(`[COMPLETED ROUTES] Received ${routes.length} completed routes`);
      setCompletedRoutes(routes);
      setError(null);
    } catch (error: any) {
      console.error('[COMPLETED ROUTES] Error fetching completed routes:', error);
      setError('Failed to load completed routes. Please try again.');
      setCompletedRoutes([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, session?.access_token]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCompletedRoutes().finally(() => setRefreshing(false));
  }, [fetchCompletedRoutes]);

  const handleRoutePress = (route: Route) => {
    router.push({
      pathname: '/route-details',
      params: {
        routeData: JSON.stringify(route)
      }
    });
  };

  const handleUncompleteRoute = async (routeId: string, routeName: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'Please log in to manage completed routes');
      return;
    }

    Alert.alert(
      'Mark as Incomplete',
      `Mark "${routeName}" as not completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Incomplete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove from completed routes (this might need a specific endpoint)
              const response = await fetch(`${getBaseUrl()}/user/routes/complete`, {
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
              setCompletedRoutes(prev => prev.filter(route => route.id !== routeId));
              Alert.alert('Success', 'Route marked as incomplete');
            } catch (error) {
              console.error('[COMPLETED ROUTES] Error marking route as incomplete:', error);
              Alert.alert('Error', 'Failed to update route status. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleSaveRoute = async (routeId: string, routeName: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'Please log in to save routes');
      return;
    }

    try {
      const response = await fetch(`${getBaseUrl()}/user/routes/save`, {
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

      Alert.alert('Success', 'Route saved to your saved routes!');
    } catch (error) {
      console.error('[COMPLETED ROUTES] Error saving route:', error);
      Alert.alert('Error', 'Failed to save route. Please try again.');
    }
  };

  const formatCompletionDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown date';
    }
  };

  useEffect(() => {
    fetchCompletedRoutes();
  }, [fetchCompletedRoutes]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} translucent />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading completed routes...</Text>
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
          <Text style={styles.headerTitle}>Completed Routes</Text>
          <Text style={styles.headerSubtitle}>
            {completedRoutes.length} {completedRoutes.length === 1 ? 'route' : 'routes'} completed
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Routes List */}
      <FlatList
        data={completedRoutes}
        renderItem={({ item }) => (
          <View style={styles.routeItemContainer}>
            <TouchableOpacity
              style={styles.routeCard}
              onPress={() => handleRoutePress(item)}
              activeOpacity={0.7}
            >
              <RouteCard route={item} />
              {/* Completion Info Overlay */}
              <View style={styles.completionInfo}>
                <View style={styles.completionBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={styles.completionText}>Completed</Text>
                </View>
                {item.completed_at && (
                  <Text style={styles.completionDate}>
                    {formatCompletionDate(item.completed_at)}
                  </Text>
                )}
                {item.rating && (
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>{item.rating}/5</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={() => handleSaveRoute(item.id, item.name)}
              >
                <Ionicons name="bookmark-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.uncompleteButton]}
                onPress={() => handleUncompleteRoute(item.id, item.name)}
              >
                <Ionicons name="close-circle" size={20} color="#EF4444" />
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
                <Text style={styles.errorText}>Failed to load completed routes</Text>
                <Text style={styles.errorSubtext}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={fetchCompletedRoutes}>
                  <Ionicons name="refresh" size={16} color="white" />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={60} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>No completed routes yet</Text>
                <Text style={styles.emptySubtext}>
                  Complete routes to see them here. Mark routes as completed after you finish them!
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
  completionInfo: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  completionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  completionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  completionDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
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
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  uncompleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
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

export default CompletedRoutesScreen;
