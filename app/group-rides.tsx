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
import { groupRideApi } from '../src/utils/api';

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
    description?: string;
    distance: number;
    duration: number;
    difficulty: string;
    elevation_gain: number;
    start_location?: any;
    end_location?: any;
    images: string[];
    rating?: number;
    tags?: string[];
    categories?: {
      name: string;
      icon: string;
    };
  };
  creator: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
  };
  user_role: string; // "leader" or "member"
  joined_at?: string;
  // Legacy fields for backward compatibility
  routes?: any;
  profiles?: any;
  members?: any[];
  participants?: any[];
}

const GroupRidesScreen = () => {
  console.log('[GROUP RIDES] Component mounting/rendering');
  
  const { user } = useAuth() as AuthContextType;
  const [groupRides, setGroupRides] = useState<GroupRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  console.log('[GROUP RIDES] User from auth:', user);
  console.log('[GROUP RIDES] Initial state - loading:', loading, 'error:', error, 'groupRides:', groupRides.length);

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
      console.log('[GROUP RIDES] User object:', user);
      console.log('[GROUP RIDES] User ID type:', typeof user.id);

      // Use the groupRideApi helper function - try without status filter first
      let data = await groupRideApi.getUserGroupRides(user.id, {
        page: 1,
        limit: 50
      });

      // If no data returned, try with different status values
      if (!data || (data.group_rides && data.group_rides.length === 0) || (Array.isArray(data) && data.length === 0)) {
        console.log('[GROUP RIDES] No data with default params, trying with status=active');
        data = await groupRideApi.getUserGroupRides(user.id, {
          status: 'active',
          page: 1,
          limit: 50
        });
      }

      // If still no data, try with status=completed
      if (!data || (data.group_rides && data.group_rides.length === 0) || (Array.isArray(data) && data.length === 0)) {
        console.log('[GROUP RIDES] No data with active status, trying with status=completed');
        data = await groupRideApi.getUserGroupRides(user.id, {
          status: 'completed',
          page: 1,
          limit: 50
        });
      }

      console.log('[GROUP RIDES] Raw response:', JSON.stringify(data, null, 2));
      console.log('[GROUP RIDES] Response type:', typeof data);
      console.log('[GROUP RIDES] Is array:', Array.isArray(data));
      console.log('[GROUP RIDES] Response keys:', data ? Object.keys(data) : 'null');

      // Handle backend response format
      let rides = [];
      if (data.group_rides && Array.isArray(data.group_rides)) {
        rides = data.group_rides;
        console.log('[GROUP RIDES] Using group_rides array:', rides.length);
      } else if (Array.isArray(data)) {
        rides = data;
        console.log('[GROUP RIDES] Using direct array:', rides.length);
      } else if (data.data && Array.isArray(data.data)) {
        rides = data.data;
        console.log('[GROUP RIDES] Using data array:', rides.length);
      } else {
        console.log('[GROUP RIDES] No valid rides array found in response');
        console.log('[GROUP RIDES] Available data properties:', data ? Object.keys(data) : 'null');
      }

      console.log('[GROUP RIDES] Extracted rides:', rides.length);
      console.log('[GROUP RIDES] First ride sample:', rides[0]);
      console.log('[GROUP RIDES] Pagination info:', data.pagination);

      // Filter and sort rides to show most relevant first
      const sortedRides = rides
        .filter((ride: any) => ride && ride.id) // Ensure valid rides
        .sort((a: any, b: any) => {
          // Sort by creation date (newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

      setGroupRides(sortedRides);
      console.log('[GROUP RIDES] Loaded group rides:', sortedRides.length);
      console.log('[GROUP RIDES] Sample ride data:', sortedRides[0]);
    } catch (error) {
      console.error('[GROUP RIDES] Error fetching group rides:', error);
      setError('Failed to load group rides. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    console.log('[GROUP RIDES] useEffect triggered - calling fetchGroupRides');
    console.log('[GROUP RIDES] fetchGroupRides function:', fetchGroupRides);
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

  const handleGroupRidePress = async (groupRide: GroupRide) => {
    console.log('[GROUP RIDES] Navigating to group ride status:', groupRide.id);
    console.log('[GROUP RIDES] Group ride data:', {
      id: groupRide.id,
      routeName: groupRide.route?.name || groupRide.routes?.name,
      status: groupRide.status,
      userRole: groupRide.user_role
    });
    
    try {
      // Fetch full group ride details from API to get members/participants data
      console.log('[GROUP RIDES] Fetching full group ride details for navigation');
      const fullGroupRideData = await groupRideApi.getGroupRideDetails(groupRide.id);
      console.log('[GROUP RIDES] Full group ride data fetched:', fullGroupRideData);
      
      router.push({
        pathname: '/group-ride-status',
        params: {
          groupRideId: groupRide.id,
          groupRideData: JSON.stringify(fullGroupRideData),
          source: 'group-rides',
        },
      });
    } catch (error) {
      console.error('[GROUP RIDES] Error fetching full group ride details:', error);
      // Fallback to basic data if API call fails
      router.push({
        pathname: '/group-ride-status',
        params: {
          groupRideId: groupRide.id,
          groupRideData: JSON.stringify(groupRide),
          source: 'group-rides',
        },
      });
    }
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
    console.log('[GROUP RIDES] Getting participant count for:', groupRide.id);
    console.log('[GROUP RIDES] Group ride members:', groupRide.members);
    console.log('[GROUP RIDES] Group ride participants:', groupRide.participants);
    
    if (groupRide.members && Array.isArray(groupRide.members)) {
      console.log('[GROUP RIDES] Using members array, count:', groupRide.members.length);
      return groupRide.members.length;
    }
    if (groupRide.participants && Array.isArray(groupRide.participants)) {
      console.log('[GROUP RIDES] Using participants array, count:', groupRide.participants.length);
      return groupRide.participants.length;
    }
    console.log('[GROUP RIDES] No members/participants array found, returning 1 (creator only)');
    return 1; // At least the creator is a participant
  };

  const renderGroupRide = ({ item }: { item: GroupRide }) => {
    console.log('[GROUP RIDES] Rendering group ride:', item.id, item.route?.name || item.routes?.name);
    
    // Use new backend response structure with fallbacks for legacy data
    const routeInfo = item.route || item.routes || {};
    const creatorInfo = item.creator || item.profiles || {};
    const userRole = item.user_role || 'Unknown';
    
    console.log('[GROUP RIDES] Route info:', routeInfo);
    console.log('[GROUP RIDES] Creator info:', creatorInfo);
    console.log('[GROUP RIDES] User role:', userRole);
    
    // Determine if user is creator
    const isCreator = user?.id === item.created_by || userRole === 'leader';
    
    // Get participant count (this might need to be calculated differently with new API)
    const participantCount = getParticipantCount(item);

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
                {routeInfo.categories && (
                  <View style={[styles.categoryBadge, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.categoryText}>{routeInfo.categories.name}</Text>
                  </View>
                )}
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
                {creatorInfo.avatar_url ? (
                  <Image source={{ uri: creatorInfo.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={16} color={theme.colors.primary} />
                )}
              </View>
              <Text style={styles.organizerText}>
                by {creatorInfo.full_name || creatorInfo.username || 'Unknown'}
              </Text>
            </View>
            <View style={styles.participantInfo}>
              <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.participantText}>{participantCount} participants</Text>
            </View>
          </View>

          {/* User Role Badge */}
          <View style={styles.roleContainer}>
            <View style={[
              styles.roleBadge, 
              { backgroundColor: isCreator ? theme.colors.primary : theme.colors.textSecondary }
            ]}>
              <Ionicons 
                name={isCreator ? "star" : "person"} 
                size={12} 
                color="#FFFFFF" 
              />
              <Text style={styles.roleText}>
                {userRole === 'leader' ? 'Leader' : userRole === 'member' ? 'Member' : userRole}
              </Text>
            </View>
          </View>

          {/* Dates and Additional Info */}
          <View style={styles.dateContainer}>
            <Text style={styles.createdDate}>
              Created {formatDate(item.created_at)}
            </Text>
            {item.joined_at && (
              <Text style={styles.joinedDate}>
                Joined {formatDate(item.joined_at)}
              </Text>
            )}
          </View>
          
          {/* Route Rating */}
          {routeInfo.rating && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>{routeInfo.rating.toFixed(1)}</Text>
            </View>
          )}
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
          <Text style={styles.headerTitle}>My Group Rides</Text>
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
          <Text style={styles.headerTitle}>My Group Rides</Text>
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
      {(() => {
        console.log('[GROUP RIDES] Rendering content - groupRides.length:', groupRides.length);
        console.log('[GROUP RIDES] groupRides array:', groupRides);
        return groupRides.length === 0;
      })() ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>No Group Rides Found</Text>
          <Text style={styles.emptySubtitle}>
            You haven&apos;t created or joined any group rides yet. Create your first group ride or wait for invitations from friends.
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
          onLayout={() => console.log('[GROUP RIDES] FlatList onLayout - rendering with', groupRides.length, 'items')}
          onContentSizeChange={() => console.log('[GROUP RIDES] FlatList content size changed')}
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
  categoryBadge: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: theme.spacing.xs,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
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
  dateContainer: {
    marginTop: theme.spacing.xs,
  },
  createdDate: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  joinedDate: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  ratingText: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  roleContainer: {
    marginTop: theme.spacing.xs,
    alignItems: 'flex-start',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
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
