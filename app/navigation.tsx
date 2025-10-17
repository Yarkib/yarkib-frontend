import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import MapboxGL from '@rnmapbox/maps';
import { theme } from '../src/theme';

interface RouteData {
  id: string;
  name: string;
  coordinates: Array<[number, number]>;
  waypoints?: Array<{ latitude: number; longitude: number; name?: string }>;
  distance: number;
  duration: number;
}

const NavigationScreen = () => {
  const { routeData } = useLocalSearchParams<{ routeData: string }>();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(true);
  
  // Mock navigation state (will be replaced with real GPS later)
  const [mockState, setMockState] = useState({
    currentSpeed: 25, // km/h
    distanceRemaining: 8.5, // km
    timeRemaining: 20, // minutes
    nextTurnDistance: 0.3, // km
    nextTurnInstruction: 'Turn right onto Main Street',
    nextTurnType: 'turn-right' as const,
    currentProgress: 0.35, // 35% complete
  });

  // Generate waypoints for progress bar (mock data for now)
  const allWaypoints = route ? [
    { name: 'Start Point', completed: true, distance: 0 },
    { name: 'Main Street', completed: true, distance: 2.1 },
    { name: 'Park Avenue', completed: false, distance: 4.5 },
    { name: 'City Bridge', completed: false, distance: 7.2 },
    { name: 'Destination', completed: false, distance: route.distance || 8.5 },
  ] : [];

  // Get only the most recent completed and next upcoming waypoint
  const completedWaypoints = allWaypoints.filter(w => w.completed);
  const upcomingWaypoints = allWaypoints.filter(w => !w.completed);
  
  const recentCompleted = completedWaypoints.length > 0 ? completedWaypoints[completedWaypoints.length - 1] : null;
  const nextUpcoming = upcomingWaypoints.length > 0 ? upcomingWaypoints[0] : null;
  
  // Calculate progress between these two waypoints
  const progressBetweenWaypoints = recentCompleted && nextUpcoming && route
    ? ((mockState.currentProgress * (route.distance || 0) - recentCompleted.distance) / 
       (nextUpcoming.distance - recentCompleted.distance)) * 100
    : 0;

  const mapRef = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // Parse route data
  useEffect(() => {
    if (routeData) {
      try {
        const parsedRoute = JSON.parse(routeData);
        setRoute(parsedRoute);
        console.log('[NAVIGATION] Route loaded:', parsedRoute);
      } catch (error) {
        console.error('[NAVIGATION] Error parsing route data:', error);
        Alert.alert('Error', 'Failed to load route data');
      }
    }
  }, [routeData]);

  // Initialize Mapbox
  useEffect(() => {
    const token = 'pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ';
    setMapboxToken(token);
    MapboxGL.setAccessToken(token);
  }, []);

  // Mock location update (will be replaced with real GPS)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isNavigating) {
        setMockState(prev => ({
          ...prev,
          distanceRemaining: Math.max(0, prev.distanceRemaining - 0.1),
          nextTurnDistance: Math.max(0, prev.nextTurnDistance - 0.05),
          timeRemaining: Math.max(0, prev.timeRemaining - 0.5),
          currentProgress: Math.min(1, prev.currentProgress + 0.02), // Increase progress
        }));
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isNavigating]);

  const handleEndNavigation = () => {
    Alert.alert(
      'End Navigation',
      'Are you sure you want to end navigation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => {
            setIsNavigating(false);
            router.back();
          },
        },
      ]
    );
  };

  const handleRecenter = () => {
    // Will recenter camera on user location
    Alert.alert('Recenter', 'Camera will recenter on your location');
  };

  const getTurnIcon = (turnType: string) => {
    const iconMap: { [key: string]: any } = {
      'turn-right': 'arrow-forward',
      'turn-left': 'arrow-back',
      'straight': 'arrow-up',
      'arrive': 'flag',
    };
    return iconMap[turnType] || 'arrow-forward';
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  if (!route || !mapboxToken) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading navigation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Convert route coordinates to GeoJSON
  const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: route.coordinates.length > 0 
        ? route.coordinates 
        : [[0, 0], [0, 0]], // Fallback coordinates
    },
  };

  // Mock user location (will be replaced with real GPS)
  const mockUserLocation: [number, number] = route.coordinates[0] || [0, 0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Mapbox Map - Full Screen */}
      <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Light}
        compassEnabled={true}
        compassViewPosition={3}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={17}
          centerCoordinate={mockUserLocation}
          pitch={50}
          animationMode="flyTo"
          animationDuration={600}
        />

        {/* Route Line - Google Maps Blue */}
        {route.coordinates.length > 0 && (
          <MapboxGL.ShapeSource id="routeSource" shape={routeGeoJSON}>
            <MapboxGL.LineLayer
              id="routeLine"
              style={{
                lineColor: '#4285F4',
                lineWidth: 7,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Destination Marker */}
        {route.coordinates.length > 1 && (
          <MapboxGL.PointAnnotation
            id="endPoint"
            coordinate={route.coordinates[route.coordinates.length - 1]}
          >
            <View style={styles.destinationMarker}>
              <View style={styles.destinationPin} />
            </View>
          </MapboxGL.PointAnnotation>
        )}

        {/* User Location */}
        <MapboxGL.PointAnnotation
          id="userLocation"
          coordinate={mockUserLocation}
        >
          <View style={styles.userLocationMarker}>
            <View style={styles.userLocationPulse} />
            <View style={styles.userLocationDot} />
          </View>
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      {/* Google Maps Style - Top Turn Card */}
      <SafeAreaView style={styles.topContainer}>
        <View style={styles.topCard}>
          {/* Large Turn Icon */}
          <View style={styles.turnIconLarge}>
            <Ionicons 
              name={getTurnIcon(mockState.nextTurnType)} 
              size={64} 
              color="#000000" 
            />
          </View>
          
          {/* Turn Information */}
          <View style={styles.turnInfo}>
            <Text style={styles.distanceLarge}>
              {(mockState.nextTurnDistance * 1000).toFixed(0)} m
            </Text>
            <Text style={styles.streetName} numberOfLines={1}>
              {mockState.nextTurnInstruction}
            </Text>
            
            {/* ETA and Distance Row */}
            <View style={styles.etaRow}>
              <Text style={styles.etaText}>
                {formatTime(mockState.timeRemaining)}
              </Text>
              <View style={styles.dot} />
              <Text style={styles.etaText}>
                {mockState.distanceRemaining.toFixed(1)} km
              </Text>
            </View>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleEndNavigation}
            activeOpacity={0.6}
          >
            <Ionicons name="close" size={24} color="#5f6368" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Redesigned Progress Card - Left Side */}
      {recentCompleted && nextUpcoming && (
        <View style={styles.progressCard}>
          {/* Recent Completed Waypoint */}
          <View style={styles.waypointSection}>
            <View style={styles.waypointIconContainer}>
              <Ionicons name="checkmark-circle" size={20} color="#34A853" />
            </View>
            <View style={styles.waypointTextContainer}>
              <Text style={styles.waypointStatus}>Passed</Text>
              <Text style={styles.waypointName} numberOfLines={1}>
                {recentCompleted.name}
              </Text>
            </View>
          </View>

          {/* Progress Line */}
          <View style={styles.progressLineContainer}>
            <View style={styles.progressLine}>
              <View 
                style={[
                  styles.progressLineActive, 
                  { height: `${Math.min(100, Math.max(0, progressBetweenWaypoints))}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressPercentage}>
              {Math.round(mockState.currentProgress * 100)}%
            </Text>
          </View>

          {/* Next Upcoming Waypoint */}
          <View style={styles.waypointSection}>
            <View style={styles.waypointIconContainer}>
              <View style={styles.upcomingDot} />
            </View>
            <View style={styles.waypointTextContainer}>
              <Text style={styles.waypointStatusNext}>Next</Text>
              <Text style={styles.waypointName} numberOfLines={1}>
                {nextUpcoming.name}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Google Maps Style - Bottom Actions */}
      <View style={styles.bottomActionsContainer}>
        {/* Speed Display */}
        <View style={styles.speedCard}>
          <Text style={styles.speedNumber}>{mockState.currentSpeed}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>

        {/* Recenter Button */}
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={24} color="#5f6368" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 16,
    color: '#5f6368',
    marginTop: 12,
  },
  
  // Google Maps Style - Top Card
  topContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  
  // Large Turn Icon (Google Style)
  turnIconLarge: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  
  // Turn Information
  turnInfo: {
    flex: 1,
  },
  distanceLarge: {
    fontSize: 36,
    fontWeight: '400',
    color: '#202124',
    letterSpacing: -1,
  },
  streetName: {
    fontSize: 16,
    fontWeight: '400',
    color: '#5f6368',
    marginTop: 2,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  etaText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5f6368',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#5f6368',
    marginHorizontal: 8,
  },
  
  // Close Button
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  // Bottom Actions (Google Style)
  bottomActionsContainer: {
    position: 'absolute',
    bottom: 40,
    right: 16,
    alignItems: 'flex-end',
    gap: 12,
  },
  
  // Speed Card
  speedCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 80,
  },
  speedNumber: {
    fontSize: 24,
    fontWeight: '500',
    color: '#202124',
    lineHeight: 28,
  },
  speedUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5f6368',
    marginTop: 2,
  },
  
  // Recenter Button
  recenterButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  // Redesigned Progress Card - Left Side (Compact)
  progressCard: {
    position: 'absolute',
    left: 12,
    top: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    width: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  
  waypointSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  waypointIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  waypointTextContainer: {
    flex: 1,
    marginLeft: 6,
  },
  
  waypointStatus: {
    fontSize: 9,
    fontWeight: '600',
    color: '#34A853',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  
  waypointStatusNext: {
    fontSize: 9,
    fontWeight: '600',
    color: '#5f6368',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  
  waypointName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#202124',
    lineHeight: 14,
  },
  
  progressLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 10,
  },
  
  progressLine: {
    width: 3,
    height: 35,
    backgroundColor: '#E8EAED',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  
  progressLineActive: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#4285F4',
    borderRadius: 2,
  },
  
  progressPercentage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4285F4',
    letterSpacing: -0.5,
  },
  
  upcomingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#5f6368',
  },

  // Destination Marker (Google Red Pin)
  destinationMarker: {
    width: 32,
    height: 48,
    alignItems: 'center',
  },
  destinationPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EA4335',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // User Location (Google Blue Dot)
  userLocationMarker: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userLocationDot: {
    width: 16,
    height: 16,
    backgroundColor: '#4285F4',
    borderRadius: 8,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    position: 'absolute',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  userLocationPulse: {
    width: 44,
    height: 44,
    backgroundColor: '#4285F4',
    opacity: 0.2,
    borderRadius: 22,
    position: 'absolute',
  },
});

export default NavigationScreen;

