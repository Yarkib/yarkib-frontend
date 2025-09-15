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
import { getBaseUrl } from '../src/utils/api';

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
    routes: {
      id: string;
      name: string;
      description: string;
      distance: number;
      duration: number;
      difficulty: string;
      elevation_gain: number;
      start_location?: string;
      end_location?: string;
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
  };
}

const GroupRideInvitationScreen = () => {
  const { invitationData } = useLocalSearchParams<{ invitationData: string }>();
  const { user } = useAuth() as AuthContextType;
  
  const [invitation, setInvitation] = useState<GroupRideInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [rejected, setRejected] = useState(false);

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
      console.log('[INVITATION] Accepting invitation for group ride:', invitation.group_ride_id);
      console.log('[INVITATION] User ID:', user.id);

      // Call the backend accept endpoint directly
      const response = await fetch(`${getBaseUrl()}/group-rides/${invitation.group_ride_id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id
        })
      });

      console.log('[INVITATION] Accept response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[INVITATION] Accept failed:', response.status, errorText);
        throw new Error(`Failed to accept invitation: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[INVITATION] Accept result:', result);

      // Show success state
      setAccepted(true);
      
      // Auto-navigate to home after 2 seconds
      setTimeout(() => {
        router.replace('/home');
      }, 2000);

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

    try {
      setResponding(true);
      console.log('[INVITATION] Rejecting invitation for group ride:', invitation.group_ride_id);

      // Call the backend reject endpoint directly
      const response = await fetch(`${getBaseUrl()}/group-rides/${invitation.group_ride_id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[INVITATION] Reject failed:', response.status, errorText);
        Alert.alert('Error', `Failed to reject invitation: ${response.status} - ${errorText}`);
        return;
      }

      const result = await response.json();
      console.log('[INVITATION] Reject result:', result);

      // Show success state
      setRejected(true);
      
      // Auto-navigate to home after 2 seconds
      setTimeout(() => {
        router.replace('/home');
      }, 2000);
    } catch (error: any) {
      console.error('[INVITATION] Error rejecting invitation:', error);
      Alert.alert('Error', `Failed to reject invitation: ${error.message}`);
    } finally {
      setResponding(false);
    }
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

  // Success state for accepted invitation
  if (accepted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#34C759" />
          <Text style={styles.successTitle}>Invitation Accepted!</Text>
          <Text style={styles.successMessage}>
            You&apos;ve successfully joined the group ride &quot;{invitation.group_ride?.routes?.name || 'Unknown Route'}&quot;.
          </Text>
          <Text style={styles.redirectText}>Returning to home...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Success state for rejected invitation
  if (rejected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Ionicons name="close-circle" size={80} color="#FF9500" />
          <Text style={styles.successTitle}>Invitation Declined</Text>
          <Text style={styles.successMessage}>
            You have declined the group ride invitation.
          </Text>
          <Text style={styles.redirectText}>Returning to home...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { group_ride, message } = invitation;
  // The actual data structure uses 'routes' (plural) and 'profiles' instead of 'route' and 'creator'
  const route = group_ride?.routes;
  const creator = group_ride?.profiles;
  
  // Debug logging to understand the data structure
  console.log('[INVITATION] Group ride data:', group_ride);
  console.log('[INVITATION] Route data:', route);
  console.log('[INVITATION] Creator data:', creator);

  // Safety check for required data
  if (!route || !creator) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>
            Invalid invitation data - missing route or creator information
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
            {message || `${creator?.full_name || creator?.username || 'Someone'} invited you to join a group ride!`}
          </Text>
        </View>

        {/* Route Information */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeTitle}>{route?.name || 'Unknown Route'}</Text>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(route?.difficulty || 'easy') }]}>
              <Text style={styles.difficultyText}>{route?.difficulty || 'Easy'}</Text>
            </View>
          </View>

          <Text style={styles.routeDescription}>{route?.description || 'No description available'}</Text>

          {route?.images && route.images.length > 0 && (
            <Image source={{ uri: route.images[0] }} style={styles.routeImage} />
          )}

          {/* Route Stats */}
          <View style={styles.routeStats}>
            <View style={styles.statItem}>
              <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{route?.distance || 0} km</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{route?.duration || 0} min</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="trending-up-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{route?.elevation_gain || 0} m</Text>
            </View>
          </View>

          {/* Route Points */}
          <View style={styles.routePoints}>
            <View style={styles.pointItem}>
              <View style={[styles.pointDot, { backgroundColor: '#34C759' }]} />
              <Text style={styles.pointText}>
                {route?.start_point_name || (route?.start_location ? 'Start Location' : 'Start Point')}
              </Text>
            </View>
            <View style={styles.pointSeparator} />
            <View style={styles.pointItem}>
              <View style={[styles.pointDot, { backgroundColor: '#FF3B30' }]} />
              <Text style={styles.pointText}>
                {route?.end_point_name || (route?.end_location ? 'End Location' : 'End Point')}
              </Text>
            </View>
          </View>
        </View>

        {/* Group Ride Creator */}
        <View style={styles.creatorCard}>
          <Text style={styles.creatorTitle}>Ride Organizer</Text>
          <View style={styles.creatorInfo}>
            {creator?.avatar_url ? (
              <Image source={{ uri: creator.avatar_url }} style={styles.creatorAvatar} />
            ) : (
              <View style={styles.creatorAvatarPlaceholder}>
                <Ionicons name="person" size={24} color={theme.colors.primary} />
              </View>
            )}
            <View style={styles.creatorDetails}>
              <Text style={styles.creatorName}>{creator?.full_name || creator?.username || 'Unknown User'}</Text>
              <Text style={styles.creatorUsername}>@{creator?.username || 'unknown'}</Text>
            </View>
          </View>
        </View>

        {/* Group Ride Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Group Ride Details</Text>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>
              Created on {formatDate(group_ride?.created_at || new Date().toISOString())}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Status: {group_ride?.status || 'Unknown'}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={handleReject}
          disabled={responding}
          activeOpacity={0.7}
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
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  successTitle: {
    ...theme.typography.h2,
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  successMessage: {
    ...theme.typography.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.lg,
  },
  redirectText: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
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
    backgroundColor: theme.colors.card,
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
    backgroundColor: theme.colors.card,
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
    backgroundColor: theme.colors.card,
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
    backgroundColor: theme.colors.card,
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
