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
  Platform,
  Image,
  FlatList,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';
import { getBaseUrl, fetchRouteDetails } from '../src/utils/api';

interface GroupRideParticipant {
  id: string;
  user_id: string;
  role: 'leader' | 'participant';
  status?: 'pending' | 'accepted' | 'rejected';
  invitation_status?: 'pending' | 'accepted' | 'rejected';
  joined_at?: string;
  profiles: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
  };
}

interface GroupRide {
  id: string;
  route_id: string;
  created_by: string;
  status: string;
  created_at: string;
  route?: {
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
    start_latitude?: number;
    start_longitude?: number;
    end_latitude?: number;
    end_longitude?: number;
    waypoints?: any[];
    google_maps_url?: string;
    images: string[];
  };
  routes?: {
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
    start_latitude?: number;
    start_longitude?: number;
    end_latitude?: number;
    end_longitude?: number;
    waypoints?: any[];
    google_maps_url?: string;
    images: string[];
  };
  profiles: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
  };
  creator?: {
    id: string;
    full_name?: string;
    name?: string;
    username?: string;
    avatar_url?: string;
    avatar?: string;
  };
  participants?: GroupRideParticipant[];
  members?: GroupRideParticipant[];
}

const GroupRideStatusScreen = () => {
  const { groupRideData, groupRideId, source } = useLocalSearchParams<{ 
    groupRideData: string; 
    groupRideId: string; 
    source?: string;
  }>();
  const { user } = useAuth() as AuthContextType;
  
  const [groupRide, setGroupRide] = useState<GroupRide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Smart back navigation based on source
  const handleBackNavigation = () => {
    console.log('[GROUP RIDE STATUS] Back navigation - source:', source);
    
    if (source === 'group-rides') {
      console.log('[GROUP RIDE STATUS] Navigating back to group rides');
      router.replace('/group-rides');
    } else if (source === 'notifications') {
      console.log('[GROUP RIDE STATUS] Navigating back to notifications');
      router.replace('/notifications');
    } else {
      // Default fallback - try to go back in history, then fallback to home
      console.log('[GROUP RIDE STATUS] No source specified, using default navigation');
      try {
        router.back();
      } catch {
        console.log('[GROUP RIDE STATUS] router.back() failed, falling back to home');
        router.replace('/home');
      }
    }
  };

  useEffect(() => {
    const loadGroupRide = async () => {
      try {
        setLoading(true);
        setError(null);

        if (groupRideData) {
          // Use passed data if available
          try {
            const parsedData = JSON.parse(groupRideData);
            
            // Normalize the data structure to ensure consistent format
            const normalizedData = {
              ...parsedData,
              route: parsedData.route || parsedData.routes || {},
              creator: parsedData.creator || parsedData.profiles || {},
              members: parsedData.members || parsedData.participants || [],
            };

            // Ensure route has all required fields
            let routeData = normalizedData.route;
            
            // If route data is missing or incomplete, try to fetch it
            if ((!routeData.name || !routeData.description) && parsedData.route_id) {
              try {
                console.log('[GROUP RIDE STATUS] Fetching missing route details for route_id:', parsedData.route_id);
                const routeDetails = await fetchRouteDetails(parsedData.route_id);
                routeData = routeDetails;
                console.log('[GROUP RIDE STATUS] Fetched route details:', routeDetails);
              } catch (error) {
                console.error('[GROUP RIDE STATUS] Failed to fetch route details:', error);
                // Continue with existing route data
              }
            }
            
            normalizedData.route = {
              id: routeData.id || parsedData.route_id,
              name: routeData.name || 'Unknown Route',
              description: routeData.description || '',
              distance: Number(routeData.distance) || 0,
              duration: Number(routeData.duration) || 0,
              difficulty: routeData.difficulty || 'easy',
              elevation_gain: Number(routeData.elevation_gain) || 0,
              images: Array.isArray(routeData.images) ? routeData.images : [],
              tags: Array.isArray(routeData.tags) ? routeData.tags : [],
              rating: Number(routeData.rating) || 0,
              start_location: routeData.start_location,
              end_location: routeData.end_location,
              start_point_name: routeData.start_point_name,
              end_point_name: routeData.end_point_name,
              waypoints: routeData.waypoints || [],
              google_maps_url: routeData.google_maps_url,
            };

            // Ensure creator has all required fields
            normalizedData.creator = {
              id: normalizedData.creator.id || parsedData.created_by,
              full_name: normalizedData.creator.full_name || normalizedData.creator.name,
              username: normalizedData.creator.username,
              avatar_url: normalizedData.creator.avatar_url || normalizedData.creator.avatar,
            };

        // Normalize members/participants with proper status determination
        console.log('[GROUP RIDE STATUS] Initial load - Normalizing members with status determination...');
        normalizedData.members = normalizedData.members.map((member: any) => {
          // Determine status using the same logic as getParticipantStats
          let status = 'pending'; // Default
          
          // Priority 1: Check for explicit status field
          if (member.status) {
            const rawStatus = member.status.toLowerCase();
            if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
              status = 'accepted';
            } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
              status = 'rejected';
            } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
              status = 'pending';
            }
          }
          // Priority 2: Check for invitation_status field
          else if (member.invitation_status) {
            const rawStatus = member.invitation_status.toLowerCase();
            if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
              status = 'accepted';
            } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
              status = 'rejected';
            } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
              status = 'pending';
            }
          }
          // Priority 3: Use joined_at timestamp as indicator of acceptance
          else if (member.joined_at) {
            status = 'accepted';
          }
          
          console.log(`[GROUP RIDE STATUS] Initial load - Member ${member.id || member.user_id} status determined: ${status} (from: ${member.status || member.invitation_status || member.joined_at || 'default'})`);
          
          return {
            id: member.id || member.user_id,
            user_id: member.user_id || member.id,
            role: member.role || 'participant',
            joined_at: member.joined_at,
            status: status, // Use determined status
            invitation_status: member.invitation_status,
            profiles: member.profiles || member.user || {
              id: member.user_id || member.id,
              full_name: member.full_name || member.name,
              username: member.username,
              avatar_url: member.avatar_url || member.avatar,
            }
          };
        });

            setGroupRide(normalizedData);
            console.log('[GROUP RIDE STATUS] Loaded and normalized group ride from params:', normalizedData);
            console.log('[GROUP RIDE STATUS] Route data:', normalizedData.route);
            console.log('[GROUP RIDE STATUS] Route name:', normalizedData.route.name);
            console.log('[GROUP RIDE STATUS] Route description:', normalizedData.route.description);
            console.log('[GROUP RIDE STATUS] Route distance:', normalizedData.route.distance);
            console.log('[GROUP RIDE STATUS] Route duration:', normalizedData.route.duration);
            console.log('[GROUP RIDE STATUS] Route difficulty:', normalizedData.route.difficulty);
            console.log('[GROUP RIDE STATUS] Creator data:', normalizedData.creator);
            console.log('[GROUP RIDE STATUS] Members data:', normalizedData.members);
        } catch (parseError) {
          console.error('[GROUP RIDE STATUS] Error parsing group ride data:', parseError);
          throw new Error('Invalid group ride data');
        }
        } else if (groupRideId) {
          // Fetch from API if only ID is provided
          console.log('[GROUP RIDE STATUS] Fetching group ride details for ID:', groupRideId);
          const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch group ride: ${response.status}`);
          }

          const fetchedData = await response.json();
          
          // 🔍 COMPREHENSIVE DEBUG LOGGING
          console.log('🔍 [DEBUG] Full API Response:', JSON.stringify(fetchedData, null, 2));
          console.log('🔍 [DEBUG] Available fields:', Object.keys(fetchedData));
          console.log('🔍 [DEBUG] Members field exists:', 'members' in fetchedData);
          console.log('🔍 [DEBUG] Participants field exists:', 'participants' in fetchedData);
          console.log('🔍 [DEBUG] Route field exists:', 'route' in fetchedData);
          console.log('🔍 [DEBUG] Routes field exists:', 'routes' in fetchedData);
          console.log('🔍 [DEBUG] Creator field exists:', 'creator' in fetchedData);
          console.log('🔍 [DEBUG] Profiles field exists:', 'profiles' in fetchedData);
          
          if (fetchedData.members && fetchedData.members.length > 0) {
            console.log('🔍 [DEBUG] First member structure:', JSON.stringify(fetchedData.members[0], null, 2));
            console.log('🔍 [DEBUG] Member fields:', Object.keys(fetchedData.members[0]));
          }
          
          if (fetchedData.participants && fetchedData.participants.length > 0) {
            console.log('🔍 [DEBUG] First participant structure:', JSON.stringify(fetchedData.participants[0], null, 2));
            console.log('🔍 [DEBUG] Participant fields:', Object.keys(fetchedData.participants[0]));
          }
          
          // Normalize the fetched data as well
          const normalizedData = {
            ...fetchedData,
            route: fetchedData.route || fetchedData.routes || {},
            creator: fetchedData.creator || fetchedData.profiles || {},
            members: fetchedData.members || fetchedData.participants || [],
          };

          setGroupRide(normalizedData);
          console.log('[GROUP RIDE STATUS] Loaded and normalized group ride from API:', normalizedData);
        } else {
          throw new Error('No group ride data or ID provided');
        }
        } catch (loadError) {
          console.error('[GROUP RIDE STATUS] Error loading group ride:', loadError);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load group ride');
        } finally {
          setLoading(false);
        }
      };

      loadGroupRide();
    }, [groupRideData, groupRideId]);

  const refreshGroupRide = async () => {
    if (!groupRide?.id) return;
    try {
      console.log('[GROUP RIDE STATUS] Refreshing group ride:', groupRide.id);
      const response = await fetch(`${getBaseUrl()}/group-rides/${groupRide.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const updatedData = await response.json();
        
        // Normalize the refreshed data using the same logic as initial load
        const normalizedData = {
          ...updatedData,
          route: updatedData.route || updatedData.routes || {},
          creator: updatedData.creator || updatedData.profiles || {},
          members: updatedData.members || updatedData.participants || [],
        };

        // Ensure route has all required fields
        let routeData = normalizedData.route;
        
        // If route data is missing or incomplete, try to fetch it
        if ((!routeData.name || !routeData.description) && updatedData.route_id) {
          try {
            console.log('[GROUP RIDE STATUS] Refreshing - Fetching missing route details for route_id:', updatedData.route_id);
            const routeDetails = await fetchRouteDetails(updatedData.route_id);
            routeData = routeDetails;
            console.log('[GROUP RIDE STATUS] Refreshing - Fetched route details:', routeDetails);
          } catch (error) {
            console.error('[GROUP RIDE STATUS] Refreshing - Failed to fetch route details:', error);
            // Continue with existing route data
          }
        }
        
        normalizedData.route = {
          id: routeData.id || updatedData.route_id,
          name: routeData.name || 'Unknown Route',
          description: routeData.description || '',
          distance: Number(routeData.distance) || 0,
          duration: Number(routeData.duration) || 0,
          difficulty: routeData.difficulty || 'easy',
          elevation_gain: Number(routeData.elevation_gain) || 0,
          images: Array.isArray(routeData.images) ? routeData.images : [],
          tags: Array.isArray(routeData.tags) ? routeData.tags : [],
          rating: Number(routeData.rating) || 0,
          start_location: routeData.start_location,
          end_location: routeData.end_location,
          start_point_name: routeData.start_point_name,
          end_point_name: routeData.end_point_name,
          waypoints: routeData.waypoints || [],
          google_maps_url: routeData.google_maps_url,
        };

        // Ensure creator has all required fields
        normalizedData.creator = {
          id: normalizedData.creator.id || updatedData.created_by,
          full_name: normalizedData.creator.full_name || normalizedData.creator.name,
          username: normalizedData.creator.username,
          avatar_url: normalizedData.creator.avatar_url || normalizedData.creator.avatar,
        };

        // Normalize members/participants with proper status determination
        console.log('[GROUP RIDE STATUS] Refresh - Normalizing members with status determination...');
        normalizedData.members = normalizedData.members.map((member: any) => {
          // Determine status using the same logic as getParticipantStats
          let status = 'pending'; // Default
          
          // Priority 1: Check for explicit status field
          if (member.status) {
            const rawStatus = member.status.toLowerCase();
            if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
              status = 'accepted';
            } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
              status = 'rejected';
            } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
              status = 'pending';
            }
          }
          // Priority 2: Check for invitation_status field
          else if (member.invitation_status) {
            const rawStatus = member.invitation_status.toLowerCase();
            if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
              status = 'accepted';
            } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
              status = 'rejected';
            } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
              status = 'pending';
            }
          }
          // Priority 3: Use joined_at timestamp as indicator of acceptance
          else if (member.joined_at) {
            status = 'accepted';
          }
          
          console.log(`[GROUP RIDE STATUS] Refresh - Member ${member.id || member.user_id} status determined: ${status} (from: ${member.status || member.invitation_status || member.joined_at || 'default'})`);
          
          return {
            id: member.id || member.user_id,
            user_id: member.user_id || member.id,
            role: member.role || 'participant',
            joined_at: member.joined_at,
            status: status, // Use determined status
            invitation_status: member.invitation_status,
            profiles: member.profiles || member.user || {
              id: member.user_id || member.id,
              full_name: member.full_name || member.name,
              username: member.username,
              avatar_url: member.avatar_url || member.avatar,
            }
          };
        });

        setGroupRide(normalizedData);
        console.log('[GROUP RIDE STATUS] Refreshed and normalized group ride data:', normalizedData);
        console.log('[GROUP RIDE STATUS] Refreshed route data:', normalizedData.route);
        console.log('[GROUP RIDE STATUS] Refreshed creator data:', normalizedData.creator);
        console.log('[GROUP RIDE STATUS] Refreshed members data:', normalizedData.members);
      } else {
        const errorText = await response.text();
        console.error('[GROUP RIDE STATUS] Failed to refresh group ride:', response.status, errorText);
        setError(`Failed to refresh group ride: ${response.status}`);
      }
    } catch (refreshError) {
      console.error('[GROUP RIDE STATUS] Error refreshing group ride:', refreshError);
      setError('Failed to refresh group ride. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#34C759';
      case 'rejected':
        return '#FF3B30';
      case 'pending':
        return '#FF9500';
      default:
        return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'checkmark-circle';
      case 'rejected':
        return 'close-circle';
      case 'pending':
        return 'time';
      default:
        return 'help-circle';
    }
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getParticipantStats = () => {
    // Handle multiple possible data structures
    let participants = null;
    
    console.log('🔍 [DEBUG] getParticipantStats - groupRide:', groupRide);
    console.log('🔍 [DEBUG] getParticipantStats - groupRide.members:', groupRide?.members);
    console.log('🔍 [DEBUG] getParticipantStats - groupRide.participants:', groupRide?.participants);
    
    if (groupRide?.members) {
      participants = groupRide.members;
      console.log('[GROUP RIDE STATUS] Using members array:', participants);
    } else if (groupRide?.participants) {
      participants = groupRide.participants;
      console.log('[GROUP RIDE STATUS] Using participants array:', participants);
    } else {
      console.log('[GROUP RIDE STATUS] No participants or members found');
      return { total: 0, accepted: 0, pending: 0, rejected: 0 };
    }
    
    if (!Array.isArray(participants) || participants.length === 0) {
      console.log('[GROUP RIDE STATUS] Participants array is empty or not an array');
      return { total: 0, accepted: 0, pending: 0, rejected: 0 };
    }
    
    const stats = participants.reduce((acc, participant) => {
      acc.total++;
      
      // Improved status determination logic
      let status = 'pending'; // Default
      
      // Priority 1: Check for explicit status field
      if (participant.status) {
        const rawStatus = participant.status.toLowerCase();
        if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
        status = 'accepted';
        } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
          status = 'rejected';
        } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
          status = 'pending';
        }
      }
      // Priority 2: Check for invitation_status field
      else if (participant.invitation_status) {
        const rawStatus = participant.invitation_status.toLowerCase();
        if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
          status = 'accepted';
        } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
          status = 'rejected';
        } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
          status = 'pending';
        }
      }
      // Priority 3: Use joined_at timestamp as indicator of acceptance
      else if (participant.joined_at) {
        status = 'accepted';
        console.log('[GROUP RIDE STATUS] Has joined_at timestamp, marking as accepted:', participant.joined_at);
      }
      
      console.log('🔍 [DEBUG] Participant object:', JSON.stringify(participant, null, 2));
      console.log('🔍 [DEBUG] Participant.status:', participant.status);
      console.log('🔍 [DEBUG] Participant.invitation_status:', participant.invitation_status);
      console.log('🔍 [DEBUG] Participant.joined_at:', participant.joined_at);
      console.log('🔍 [DEBUG] Participant.role:', participant.role);
      console.log('[GROUP RIDE STATUS] Final status:', status);
      
      // Count the status
      if (status === 'accepted' || status === 'pending' || status === 'rejected') {
        acc[status]++;
      } else {
        // If status is not one of our expected values, count as pending
        console.log('[GROUP RIDE STATUS] Unknown status, counting as pending:', status);
        acc.pending++;
      }
      
      return acc;
    }, { total: 0, accepted: 0, pending: 0, rejected: 0 });
    
    console.log('[GROUP RIDE STATUS] Calculated stats:', stats);
    return stats;
  };

  const handleInviteMore = () => {
    // Navigate to invite screen or show invite modal
    router.push({
      pathname: '/group-ride-invite',
      params: {
        groupRideId: groupRide?.id,
        groupRideData: JSON.stringify(groupRide),
      },
    });
  };

  const handleCancelRide = () => {
    Alert.alert(
      'Cancel Group Ride',
      'Are you sure you want to cancel this group ride? This action cannot be undone.',
      [
        { text: 'Keep Ride', style: 'cancel' },
        {
          text: 'Cancel Ride',
          style: 'destructive',
          onPress: async () => {
            // TODO: Implement cancel ride functionality
            console.log('[GROUP RIDE STATUS] Cancel ride not implemented yet');
          },
        },
      ]
    );
  };

  const handleOpenLink = async (url: string) => {
    try {
      console.log('[GROUP RIDE STATUS] [LINK] Attempting to open URL:', url);
      console.log('[GROUP RIDE STATUS] [LINK] Platform:', Platform.OS);
      
      // On web, just open the URL directly in a new tab
      if (Platform.OS === 'web') {
        console.log('[GROUP RIDE STATUS] [LINK] Web platform - opening in new tab');
        window.open(url, '_blank');
        console.log('[GROUP RIDE STATUS] [LINK] Successfully opened URL in new tab');
        return;
      }
      
      // On Android, try to open with Linking directly without checking canOpenURL
      // canOpenURL can return false even when the app is installed due to Android 11+ restrictions
      if (Platform.OS === 'android') {
        console.log('[GROUP RIDE STATUS] [LINK] Android platform - attempting to open with Linking.openURL');
        try {
          await Linking.openURL(url);
          console.log('[GROUP RIDE STATUS] [LINK] Successfully opened URL on Android');
          return;
        } catch (androidError) {
          console.error('[GROUP RIDE STATUS] [LINK] Android Linking.openURL failed:', androidError);
          Alert.alert(
            'Unable to Open Google Maps',
            'Please ensure Google Maps is installed on your device.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      
      // On iOS, use canOpenURL check
      const ok = await Linking.canOpenURL(url);
      console.log('[GROUP RIDE STATUS] [LINK] Can open URL:', ok);
      if (ok) {
        await Linking.openURL(url);
        console.log('[GROUP RIDE STATUS] [LINK] Successfully opened URL');
      } else {
        console.warn('[GROUP RIDE STATUS] [LINK] Cannot open URL - not supported');
        Alert.alert('Error', 'Unable to open Google Maps. Please ensure you have Google Maps installed.');
      }
    } catch (error) {
      console.error('[GROUP RIDE STATUS] [LINK] Error opening URL:', error);
      Alert.alert('Error', `Failed to open link: ${error}`);
    }
  };

  const handleStartRide = async () => {
    try {
      console.log('[GROUP RIDE STATUS] Starting ride with route:', routes);

      // 1) Try latest backend route details to get authoritative google_maps_url
      let mapsUrlFromBackend: string | null = null;
      const routeId = routes?.id || groupRide?.route_id;
      if (routeId) {
        try {
          const latestRoute = await fetchRouteDetails(routeId);
          if (latestRoute?.google_maps_url) {
            mapsUrlFromBackend = latestRoute.google_maps_url;
          }
        } catch (e) {
          console.log('[GROUP RIDE STATUS] Could not fetch latest route details, will fallback:', (e as Error)?.message);
        }
      }

      // 2) Prefer backend-provided link, else use any link on the passed data, else generate
      if (mapsUrlFromBackend) {
        console.log('[GROUP RIDE STATUS] Opening backend Google Maps URL:', mapsUrlFromBackend);
        await handleOpenLink(mapsUrlFromBackend);
        return;
      }

      if (routes?.google_maps_url) {
        console.log('[GROUP RIDE STATUS] Opening Google Maps with existing URL:', routes.google_maps_url);
        await handleOpenLink(routes.google_maps_url);
        return;
      }

      // 3) Fallback: build URL identical to route-details implementation
      let mapsUrl = 'https://www.google.com/maps/dir/';

      if (routes?.waypoints && routes.waypoints.length > 0) {
        const waypointCoords = routes.waypoints
          .map((waypoint: any) => `${waypoint.latitude},${waypoint.longitude}`)
          .join('/');
        mapsUrl += waypointCoords;
      } else if (
        routes?.start_latitude &&
        routes.start_longitude &&
        routes.end_latitude &&
        routes.end_longitude
      ) {
        mapsUrl += `${routes.start_latitude},${routes.start_longitude}/${routes.end_latitude},${routes.end_longitude}`;
      } else {
        mapsUrl += encodeURIComponent(routes?.name || 'Bike ride');
      }

      mapsUrl += '/data=!3m1!4b1!4m2!4m1!3e1';

      console.log('[GROUP RIDE STATUS] Opening Google Maps with generated URL:', mapsUrl);
      await handleOpenLink(mapsUrl);
    } catch (error) {
      console.error('[GROUP RIDE STATUS] Error opening Google Maps:', error);
    }
  };

  const renderParticipant = ({ item }: { item: any }) => {
    // Handle different data structures
    const userInfo = item.profiles || item.user || {};
    const role = item.role || 'participant';
    
    // Use the same improved status determination logic as getParticipantStats
    let status = 'pending'; // Default
    
    // Priority 1: Check for explicit status field
    if (item.status) {
      const rawStatus = item.status.toLowerCase();
      if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
      status = 'accepted';
      } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
        status = 'rejected';
      } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
        status = 'pending';
      }
    }
    // Priority 2: Check for invitation_status field
    else if (item.invitation_status) {
      const rawStatus = item.invitation_status.toLowerCase();
      if (rawStatus === 'accepted' || rawStatus === 'joined' || rawStatus === 'member' || rawStatus === 'active') {
        status = 'accepted';
      } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
        status = 'rejected';
      } else if (rawStatus === 'pending' || rawStatus === 'invited' || rawStatus === 'waiting') {
        status = 'pending';
      }
    }
    // Priority 3: Use joined_at timestamp as indicator of acceptance
    else if (item.joined_at) {
      status = 'accepted';
      console.log('[GROUP RIDE STATUS] Render - Has joined_at timestamp, marking as accepted:', item.joined_at);
    }
    
    // Determine if this is the ride leader (creator)
    const isRideLeader = item.user_id === groupRide?.created_by || 
                        userInfo.id === groupRide?.created_by ||
                        role === 'leader';
    
    console.log('[GROUP RIDE STATUS] Rendering participant:', item);
    console.log('[GROUP RIDE STATUS] User info:', userInfo);
    console.log('[GROUP RIDE STATUS] Is ride leader:', isRideLeader);
    console.log('[GROUP RIDE STATUS] Status:', status);
    
    return (
      <View style={styles.participantItem}>
        <View style={styles.participantInfo}>
          {userInfo.avatar_url ? (
            <Image source={{ uri: userInfo.avatar_url }} style={styles.participantAvatar} />
          ) : (
            <View style={styles.participantAvatarPlaceholder}>
              <Ionicons name="person" size={20} color={theme.colors.primary} />
            </View>
          )}
          <View style={styles.participantDetails}>
            <Text style={styles.participantName}>
              {userInfo.full_name || userInfo.name || userInfo.username || 'Unknown User'}
            </Text>
            <Text style={styles.participantRole}>
              {isRideLeader ? 'Ride Leader' : (role === 'leader' ? 'Ride Leader' : 'Participant')}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
          <Ionicons name={getStatusIcon(status)} size={16} color="#FFFFFF" />
          <Text style={styles.statusText}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading group ride status...</Text>
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
            onPress={handleBackNavigation}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Handle different possible data structures
  const routes = groupRide.route || groupRide.routes;
  const profiles = groupRide.creator || groupRide.profiles;
  const stats = getParticipantStats();
  
  // Debug logging for data structure
  console.log('[GROUP RIDE STATUS] Routes data:', routes);
  console.log('[GROUP RIDE STATUS] Profiles/Creator data:', profiles);
  console.log('[GROUP RIDE STATUS] Group ride created_by:', groupRide.created_by);
  console.log('[GROUP RIDE STATUS] Current user ID:', user?.id);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleBackNavigation}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Status</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={refreshGroupRide}
        >
          <Ionicons name="refresh" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Route Information */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeTitle}>{routes?.name || 'Unknown Route'}</Text>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(routes?.difficulty || 'easy') }]}>
              <Text style={styles.difficultyText}>{routes?.difficulty || 'Easy'}</Text>
            </View>
          </View>

          {routes?.description && routes.description.trim() !== '' ? (
            <Text style={styles.routeDescription}>{routes.description}</Text>
          ) : (
            <Text style={styles.routeDescriptionPlaceholder}>No description available for this route</Text>
          )}

          {routes?.images && routes.images.length > 0 && (
            <Image source={{ uri: routes.images[0] }} style={styles.routeImage} />
          )}

          {/* Route Stats */}
          <View style={styles.routeStats}>
            <View style={styles.statItem}>
              <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{routes?.distance || 0} km</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{routes?.duration || 0} min</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="trending-up-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.statText}>{routes?.elevation_gain || 0} m</Text>
            </View>
          </View>
        </View>

        {/* Ride Organizer */}
        <View style={styles.organizerCard}>
          <Text style={styles.organizerTitle}>Ride Organizer</Text>
          <View style={styles.organizerInfo}>
            {(() => {
              // Try multiple possible data structures for organizer info
              const organizerInfo = profiles || groupRide.creator || {};
              const avatarUrl = organizerInfo.avatar_url || (organizerInfo as any).avatar;
              const fullName = organizerInfo.full_name || (organizerInfo as any).name || organizerInfo.username;
              const username = organizerInfo.username || (organizerInfo as any).name;
              
              console.log('[GROUP RIDE STATUS] Organizer info:', organizerInfo);
              
              return (
                <>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.organizerAvatar} />
                  ) : (
                    <View style={styles.organizerAvatarPlaceholder}>
                      <Ionicons name="person" size={24} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={styles.organizerDetails}>
                    <Text style={styles.organizerName}>
                      {fullName || 'Unknown User'}
                    </Text>
                    <Text style={styles.organizerUsername}>
                      @{username || 'unknown'}
                    </Text>
                  </View>
                </>
              );
            })()}
          </View>
        </View>

        {/* Participant Statistics */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Participation Status</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total Invited</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#34C759' }]}>{stats.accepted}</Text>
              <Text style={styles.statLabel}>Accepted</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#FF9500' }]}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#FF3B30' }]}>{stats.rejected}</Text>
              <Text style={styles.statLabel}>Declined</Text>
            </View>
          </View>
        </View>

        {/* Participants List */}
        <View style={styles.participantsCard}>
          <Text style={styles.participantsTitle}>Participants ({stats.total})</Text>
          {(() => {
            const participants = groupRide.members || groupRide.participants || [];
            console.log('[GROUP RIDE STATUS] Participants for rendering:', participants);
            
            if (participants && participants.length > 0) {
              return (
                <FlatList
                  data={participants}
                  renderItem={renderParticipant}
                  keyExtractor={(item) => item.id || item.user_id}
                  scrollEnabled={false}
                />
              );
            } else {
              return (
                <View style={styles.emptyParticipants}>
                  <Ionicons name="people-outline" size={48} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyParticipantsText}>No participants yet</Text>
                </View>
              );
            }
          })()}
        </View>

        {/* Ride Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Ride Details</Text>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>
              Created on {formatDate(groupRide?.created_at || new Date().toISOString())}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Status: {groupRide?.status || 'Unknown'}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={handleInviteMore}
        >
          <Ionicons name="person-add" size={20} color={theme.colors.primary} />
          <Text style={styles.secondaryButtonText}>Invite More</Text>
        </TouchableOpacity>

        {stats.accepted > 0 && (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleStartRide}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Start Ride</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleCancelRide}
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
          <Text style={styles.dangerButtonText}>Cancel Ride</Text>
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
  routeCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
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
  routeDescriptionPlaceholder: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
    fontStyle: 'italic',
    opacity: 0.7,
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
  organizerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  organizerTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: theme.spacing.md,
  },
  organizerAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  organizerDetails: {
    flex: 1,
  },
  organizerName: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  organizerUsername: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statsCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  statsTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    ...theme.typography.h2,
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statLabel: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  participantsCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  participantsTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing.md,
  },
  participantAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  participantDetails: {
    flex: 1,
  },
  participantName: {
    ...theme.typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  participantRole: {
    ...theme.typography.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 4,
  },
  emptyParticipants: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyParticipantsText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
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
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  primaryButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
  secondaryButtonText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
  dangerButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: theme.spacing.xs,
  },
});

export default GroupRideStatusScreen;
