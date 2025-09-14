import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';
import { groupRideApi } from '../src/utils/api';

interface GroupRideMember {
  id: string;
  user_id: string;
  group_ride_id: string;
  role: 'leader' | 'member';
  joined_at: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatar_url?: string;
  };
}

interface GroupRideDetails {
  id: string;
  route_id: string;
  created_by: string;
  status: string;
  created_at: string;
  route: {
    id: string;
    name: string;
    description: string;
    distance: number;
    duration: number;
    difficulty: string;
    elevation_gain: number;
    start_point_name: string;
    end_point_name: string;
    images: string[];
  };
  creator: {
    id: string;
    name: string;
    username: string;
    avatar_url?: string;
  };
  members: GroupRideMember[];
}

const GroupRideDetailsScreen = () => {
  const { groupRideData } = useLocalSearchParams<{ groupRideData: string }>();
  const { user } = useAuth() as AuthContextType;
  
  const [groupRide, setGroupRide] = useState<GroupRideDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupRideData) {
      try {
        const parsedGroupRide = JSON.parse(groupRideData);
        setGroupRide(parsedGroupRide);
        console.log('[GROUP RIDE] Loaded group ride:', parsedGroupRide);
      } catch (error) {
        console.error('[GROUP RIDE] Error parsing group ride data:', error);
        setError('Invalid group ride data');
      }
    }
    setLoading(false);
  }, [groupRideData]);

  const refreshGroupRide = async () => {
    if (!groupRide?.id) return;

    try {
      setRefreshing(true);
      console.log('[GROUP RIDE] Refreshing group ride details...');

      const updatedGroupRide = await groupRideApi.getGroupRideDetails(groupRide.id);
      setGroupRide(updatedGroupRide);
      console.log('[GROUP RIDE] Group ride refreshed:', updatedGroupRide);
    } catch (error) {
      console.error('[GROUP RIDE] Error refreshing group ride:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLeaveGroup = () => {
    if (!groupRide || !user?.id) {
      Alert.alert('Error', 'Unable to leave group ride');
      return;
    }

    Alert.alert(
      'Leave Group Ride',
      'Are you sure you want to leave this group ride?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[GROUP RIDE] Leaving group ride:', groupRide.id);
              // TODO: Implement leave group ride API endpoint
              Alert.alert('Success', 'You have left the group ride.');
              router.replace('/home');
            } catch (error: any) {
              console.error('[GROUP RIDE] Error leaving group ride:', error);
              Alert.alert('Error', `Failed to leave group ride: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'leader':
        return '#FF9500';
      case 'member':
        return theme.colors.primary;
      default:
        return theme.colors.textSecondary;
    }
  };

  const renderMember = ({ item }: { item: GroupRideMember }) => (
    <View style={styles.memberItem}>
      <View style={styles.memberInfo}>
        {item.user.avatar_url ? (
          <Image source={{ uri: item.user.avatar_url }} style={styles.memberAvatar} />
        ) : (
          <View style={styles.memberAvatarPlaceholder}>
            <Ionicons name="person" size={20} color={theme.colors.primary} />
          </View>
        )}
        <View style={styles.memberDetails}>
          <Text style={styles.memberName}>{item.user.name}</Text>
          <Text style={styles.memberUsername}>@{item.user.username}</Text>
        </View>
      </View>
      <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
        <Text style={styles.roleText}>{item.role}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading group ride...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !groupRide) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>
            {error || 'Group ride not found'}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { route, creator, members } = groupRide;
  const isLeader = creator.id === user?.id;
  const currentUserMember = members.find(member => member.user_id === user?.id);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Ride</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={refreshGroupRide}
        >
          <Ionicons name="refresh" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Group Ride Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Ionicons name="people" size={24} color={theme.colors.primary} />
            <Text style={styles.statusTitle}>Active Group Ride</Text>
          </View>
          <Text style={styles.statusText}>
            {members.length} member{members.length !== 1 ? 's' : ''} joined
          </Text>
        </View>

        {/* Route Information */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeTitle}>{route.name}</Text>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(route.difficulty) }]}>
              <Text style={styles.difficultyText}>{route.difficulty}</Text>
            </View>
          </View>

          <Text style={styles.routeDescription}>{route.description}</Text>

          {route.images && route.images.length > 0 && (
            <Image source={{ uri: route.images[0] }} style={styles.routeImage} />
          )}

          {/* Route Stats */}
          <View style={styles.routeStats}>
            <View style={styles.statItem}>
              <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{route.distance} km</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{route.duration} min</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="trending-up-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{route.elevation_gain} m</Text>
            </View>
          </View>

          {/* Route Points */}
          <View style={styles.routePoints}>
            <View style={styles.pointItem}>
              <View style={[styles.pointDot, { backgroundColor: '#34C759' }]} />
              <Text style={styles.pointText}>{route.start_point_name}</Text>
            </View>
            <View style={styles.pointSeparator} />
            <View style={styles.pointItem}>
              <View style={[styles.pointDot, { backgroundColor: '#FF3B30' }]} />
              <Text style={styles.pointText}>{route.end_point_name}</Text>
            </View>
          </View>
        </View>

        {/* Group Ride Creator */}
        <View style={styles.creatorCard}>
          <Text style={styles.creatorTitle}>Ride Organizer</Text>
          <View style={styles.creatorInfo}>
            {creator.avatar_url ? (
              <Image source={{ uri: creator.avatar_url }} style={styles.creatorAvatar} />
            ) : (
              <View style={styles.creatorAvatarPlaceholder}>
                <Ionicons name="person" size={24} color={theme.colors.primary} />
              </View>
            )}
            <View style={styles.creatorDetails}>
              <Text style={styles.creatorName}>{creator.name}</Text>
              <Text style={styles.creatorUsername}>@{creator.username}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor('leader') }]}>
              <Text style={styles.roleText}>Leader</Text>
            </View>
          </View>
        </View>

        {/* Members List */}
        <View style={styles.membersCard}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>Members ({members.length})</Text>
          </View>
          
          <FlatList
            data={members}
            renderItem={renderMember}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Group Ride Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Group Ride Details</Text>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>
              Created on {formatDate(groupRide.created_at)}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Status: {groupRide.status}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {currentUserMember && (
          <TouchableOpacity
            style={[styles.actionButton, styles.leaveButton]}
            onPress={handleLeaveGroup}
          >
            <Ionicons name="exit-outline" size={20} color="#FF3B30" />
            <Text style={styles.leaveButtonText}>Leave Ride</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.actionButton, styles.viewRouteButton]}
          onPress={() => {
            router.push({
              pathname: '/route-details',
              params: {
                routeData: JSON.stringify(route),
              },
            });
          }}
        >
          <Ionicons name="map-outline" size={20} color="#FFFFFF" />
          <Text style={styles.viewRouteButtonText}>View Route</Text>
        </TouchableOpacity>
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
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
  backButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  backButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: theme.colors.primary + '10',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  statusTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
  statusText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  routeCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  routeTitle: {
    ...theme.typography.h3,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  difficultyBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  difficultyText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  routeDescription: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  routeImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  routePoints: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
  },
  pointText: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontSize: 14,
  },
  pointSeparator: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.sm,
  },
  creatorCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  creatorTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: theme.spacing.md,
  },
  creatorAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  creatorDetails: {
    flex: 1,
  },
  creatorName: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  creatorUsername: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  membersCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  membersTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing.md,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  memberUsername: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  roleText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  detailsCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  detailsTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  detailText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: theme.spacing.xs,
  },
  leaveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  viewRouteButton: {
    backgroundColor: theme.colors.primary,
  },
  leaveButtonText: {
    ...theme.typography.body,
    color: '#FF3B30',
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
  viewRouteButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
});

export default GroupRideDetailsScreen;
