import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';
import { notificationsApi, groupRideApi } from '../src/utils/api';
import { router } from 'expo-router';

interface Notification {
  id: string;
  type: string;
  message: string;
  related_id?: string;
  is_read: boolean;
  created_at: string;
}

const NotificationsScreen = () => {
  const { user } = useAuth() as AuthContextType;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false); // New state for filter toggle

  // Fetch notifications from backend
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setError('Please log in to view notifications');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      console.log(`[NOTIFICATIONS] Fetching notifications for user ${user.id}`);

      const data = await notificationsApi.getUserNotifications(user.id, {
        is_read: showAll ? null : false, // Fetch all if showAll is true, otherwise only unread
        page: 1,
        limit: 50,
      });
      
      console.log('[NOTIFICATIONS] Received notifications:', data);

      // Handle different response formats
      let notificationsData: Notification[] = [];
      if (Array.isArray(data)) {
        notificationsData = data;
      } else if (data.notifications && Array.isArray(data.notifications)) {
        notificationsData = data.notifications;
      } else if (data.data && Array.isArray(data.data)) {
        notificationsData = data.data;
      }

      setNotifications(notificationsData);
    } catch (error: any) {
      console.error('[NOTIFICATIONS] Error fetching notifications:', error);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, showAll]);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    if (!user?.id) return;

    try {
      console.log(`[NOTIFICATIONS] Marking notification ${notificationId} as read`);

      await notificationsApi.markNotificationAsRead(notificationId, user.id);

      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, is_read: true }
            : notification
        )
      );

      console.log(`[NOTIFICATIONS] Notification ${notificationId} marked as read`);
    } catch (error: any) {
      console.error(`[NOTIFICATIONS] Error marking notification as read:`, error);
      Alert.alert('Error', 'Failed to mark notification as read');
    }
  };

  // Handle notification press
  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Handle different notification types
    switch (notification.type) {
      case 'group_ride_invitation':
        console.log('[NOTIFICATIONS] Group ride invitation pressed:', notification.related_id);
        try {
          // Log the notification data for debugging
          console.log('[NOTIFICATIONS] Full notification data:', notification);
          
          // Validate that we have a related_id
          if (!notification.related_id) {
            console.error('[NOTIFICATIONS] No related_id found in notification:', notification);
            Alert.alert('Error', 'Invalid notification: Missing group ride ID');
            return;
          }

          // Fetch group ride details for the invitation
          console.log('[NOTIFICATIONS] Attempting to fetch group ride details for ID:', notification.related_id);
          const groupRideDetails = await groupRideApi.getGroupRideDetails(notification.related_id);
          console.log('[NOTIFICATIONS] Successfully fetched group ride details:', groupRideDetails);
          
          // Create invitation object with the fetched data
          const invitationData = {
            id: notification.id,
            group_ride_id: notification.related_id,
            sender_id: groupRideDetails.created_by,
            receiver_id: user?.id,
            status: 'pending',
            message: notification.message,
            created_at: notification.created_at,
            group_ride: groupRideDetails,
          };

          console.log('[NOTIFICATIONS] Created invitation data:', invitationData);

          // Navigate to invitation response screen
          router.push({
            pathname: '/group-ride-invitation',
            params: {
              invitationData: JSON.stringify(invitationData),
            },
          });
        } catch (error: any) {
          console.error('[NOTIFICATIONS] Error fetching group ride details:', error);
          
          // Check if it's a 404 error (group ride not found)
          if (error.message && error.message.includes('404')) {
            Alert.alert(
              'Group Ride Not Found',
              'This group ride invitation is no longer valid. The group ride may have been cancelled or deleted.',
              [
                {
                  text: 'Mark as Read',
                  onPress: () => markAsRead(notification.id),
                },
                {
                  text: 'OK',
                  style: 'default',
                },
              ]
            );
          } else {
            Alert.alert('Error', `Failed to load invitation details: ${error.message}`);
          }
        }
        break;
      case 'group_ride_accepted':
        console.log('[NOTIFICATIONS] Group ride accepted notification pressed:', notification.related_id);
        try {
          // Validate that we have a related_id
          if (!notification.related_id) {
            console.error('[NOTIFICATIONS] No related_id found in notification:', notification);
            Alert.alert('Error', 'Invalid notification: Missing group ride ID');
            return;
          }

          // Fetch group ride details
          console.log('[NOTIFICATIONS] Attempting to fetch group ride details for ID:', notification.related_id);
          const groupRideDetails = await groupRideApi.getGroupRideDetails(notification.related_id);
          console.log('[NOTIFICATIONS] Successfully fetched group ride details:', groupRideDetails);
          
          // Navigate to group ride status screen
          router.push({
            pathname: '/group-ride-status',
            params: {
              groupRideData: JSON.stringify(groupRideDetails),
              source: 'notifications',
            },
          });
        } catch (error: any) {
          console.error('[NOTIFICATIONS] Error fetching group ride details:', error);
          
          // Check if it's a 404 error (group ride not found)
          if (error.message && error.message.includes('404')) {
            Alert.alert(
              'Group Ride Not Found',
              'This group ride is no longer available. It may have been cancelled or deleted.',
              [
                {
                  text: 'Mark as Read',
                  onPress: () => markAsRead(notification.id),
                },
                {
                  text: 'OK',
                  style: 'default',
                },
              ]
            );
          } else {
            Alert.alert('Error', `Failed to load group ride details: ${error.message}`);
          }
        }
        break;
      case 'group_ride_rejected':
        console.log('[NOTIFICATIONS] Group ride rejected notification pressed:', notification.related_id);
        try {
          // Validate that we have a related_id
          if (!notification.related_id) {
            console.error('[NOTIFICATIONS] No related_id found in notification:', notification);
            Alert.alert('Error', 'Invalid notification: Missing group ride ID');
            return;
          }

          // Fetch group ride details
          console.log('[NOTIFICATIONS] Attempting to fetch group ride details for ID:', notification.related_id);
          const groupRideDetails = await groupRideApi.getGroupRideDetails(notification.related_id);
          console.log('[NOTIFICATIONS] Successfully fetched group ride details:', groupRideDetails);
          
          // Navigate to group ride status screen
          router.push({
            pathname: '/group-ride-status',
            params: {
              groupRideData: JSON.stringify(groupRideDetails),
              source: 'notifications',
            },
          });
        } catch (error: any) {
          console.error('[NOTIFICATIONS] Error fetching group ride details:', error);
          
          // Check if it's a 404 error (group ride not found)
          if (error.message && error.message.includes('404')) {
            Alert.alert(
              'Group Ride Not Found',
              'This group ride is no longer available. It may have been cancelled or deleted.',
              [
                {
                  text: 'Mark as Read',
                  onPress: () => markAsRead(notification.id),
                },
                {
                  text: 'OK',
                  style: 'default',
                },
              ]
            );
          } else {
            Alert.alert('Error', `Failed to load group ride details: ${error.message}`);
          }
        }
        break;
      default:
        console.log('[NOTIFICATIONS] Generic notification pressed:', notification.type);
    }
  };

  // Refresh notifications
  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'group_ride_invitation':
        return 'people-outline';
      case 'group_ride_accepted':
        return 'checkmark-circle-outline';
      case 'group_ride_rejected':
        return 'close-circle-outline';
      case 'group_ride_cancelled':
        return 'alert-circle-outline';
      default:
        return 'notifications-outline';
    }
  };

  // Get notification color based on type
  const getNotificationColor = (type: string, isRead: boolean) => {
    if (isRead) return theme.colors.textSecondary;
    
    switch (type) {
      case 'group_ride_invitation':
        return theme.colors.primary;
      case 'group_ride_accepted':
        return '#34C759';
      case 'group_ride_rejected':
        return '#FF3B30';
      case 'group_ride_cancelled':
        return '#FF9500';
      default:
        return theme.colors.primary;
    }
  };

  // Format notification time
  const formatNotificationTime = (createdAt: string) => {
    const date = new Date(createdAt);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.is_read && styles.unreadNotification
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View style={[
          styles.notificationIconContainer,
          !item.is_read && styles.unreadIconContainer
        ]}>
          <Ionicons
            name={getNotificationIcon(item.type)}
            size={24}
            color={getNotificationColor(item.type, item.is_read)}
          />
        </View>
        
        <View style={styles.notificationTextContainer}>
          <Text style={[
            styles.notificationMessage,
            !item.is_read && styles.unreadText
          ]}>
            {item.message}
          </Text>
          <View style={styles.notificationMeta}>
            <Text style={styles.notificationTime}>
              {formatNotificationTime(item.created_at)}
            </Text>
            {item.is_read && (
              <Text style={styles.readIndicator}>Read</Text>
            )}
          </View>
          {/* Debug info - remove in production */}
          {__DEV__ && (
            <Text style={styles.debugText}>
              Type: {item.type} | Related ID: {item.related_id || 'None'}
            </Text>
          )}
        </View>

        {!item.is_read && (
          <View style={styles.unreadIndicator} />
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/home')}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity
            style={[styles.filterButton, showAll && styles.filterButtonActive]}
            onPress={() => setShowAll(!showAll)}
          >
            <Ionicons 
              name={showAll ? "list-outline" : "mail-unread-outline"} 
              size={16} 
              color="white" 
              style={{ marginRight: 4 }}
            />
            <Text style={styles.filterButtonText}>
              {showAll ? 'All' : 'Unread'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/home')}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity
            style={[styles.filterButton, showAll && styles.filterButtonActive]}
            onPress={() => setShowAll(!showAll)}
          >
            <Ionicons 
              name={showAll ? "list-outline" : "mail-unread-outline"} 
              size={16} 
              color="white" 
              style={{ marginRight: 4 }}
            />
            <Text style={styles.filterButtonText}>
              {showAll ? 'All' : 'Unread'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNotifications}>
            <Text style={styles.retryButtonText}>Retry</Text>
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
          style={styles.backButton}
          onPress={() => router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          style={[styles.filterButton, showAll && styles.filterButtonActive]}
          onPress={() => setShowAll(!showAll)}
        >
          <Ionicons 
            name={showAll ? "list-outline" : "mail-unread-outline"} 
            size={16} 
            color="white" 
            style={{ marginRight: 4 }}
          />
          <Text style={styles.filterButtonText}>
            {showAll ? 'All' : 'Unread'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Status */}
      <View style={styles.filterStatus}>
        <Text style={styles.filterStatusText}>
          {showAll ? 'All Notifications' : 'Unread Notifications'} ({notifications.length})
        </Text>
        {!showAll && notifications.length > 0 && (
          <Text style={styles.filterHint}>
            Tap "All" to see read notifications
          </Text>
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.notificationsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>
              {showAll ? 'No notifications' : 'No unread notifications'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {showAll 
                ? 'You have no notifications yet'
                : 'You\'re all caught up! Switch to "All" to see read notifications.'
              }
            </Text>
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
  backButton: {
    padding: theme.spacing.sm,
  },
  headerTitle: {
    ...theme.typography.h3,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placeholder: {
    width: 40,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary,
    opacity: 1,
  },
  filterButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  filterStatus: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterStatusText: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  filterHint: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
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
  notificationsList: {
    paddingVertical: theme.spacing.sm,
  },
  notificationItem: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  unreadNotification: {
    backgroundColor: theme.colors.primary + '05',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  notificationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  unreadIconContainer: {
    backgroundColor: theme.colors.primary + '15',
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationMessage: {
    ...theme.typography.body,
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 22,
  },
  unreadText: {
    fontWeight: '600',
  },
  notificationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  notificationTime: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  readIndicator: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  debugText: {
    ...theme.typography.body,
    fontSize: 10,
    color: '#666',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
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
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default NotificationsScreen;
