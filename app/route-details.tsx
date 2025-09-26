import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../src/theme';
import { fetchRouteElevation, userRoutesApi } from '../src/utils/api';
import RouteElevationChart from '../src/components/RouteElevationChart';
import RouteActionButtons from '../src/components/RouteActionButtons';
import WaypointsSection from '../src/components/WaypointsSection';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';

const RouteDetails = () => {
  console.log(`[FRONTEND] RouteDetails: Component mounted`);
  
  const { routeData } = useLocalSearchParams<{ routeData: string }>();
  const initialRoute = useMemo(() => (routeData ? JSON.parse(routeData) : null), [routeData]);
  
  // ✨ KEY FIX: Make route data mutable with state
  const [route, setRoute] = useState(initialRoute);
  const [elevationData, setElevationData] = useState<any | null>(null);
  const [loadingElevation, setLoadingElevation] = useState(false);
  const [elevationError, setElevationError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const { user, session } = useAuth() as AuthContextType;
  
  console.log(`[FRONTEND] RouteDetails: Route data:`, route);

  // ✨ Simple handler to update route data when buttons change
  const handleRouteUpdate = (updates: { is_saved?: boolean; is_completed?: boolean }) => {
    setRoute((prev: any) => prev ? { ...prev, ...updates } : null);
  };

  



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
        setElevationError(null);
        const data = await fetchRouteElevation(route.id);
        setElevationData(data);
      } catch (error) {
        console.error('Failed to load elevation data:', error);
        setElevationError('Failed to load elevation data');
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
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
    } catch {}
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return '#10B981';
      case 'moderate': return '#F59E0B';
      case 'hard': return '#EF4444';
      default: return '#6B7280';
    }
  };

  if (!route) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Image with Overlay Header */}
        <View style={styles.heroContainer}>
          {route.images?.[0] && (
            <Image source={{ uri: route.images[0] }} style={styles.heroImage} />
          )}
          <View style={styles.heroOverlay}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#000" />
                </TouchableOpacity>
            <TouchableOpacity style={styles.shareButton}>
              <Ionicons name="share-outline" size={22} color="#000" />
        </TouchableOpacity>
          </View>
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

          {/* Elevation Profile Card */}
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
              ) : elevationError ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="warning-outline" size={20} color="#EF4444" />
                  <Text style={styles.errorText}>{elevationError}</Text>
                </View>
              ) : (elevationData?.elevation_profile || route.elevation_profile) ? (
                <RouteElevationChart 
                  data={elevationData?.elevation_profile || route.elevation_profile} 
                  maxElevation={elevationData?.max_elevation || route.max_elevation}
                />
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="bar-chart-outline" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No elevation data available</Text>
                </View>
              )}
            </View>
          </View>

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
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
  },
  heroOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
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

});

export default RouteDetails;
