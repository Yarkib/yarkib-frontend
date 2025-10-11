import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import MapboxGL from '@rnmapbox/maps';
import { Route } from '../types/route';
import { calculateRouteBounds, formatRouteForMapbox } from '../utils/routeUtils';
import { useAuth } from '../context/AuthContext';
import { AuthContextType } from '../types/auth';

interface MapRouteCardProps {
  route: Route;
}

const COLLAPSED_HEIGHT = 250;
const EXPANDED_HEIGHT = 500;

const MapRouteCard: React.FC<MapRouteCardProps> = ({ route }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const { session } = useAuth() as AuthContextType;
  const heightValue = useSharedValue(COLLAPSED_HEIGHT);

  // Fetch Mapbox token from backend
  useEffect(() => {
    const fetchToken = async () => {
      // For now, using a placeholder - backend will provide this
      // In production, this should fetch from: GET /api/mapbox/token
      try {
        setIsLoadingToken(true);
        // TODO: Uncomment when backend endpoint is ready
        // const token = await fetchMapboxToken(session?.access_token || '');
        // setMapboxToken(token);
        
        // Temporary: Set a placeholder that will need to be replaced
        console.log('[MapRouteCard] Mapbox token should be fetched from backend');
        setMapboxToken('pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ');
        setIsLoadingToken(false);
      } catch (error) {
        console.error('[MapRouteCard] Error fetching Mapbox token:', error);
        setIsLoadingToken(false);
      }
    };

    fetchToken();
  }, [session]);

  // Initialize Mapbox with token
  useEffect(() => {
    if (mapboxToken) {
      MapboxGL.setAccessToken(mapboxToken);
    }
  }, [mapboxToken]);

  // Animated style for height
  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: withSpring(heightValue.value, {
        damping: 15,
        stiffness: 150,
      }),
    };
  });

  const toggleExpand = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    heightValue.value = newExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  };

  const handleModifyRoute = () => {
    router.push({
      pathname: '/modify-route',
      params: { routeId: route.id, routeData: JSON.stringify(route) },
    });
  };

  // Debug: Log the route data to see what we're receiving
  console.log('[MapRouteCard] Rendering:', route.id, route.name, '| Points:', route.route_points?.length || 0);

  // Try to get route points from different possible sources
  let routePoints = route.route_points;
  
  // If no route_points, try to extract from route_geometry (GeoJSON format)
  if (!routePoints || routePoints.length === 0) {
    if (route.route_geometry?.coordinates && Array.isArray(route.route_geometry.coordinates)) {
      console.log('[MapRouteCard] Converting route_geometry to route_points');
      routePoints = route.route_geometry.coordinates.map((coord: number[]) => ({
        latitude: coord[1],
        longitude: coord[0],
      }));
    }
  }

  // If still no route points, create a simple route from start/end locations
  if (!routePoints || routePoints.length === 0) {
    if (route.start_location && route.end_location) {
      console.log('[MapRouteCard] Creating route from start/end locations');
      routePoints = [
        { latitude: route.start_location.latitude, longitude: route.start_location.longitude },
        { latitude: route.end_location.latitude, longitude: route.end_location.longitude },
      ];
    }
  }

  console.log('[MapRouteCard] Final points:', routePoints?.length || 0);

  // Calculate bounds for the route
  const bounds = routePoints ? calculateRouteBounds(routePoints) : null;
  const routeGeoJSON = routePoints ? formatRouteForMapbox({ ...route, route_points: routePoints }) : null;

  if (isLoadingToken) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="map-outline" size={22} color="#000" />
          <Text style={styles.cardTitle}>Route Map</Text>
        </View>
        <View style={[styles.loadingContainer, { height: COLLAPSED_HEIGHT }]}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </View>
    );
  }

  if (!routePoints || routePoints.length < 2) {
    console.warn('[MapRouteCard] No coordinates for:', route.id, route.name);
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="map-outline" size={22} color="#000" />
          <Text style={styles.cardTitle}>Route Map</Text>
        </View>
        <View style={[styles.emptyContainer, { height: COLLAPSED_HEIGHT }]}>
          <Ionicons name="map-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>No route data available</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
            This route doesn&apos;t have GPS coordinates yet
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="map-outline" size={22} color="#000" />
        <Text style={styles.cardTitle}>Route Map</Text>
        <TouchableOpacity 
          style={styles.modifyButton}
          onPress={handleModifyRoute}
        >
          <Ionicons name="create-outline" size={18} color="#FFFFFF" />
          <Text style={styles.modifyButtonText}>Modify</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.expandButton}
          onPress={toggleExpand}
        >
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#6B7280" 
          />
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.mapContainer, animatedStyle]}>
        <TouchableOpacity 
          style={styles.mapTouchable}
          onPress={toggleExpand}
          activeOpacity={0.9}
        >
          <MapboxGL.MapView
            style={styles.map}
            styleURL={MapboxGL.StyleURL.Light}
            compassEnabled={false}
            scaleBarEnabled={false}
            logoEnabled={false}
            attributionEnabled={false}
          >
            <MapboxGL.Camera
              bounds={bounds ? {
                ne: [bounds.maxLng, bounds.maxLat],
                sw: [bounds.minLng, bounds.minLat],
                paddingTop: 40,
                paddingBottom: 40,
                paddingLeft: 40,
                paddingRight: 40,
              } : undefined}
              animationMode="none"
              animationDuration={0}
            />

            {/* Route Line */}
            {routeGeoJSON && (
              <MapboxGL.ShapeSource id="routeSource" shape={routeGeoJSON}>
                <MapboxGL.LineLayer
                  id="routeLine"
                  style={{
                    lineColor: '#3B82F6',
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </MapboxGL.ShapeSource>
            )}

            {/* Start Marker */}
            {routePoints && routePoints.length > 0 && (
              <MapboxGL.PointAnnotation
                id="startMarker"
                coordinate={[routePoints[0].longitude, routePoints[0].latitude]}
              >
                <View style={styles.startMarker}>
                  <Ionicons name="play-circle" size={12} color="#10B981" />
                </View>
              </MapboxGL.PointAnnotation>
            )}

            {/* End Marker */}
            {routePoints && routePoints.length > 1 && (
              <MapboxGL.PointAnnotation
                id="endMarker"
                coordinate={[routePoints[routePoints.length - 1].longitude, routePoints[routePoints.length - 1].latitude]}
              >
                <View style={styles.endMarker}>
                  <Ionicons name="flag" size={12} color="#EF4444" />
                </View>
              </MapboxGL.PointAnnotation>
            )}
          </MapboxGL.MapView>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    flex: 1,
  },
  expandButton: {
    padding: 4,
  },
  mapContainer: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  mapTouchable: {
    width: '100%',
    height: '100%',
  },
  map: {
    flex: 1,
  },
  modifyButton: {
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  modifyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9CA3AF',
  },
  startMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  endMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MapRouteCard;

