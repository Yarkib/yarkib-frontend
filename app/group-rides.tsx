import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';
import { getBaseUrl } from '../src/utils/api';

interface GroupRide {
  id: string;
  route_id: string;
  created_by: string;
  status: string;
  created_at: string;
  routes: {
    id: string;
    name: string;
    description: string;
    distance: number;
    duration: number;
    difficulty: string;
    elevation_gain: number;
    start_point_name?: string;
    end_point_name?: string;
    images: string[];
  };
  profiles: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
  };
  members?: Array<{
    id: string;
    user_id: string;
    role: string;
    joined_at?: string;
    profiles: {
      id: string;
      full_name?: string;
      username?: string;
      avatar_url?: string;
    };
  }>;
}

const GroupRidesScreen = () => {
  const { user } = useAuth() as AuthContextType;
  const [groupRides, setGroupRides] = useState<GroupRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all group rides
  const fetchGroupRides = useCallback(async () => {
    if (!user?.id) {
      setError('Please log in to view group rides');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      console.log('[GROUP RIDES] Fetching group rides for user:', user.id);

      const response = await fetch(`${getBaseUrl()}/group-rides`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GROUP RIDES] Fetch failed:', response.status, errorText);
        throw new Error(`Failed to fetch group rides: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GROUP RIDES] Raw response:', data);

      // Handle different response formats
      let rides = [];
      if (Array.isArray(data)) {
        rides = data;
      } else if (data.group_rides && Array.isArray(data.group_rides)) {
        rides = data.group_rides;
      } else if (data.data && Array.isArray(data.data)) {
        rides = data.data;
      }

      setGroupRides(rides);
      console.log('[GROUP RIDES] Loaded group rides:', rides.length);
    } catch (error) {
      console.error('[GROUP RIDES] Error fetching group rides:', error);
      setError('Failed to load group rides. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchGroupRides();
  }, [fetchGroupRides]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGroupRides();
  }, [fetchGroupRides]);

  const handleCreateGroupRide = () => {
    // Navigate to create group ride screen or show modal
    Alert.alert(
      'Create Group Ride',
      'This feature will be available soon!',
      [{ text: 'OK' }]
    );
  };

  const handleGroupRidePress = (groupRide: GroupRide) => {
    console.log('[GROUP RIDES] Navigating to group ride details:', groupRide.id);
    router.push({
      pathname: '/group-ride-details',
      params: {
        groupRideId: groupRide.id,
        groupRideData: JSON.stringify(groupRide),
      },
    });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        return '#34C759';
      case 'intermediate':
        return '#FF9500';
      case 'hard':
        return '#FF3B30';
      default:
        return theme.colors.primary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return '#34C759';
      case 'completed':
        return '#007AFF';
      case 'cancelled':
        return '#FF3B30';
      case 'upcoming':
        return '#FF9500';
      default:
        return theme.colors.textSecondary;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getParticipantCount = (groupRide: GroupRide) => {
    if (groupRide.members && Array.isArray(groupRide.members)) {
      return groupRide.members.length;
    }
    return 0;
  };

  const renderGroupRide = ({ item }: { item: GroupRide }) => {
    const participantCount = getParticipantCount(item);
    const organizerInfo = item.profiles || {};
    const routeInfo = item.routes || {};

    return (
      <TouchableOpacity
        style={styles.groupRideCard}
        onPress={() => handleGroupRidePress(item)}
        activeOpacity={0.7}
      >
        {/* Route Image */}
        {routeInfo.images && routeInfo.images.length > 0 ? (
          <Image source={{ uri: routeInfo.images[0] }} style={styles.routeImage} />
        ) : (
          <View style={styles.routeImagePlaceholder}>
            <Ionicons name="map-outline" size={32} color={theme.colors.textSecondary} />
          </View>
        )}

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.routeInfo}>
              <Text style={styles.routeName} numberOfLines={1}>
                {routeInfo.name || 'Unknown Route'}
              </Text>
              <View style={styles.routeMeta}>
                <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(routeInfo.difficulty) }]}>
                  <Text style={styles.difficultyText}>{routeInfo.difficulty || 'Easy'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.statusText}>{item.status || 'Unknown'}</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </View>

          {/* Route Stats */}
          <View style={styles.routeStats}>
            <View style={styles.statItem}>
              <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{routeInfo.distance || 0} km</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{routeInfo.duration || 0} min</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="trending-up-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{routeInfo.elevation_gain || 0} m</Text>
            </View>
          </View>

          {/* Organizer and Participants */}
          <View style={styles.cardFooter}>
            <View style={styles.organizerInfo}>
              <View style={styles.organizerAvatar}>
                {organizerInfo.avatar_url ? (
                  <Image source={{ uri: organizerInfo.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={16} color={theme.colors.primary} />
                )}
              </View>
              <Text style={styles.organizerText}>
                by {organizerInfo.full_name || organizerInfo.username || 'Unknown'}
              </Text>
            </View>
            <View style={styles.participantInfo}>
              <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.participantText}>{participantCount} participants</Text>
            </View>
          </View>

          {/* Created Date */}
          <Text style={styles.createdDate}>
            Created {formatDate(item.created_at)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.replace('/home')}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group Rides</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading group rides...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.replace('/home')}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group Rides</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchGroupRides}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Rides</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleCreateGroupRide}
        >
          <Ionicons name="add" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {groupRides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>No Group Rides Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first group ride or wait for invitations from friends.
          </Text>
          <TouchableOpacity style={styles.createButton} onPress={handleCreateGroupRide}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.createButtonText}>Create Group Ride</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groupRides}
          renderItem={renderGroupRide}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerButton: {
    padding: theme.spacing.sm,
    minWidth: 40,
  },
  headerTitle: {
    ...theme.typography.h3,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContainer: {
    padding: theme.spacing.lg,
  },
  groupRideCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  routeImage: {
    width: '100%',
    height: 160,
    resizeMode: 'cover',
  },
  routeImagePlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    padding: theme.spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  routeInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  routeName: {
    ...theme.typography.h3,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  routeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  difficultyBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
  },
  difficultyText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
    fontSize: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  organizerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  avatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  organizerText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginLeft: theme.spacing.xs,
  },
  createdDate: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    ...theme.typography.h3,
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  createButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: theme.spacing.sm,
  },
});

export default GroupRidesScreen;
