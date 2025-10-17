import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Linking, FlatList, Dimensions, Alert, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../src/theme';
import { fetchRouteDetails, fetchRouteElevation, fetchRouteCoordinates, userRoutesApi } from '../src/utils/api';
import ElevationChart from '../src/components/ElevationChart';
import RouteActionButtons from '../src/components/RouteActionButtons';
import WaypointsSection from '../src/components/WaypointsSection';
import MapRouteCard from '../src/components/MapRouteCard';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';

const RouteDetails = () => {
  console.log(`[FRONTEND] RouteDetails: Component mounted`);
  
  const { routeData, routeId } = useLocalSearchParams<{ routeData?: string; routeId?: string }>();
  const initialRoute = useMemo(() => (routeData ? JSON.parse(routeData) : null), [routeData]);
  
  // ✨ KEY FIX: Make route data mutable with state
  const [route, setRoute] = useState(initialRoute);
  const [loadingRoute, setLoadingRoute] = useState(!initialRoute); // Only load if no initial data
  const [routeError, setRouteError] = useState<string | null>(null);
  const [elevationData, setElevationData] = useState<any | null>(null);
  const [loadingElevation, setLoadingElevation] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { user, session } = useAuth() as AuthContextType;
  
  console.log(`[FRONTEND] RouteDetails:`, route?.id, route?.name, '| Points:', route?.route_points?.length || 0);

  // ✨ Simple handler to update route data when buttons change
  const handleRouteUpdate = (updates: { is_saved?: boolean; is_completed?: boolean }) => {
    setRoute((prev: any) => prev ? { ...prev, ...updates } : null);
  };

  // ✨ Fetch route details from backend if not provided
  useEffect(() => {
    const fetchRouteData = async () => {
      // If we have initial route data, don't fetch from backend
      if (initialRoute) {
        console.log('[ROUTE DETAILS] Using provided route data, skipping backend fetch');
        return;
      }

      // If we have routeId, fetch from backend
      if (routeId) {
        try {
          setLoadingRoute(true);
          setRouteError(null);
          console.log('[ROUTE DETAILS] Fetching route details from backend for route:', routeId);
          
          const routeData = await fetchRouteDetails(routeId);
          console.log('[ROUTE DETAILS] Received route data from backend:', routeData);
          
          setRoute(routeData);
        } catch (error) {
          console.error('[ROUTE DETAILS] Error fetching route details:', error);
          setRouteError(error instanceof Error ? error.message : 'Failed to load route details');
        } finally {
          setLoadingRoute(false);
        }
      } else {
        console.error('[ROUTE DETAILS] No route data or routeId provided');
        setRouteError('No route information provided');
        setLoadingRoute(false);
      }
    };

    fetchRouteData();
  }, [routeId, initialRoute]);

  // ✨ Optionally fetch route coordinates if not already present
  useEffect(() => {
    const fetchCoordinates = async () => {
      if (!route?.id) return;
      
      // Skip if route already has coordinates
      if (route.route_points && route.route_points.length > 0) {
        console.log('[COORDINATES] Route already has coordinates, skipping fetch');
        return;
      }
      
      try {
        console.log('[COORDINATES] Fetching coordinates for route:', route.id);
        const coordinatesData = await fetchRouteCoordinates(route.id);
        
        // Update route with coordinates
        setRoute((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            route_points: coordinatesData.coordinates,
            start_location: coordinatesData.start_location,
            end_location: coordinatesData.end_location,
          };
        });
        
        console.log('[COORDINATES] Successfully added coordinates to route');
      } catch (error: any) {
        console.log('[COORDINATES] Coordinates endpoint not available, using fallback transformation');
        console.log('[COORDINATES] Error:', error.message);
        // This is fine - the transformation logic will handle it
      }
    };

    fetchCoordinates();
  }, [route?.id, route?.route_points]);

  // ✨ Fetch route status from database when component mounts
  useEffect(() => {
    const fetchRouteStatus = async () => {
      if (!route?.id || !user?.id || !session?.access_token) {
        console.log('[ROUTE STATUS] Missing required data for status fetch:', {
          hasRoute: !!route?.id,
          hasUser: !!user?.id,
          hasToken: !!session?.access_token,
        });
        return;
      }

      try {
        setLoadingStatus(true);
        console.log('[ROUTE STATUS] Fetching route status from database...', {
          routeId: route.id,
          userId: user.id,
        });

        const statusData = await userRoutesApi.getRouteStatus(
          route.id,
          user.id,
          session.access_token
        );

        console.log('[ROUTE STATUS] Received status from database:', statusData);

        // Update route with fresh status from database
        setRoute((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            is_saved: statusData.is_saved,
            is_completed: statusData.is_completed,
            saved_at: statusData.saved_at,
            completed_at: statusData.completed_at,
          };
        });

      } catch (error) {
        console.error('[ROUTE STATUS] Error fetching route status:', error);
        // Don't show error to user, just log it
        // The buttons will use the initial state from route data
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchRouteStatus();
  }, [route?.id, user?.id, session?.access_token]);

  // Fetch elevation profile
  useEffect(() => {
    const load = async () => {
      if (!route?.id) return;
      try {
        setLoadingElevation(true);
        console.log('[ELEVATION] Fetching elevation for route:', route.id);
        const data = await fetchRouteElevation(route.id);
        setElevationData(data);
        console.log('[ELEVATION] State updated successfully');
      } catch (error) {
        // Log the actual error to help debug
        console.error('[ELEVATION] Error fetching elevation data:', error);
        console.log('[ELEVATION] Data not available for this route');
      } finally {
        setLoadingElevation(false);
      }
    };
    load();
  }, [route?.id]);


  const formatDuration = (minutes?: number) => {
    if (!minutes && minutes !== 0) return '—';
    const h = Math.floor((minutes || 0) / 60);
    const m = (minutes || 0) % 60;
    return `${h > 0 ? `${h}h ` : ''}${m}m`;
  };

  const handleOpenLink = async (url: string) => {
    try {
      console.log('[LINK] Attempting to open URL:', url);
      console.log('[LINK] Platform:', Platform.OS);
      
      // On web, just open the URL directly in a new tab
      if (Platform.OS === 'web') {
        console.log('[LINK] Web platform - opening in new tab');
        window.open(url, '_blank');
        console.log('[LINK] Successfully opened URL in new tab');
        return;
      }
      
      // On Android, try to open with Linking directly without checking canOpenURL
      // canOpenURL can return false even when the app is installed due to Android 11+ restrictions
      if (Platform.OS === 'android') {
        console.log('[LINK] Android platform - attempting to open with Linking.openURL');
        try {
          await Linking.openURL(url);
          console.log('[LINK] Successfully opened URL on Android');
          return;
        } catch (androidError) {
          console.error('[LINK] Android Linking.openURL failed:', androidError);
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
      console.log('[LINK] Can open URL:', ok);
      if (ok) {
        await Linking.openURL(url);
        console.log('[LINK] Successfully opened URL');
      } else {
        console.warn('[LINK] Cannot open URL - not supported');
        Alert.alert('Error', 'Unable to open Google Maps. Please ensure you have Google Maps installed.');
      }
    } catch (error) {
      console.error('[LINK] Error opening URL:', error);
      Alert.alert('Error', `Failed to open link: ${error}`);
    }
  };

  const handleStartRide = async () => {
    try {
      console.log('[START RIDE] Button clicked');
      console.log('[START RIDE] Route data:', {
        id: route?.id,
        name: route?.name,
        hasRoutePoints: route?.route_points?.length > 0,
        hasWaypoints: route?.waypoints?.length > 0,
        hasStartLocation: !!route?.start_location,
        hasEndLocation: !!route?.end_location,
      });

      // Prepare route coordinates for navigation
      let coordinates: [number, number][] = [];
      
      if (route.route_points && route.route_points.length > 0) {
        // Use route_points if available (already in [lon, lat] format for Mapbox)
        coordinates = route.route_points.map((point: any) => {
          if (Array.isArray(point)) {
            return point;
          } else if (point.longitude !== undefined && point.latitude !== undefined) {
            return [point.longitude, point.latitude];
          }
          return [0, 0];
        });
      } else if (route.waypoints && route.waypoints.length > 0) {
        // Use waypoints if available
        coordinates = route.waypoints.map((wp: any) => [wp.longitude, wp.latitude]);
      } else if (route.start_location && route.end_location) {
        // Fallback to start and end locations
        coordinates = [
          [route.start_location.longitude, route.start_location.latitude],
          [route.end_location.longitude, route.end_location.latitude],
        ];
      }

      if (coordinates.length === 0) {
        Alert.alert(
          'Route Data Missing',
          'This route does not have coordinate data for navigation. Please select a different route.'
        );
        return;
      }

      // Navigate to navigation page with route data
      console.log('[START RIDE] Navigating to navigation page with', coordinates.length, 'coordinates');
      router.push({
        pathname: '/navigation',
        params: {
          routeData: JSON.stringify({
            id: route.id,
            name: route.name,
            coordinates: coordinates,
            waypoints: route.waypoints || [],
            distance: route.distance,
            duration: route.duration,
          }),
        },
      });
    } catch (error) {
      console.error('[START RIDE] Error:', error);
      Alert.alert('Error', 'Failed to start navigation. Please try again.');
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentImageIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return '#10B981';
      case 'moderate': return '#F59E0B';
      case 'hard': return '#EF4444';
      default: return '#6B7280';
    }
  };

  // Show loading state while fetching route data
  if (loadingRoute) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading route details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error state if route fetch failed
  if (routeError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{routeError}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => {
              setRouteError(null);
              setLoadingRoute(true);
              // Retry logic will be handled by the useEffect
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!route) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Image Gallery */}
        <View style={styles.heroContainer}>
          {route.images && route.images.length > 0 ? (
            <>
              <FlatList
                data={route.images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                keyExtractor={(item, index) => `image-${index}`}
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} style={styles.heroImage} />
                )}
              />
              {/* Pagination Dots */}
              {route.images.length > 1 && (
                <View style={styles.paginationContainer}>
                  {route.images.map((_: any, index: number) => (
                    <View
                      key={`dot-${index}`}
                      style={[
                        styles.paginationDot,
                        index === currentImageIndex && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.noImageContainer}>
              <Ionicons name="image-outline" size={48} color="#CCC" />
              <Text style={styles.noImageText}>No images available</Text>
            </View>
          )}
        </View>

        {/* Main Content Card */}
        <View style={styles.mainCard}>
          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.routeTitle}>{route.name}</Text>
            <Text style={styles.routeDescription}>{route.description}</Text>
          </View>

          {/* Quick Stats Card */}
          <View style={styles.statsCard}>
          <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="map-outline" size={20} color="#000" />
              </View>
              <Text style={styles.statValue}>{route.distance ?? '—'} km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="time-outline" size={20} color="#000" />
              </View>
            <Text style={styles.statValue}>{formatDuration(route.duration)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          
            {route.difficulty && (
              <>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
                  <View style={[styles.statIconContainer, { backgroundColor: getDifficultyColor(route.difficulty) + '15' }]}>
                    <Ionicons name="fitness-outline" size={20} color={getDifficultyColor(route.difficulty)} />
          </View>
                  <Text style={[styles.statValue, { color: getDifficultyColor(route.difficulty) }]}>{route.difficulty}</Text>
                  <Text style={styles.statLabel}>Difficulty</Text>
        </View>
              </>
            )}
          </View>

          {/* Route Action Buttons - Only show if user is authenticated */}
          {user && session?.access_token && (
            <View style={styles.actionButtonsContainer}>
              {loadingStatus ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>Loading route status...</Text>
                </View>
              ) : (
                <RouteActionButtons
                  routeId={route.id}
                  routeName={route.name}
                  userId={user.id}
                  accessToken={session.access_token}
                  initialSaved={route.is_saved}
                  initialCompleted={route.is_completed}
                  style="full"
                  onRouteUpdate={handleRouteUpdate}
                  onSaveChange={(saved) => {
                    console.log(`Route ${route.id} save status changed:`, saved);
                  }}
                  onCompleteChange={(completed) => {
                    console.log(`Route ${route.id} complete status changed:`, completed);
                  }}
                />
              )}
            </View>
          )}

          {/* Route Map Card - Interactive Mapbox visualization */}
          <MapRouteCard key={route.id} route={route} />

          {/* Elevation Profile Card - Only show if data is available or loading */}
          {(() => {
            const hasElevationData = (elevationData?.elevation_profile?.length > 0) || (route.elevation_profile?.length > 0);
            
            if (!loadingElevation && !hasElevationData) {
              return null;
            }
            
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="trending-up-outline" size={22} color="#000" />
                  <Text style={styles.cardTitle}>Elevation Profile</Text>
                </View>
                <View style={styles.cardContent}>
                  {loadingElevation ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#000" />
                      <Text style={styles.loadingText}>Loading elevation data...</Text>
                    </View>
                  ) : hasElevationData ? (
                    <ElevationChart 
                      data={elevationData?.elevation_profile || route.elevation_profile} 
                      maxElevation={elevationData?.max_elevation || route.max_elevation}
                      gpxFileUrl={route.gpx_file_url}
                    />
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="bar-chart-outline" size={32} color="#D1D5DB" />
                      <Text style={styles.emptyText}>No elevation data available</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}

          {/* Waypoints Section */}
          <WaypointsSection
            routeId={route.id}
            onTimeUpdate={(updatedWaypoints) => {
              console.log('Waypoints updated:', updatedWaypoints);
            }}
          />
          
          {/* External Links Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="link-outline" size={22} color="#000" />
              <Text style={styles.cardTitle}>External Links</Text>
            </View>
            <View style={styles.cardContent}>
              {route.gpx_file_url || route.google_maps_url ? (
        <View style={styles.linksContainer}>
          {route.gpx_file_url && (
            <TouchableOpacity
              style={styles.linkButton}
                      onPress={() => handleOpenLink(route.gpx_file_url)}
                    >
                      <View style={styles.linkIconContainer}>
                        <Ionicons name="download-outline" size={20} color="#000" />
                      </View>
                      <View style={styles.linkTextContainer}>
                        <Text style={styles.linkTitle}>Download GPX</Text>
                        <Text style={styles.linkSubtitle}>Get GPS coordinates</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          
          {route.google_maps_url && (
            <TouchableOpacity
              style={styles.linkButton}
                      onPress={() => handleOpenLink(route.google_maps_url)}
                    >
                      <View style={styles.linkIconContainer}>
                        <Ionicons name="map-outline" size={20} color="#000" />
                      </View>
                      <View style={styles.linkTextContainer}>
                        <Text style={styles.linkTitle}>Google Maps</Text>
                        <Text style={styles.linkSubtitle}>Open in Maps app</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="link-outline" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No external links available</Text>
                </View>
              )}
            </View>
        </View>

          {/* Tags Card */}
          {Array.isArray(route.tags) && route.tags.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="pricetags-outline" size={22} color="#000" />
                <Text style={styles.cardTitle}>Tags</Text>
              </View>
              <View style={styles.cardContent}>
          <View style={styles.tagsContainer}>
                  {route.tags.map((tag: string, index: number) => (
                    <View key={`${tag}-${index}`} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
            </View>
          </View>
        )}
        </View>
      </ScrollView>

      {/* Start Ride Button - Fixed at bottom */}
      <View style={styles.startRideContainer}>
        <TouchableOpacity 
          style={styles.startRideButton} 
          onPress={handleStartRide}
          activeOpacity={0.8}
        >
          <View style={styles.startRideContent}>
            <Ionicons name="navigate" size={24} color="#FFFFFF" />
            <Text style={styles.startRideText}>Start Ride</Text>
          </View>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingBottom: 100,
  },
  
  // Hero Section
  heroContainer: {
    height: 280,
    position: 'relative',
  },
  heroImage: {
    width: Dimensions.get('window').width,
    height: 280,
    backgroundColor: '#F3F4F6',
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#FFFFFF',
    width: 24,
  },
  noImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  noImageText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },

  // Main Content
  mainCard: {
    backgroundColor: '#FFFFFF',
    marginTop: -20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 20,
    flex: 1,
  },
  
  // Title Section
  titleSection: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  routeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  routeDescription: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },

  // Stats Card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },

  // Card Styles
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  cardContent: {
    padding: 20,
  },

  // Loading & Error States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },

  // Links
  linksContainer: {
    gap: 12,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  linkIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  linkSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },

  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },

  // Action Buttons
  actionButtonsContainer: {
    marginVertical: theme.spacing.md,
    paddingHorizontal: 20,
  },

  // Start Ride Button
  startRideContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34, // Extra padding for safe area
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  startRideButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startRideContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  startRideText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

});

export default RouteDetails;
