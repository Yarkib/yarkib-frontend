import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
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
import { groupRideApi, fetchRouteDetails, getBaseUrl } from '../src/utils/api';

interface GroupRide {
  id: string;
  route_id: string;
  created_by: string;
  status: string;
  created_at: string;
  updated_at: string;
  route: {
    id: string;
    name: string;
    distance: number;
    duration: number;
    difficulty: string;
    elevation_gain: number;
    images: string[];
    tags?: string[];
    rating?: number;
    start_location?: any;
    end_location?: any;
  };
  creator: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
  };
  user_role: string;
  joined_at: string;
  members?: {
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
  }[];
}

const GroupRidesScreen = () => {
  const { user } = useAuth() as AuthContextType;
  const [groupRides, setGroupRides] = useState<GroupRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRouteDetails, setFetchingRouteDetails] = useState(false);

  // Fetch user's group rides
  const fetchGroupRides = useCallback(async () => {
    if (!user?.id) {
      setError('Please log in to view group rides');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      console.log('[GROUP RIDES] Fetching group rides for user:', user.id);

      // Use the proper API function for user's group rides
      const data = await groupRideApi.getUserGroupRides(user.id, {
        status: 'active', // Get active group rides
        page: 1,
        limit: 50
      });

      console.log('[GROUP RIDES] Raw response:', data);
      console.log('[GROUP RIDES] Response type:', typeof data);
      console.log('[GROUP RIDES] Is array:', Array.isArray(data));
      console.log('[GROUP RIDES] Response keys:', data ? Object.keys(data) : 'null');

      // Handle different response formats and normalize data structure
      let rides = [];
      if (Array.isArray(data)) {
        rides = data;
        console.log('[GROUP RIDES] Using direct array format, count:', rides.length);
      } else if (data.group_rides && Array.isArray(data.group_rides)) {
        rides = data.group_rides;
        console.log('[GROUP RIDES] Using group_rides property, count:', rides.length);
      } else if (data.data && Array.isArray(data.data)) {
        rides = data.data;
        console.log('[GROUP RIDES] Using data property, count:', rides.length);
      } else {
        console.log('[GROUP RIDES] No valid rides array found in response');
        console.log('[GROUP RIDES] Available properties:', data ? Object.keys(data) : 'null');
      }

      // Normalize the data structure to ensure consistent format
      setFetchingRouteDetails(true);
      const normalizedRides = await Promise.all(rides.map(async (ride: any) => {
        try {
          console.log('[GROUP RIDES] Processing ride:', ride.id || 'unknown');
          console.log('[GROUP RIDES] Ride keys:', Object.keys(ride));
          console.log('[GROUP RIDES] Route data:', ride.route || ride.routes);
          console.log('[GROUP RIDES] Creator data:', ride.creator || ride.profiles);
          console.log('[GROUP RIDES] Members data:', ride.members || ride.participants);
          
          // 🔧 FIX: Fetch complete group ride data if members are missing
          let completeRideData = ride;
          if ((!ride.members || ride.members.length === 0) && (!ride.participants || ride.participants.length === 0) && ride.id) {
            try {
              console.log('[GROUP RIDES] Fetching complete group ride data for:', ride.id);
              const response = await fetch(`${getBaseUrl()}/group-rides/${ride.id}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                },
              });
              
              if (response.ok) {
                const completeData = await response.json();
                completeRideData = completeData;
                console.log('[GROUP RIDES] Fetched complete data:', completeData);
                console.log('[GROUP RIDES] Complete data members:', completeData.members || completeData.participants);
              } else {
                console.log('[GROUP RIDES] Failed to fetch complete data, using original data');
              }
            } catch (error) {
              console.error('[GROUP RIDES] Error fetching complete group ride data:', error);
              // Continue with original data
            }
          }
          
          // Ensure route data is properly structured
          let route = completeRideData.route || completeRideData.routes || {};
          const creator = completeRideData.creator || completeRideData.profiles || {};
          const members = completeRideData.members || completeRideData.participants || [];
          
          // If route data is missing or incomplete, try to fetch it
          if ((!route.name || !route.description || !route.distance) && ride.route_id) {
            try {
              console.log('[GROUP RIDES] Fetching missing route details for route_id:', ride.route_id);
              const routeDetails = await fetchRouteDetails(ride.route_id);
              route = routeDetails;
              console.log('[GROUP RIDES] Fetched route details:', routeDetails);
            } catch (error) {
              console.error('[GROUP RIDES] Failed to fetch route details:', error);
              // Continue with existing route data
            }
          }

          return {
            ...completeRideData,
            route: {
              id: route.id || ride.route_id,
              name: route.name || 'Unknown Route',
              description: route.description || '',
              distance: Number(route.distance) || 0,
              duration: Number(route.duration) || 0,
              difficulty: route.difficulty || 'easy',
              elevation_gain: Number(route.elevation_gain) || 0,
              images: Array.isArray(route.images) ? route.images : [],
              tags: Array.isArray(route.tags) ? route.tags : [],
              rating: Number(route.rating) || 0,
              start_location: route.start_location,
              end_location: route.end_location,
              start_point_name: route.start_point_name,
              end_point_name: route.end_point_name,
              waypoints: route.waypoints || [],
              google_maps_url: route.google_maps_url,
            },
            creator: {
              id: creator.id || ride.created_by,
              full_name: creator.full_name || creator.name || 'Unknown User',
              username: creator.username || 'unknown',
              avatar_url: creator.avatar_url || creator.avatar,
            },
            members: Array.isArray(members) ? members.map(member => ({
              id: member.id || member.user_id,
              user_id: member.user_id || member.id,
              role: member.role || 'participant',
              joined_at: member.joined_at,
              status: member.status || member.invitation_status,
              profiles: member.profiles || member.user || {
                id: member.user_id || member.id,
                full_name: member.full_name || member.name || 'Unknown User',
                username: member.username || 'unknown',
                avatar_url: member.avatar_url || member.avatar,
              }
            })) : []
          };
        } catch (error) {
          console.error('[GROUP RIDES] Error normalizing ride data:', error, ride);
          // Return a minimal valid structure if normalization fails
          return {
            ...ride,
            route: {
              id: ride.route_id || 'unknown',
              name: 'Unknown Route',
              description: '',
              distance: 0,
              duration: 0,
              difficulty: 'easy',
              elevation_gain: 0,
              images: [],
              tags: [],
              rating: 0,
            },
            creator: {
              id: ride.created_by || 'unknown',
              full_name: 'Unknown User',
              username: 'unknown',
              avatar_url: null,
            },
            members: []
          };
        }
      }));

      setGroupRides(normalizedRides);
      console.log('[GROUP RIDES] Loaded and normalized group rides:', normalizedRides.length);
    } catch (error) {
      console.error('[GROUP RIDES] Error fetching group rides:', error);
      setError('Failed to load group rides. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFetchingRouteDetails(false);
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
    console.log('[GROUP RIDES] Navigating to group ride status:', groupRide.id);
    console.log('[GROUP RIDES] Passing group ride data:', groupRide);
    console.log('[GROUP RIDES] Route data being passed:', groupRide.route);
    console.log('[GROUP RIDES] Creator data being passed:', groupRide.creator);
    console.log('[GROUP RIDES] Members data being passed:', groupRide.members);
    
    router.push({
      pathname: '/group-ride-status',
      params: {
        groupRideId: groupRide.id,
        groupRideData: JSON.stringify(groupRide),
        source: 'group-rides',
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
    const organizerInfo = item.creator || {};
    const routeInfo = item.route || {};
    
    // Debug logging for what's being displayed
    console.log('[GROUP RIDES] Rendering group ride:', item.id);
    console.log('[GROUP RIDES] Route info being displayed:', routeInfo);
    console.log('[GROUP RIDES] Route name:', routeInfo.name);
    console.log('[GROUP RIDES] Route distance:', routeInfo.distance);
    console.log('[GROUP RIDES] Route duration:', routeInfo.duration);
    console.log('[GROUP RIDES] Route difficulty:', routeInfo.difficulty);
    console.log('[GROUP RIDES] Organizer info being displayed:', organizerInfo);

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
          <Text style={styles.loadingText}>
            {fetchingRouteDetails ? 'Loading route details...' : 'Loading group rides...'}
          </Text>
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
