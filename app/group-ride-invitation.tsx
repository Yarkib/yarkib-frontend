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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';
import { groupRideApi } from '../src/utils/api';

interface GroupRideInvitation {
  id: string;
  group_ride_id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  created_at: string;
  group_ride: {
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
  };
}

const GroupRideInvitationScreen = () => {
  const { invitationData } = useLocalSearchParams<{ invitationData: string }>();
  const { user } = useAuth() as AuthContextType;
  
  const [invitation, setInvitation] = useState<GroupRideInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invitationData) {
      try {
        const parsedInvitation = JSON.parse(invitationData);
        setInvitation(parsedInvitation);
        console.log('[INVITATION] Loaded invitation:', parsedInvitation);
      } catch (error) {
        console.error('[INVITATION] Error parsing invitation data:', error);
        setError('Invalid invitation data');
      }
    }
    setLoading(false);
  }, [invitationData]);

  const handleAccept = async () => {
    if (!invitation || !user?.id) {
      Alert.alert('Error', 'Unable to accept invitation');
      return;
    }

    try {
      setResponding(true);
      console.log('[INVITATION] Accepting invitation:', invitation.group_ride_id);

      await groupRideApi.acceptInvitation(invitation.group_ride_id, user.id);

      Alert.alert(
        'Invitation Accepted!',
        `You've joined the group ride "${invitation.group_ride.route.name}".`,
        [
          {
            text: 'View Group Ride',
            onPress: () => {
              router.replace({
                pathname: '/group-ride-details',
                params: {
                  groupRideData: JSON.stringify(invitation.group_ride),
                },
              });
            },
          },
          {
            text: 'Go Home',
            onPress: () => router.replace('/home'),
          },
        ]
      );
    } catch (error: any) {
      console.error('[INVITATION] Error accepting invitation:', error);
      Alert.alert('Error', `Failed to accept invitation: ${error.message}`);
    } finally {
      setResponding(false);
    }
  };

  const handleReject = async () => {
    if (!invitation || !user?.id) {
      Alert.alert('Error', 'Unable to reject invitation');
      return;
    }

    Alert.alert(
      'Reject Invitation',
      'Are you sure you want to decline this group ride invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setResponding(true);
              console.log('[INVITATION] Rejecting invitation:', invitation.group_ride_id);

              await groupRideApi.rejectInvitation(invitation.group_ride_id, user.id);

              Alert.alert(
                'Invitation Declined',
                'You have declined the group ride invitation.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/home'),
                  },
                ]
              );
            } catch (error: any) {
              console.error('[INVITATION] Error rejecting invitation:', error);
              Alert.alert('Error', `Failed to reject invitation: ${error.message}`);
            } finally {
              setResponding(false);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invitation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>
            {error || 'Invitation not found'}
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

  const { group_ride, message } = invitation;
  const { route, creator } = group_ride;

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
        <Text style={styles.headerTitle}>Group Ride Invitation</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Invitation Card */}
        <View style={styles.invitationCard}>
          <View style={styles.invitationHeader}>
            <Ionicons name="people-outline" size={32} color={theme.colors.primary} />
            <Text style={styles.invitationTitle}>Group Ride Invitation</Text>
          </View>

          <Text style={styles.invitationMessage}>
            {message || `${creator.name} invited you to join a group ride!`}
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
          </View>
        </View>

        {/* Group Ride Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Group Ride Details</Text>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>
              Created on {formatDate(group_ride.created_at)}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Status: {group_ride.status}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={handleReject}
          disabled={responding}
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
          <Text style={styles.rejectButtonText}>
            {responding ? 'Declining...' : 'Decline'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={handleAccept}
          disabled={responding}
        >
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.acceptButtonText}>
            {responding ? 'Joining...' : 'Join Ride'}
          </Text>
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
  invitationCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  invitationTitle: {
    ...theme.typography.h3,
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  invitationMessage: {
    ...theme.typography.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    lineHeight: 24,
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
  acceptButton: {
    backgroundColor: '#34C759',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  acceptButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
  rejectButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
});

export default GroupRideInvitationScreen;
