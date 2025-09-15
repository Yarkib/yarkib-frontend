import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { groupRideApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { AuthContextType } from '../types/auth';

interface User {
  id: string;
  username: string;
  name?: string;
  email?: string;
  avatar?: string;
  invitationStatus?: 'pending' | 'invited' | 'accepted' | 'rejected';
}

interface GroupRideModalProps {
  visible: boolean;
  onClose: () => void;
  routeId: string;
  routeName: string;
}

const GroupRideModal: React.FC<GroupRideModalProps> = ({
  visible,
  onClose,
  routeId,
  routeName,
}) => {
  const { user } = useAuth() as AuthContextType;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sendingInvitations, setSendingInvitations] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createdGroupRideId, setCreatedGroupRideId] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
      setInvitedUsers([]);
      setSearchError(null);
      setCreatedGroupRideId(null);
    }
  }, [visible]);

  // Search for users based on username query
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    if (!user?.id) {
      setSearchError('Please log in to search for users');
      return;
    }

    try {
      setSearchLoading(true);
      setSearchError(null);

      // Search users using the API helper
      console.log(`[GROUP RIDE] Searching for users with username: "${query}"`);
      
      const data = await groupRideApi.searchUsers(query.trim());
      console.log('[GROUP RIDE] Search response:', data);
      
      // Handle the response format from the backend
      let users: User[] = [];
      if (data.users && Array.isArray(data.users)) {
        users = data.users.map((userData: any) => ({
          id: userData.id,
          username: userData.username,
          name: userData.full_name || userData.name,
          email: userData.email,
          avatar: userData.avatar_url,
        }));
      }

      // Filter out current user, already selected users, and already invited users
      const filteredUsers = users.filter(
        (userData: User) => 
          userData.id !== user?.id && 
          !selectedUsers.find(selected => selected.id === userData.id) &&
          !invitedUsers.find(invited => invited.id === userData.id)
      );

      setSearchResults(filteredUsers);
      console.log(`[GROUP RIDE] Found ${filteredUsers.length} users matching "${query}"`);
      
    } catch (error) {
      console.error('[GROUP RIDE] Error searching users:', error);
      setSearchError('Failed to search users. Please try again.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [user?.id, selectedUsers, invitedUsers]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchUsers]);

  // Add user to selected list
  const selectUser = (userToAdd: User) => {
    setSelectedUsers(prev => [...prev, userToAdd]);
    setSearchResults(prev => prev.filter(user => user.id !== userToAdd.id));
    setSearchQuery('');
  };

  // Remove user from selected list
  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(user => user.id !== userId));
  };

  // Send group ride invitations
  const sendInvitations = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('No Users Selected', 'Please select at least one user to invite.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'Please log in to send invitations.');
      return;
    }

    try {
      setSendingInvitations(true);

      // Step 1: Create group ride
      console.log('[GROUP RIDE] Creating group ride...');
      const groupRideData = await groupRideApi.createGroupRide(routeId, user.id);
      console.log('[GROUP RIDE] Group ride creation response:', groupRideData);
      
      // Extract group ride ID from response - handle different response formats
      let groupRideId: string | null = null;
      
      if (groupRideData) {
        // Try different possible locations for the ID
        groupRideId = groupRideData.id || 
                     groupRideData.data?.id || 
                     groupRideData.group_ride?.id || 
                     groupRideData.group_ride_id;
      }
      
      if (!groupRideId) {
        console.error('[GROUP RIDE] No group ride ID found in response:', groupRideData);
        throw new Error('Failed to create group ride: No ID returned from server');
      }
      
      console.log('[GROUP RIDE] Group ride created successfully with ID:', groupRideId);
      
      // Store the group ride ID for potential future use
      setCreatedGroupRideId(groupRideId);

      // Step 2: Send invitations to each selected user
      const invitationPromises = selectedUsers.map(async (selectedUser) => {
        try {
          console.log(`[GROUP RIDE] Inviting ${selectedUser.username} to group ride ${groupRideId}`);
          await groupRideApi.inviteUser(groupRideId, user.id, selectedUser.username);
          console.log(`[GROUP RIDE] Successfully invited ${selectedUser.username}`);
          
          // Mark user as invited
          const invitedUser = { ...selectedUser, invitationStatus: 'invited' as const };
          setInvitedUsers(prev => [...prev, invitedUser]);
          
          return { success: true, user: selectedUser };
        } catch (error: any) {
          console.error(`[GROUP RIDE] Error inviting ${selectedUser.username}:`, error);
          return { success: false, user: selectedUser, error: error.message };
        }
      });

      const results = await Promise.all(invitationPromises);
      const successfulInvites = results.filter(r => r.success);
      const failedInvites = results.filter(r => !r.success);

      console.log('[GROUP RIDE] Invitation results:', { successful: successfulInvites.length, failed: failedInvites.length });

      // Show results to user
      if (successfulInvites.length > 0) {
        const message = failedInvites.length > 0 
          ? `Sent ${successfulInvites.length} invitation${successfulInvites.length > 1 ? 's' : ''} successfully. ${failedInvites.length} failed.`
          : `Successfully sent ${successfulInvites.length} invitation${successfulInvites.length > 1 ? 's' : ''} for the group ride!`;
        
        // Clear selected users after successful invitations
        setSelectedUsers([]);
        
        Alert.alert(
          'Group Ride Created!',
          `${message}\n\nGroup Ride ID: ${groupRideId}`,
          [
            {
              text: 'OK',
              onPress: () => {
                onClose();
              }
            }
          ]
        );
      } else {
        // Group ride was created but no invitations were sent successfully
        Alert.alert(
          'Group Ride Created',
          `Group ride was created successfully (ID: ${groupRideId}), but failed to send invitations. You can invite users later.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('[GROUP RIDE] Error in invitation process:', error);
      Alert.alert(
        'Error',
        `Failed to create group ride: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setSendingInvitations(false);
    }
  };

  const renderSearchResult = ({ item }: { item: User }) => {
    const isInvited = invitedUsers.find(invited => invited.id === item.id);
    
    return (
      <TouchableOpacity
        style={[
          styles.searchResultItem,
          isInvited && styles.searchResultItemInvited
        ]}
        onPress={() => !isInvited && selectUser(item)}
        activeOpacity={isInvited ? 1 : 0.7}
        disabled={!!isInvited}
      >
        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <Ionicons name="person-circle-outline" size={40} color={theme.colors.textSecondary} />
            )}
          </View>
          <View style={styles.userDetails}>
            <Text style={[styles.username, isInvited && styles.usernameInvited]}>{item.username}</Text>
            {item.name && <Text style={[styles.userName, isInvited && styles.userNameInvited]}>{item.name}</Text>}
          </View>
        </View>
        {isInvited ? (
          <View style={styles.invitedBadge}>
            <Ionicons name="checkmark-circle" size={24} color="#34C759" />
            <Text style={styles.invitedText}>Invited</Text>
          </View>
        ) : (
          <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  const renderSelectedUser = ({ item }: { item: User }) => (
    <View style={styles.selectedUserItem}>
      <View style={styles.selectedUserInfo}>
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle-outline" size={32} color={theme.colors.textSecondary} />
          )}
        </View>
        <Text style={styles.selectedUsername}>{item.username}</Text>
      </View>
      <TouchableOpacity
        onPress={() => removeUser(item.id)}
        style={styles.removeButton}
        activeOpacity={0.7}
      >
        <Ionicons name="close-circle" size={24} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  const renderInvitedUser = ({ item }: { item: User }) => (
    <View style={styles.invitedUserItem}>
      <View style={styles.invitedUserInfo}>
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle-outline" size={32} color={theme.colors.textSecondary} />
          )}
        </View>
        <Text style={styles.invitedUsername}>{item.username}</Text>
      </View>
      <View style={styles.invitedStatusBadge}>
        <Ionicons name="checkmark-circle" size={20} color="#34C759" />
        <Text style={styles.invitedStatusText}>Invited</Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Group Ride</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Route Info */}
          <View style={styles.routeInfo}>
            <Ionicons name="map-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.routeName}>{routeName}</Text>
          </View>

          {/* Group Ride ID (when created) */}
          {createdGroupRideId && (
            <View style={styles.groupRideIdContainer}>
              <Ionicons name="checkmark-circle" size={16} color="#34C759" />
              <Text style={styles.groupRideIdLabel}>Group Ride Created:</Text>
              <Text style={styles.groupRideIdText}>{createdGroupRideId}</Text>
            </View>
          )}

          {/* Search Section */}
          <View style={styles.searchSection}>
            <Text style={styles.sectionTitle}>Search Users</Text>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username or name..."
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchLoading && (
                <ActivityIndicator size="small" color={theme.colors.primary} style={styles.searchLoader} />
              )}
            </View>
            
            {/* Search Hint */}
            <Text style={styles.searchHint}>
              Search for users by their username or full name to invite them
            </Text>

            {/* Search Error */}
            {searchError && (
              <View style={styles.errorContainer}>
                <Ionicons name="warning-outline" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{searchError}</Text>
              </View>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                <Text style={styles.resultsTitle}>Found {searchResults.length} user{searchResults.length !== 1 ? 's' : ''}</Text>
                <FlatList
                  data={searchResults}
                  renderItem={renderSearchResult}
                  keyExtractor={(item) => item.id}
                  style={styles.searchResultsList}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
          </View>

          {/* Selected Users */}
          {selectedUsers.length > 0 && (
            <View style={styles.selectedSection}>
              <Text style={styles.sectionTitle}>
                Selected Users ({selectedUsers.length})
              </Text>
              <FlatList
                data={selectedUsers}
                renderItem={renderSelectedUser}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.selectedUsersList}
              />
            </View>
          )}

          {/* Invited Users */}
          {invitedUsers.length > 0 && (
            <View style={styles.invitedSection}>
              <Text style={styles.sectionTitle}>
                Invited Users ({invitedUsers.length})
              </Text>
              <FlatList
                data={invitedUsers}
                renderItem={renderInvitedUser}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.invitedUsersList}
              />
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.button,
                styles.sendButton,
                selectedUsers.length === 0 && styles.sendButtonDisabled
              ]}
              onPress={sendInvitations}
              disabled={selectedUsers.length === 0 || sendingInvitations}
              activeOpacity={0.7}
            >
              {sendingInvitations ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#FFFFFF" style={styles.sendIcon} />
                  <Text style={styles.sendButtonText}>
                    Send Invitations ({selectedUsers.length})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
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
  closeButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    ...theme.typography.h3,
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
  },
  routeName: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  searchSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  sectionTitle: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    fontSize: 16,
    color: theme.colors.text,
  },
  searchLoader: {
    marginLeft: theme.spacing.sm,
  },
  searchHint: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    fontStyle: 'italic',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  errorText: {
    ...theme.typography.body,
    fontSize: 14,
    color: '#EF4444',
  },
  searchResults: {
    marginTop: theme.spacing.md,
  },
  resultsTitle: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  searchResultsList: {
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchResultItemInvited: {
    backgroundColor: '#34C759' + '10',
    borderColor: '#34C759' + '30',
    opacity: 0.8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: theme.spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userDetails: {
    flex: 1,
  },
  username: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  userName: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  usernameInvited: {
    color: theme.colors.textSecondary,
  },
  userNameInvited: {
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  invitedText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  selectedSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  selectedUsersList: {
    marginTop: theme.spacing.sm,
  },
  selectedUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  selectedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  selectedUsername: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  removeButton: {
    padding: theme.spacing.xs,
  },
  invitedSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  invitedUsersList: {
    marginTop: theme.spacing.sm,
  },
  invitedUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759' + '15',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#34C759' + '30',
  },
  invitedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  invitedUsername: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '500',
    color: '#34C759',
  },
  invitedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  invitedStatusText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  groupRideIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759' + '15',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
  },
  groupRideIdLabel: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
    marginLeft: theme.spacing.xs,
  },
  groupRideIdText: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginLeft: theme.spacing.xs,
    fontFamily: 'monospace',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    flex: 2,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.textSecondary,
    opacity: 0.6,
  },
  sendIcon: {
    marginRight: theme.spacing.xs,
  },
  sendButtonText: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default GroupRideModal;
