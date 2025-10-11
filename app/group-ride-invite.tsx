import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';
import { getBaseUrl } from '../src/utils/api';

interface User {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  email?: string;
}

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
}

const GroupRideInviteScreen = () => {
  const { groupRideId, groupRideData } = useLocalSearchParams<{ 
    groupRideId: string;
    groupRideData: string;
  }>();
  const { user } = useAuth() as AuthContextType;
  
  const [groupRide, setGroupRide] = useState<GroupRide | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<'username' | 'email'>('username');

  useEffect(() => {
    if (groupRideData) {
      try {
        const parsedData = JSON.parse(groupRideData);
        setGroupRide(parsedData);
        console.log('[GROUP RIDE INVITE] Loaded group ride:', parsedData);
      } catch (error) {
        console.error('[GROUP RIDE INVITE] Error parsing group ride data:', error);
      }
    }
  }, [groupRideData]);

  const searchUsers = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      let response;
      
      if (searchType === 'email') {
        // Search by email using the new email search endpoint
        response = await fetch(`${getBaseUrl()}/users/search/email?email=${encodeURIComponent(query)}&page=1&limit=20`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } else {
        // Search by username/name using the existing endpoint
        response = await fetch(`${getBaseUrl()}/users/search?q=${encodeURIComponent(query)}&page=1&limit=20`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      if (response.ok) {
        const data = await response.json();
        let users: User[] = [];
        
        if (Array.isArray(data)) {
          users = data;
        } else if (data.users && Array.isArray(data.users)) {
          users = data.users;
        } else if (data.data && Array.isArray(data.data)) {
          users = data.data;
        }

        // Filter out the current user and group ride creator
        const filteredUsers = users.filter(u => 
          u.id !== user?.id && u.id !== groupRide?.created_by
        );
        
        setSearchResults(filteredUsers);
        console.log(`[GROUP RIDE INVITE] ${searchType} search results:`, filteredUsers);
      } else {
        console.error(`[GROUP RIDE INVITE] ${searchType} search failed:`, response.status);
      }
    } catch (error) {
      console.error(`[GROUP RIDE INVITE] Error searching users by ${searchType}:`, error);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    searchUsers(text);
  };

  const inviteUser = async (userId: string, username: string) => {
    if (!groupRideId || !user?.id) {
      Alert.alert('Error', 'Unable to send invitation');
      return;
    }

    setInviting(userId);
    try {
      console.log('[GROUP RIDE INVITE] Inviting user:', username, 'to group ride:', groupRideId);

      const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_id: user.id,
          receiver_username: username,
        }),
      });

      if (response.ok) {
        Alert.alert(
          'Invitation Sent',
          `Successfully invited ${username} to the group ride!`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Remove user from search results
                setSearchResults(prev => prev.filter(u => u.id !== userId));
                setSearchQuery('');
              },
            },
          ]
        );
      } else {
        const errorText = await response.text();
        console.error('[GROUP RIDE INVITE] Invite failed:', response.status, errorText);
        Alert.alert('Error', `Failed to send invitation: ${errorText}`);
      }
    } catch (error: any) {
      console.error('[GROUP RIDE INVITE] Error inviting user:', error);
      Alert.alert('Error', `Failed to send invitation: ${error.message}`);
    } finally {
      setInviting(null);
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
        ) : (
          <View style={styles.userAvatarPlaceholder}>
            <Ionicons name="person" size={20} color={theme.colors.primary} />
          </View>
        )}
        <View style={styles.userDetails}>
          <Text style={styles.userName}>
            {item.full_name || item.username}
          </Text>
          {searchType === 'email' && item.email ? (
            <Text style={styles.userEmail}>{item.email}</Text>
          ) : (
            <Text style={styles.userUsername}>@{item.username}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.inviteButton, inviting === item.id && styles.inviteButtonDisabled]}
        onPress={() => inviteUser(item.id, item.username)}
        disabled={inviting === item.id}
      >
        {inviting === item.id ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text style={styles.inviteButtonText}>Invite</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

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
        <Text style={styles.headerTitle}>Invite Riders</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Group Ride Info */}
        {groupRide && (
          <View style={styles.rideInfoCard}>
            <Text style={styles.rideInfoTitle}>Inviting to:</Text>
            <Text style={styles.rideName}>{groupRide.routes?.name || 'Unknown Route'}</Text>
            <Text style={styles.rideDetails}>
              {groupRide.routes?.distance || 0} km • {groupRide.routes?.duration || 0} min • {groupRide.routes?.difficulty || 'Easy'}
            </Text>
          </View>
        )}

        {/* Search Section */}
        <View style={styles.searchCard}>
          <Text style={styles.searchTitle}>Search for riders to invite</Text>
          
          {/* Search Type Toggle */}
          <View style={styles.searchTypeToggle}>
            <TouchableOpacity
              style={[
                styles.searchTypeButton,
                searchType === 'username' && styles.searchTypeButtonActive
              ]}
              onPress={() => {
                setSearchType('username');
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              <Ionicons 
                name="person" 
                size={16} 
                color={searchType === 'username' ? '#FFFFFF' : theme.colors.textSecondary} 
              />
              <Text style={[
                styles.searchTypeButtonText,
                searchType === 'username' && styles.searchTypeButtonTextActive
              ]}>
                Username
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.searchTypeButton,
                searchType === 'email' && styles.searchTypeButtonActive
              ]}
              onPress={() => {
                setSearchType('email');
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              <Ionicons 
                name="mail" 
                size={16} 
                color={searchType === 'email' ? '#FFFFFF' : theme.colors.textSecondary} 
              />
              <Text style={[
                styles.searchTypeButtonText,
                searchType === 'email' && styles.searchTypeButtonTextActive
              ]}>
                Email
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={searchType === 'email' ? 'Search by email address...' : 'Search by username or name...'}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType={searchType === 'email' ? 'email-address' : 'default'}
              autoCapitalize={searchType === 'email' ? 'none' : 'words'}
            />
            {searching && (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            )}
          </View>
        </View>

        {/* Search Results */}
        {searchQuery.length >= 2 && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>
              {searching ? 'Searching...' : `Found ${searchResults.length} users`}
            </Text>
            {searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                renderItem={renderUser}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : !searching && (
              <View style={styles.noResults}>
                <Ionicons name="person-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={styles.noResultsText}>No users found</Text>
                <Text style={styles.noResultsSubtext}>
                  Try searching with a different username or name
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Ionicons name="information-circle-outline" size={24} color={theme.colors.primary} />
          <View style={styles.instructionsText}>
            <Text style={styles.instructionsTitle}>How to invite riders</Text>
            <Text style={styles.instructionsBody}>
              Search for users by their username, full name, or email address. Toggle between search types 
              using the buttons above. Once you find someone you want to invite, tap the &quot;Invite&quot; button 
              to send them a group ride invitation.
            </Text>
          </View>
        </View>
      </ScrollView>
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
  rideInfoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  rideInfoTitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  rideName: {
    ...theme.typography.h3,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  rideDetails: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  searchCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  searchTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  searchTypeToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.sm,
    padding: 4,
    marginBottom: theme.spacing.md,
  },
  searchTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
  },
  searchTypeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  searchTypeButtonText: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  searchTypeButtonTextActive: {
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  resultsCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  resultsTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing.md,
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  userUsername: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  userEmail: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  inviteButtonDisabled: {
    opacity: 0.6,
  },
  inviteButtonText: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: theme.spacing.xs,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  noResultsText: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  noResultsSubtext: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  instructionsCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  instructionsText: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  instructionsTitle: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  instructionsBody: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});

export default GroupRideInviteScreen;


