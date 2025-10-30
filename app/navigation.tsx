import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import debounce from 'lodash.debounce';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getApiBaseUrl } from '../src/config/config';
import { useAuth } from '../src/context/AuthContext';
import { waypointsApi } from '../src/utils/api';
import { createDynamicRouteCoordinates, findClosestPointOnRoute } from './utils/navigationRouteHelpers';

// Helper function for array comparison
function arraysEqual(a: Array<[number,number]> | null, b: Array<[number,number]> | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

// Coordinate validation helper
function ensureLngLat(coord: [number,number]): [number,number] {
  const [a, b] = coord;
  // If first value looks like latitude (> -90 && < 90) and second also plausible,
  // assume we need to swap to get [lng,lat] format
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && Math.abs(a) < Math.abs(b)) {
    return [coord[1], coord[0]] as [number,number];
  }
  return coord;
}

// Compute bearing between two points
function computeBearing(from: [number,number], to: [number,number]): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const λ1 = toRad(lng1), λ2 = toRad(lng2);
  const y = Math.sin(λ2-λ1)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const θ = Math.atan2(y,x);
  return (toDeg(θ)+360) % 360; // 0..359
}

// Compute smoothed bearing using 3-point EMA
function smoothedBearing(samples: Array<[number,number]>): number | null {
  if (samples.length < 2) return null;
  
  // Compute bearings between consecutive pairs
  const bearings = [];
  for (let i = 1; i < samples.length; i++) {
    bearings.push(computeBearing(samples[i-1], samples[i]));
  }
  
  // Simple EMA with heavier weight to newest
  let alpha = 0.6;
  let ema = bearings[0];
  for (let i = 1; i < bearings.length; i++) {
    ema = (alpha * bearings[i]) + ((1-alpha) * ema);
  }
  return (ema + 360) % 360;
}

// Enhanced Map Matching helper with confidence
async function mapMatchTrace(pointsArray: Array<[number,number]>, token: string) {
  if (!pointsArray || pointsArray.length < 2) return null;
  try {
    const coords = pointsArray.map(p => `${p[0]},${p[1]}`).join(';');
    const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}?geometries=geojson&access_token=${token}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.matchings && j.matchings.length) {
      const best = j.matchings[0];
      const lastTrace = j.tracepoints ? j.tracepoints[j.tracepoints.length - 1] : null;
      const snapped = lastTrace && lastTrace.location ? lastTrace.location : best.geometry.coordinates[0];
      
      // Calculate confidence based on matching quality
      const confidence = lastTrace?.matching_index !== undefined ? 
        (lastTrace.matching_index >= 0 ? 0.9 : 0.3) : 0.5;
      
      return { 
        matchedCoords: snapped, 
        matchGeometry: best.geometry, 
        matchings: j.matchings,
        confidence: confidence,
        lastTracepoint: lastTrace
      };
    }
  } catch (error) {
    console.warn('[NAV] Map matching failed:', error);
  }
  return null;
}

interface RouteData {
  id: string;
  name: string;
  coordinates: Array<[number, number]>;
  waypoints?: Array<{ latitude: number; longitude: number; name?: string }>;
  distance: number;
  duration: number;
}

interface MajorPoint {
  id: string;
  name: string;
  point_type: 'gas_station' | 'restaurant' | 'coffee_shop' | 'scenic_point' | 'rest_area' | 'custom';
  lat: number;
  lon: number;
  distance_from_start: number; // km
  base_driving_time: number; // seconds
  stop_duration: number; // seconds
  status: 'upcoming' | 'approaching' | 'completed' | 'skipped';
  completedAt?: Date;
}

const NavigationScreen = () => {
  const { routeData } = useLocalSearchParams<{ routeData: string }>();
  const { user } = useAuth() as { user: any };
  const [route, setRoute] = useState<RouteData | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);
  
  // Navigation phase management
  const [navigationPhase, setNavigationPhase] = useState<'TO_START' | 'ON_ROUTE'>('TO_START');
  const [navigationToStartRoute, setNavigationToStartRoute] = useState<[number, number][] | null>(null);
  const [dynamicRouteCoordinates, setDynamicRouteCoordinates] = useState<[number, number][] | null>(null);
  const dynamicRouteCoordinatesRef = useRef<[number, number][] | null>(null);
  const navigationToStartRouteRef = useRef<[number, number][] | null>(null);
  const recentPointsRef = useRef<Array<[number, number]>>([]);
  const [navigationSteps, setNavigationSteps] = useState<any[]>([]);
  const [distanceToStart, setDistanceToStart] = useState<number>(0);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [hasAutoTransitioned, setHasAutoTransitioned] = useState(false);
  const [isLoadingNavToStart, setIsLoadingNavToStart] = useState(false);
  const [navigationToStartError, setNavigationToStartError] = useState<string | null>(null);
  const [skippedToRoute, setSkippedToRoute] = useState(false);
  const [showStartReminder, setShowStartReminder] = useState(false);
  const [hasAttemptedNavToStart, setHasAttemptedNavToStart] = useState(false);
  const [followUserLocation, setFollowUserLocation] = useState(true);
  const [lastRecalculationTime, setLastRecalculationTime] = useState<number>(0);
  const [originalRouteCoordinates, setOriginalRouteCoordinates] = useState<[number, number][] | null>(null);
  
  // Navigation thresholds
  const NAVIGATION_THRESHOLDS = {
    AT_START: 0.15,        // 150 meters - auto-skip
    NEAR_START: 0.5,       // 500 meters - show skip button
    ARRIVED_AT_START: 0.05, // 50 meters - auto-transition
    MAX_NAV_DISTANCE: 500, // 500 km - max distance for navigation to start
    DEVIATION_THRESHOLD: 0.2, // 200 meters - recalculate route if deviated
    RECALCULATION_COOLDOWN: 30000, // 30 seconds between recalculations
  };

  // Ultra-precise threshold function for maximum accuracy
  const getAdaptiveThresholds = (speedMps: number) => {
    const speedKmh = speedMps * 3.6;
    const isHighway = speedKmh > 50;
    
    return {
      // Ultra-tight thresholds for service road vs main road accuracy
      ON_ROUTE: 8,                     // Very tight 8m - distinguish service/main roads
      REROUTE: 25,                     // Very aggressive 25m rerouting
      DEBOUNCE: isHighway ? 800 : 500, // Much faster response
      COOLDOWN: isHighway ? 3000 : 2000, // Much shorter cooldown
      BEARING_TOLERANCE: 30,           // Very tight 30° for precise road following
      MAP_MATCH_POINTS: 8,             // More points for better precision
      MAP_MATCH_FREQ_MS: isHighway ? 2000 : 1000 // Much more frequent map matching
    };
  };

  // Legacy constants (will be replaced by adaptive ones)
  const REROUTE_DEBOUNCE_MS = 1500;
  const REROUTE_COOLDOWN_MS = 10000;
  const DEVIATION_THRESHOLD_METERS = 25;

  const lastRecalcRef = useRef<number>(0);
  const lastMapMatchRef = useRef<number>(0);
  const routeETARef = useRef<number | null>(null);

  // Enhanced debounced reroute function with adaptive thresholds
  const debouncedFetchNavigationToStart = useRef(
    debounce(async (currentLngLat: [number, number], originalRouteEnd: [number, number], currentSpeed: number = 0) => {
      const now = Date.now();
      const thresholds = getAdaptiveThresholds(currentSpeed);
      
      if (now - lastRecalcRef.current < thresholds.COOLDOWN) return;
      lastRecalcRef.current = now;
      
      try {
        console.log('[NAV] Debounced reroute triggered:', { currentLngLat, originalRouteEnd, speed: currentSpeed });
        
        // Enhanced reroute logic with controlled map matching
        const lastPoints = recentPointsRef.current;
        let originForRouting = ensureLngLat(currentLngLat);
        let bearing: number | null = null;
        let mapMatchConfidence = 0;
        const token = mapboxToken || 'pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ';

        // Controlled map matching based on frequency and point count
        const shouldMapMatch = (now - lastMapMatchRef.current > thresholds.MAP_MATCH_FREQ_MS) && 
                              (lastPoints.length >= thresholds.MAP_MATCH_POINTS);
        
        if (shouldMapMatch) {
          const mm = await mapMatchTrace(lastPoints, token);
          if (mm && mm.matchedCoords && mm.confidence > 0.3) { // Lower confidence threshold for more aggressive snapping
            originForRouting = mm.matchedCoords;
            mapMatchConfidence = mm.confidence;
            lastMapMatchRef.current = now;
            console.log('[NAV] Using map matched origin:', { origin: originForRouting, confidence: mapMatchConfidence });
          }
        }
        
        // Use smoothed bearing for better directional routing
        bearing = smoothedBearing(lastPoints);
        if (bearing === null && lastPoints.length >= 2) {
          // Fallback to simple bearing if smoothed fails
          bearing = computeBearing(lastPoints[lastPoints.length-2], lastPoints[lastPoints.length-1]);
        }
        
        console.log('[NAV] Reroute params:', { 
          origin: originForRouting, 
          bearing, 
          mapMatchConfidence,
          bearingTolerance: thresholds.BEARING_TOLERANCE
        });

        // Request reroute with enhanced parameters
        const routeResp = await fetchReroute(originForRouting, originalRouteEnd, bearing, thresholds.BEARING_TOLERANCE);
        
        if (routeResp?.routes?.length) {
          const newRoute = routeResp.routes[0].geometry.coordinates;
          const newETA = routeResp.routes[0].duration; // in seconds
          const currentETA = routeETARef.current;
          
          console.log('[NAV] DIRECTIONS result first coords:', newRoute.slice(0, 3));
          console.log('[NAV] Route comparison:', { newETA, currentETA, improvement: currentETA ? currentETA - newETA : 'N/A' });
          
          // Aggressive route switching for maximum accuracy
          const shouldSwitchRoute = !currentETA || // No current route
                                   (newETA < currentETA - 5) || // >5s improvement (more aggressive)
                                   (mapMatchConfidence > 0.4); // Lower confidence threshold for more switching
          
          if (shouldSwitchRoute) {
            setNavigationToStartRoute(newRoute);
            navigationToStartRouteRef.current = newRoute;
            routeETARef.current = newETA;
            setNavigationSteps(routeResp.routes[0].legs[0]?.steps || []);
            // Clear dynamic route since we have a new base route
            setDynamicRouteCoordinates(null);
            dynamicRouteCoordinatesRef.current = null;
            console.log('[NAV] Route switched - benefit confirmed');
          } else {
            console.log('[NAV] Route not switched - insufficient benefit');
          }
        } else {
          console.warn('[NAV] No routes returned from reroute API');
        }
      } catch (err) {
        console.warn('[NAV] Reroute API failed', err);
      }
    }, REROUTE_DEBOUNCE_MS)
  ).current;
  
  // Major points state
  const [majorPoints, setMajorPoints] = useState<MajorPoint[]>([]);
  const [loadingMajorPoints, setLoadingMajorPoints] = useState(false);
  
  // Navigation waypoints state
  const [navigationWaypoints, setNavigationWaypoints] = useState<any[]>([]);
  const [loadingNavigationWaypoints, setLoadingNavigationWaypoints] = useState(false);
  
  // User profile state
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Scroll snap-back state
  const [scrollTimeout, setScrollTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Proximity thresholds for major points
  const MAJOR_POINT_THRESHOLDS = {
    APPROACHING: 0.5, // 500m - show "approaching" state
    REACHED: 0.05,    // 50m - mark as completed
    PASSED: 0.1,      // 100m behind - definitely passed
  };
  
  // Real navigation state (updated with GPS)
  const [navigationState, setNavigationState] = useState<{
    currentSpeed: number;
    distanceRemaining: number;
    timeRemaining: number;
    nextTurnDistance: number;
    nextTurnInstruction: string;
    nextTurnType: 'turn-right' | 'turn-left' | 'straight' | 'arrive';
    currentProgress: number;
    userLocation: { latitude: number; longitude: number } | null;
    heading: number;
    currentStepIndex: number;
  }>({
    currentSpeed: 0,
    distanceRemaining: 0,
    timeRemaining: 0,
    nextTurnDistance: 0,
    nextTurnInstruction: 'Loading navigation...',
    nextTurnType: 'straight',
    currentProgress: 0,
    userLocation: {
      latitude: 24.93431525,
      longitude: 67.06849039,
    },
    heading: 0,
    currentStepIndex: 0,
  });

  // Mock data for demonstration
  const mockCurrentPosition = 35; // 35% through the route

  // Get major points progress (real data from database)
  const completedPoints = majorPoints.filter(p => p.status === 'completed');
  const totalPoints = majorPoints.length;
  const progressPercentage = totalPoints > 0 ? (completedPoints.length / totalPoints) * 100 : 0;
  
  // Calculate progress based on current position for the progress line
  // Since we reversed the order (destination at top, start at bottom), 
  // the progress line should show completion from bottom to current position
  const currentPositionProgress = mockCurrentPosition; // 35% from bottom
  const mockTimeToNextStop = 12; // 12 minutes to next stop
  const mockNextStopName = "Shell Gas Station";
  
  // Calculate current position percentage (using mock data for now)
  const currentPositionPercentage = totalPoints > 0 ? mockCurrentPosition : 0;

  const mapRef = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // Scroll snap-back functionality
  const handleScroll = () => {
    setIsScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Set new timeout to snap back after scrolling stops
    const timeout = setTimeout(() => {
      snapToCurrentPosition();
      setIsScrolling(false);
    }, 2000); // 2 seconds after scrolling stops
    
    setScrollTimeout(timeout);
  };


  const snapToCurrentPosition = () => {
    if (!scrollViewRef.current) return;
    
    // Find the current waypoint index (where bike icon is)
    const allWaypoints = [
      ...majorPoints.map(p => ({ ...p, isMajor: true })),
      ...navigationWaypoints.map(p => ({ ...p, isMajor: false }))
    ].sort((a, b) => b.distance_from_start - a.distance_from_start);
    
    const currentPosition = mockCurrentPosition; // 35%
    const waypointProgress = (index: number) => (index / (allWaypoints.length - 1)) * 100;
    
    // Find the waypoint that contains the current position
    let targetIndex = 0;
    for (let i = 0; i < allWaypoints.length - 1; i++) {
      const currentProgress = waypointProgress(i);
      const nextProgress = waypointProgress(i + 1);
      
      if (currentPosition >= currentProgress && currentPosition < nextProgress) {
        targetIndex = i;
        break;
      }
    }
    
    // Calculate scroll position to center on the target waypoint
    const itemHeight = 32; // More accurate height per waypoint item
    const containerHeight = 120; // Height of the scroll container
    const visibleItems = Math.floor(containerHeight / itemHeight);
    
    // Center the target waypoint in the visible area
    const centerOffset = Math.floor(visibleItems / 2);
    const scrollPosition = Math.max(0, (targetIndex - centerOffset) * itemHeight);
    
    // Smooth scroll to the target position
    scrollViewRef.current.scrollTo({
      y: scrollPosition,
      animated: true,
    });
  };

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

  // Initialize Mapbox and request location permissions
  useEffect(() => {
    const initializeMapbox = async () => {
      const token = 'pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ';
      setMapboxToken(token);
      MapboxGL.setAccessToken(token);
      
      // Request location permissions using Expo Location
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        setLocationPermission(granted);
        console.log('[NAVIGATION] Location permission:', granted, 'Status:', status);
        
        if (!granted) {
          Alert.alert(
            'Location Permission Required',
            'Please enable location permissions to use navigation features.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[NAVIGATION] Error requesting location permission:', error);
      }
    };
    
    initializeMapbox();
  }, []);

  // Location tracking using Expo Location
  useEffect(() => {
    if (!locationPermission) return;
    
    let locationSubscription: Location.LocationSubscription | null = null;
    
    const startLocationTracking = async () => {
      console.log('[NAV] Starting Expo Location tracking...');
      
      try {
        // Get initial location immediately
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        
        if (initialLocation) {
          console.log('[NAV] Initial location acquired:', initialLocation.coords);
          handleLocationUpdate(initialLocation);
        }
        
        // Start watching position for real-time updates
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000, // Update every 2 seconds
            distanceInterval: 5, // Update every 5 meters
          },
          (location) => {
            console.log('[NAV] Location update received:', location.coords);
            handleLocationUpdate(location);
          }
        );
        
        console.log('[NAV] Location subscription started');
        
        } catch (error) {
        console.error('[NAV] Error starting location tracking:', error);
        }
    };
    
    startLocationTracking();

      return () => {
      console.log('[NAV] Stopping Expo Location tracking');
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [locationPermission]);

  // Handle real-time location updates from Expo Location
  const handleLocationUpdate = async (location: Location.LocationObject) => {
    if (!location || !location.coords) return;
    
    const { coords } = location;
    console.log('[NAVIGATION] Location update:', coords);
    
    // Convert speed from m/s to km/h
    const speedKmh = (coords.speed || 0) * 3.6;
    
    // Create user location object
      const userLoc = { latitude: coords.latitude, longitude: coords.longitude };
      
    // Track recent GPS points for bearing calculation and map matching
    const userPt: [number, number] = [coords.longitude, coords.latitude];
    recentPointsRef.current.push(userPt);
    // Keep only last 8 points for map matching
    if (recentPointsRef.current.length > 8) {
      recentPointsRef.current.shift();
    }
      
    // Update navigation state with real GPS data
    setNavigationState(prev => {
      // Calculate progress if we have route coordinates
      let progress = prev.currentProgress;
      if (route && route.coordinates.length > 0) {
        // Simple progress calculation based on distance from start
        const startCoord = route.coordinates[0];
        const endCoord = route.coordinates[route.coordinates.length - 1];
        
        // Calculate distance traveled (simplified)
        const totalDistance = route.distance || 8.5;
        const distanceTraveled = calculateDistance(
          startCoord[1], startCoord[0],
          coords.latitude, coords.longitude
        );
        progress = Math.min(1, distanceTraveled / totalDistance);
      }
      
      return {
        ...prev,
        currentSpeed: Math.round(speedKmh),
        userLocation: userLoc,
        heading: coords.heading || 0,
        currentProgress: progress,
      };
    });
    
    // Check for route deviation and update dynamic route during TO_START phase
    if (navigationPhase === 'TO_START') {
      if (navigationToStartRouteRef.current && navigationToStartRouteRef.current.length > 0) {
        // ensure coords are [lng,lat]
        const userPt: [number,number] = [userLoc.longitude, userLoc.latitude];
        const closest = findClosestPointOnRoute(navigationToStartRouteRef.current, userPt);
        console.log('[NAV] Projection check', { 
          segIdx: closest.segmentIndex, 
          t: closest.t.toFixed(3), 
          distMeters: closest.distanceMeters.toFixed(1) 
        });

        // Use adaptive thresholds based on current speed
        const currentSpeed = coords.speed || 0;
        const thresholds = getAdaptiveThresholds(currentSpeed);

        if (closest.distanceMeters <= thresholds.ON_ROUTE) {
          const newDyn = createDynamicRouteCoordinates(navigationToStartRouteRef.current, userPt);
          // only update if different to avoid unnecessary rerenders
          if (!arraysEqual(dynamicRouteCoordinatesRef.current, newDyn)) {
            setDynamicRouteCoordinates(newDyn);
            dynamicRouteCoordinatesRef.current = newDyn;
            console.log('[NAV] Updated dynamic route (shortened)', { newLength: newDyn.length, speed: currentSpeed });
          }
        } else if (closest.distanceMeters > thresholds.REROUTE) {
          // Create a better bridging segment using road geometry
          console.log('[NAV] User far off-route, creating bridging segment', { 
            dist: closest.distanceMeters.toFixed(1), 
            speed: currentSpeed,
            thresholds: thresholds
          });
          try {
            await createBridgingSegmentAndDraw(userPt, closest.segmentIndex);
          } catch (err) {
            console.warn('[NAV] Bridge creation failed:', err);
          }
          debouncedFetchNavigationToStart(userPt, route?.coordinates[0] || [0, 0], currentSpeed);
        } else {
          // moderate deviation - show dynamic route but don't reroute
          const newDyn = createDynamicRouteCoordinates(navigationToStartRouteRef.current, userPt);
          if (!arraysEqual(dynamicRouteCoordinatesRef.current, newDyn)) {
            setDynamicRouteCoordinates(newDyn);
            dynamicRouteCoordinatesRef.current = newDyn;
            console.log('[NAV] Moderate deviation - visual update', { 
              newLength: newDyn.length, 
              dist: closest.distanceMeters.toFixed(1) 
            });
          }
        }
      } else {
        console.log('[NAV] No route data available for projection check');
      }
    }
  };
  
  // Simple distance calculation helper
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };


  // Create bridging segment using road geometry instead of straight lines
  const createBridgingSegmentAndDraw = async (userPt: [number, number], segmentIndex: number) => {
    try {
      if (!navigationToStartRouteRef.current) return;
      
      // Get the next route point to bridge to
      const nextIndex = Math.min(segmentIndex + 1, navigationToStartRouteRef.current.length - 1);
      const nextRoutePt = navigationToStartRouteRef.current[nextIndex];
      
      // Compute bearing if we have recent points
      let bearing: number | null = null;
      if (recentPointsRef.current.length >= 2) {
        bearing = computeBearing(recentPointsRef.current[recentPointsRef.current.length-2], userPt);
      }
      
      // Request a short route from user to next route point with ultra-tight tolerance for maximum accuracy
      const bridgeResp = await fetchReroute(userPt, nextRoutePt, bearing, 30); // Ultra-tight 30° for precise road-following
      
      if (bridgeResp?.routes?.length) {
        const bridgeCoords = bridgeResp.routes[0].geometry.coordinates;
        // Combine bridge + remaining original route
        const remainingRoute = navigationToStartRouteRef.current.slice(nextIndex + 1);
        const fullBridgedRoute = [...bridgeCoords, ...remainingRoute];
        setDynamicRouteCoordinates(fullBridgedRoute);
        dynamicRouteCoordinatesRef.current = fullBridgedRoute;
        console.log('[NAV] Created road-following bridge segment', { bridgeLength: bridgeCoords.length });
      } else {
        // Fallback to straight line with visual indicator it's temporary
        const bridgingLine: [number,number][] = [[userPt[0], userPt[1]], [nextRoutePt[0], nextRoutePt[1]]];
        setDynamicRouteCoordinates(bridgingLine);
        dynamicRouteCoordinatesRef.current = bridgingLine;
        console.log('[NAV] Using temporary straight bridge (API failed)');
      }
    } catch (error) {
      console.warn('[NAV] Bridge segment creation failed:', error);
      // Fallback to straight line
      if (navigationToStartRouteRef.current) {
        const nextIndex = Math.min(segmentIndex + 1, navigationToStartRouteRef.current.length - 1);
        const nextRoutePt = navigationToStartRouteRef.current[nextIndex];
        const bridgingLine: [number,number][] = [[userPt[0], userPt[1]], [nextRoutePt[0], nextRoutePt[1]]];
        setDynamicRouteCoordinates(bridgingLine);
        dynamicRouteCoordinatesRef.current = bridgingLine;
      }
    }
  };

  // Enhanced reroute function with bearing and tolerance
  const fetchReroute = async (origin: [number, number], destination: [number, number], bearing: number | null = null, bearingTolerance: number = 45) => {
    const token = mapboxToken || 'pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ';
    const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
    const base = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`;
    const params = new URLSearchParams({
      geometries: 'geojson',
      overview: 'full',
      steps: 'true',
      alternatives: 'false',
      continue_straight: 'false',
      access_token: token,
    });
    if (bearing != null) {
      // bearings: origin bearing with adaptive tolerance + placeholder for destination
      params.append('bearings', `${Math.round(bearing)},${bearingTolerance};`);
    }
    const url = `${base}?${params.toString()}`;
    console.log('[NAV] REROUTE REQUEST', { origin, bearing, bearingTolerance, destination, url });
    const res = await fetch(url);
    return res.json();
  };

  // Enhanced navigation route fetch with bearing constraints to prevent building routing
  const fetchNavigationToStart = async (userLocation: [number, number], startPoint: [number, number]) => {
    const token = mapboxToken || 'pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ';
    if (!token) {
      console.log('[NAV] No Mapbox token available yet');
      return;
    }

    try {
      setIsLoadingNavToStart(true);
      setNavigationToStartError(null);
      console.log('[NAV] Fetching route to start point...', { userLocation, startPoint });
      
      // Enhanced origin with map matching and bearing if available
      let enhancedOrigin = ensureLngLat(userLocation);
      let bearing: number | null = null;
      
      // Try to get smoothed bearing from recent points
      if (recentPointsRef.current.length >= 2) {
        bearing = smoothedBearing(recentPointsRef.current);
        console.log('[NAV] Using smoothed bearing for initial route:', bearing);
      }
      
      // Try map matching for better origin if we have enough points (aggressive snapping)
      if (recentPointsRef.current.length >= 4) {
        const mm = await mapMatchTrace(recentPointsRef.current, token);
        if (mm && mm.matchedCoords && mm.confidence > 0.3) { // Lower threshold for more aggressive road snapping
          enhancedOrigin = mm.matchedCoords;
          console.log('[NAV] Using map matched origin for initial route:', { origin: enhancedOrigin, confidence: mm.confidence });
        }
      }
      
      // Build URL with bearing constraints for road-following accuracy
      const coords = `${enhancedOrigin[0]},${enhancedOrigin[1]};${startPoint[0]},${startPoint[1]}`;
      const params = new URLSearchParams({
        geometries: 'geojson',
        steps: 'true',
        banner_instructions: 'true',
        voice_instructions: 'true',
        alternatives: 'false',
        continue_straight: 'false',
        access_token: token,
      });
      
      // Add ultra-tight bearing constraint for maximum precision
      if (bearing !== null) {
        params.append('bearings', `${Math.round(bearing)},30;`); // Ultra-tight 30° tolerance for precise road-following
      }
      
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?${params.toString()}`;
      
      console.log('[NAV] Enhanced Mapbox API request:', { 
        origin: enhancedOrigin, 
        destination: startPoint, 
        bearing, 
        url 
      });
      
      const response = await fetch(url);
      const data = await response.json();
      console.log('[NAV] Mapbox API response:', JSON.stringify(data, null, 2));
      
      if (data.routes && data.routes[0]) {
        const coordinates = data.routes[0].geometry.coordinates;
        const distance = data.routes[0].distance / 1000; // Convert to km
        const duration = data.routes[0].duration / 60; // Convert to minutes
        const steps = data.routes[0].legs[0]?.steps || [];
        
        console.log('[NAV] Navigation to start fetched:', { 
          pointsCount: coordinates.length, 
          distance: distance.toFixed(2) + ' km',
          duration: duration.toFixed(1) + ' min',
          stepsCount: steps.length
        });
        
        setNavigationToStartRoute(coordinates);
        navigationToStartRouteRef.current = coordinates;
        routeETARef.current = data.routes[0].duration; // Store initial ETA for comparison
        setNavigationSteps(steps);
        setDistanceToStart(distance);
        setNavigationToStartError(null);
        
        // Initial dynamic route will be created on next location update
        
        // Always show skip button - user should have option to skip even if route is found
        setShowSkipButton(true);
        
        // Update navigation state with initial values
        setNavigationState(prev => ({
          ...prev,
          distanceRemaining: distance,
          timeRemaining: duration,
          nextTurnInstruction: steps[0]?.maneuver?.instruction || 'Head towards route start point',
          nextTurnDistance: steps[0]?.distance ? steps[0].distance / 1000 : 0,
          nextTurnType: getMapboxTurnType(steps[0]?.maneuver?.type),
          currentStepIndex: 0,
        }));

        // Fit camera to show entire route briefly, then switch to follow mode
        if (cameraRef.current && coordinates.length > 0) {
          setTimeout(() => {
            cameraRef.current?.fitBounds(
              [coordinates[0][0], coordinates[0][1]],
              [coordinates[coordinates.length - 1][0], coordinates[coordinates.length - 1][1]],
              [50, 100, 50, 100],
              2000
            );
          }, 500);

          // After showing the route, camera will automatically return to follow mode (configured in Camera component)
        }
      } else {
        console.error('[NAV] No route found in Directions API response');
        setNavigationToStartError('Unable to find a route to the start point. You can skip to start the route directly.');
        setShowSkipButton(true);
      }
    } catch (error) {
      console.error('[NAV] Error fetching navigation to start:', error);
      setNavigationToStartError('Failed to load navigation. Check your connection or skip to start the route.');
      setShowSkipButton(true);
    } finally {
      setIsLoadingNavToStart(false);
    }
  };

  const handleRecenter = () => {
    // Re-enable follow mode to recenter on user location
    console.log('[NAV] Recentering camera on user location');
    setFollowUserLocation(true);
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
  
  // Helper to get icon for major point type (Ionicons)
  const getPointIcon = (pointType: string): string => {
    const iconMap: { [key: string]: string } = {
      'gas_station': 'car',
      'restaurant': 'restaurant',
      'coffee_shop': 'cafe',
      'scenic_point': 'camera',
      'rest_area': 'pause-circle',
      'custom': 'location',
    };
    return iconMap[pointType] || 'location';
  };

  // Helper to get icon for navigation waypoint type
  const getNavWaypointIcon = (pointType: string): string => {
    // For navigation waypoints, use generic navigation icons based on point type
    const iconMap: { [key: string]: string } = {
      'turn': 'arrow-forward',
      'straight': 'arrow-up',
      'merge': 'git-merge',
      'exit': 'exit',
      'roundabout': 'refresh',
      'junction': 'git-branch',
      'traffic_light': 'stop-circle',
      'stop_sign': 'stop',
      'yield': 'pause',
      'other': 'navigate',
    };
    return iconMap[pointType] || 'navigate';
  };
  
  // Helper to get color for point status
  const getPointStatusColor = (status: string): string => {
    const colorMap: { [key: string]: string } = {
      'completed': '#34A853',
      'approaching': '#FBBC04',
      'upcoming': '#5f6368',
      'skipped': '#9AA0A6',
    };
    return colorMap[status] || '#5f6368';
  };
  
  // Convert Mapbox maneuver types to our turn types
  const getMapboxTurnType = (maneuverType: string): 'turn-right' | 'turn-left' | 'straight' | 'arrive' => {
    if (!maneuverType) return 'straight';
    if (maneuverType.includes('right')) return 'turn-right';
    if (maneuverType.includes('left')) return 'turn-left';
    if (maneuverType.includes('arrive')) return 'arrive';
    return 'straight';
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };
  
  // Calculate ETA based on current speed
  useEffect(() => {
    if (navigationState.currentSpeed > 0 && isNavigating) {
      const interval = setInterval(() => {
        setNavigationState(prev => {
          const distancePerSecond = prev.currentSpeed / 3600; // km per second
          const newDistance = Math.max(0, prev.distanceRemaining - distancePerSecond * 3);
          const newTime = prev.currentSpeed > 0 
            ? (newDistance / prev.currentSpeed) * 60 
            : prev.timeRemaining;
          
          return {
            ...prev,
            distanceRemaining: newDistance,
            timeRemaining: newTime,
          };
        });
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [navigationState.currentSpeed, isNavigating]);

  // Initial location check - determine if user needs navigation to start
  useEffect(() => {
    console.log('[NAV] Initial check effect:', {
      hasUserLocation: !!navigationState.userLocation,
      hasRouteCoords: !!route?.coordinates?.[0],
      hasMapboxToken: !!mapboxToken,
      navigationPhase,
      hasAttemptedNavToStart
    });
    
    if (!navigationState.userLocation || !route?.coordinates?.[0] || !mapboxToken) {
      console.log('[NAV] Missing required data for initial check');
      return;
    }
    
    // Only run once - prevent repeated attempts
    if (navigationPhase !== 'TO_START' || hasAttemptedNavToStart) {
      console.log('[NAV] Skipping initial check - already attempted');
      return;
    }
    
    const [startLon, startLat] = route.coordinates[0];
    const distance = calculateDistance(
      navigationState.userLocation.latitude,
      navigationState.userLocation.longitude,
      startLat,
      startLon
    );
    
    console.log('[NAV] Initial distance to start:', distance.toFixed(3), 'km');
    setDistanceToStart(distance);
    setHasAttemptedNavToStart(true); // Mark as attempted
    
    // CASE 1: Already at start (auto skip to route navigation)
    if (distance <= NAVIGATION_THRESHOLDS.AT_START) {
      console.log('[NAV] User already at start point - auto-skipping to route navigation');
      Alert.alert(
        '✅ At Start Point',
        `You're already at the start of "${route.name}". Beginning route navigation!`,
        [{ text: 'OK', onPress: () => setNavigationPhase('ON_ROUTE') }]
      );
    }
    // CASE 2: Too far away (>500km) - show skip option without navigation attempt
    else if (distance > NAVIGATION_THRESHOLDS.MAX_NAV_DISTANCE) {
      console.log('[NAV] User too far from start (', distance.toFixed(0), 'km) - showing skip option only');
      setNavigationToStartError(`You're ${distance.toFixed(0)} km from the route start. Navigation to start is unavailable for extreme distances.`);
      setShowSkipButton(true);
    }
    // CASE 3: Reasonable distance - fetch navigation
    else {
      console.log('[NAV] Fetching navigation route to start (distance:', distance.toFixed(2), 'km)');
      fetchNavigationToStart(
        [navigationState.userLocation.longitude, navigationState.userLocation.latitude],
        route.coordinates[0]
      );
    }
  }, [navigationState.userLocation, route?.coordinates, mapboxToken, hasAttemptedNavToStart]);

  // Real-time turn-by-turn navigation updates during TO_START phase
  useEffect(() => {
    if (navigationPhase !== 'TO_START' || !navigationState.userLocation || navigationSteps.length === 0) {
      return;
    }
    
    const interval = setInterval(() => {
      const userLoc = navigationState.userLocation;
      if (!userLoc) return;
      
      // Find current step based on user location
      let currentStepIndex = navigationState.currentStepIndex;
      let totalDistanceTraveled = 0;
      let distanceToNextTurn = 0;
      
      for (let i = 0; i < navigationSteps.length; i++) {
        const step = navigationSteps[i];
        const stepEnd = step.maneuver?.location;
        
        if (!stepEnd) continue;
        
        const distanceToStepEnd = calculateDistance(
          userLoc.latitude,
          userLoc.longitude,
          stepEnd[1], // Mapbox uses [lon, lat]
          stepEnd[0]
        );
        
        // If we're within 50m of this step's end, move to next step
        if (distanceToStepEnd <= 0.05 && i < navigationSteps.length - 1) {
          currentStepIndex = i + 1;
        }
        
        // Calculate total distance remaining
        if (i >= currentStepIndex) {
          if (i === currentStepIndex) {
            distanceToNextTurn = distanceToStepEnd;
          }
          totalDistanceTraveled += step.distance / 1000; // Convert to km
        }
      }
      
      // Get current step
      const currentStep = navigationSteps[currentStepIndex];
      
      if (currentStep) {
        setNavigationState(prev => ({
          ...prev,
          currentStepIndex,
          nextTurnInstruction: currentStep.maneuver?.instruction || 'Continue',
          nextTurnDistance: distanceToNextTurn,
          nextTurnType: getMapboxTurnType(currentStep.maneuver?.type),
          distanceRemaining: totalDistanceTraveled,
          timeRemaining: prev.currentSpeed > 0 
            ? (totalDistanceTraveled / prev.currentSpeed) * 60 
            : prev.timeRemaining,
        }));
        
        console.log('[NAV] Turn update:', {
          step: currentStepIndex + 1,
          total: navigationSteps.length,
          instruction: currentStep.maneuver?.instruction,
          distanceToTurn: (distanceToNextTurn * 1000).toFixed(0) + 'm'
        });
      }
    }, 2000); // Update every 2 seconds
    
    return () => clearInterval(interval);
  }, [navigationPhase, navigationState.userLocation, navigationState.currentStepIndex, navigationSteps]);

  // Continuous monitoring during TO_START phase
  useEffect(() => {
    if (navigationPhase !== 'TO_START' || hasAutoTransitioned || !isNavigating) return;
    
    const interval = setInterval(() => {
      if (!navigationState.userLocation || !route?.coordinates?.[0]) return;
      
      const [startLon, startLat] = route.coordinates[0];
      const distance = calculateDistance(
        navigationState.userLocation.latitude,
        navigationState.userLocation.longitude,
        startLat,
        startLon
      );
      
      setDistanceToStart(distance);
      console.log('[NAV] Distance to start:', distance.toFixed(3), 'km');
      
      // Auto-transition when very close to start point
      if (distance <= NAVIGATION_THRESHOLDS.ARRIVED_AT_START && !hasAutoTransitioned) {
        console.log('[NAV] Arrived at start point - auto-transitioning to route navigation');
        setHasAutoTransitioned(true);
        Alert.alert(
          '🎉 Start Point Reached!',
          `You've arrived at the starting point of "${route.name}". Ready to begin?`,
          [
            {
              text: 'Start Route',
              onPress: () => setNavigationPhase('ON_ROUTE')
            }
          ]
        );
      }
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, [navigationPhase, navigationState.userLocation, hasAutoTransitioned, showSkipButton, isNavigating]);


  // Fetch all waypoints (major + navigation) when route loads
  useEffect(() => {
    const loadAllWaypoints = async () => {
      if (!route?.id) return;
      
      try {
        setLoadingMajorPoints(true);
        setLoadingNavigationWaypoints(true);
        console.log('[ALL WAYPOINTS] Fetching for route:', route.id);
        
        // Use the same API as WaypointsSection component
        const allWaypointsData = await waypointsApi.getAllWaypoints(route.id);
        
        // Transform backend data to frontend format (same as WaypointsSection)
        const transformedWaypoints = allWaypointsData.map((wp: any) => ({
          id: wp.id,
          name: wp.name,
          point_type: wp.point_type || 'other',
          distance_from_start: wp.distance_from_start || 0,
          lat: wp.lat,
          lon: wp.lon,
          is_major: ['gas_station', 'restaurant', 'coffee_shop', 'hotel', 'shop', 'unknown'].includes(wp.point_type),
          status: 'upcoming' as const, // Initialize all as upcoming
        }));
        
        // Sort waypoints by distance from start to maintain route order
        const sortedWaypoints = transformedWaypoints.sort(
          (a: any, b: any) => b.distance_from_start - a.distance_from_start
        );
        
        // Separate major waypoints from navigation waypoints
        const majorPoints = sortedWaypoints.filter((wp: any) => wp.is_major);
        const navigationPoints = sortedWaypoints.filter((wp: any) => !wp.is_major);
        
        // Update major points with some mock completed for demo
        const initializedMajorPoints = majorPoints.map((point: any, index: number) => ({
          ...point,
          status: index < 1 ? 'completed' as const : 'upcoming' as const, // Mock: first point completed
        }));
        
        // Update navigation points with some mock completed for demo
        const initializedNavPoints = navigationPoints.map((point: any, index: number) => ({
          ...point,
          status: index < 2 ? 'completed' as const : 'upcoming' as const, // Mock: first two completed
        }));
        
        setMajorPoints(initializedMajorPoints);
        setNavigationWaypoints(initializedNavPoints);
        
        console.log('[ALL WAYPOINTS] Loaded:', {
          major: initializedMajorPoints.length,
          navigation: initializedNavPoints.length,
          total: sortedWaypoints.length
        });
        
        // Auto-snap to current position after waypoints are loaded
        setTimeout(() => {
          snapToCurrentPosition();
        }, 500);
        
      } catch (error) {
        console.error('[ALL WAYPOINTS] Error loading:', error);
        setMajorPoints([]);
        setNavigationWaypoints([]);
      } finally {
        setLoadingMajorPoints(false);
        setLoadingNavigationWaypoints(false);
      }
    };
    
    loadAllWaypoints();
  }, [route?.id]);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [scrollTimeout]);

  // Fetch user profile data for avatar
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        console.log('[NAVIGATION] Fetching user profile for avatar...');
        console.log('[NAVIGATION] Current user from auth:', user);
        
        // Get the session token for authentication
        let session = null;
        try {
          const sessionData = await SecureStore.getItemAsync('supabase.auth.token');
          session = sessionData ? JSON.parse(sessionData) : null;
        } catch (error) {
          console.log('[NAVIGATION] Error getting session from storage:', error);
        }
        const token = session?.access_token;
        
        if (!token) {
          console.log('[NAVIGATION] No auth token found, using fallback');
          if (user?.avatar) {
            setUserProfile({ avatar_url: user.avatar });
          }
          return;
        }
        
        // Make authenticated request to /me endpoint
        const response = await fetch(`${getApiBaseUrl()}/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const profileData = await response.json();
        console.log('[NAVIGATION] User profile data:', profileData);
        console.log('[NAVIGATION] Avatar URL from profile:', profileData?.avatar_url);
        console.log('[NAVIGATION] Full profile object keys:', Object.keys(profileData || {}));
        setUserProfile(profileData);
      } catch (error) {
        console.error('[NAVIGATION] Error fetching user profile:', error);
        console.log('[NAVIGATION] Using fallback - user from auth context:', user?.avatar);
        // Try to use user.avatar as fallback
        if (user?.avatar) {
          setUserProfile({ avatar_url: user.avatar });
        }
      }
    };

    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id]);


  // Auto-dismiss start reminder when user gets close to route start
  useEffect(() => {
    if (!showStartReminder || !navigationState.userLocation || !route?.coordinates?.[0]) {
      return;
    }
    
    const [startLon, startLat] = route.coordinates[0];
    const distanceToRouteStart = calculateDistance(
      navigationState.userLocation.latitude,
      navigationState.userLocation.longitude,
      startLat,
      startLon
    );
    
    // Hide reminder and re-enable follow mode when user gets within 500m of start
    if (distanceToRouteStart <= 0.5) {
      console.log('[NAV] User is close to route start, hiding reminder and enabling follow mode');
      setShowStartReminder(false);
      setFollowUserLocation(true); // Re-enable follow mode for navigation
    }
  }, [navigationState.userLocation, showStartReminder, route?.coordinates]);

  // Update major points status based on user location
  useEffect(() => {
    if (navigationPhase !== 'ON_ROUTE' || !navigationState.userLocation || majorPoints.length === 0) {
      return;
    }
    
    const interval = setInterval(() => {
      const userLoc = navigationState.userLocation;
      if (!userLoc) return;
      
      let updated = false;
      
      setMajorPoints(prevPoints => {
        const newPoints = [...prevPoints];
        
        newPoints.forEach((point, index) => {
          // Skip if already completed or skipped
          if (point.status === 'completed' || point.status === 'skipped') return;
          
          // Calculate distance to this point
          const distanceToPoint = calculateDistance(
            userLoc.latitude,
            userLoc.longitude,
            point.lat,
            point.lon
          );
          
          console.log(`[MAJOR POINT] ${point.name}: ${(distanceToPoint * 1000).toFixed(0)}m away, status: ${point.status}`);
          
          // Check if reached (within 50m)
          if (distanceToPoint <= MAJOR_POINT_THRESHOLDS.REACHED) {
            console.log(`[MAJOR POINT] ✅ REACHED: ${point.name}`);
            newPoints[index] = {
              ...point,
              status: 'completed',
              completedAt: new Date(),
            };
            updated = true;
            
            // Show notification
            Alert.alert(
              '✓ Checkpoint Reached',
              `${getPointIcon(point.point_type)} ${point.name}`,
              [{ text: 'OK' }],
              { cancelable: true }
            );
          }
          // Check if approaching (within 500m)
          else if (distanceToPoint <= MAJOR_POINT_THRESHOLDS.APPROACHING && point.status === 'upcoming') {
            console.log(`[MAJOR POINT] 👀 APPROACHING: ${point.name}`);
            newPoints[index] = { ...point, status: 'approaching' };
            updated = true;
          }
          // Check if we've passed this point (behind us and still marked as upcoming/approaching)
          else if (index > 0) {
            // If we're closer to the NEXT point than this one, we likely skipped it
            const nextPoint = newPoints[index + 1];
            if (nextPoint && !['completed', 'skipped'].includes(nextPoint.status)) {
              const distanceToNext = calculateDistance(
                userLoc.latitude,
                userLoc.longitude,
                nextPoint.lat,
                nextPoint.lon
              );
              
              // If next point is significantly closer, mark this one as skipped
              if (distanceToNext < distanceToPoint - 0.2) { // 200m buffer
                console.log(`[MAJOR POINT] ⏭️ SKIPPED: ${point.name}`);
                newPoints[index] = { ...point, status: 'skipped' };
                updated = true;
              }
            }
          }
        });
        
        return updated ? newPoints : prevPoints;
      });
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(interval);
  }, [navigationPhase, navigationState.userLocation, majorPoints.length]);

  if (!route || !mapboxToken) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading navigation...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  if (!locationPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="location-outline" size={64} color="#5f6368" />
          <Text style={styles.loadingText}>Requesting location permission...</Text>
          <Text style={styles.loadingSubtext}>Please enable location to start navigation</Text>
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
          followUserLocation={followUserLocation}
          followUserMode={followUserLocation ? MapboxGL.UserTrackingMode.FollowWithHeading : undefined}
          followZoomLevel={followUserLocation ? 17 : undefined}
          followPitch={followUserLocation ? 50 : undefined}
          animationMode="flyTo"
          animationDuration={600}
        />

        {/* Navigation to Start Route - Google Maps Style (TO_START phase only) */}
        {/* Dynamic Navigation to Start Route - Orange Line */}
        {(() => {
          const shouldRenderDynamic = navigationPhase === 'TO_START' && dynamicRouteCoordinates && dynamicRouteCoordinates.length > 0 && navigationState.userLocation;
          const shouldRenderFallback = navigationPhase === 'TO_START' && navigationToStartRoute && navigationToStartRoute.length > 0 && navigationState.userLocation;
          const shouldRender = shouldRenderDynamic || shouldRenderFallback;
          
          console.log('[NAV] Route line render check:', {
            navigationPhase,
            hasDynamicRouteCoordinates: !!dynamicRouteCoordinates,
            dynamicRouteLength: dynamicRouteCoordinates?.length || 0,
            hasNavigationToStartRoute: !!navigationToStartRoute,
            navigationToStartRouteLength: navigationToStartRoute?.length || 0,
            hasUserLocation: !!navigationState.userLocation,
            shouldRenderDynamic,
            shouldRenderFallback,
            shouldRender
          });
          return shouldRender;
        })() && (
          <>
            {/* Route Casing (Border) - Darker outline */}
            <MapboxGL.ShapeSource 
              key={`navToStartCasing-${navigationState.userLocation!.latitude.toFixed(6)}-${navigationState.userLocation!.longitude.toFixed(6)}`}
              id="navToStartCasingSource" 
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: dynamicRouteCoordinates && dynamicRouteCoordinates.length > 0
                    ? dynamicRouteCoordinates
                    : navigationToStartRoute!,
                },
              }}
            >
              <MapboxGL.LineLayer
                id="navToStartCasing"
                style={{
                  lineColor: '#D67500',
                  lineWidth: 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 0.6,
                }}
              />
            </MapboxGL.ShapeSource>

            {/* Main Route Line - Bright Orange */}
            <MapboxGL.ShapeSource 
              key={`navToStartMain-${navigationState.userLocation!.latitude.toFixed(6)}-${navigationState.userLocation!.longitude.toFixed(6)}`}
              id="navToStartSource" 
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: dynamicRouteCoordinates && dynamicRouteCoordinates.length > 0
                    ? dynamicRouteCoordinates
                    : navigationToStartRoute!,
                },
              }}
            >
              <MapboxGL.LineLayer
                id="navToStartLine"
                style={{
                  lineColor: '#FF9500',
                  lineWidth: 3.5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 1,
                }}
              />
            </MapboxGL.ShapeSource>

            {/* Direction Arrows along the route - Google Maps style */}
            <MapboxGL.ShapeSource 
              key={`navToStartArrows-${navigationState.userLocation!.latitude.toFixed(6)}-${navigationState.userLocation!.longitude.toFixed(6)}`}
              id="navToStartArrowsSource" 
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: dynamicRouteCoordinates && dynamicRouteCoordinates.length > 0
                    ? dynamicRouteCoordinates
                    : navigationToStartRoute!,
                },
              }}
            >
              <MapboxGL.SymbolLayer
                id="navToStartArrows"
                style={{
                  symbolPlacement: 'line',
                  symbolSpacing: 80,
                  iconImage: 'triangle-11',
                  iconSize: 0.5,
                  iconRotationAlignment: 'map',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconColor: '#000000',
                }}
              />
            </MapboxGL.ShapeSource>
          </>
        )}

        {/* Library Route - Preview (grayed out during TO_START phase) */}
        {navigationPhase === 'TO_START' && route.coordinates.length > 0 && (
          <MapboxGL.ShapeSource id="routePreviewSource" shape={routeGeoJSON}>
            <MapboxGL.LineLayer
              id="routePreviewLine"
              style={{
                lineColor: '#B0BEC5',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.6,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Library Route - Active (solid blue during ON_ROUTE phase) */}
        {navigationPhase === 'ON_ROUTE' && route.coordinates.length > 0 && (
          <>
            {/* Route Casing (Border) - Darker blue outline */}
            <MapboxGL.ShapeSource id="routeCasingSource" shape={routeGeoJSON}>
              <MapboxGL.LineLayer
                id="routeCasing"
                style={{
                  lineColor: '#1967D2',
                  lineWidth: 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 0.6,
                }}
              />
            </MapboxGL.ShapeSource>

            {/* Main Route Line - Bright Blue */}
          <MapboxGL.ShapeSource id="routeSource" shape={routeGeoJSON}>
            <MapboxGL.LineLayer
              id="routeLine"
              style={{
                lineColor: '#4285F4',
                  lineWidth: 3.5,
                lineCap: 'round',
                lineJoin: 'round',
                  lineOpacity: 1,
              }}
            />
          </MapboxGL.ShapeSource>

            {/* Direction Arrows along the route - Google Maps style */}
            <MapboxGL.ShapeSource id="routeArrowsSource" shape={routeGeoJSON}>
              <MapboxGL.SymbolLayer
                id="routeArrows"
                style={{
                  symbolPlacement: 'line',
                  symbolSpacing: 80,
                  iconImage: 'triangle-11',
                  iconSize: 0.5,
                  iconRotationAlignment: 'map',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconColor: '#000000',
                }}
              />
            </MapboxGL.ShapeSource>
          </>
        )}

        {/* Start Point Marker (only during TO_START phase) */}
        {navigationPhase === 'TO_START' && route.coordinates.length > 0 && (
          <MapboxGL.PointAnnotation
            id="startPoint"
            coordinate={route.coordinates[0]}
          >
            <View style={styles.startPointMarker}>
              <View style={styles.startPointPin}>
                <Ionicons name="flag" size={16} color="#FFFFFF" />
              </View>
            </View>
          </MapboxGL.PointAnnotation>
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

        {/* Custom User Location Marker with Profile Picture */}
        <MapboxGL.Images 
          images={{ 
            'user-avatar': (userProfile?.avatar_url || user?.avatar) ? 
              { uri: `https://images.weserv.nl/?url=${encodeURIComponent(userProfile?.avatar_url || user?.avatar)}&w=64&h=64&fit=cover&mask=circle&border=3,4285F4` } : 
              { uri: 'https://ui-avatars.com/api/?name=U&background=4285F4&color=FFFFFF&size=64&rounded=true&bold=true' } // Fallback
          }} 
        />
        <MapboxGL.LocationPuck
          visible={true}
          topImage="user-avatar"
        />
      </MapboxGL.MapView>



      {/* Back Button - Top Left */}
      <SafeAreaView style={styles.backButtonContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Alert.alert(
              'Exit Navigation',
              'Are you sure you want to exit navigation?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Exit',
                  style: 'destructive',
                  onPress: () => router.back(),
                },
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#202124" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Google Maps Style - Top Turn Card */}
      <SafeAreaView style={styles.topContainer}>
        <View style={styles.topCard}>
          {/* Large Turn Icon */}
          <View style={styles.turnIconLarge}>
            <Ionicons 
              name={navigationPhase === 'TO_START' && navigationSteps.length > 0
                ? getTurnIcon(navigationState.nextTurnType)
                : navigationPhase === 'TO_START'
                  ? 'flag'
                  : getTurnIcon(navigationState.nextTurnType)
              } 
              size={40} 
              color={navigationPhase === 'TO_START' && navigationSteps.length === 0 ? '#FF9500' : '#000000'} 
            />
          </View>
          
          {/* Turn Information */}
          <View style={styles.turnInfo}>
            <Text style={styles.distanceLarge}>
              {navigationPhase === 'TO_START' && navigationSteps.length > 0
                ? navigationState.nextTurnDistance < 1
                  ? `${(navigationState.nextTurnDistance * 1000).toFixed(0)} m`
                  : `${navigationState.nextTurnDistance.toFixed(1)} km`
                : navigationPhase === 'TO_START'
                  ? distanceToStart < 1 
                    ? `${(distanceToStart * 1000).toFixed(0)} m`
                    : `${distanceToStart.toFixed(1)} km`
                  : navigationState.nextTurnDistance < 1
                    ? `${(navigationState.nextTurnDistance * 1000).toFixed(0)} m`
                    : `${navigationState.nextTurnDistance.toFixed(1)} km`
              }
            </Text>
            <Text style={styles.streetName} numberOfLines={1}>
              {navigationPhase === 'TO_START' && navigationSteps.length > 0
                ? navigationState.nextTurnInstruction
                : navigationPhase === 'TO_START'
                  ? `To start of ${route.name}`
                  : navigationState.nextTurnInstruction
              }
            </Text>
            
            {/* ETA and Distance Row */}
            <View style={styles.etaRow}>
              <Text style={styles.etaText}>
                {formatTime(navigationState.timeRemaining)}
              </Text>
              <View style={styles.dot} />
              <Text style={styles.etaText}>
                {navigationState.distanceRemaining.toFixed(1)} km
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Error Message Card - When navigation to start fails */}
      {navigationPhase === 'TO_START' && navigationToStartError && (
        <View style={styles.errorMessageContainer}>
          <View style={styles.errorCard}>
            <View style={styles.errorIconContainer}>
              <Ionicons name="warning" size={28} color="#EA4335" />
            </View>
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorTitle}>Navigation Unavailable</Text>
              <Text style={styles.errorMessage}>{navigationToStartError}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Start Location Reminder Banner - When user skipped to route */}
      {navigationPhase === 'ON_ROUTE' && showStartReminder && route?.coordinates?.[0] && (
        <View style={styles.reminderBannerContainer}>
          <View style={styles.reminderBanner}>
            <View style={styles.reminderIconContainer}>
              <Ionicons name="navigate-circle" size={24} color="#1967D2" />
            </View>
            <View style={styles.reminderTextContainer}>
              <Text style={styles.reminderTitle}>Navigate to Start Point</Text>
              <View style={styles.reminderDistanceRow}>
                <Ionicons name="location" size={13} color="#5f6368" />
                <Text style={styles.reminderDistanceText}>
                  {distanceToStart < 1 
                    ? `${(distanceToStart * 1000).toFixed(0)} m away` 
                    : `${distanceToStart.toFixed(2)} km away`
                  }
                </Text>
              </View>
              {/* Show directions button if navigation route is available */}
              {navigationToStartRoute && navigationToStartRoute.length > 0 && (
          <TouchableOpacity
                  style={styles.directionsButton}
                  onPress={() => {
                    console.log('[NAV] Opening directions to start');
                    setFollowUserLocation(true);
                    setNavigationPhase('TO_START');
                    setShowStartReminder(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-forward" size={14} color="#1967D2" />
                  <Text style={styles.directionsButtonText}>Get Directions</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.reminderDismissButton}
              onPress={() => {
                console.log('[NAV] User dismissed start reminder');
                setShowStartReminder(false);
              }}
            activeOpacity={0.6}
          >
              <Ionicons name="close" size={18} color="#5f6368" />
          </TouchableOpacity>
        </View>
        </View>
      )}

      {/* Enhanced Skip Button - Always shown during TO_START phase */}
      {navigationPhase === 'TO_START' && showSkipButton && !isLoadingNavToStart && (
        <View style={styles.skipButtonContainer}>
          {/* Info Card - Shows distance and option to skip */}
          <View style={styles.skipInfoCard}>
            <View style={styles.skipInfoRow}>
              <View style={styles.skipInfoLeft}>
                <Ionicons name="location" size={20} color="#FF9500" />
                <View style={styles.skipInfoTextContainer}>
                  <Text style={styles.skipInfoTitle}>Distance to Start</Text>
                  <Text style={styles.skipInfoDistance}>
                    {distanceToStart < 1 
                      ? `${(distanceToStart * 1000).toFixed(0)} m` 
                      : `${distanceToStart.toFixed(2)} km`
                    }
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.skipButtonCompact}
                onPress={() => {
                  console.log('[NAV] User manually skipped to route navigation');
                  Alert.alert(
                    'Skip to Route?',
                    navigationToStartError 
                      ? 'The route will be displayed on the map. Navigate to the start point to begin.' 
                      : `You're ${distanceToStart < 1 ? (distanceToStart * 1000).toFixed(0) + 'm' : distanceToStart.toFixed(2) + 'km'} from the start. View the full route?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'View Route',
                        style: 'default',
                        onPress: () => {
                          console.log('[NAV] Switching to ON_ROUTE with skip flag');
                          
                          // Mark that user skipped
                          setSkippedToRoute(true);
                          setShowStartReminder(true);
                          
                          // Disable follow user mode to allow manual zoom
                          setFollowUserLocation(false);
                          
                          // Switch to route navigation
                          setNavigationPhase('ON_ROUTE');
                          setShowSkipButton(false);
                          setNavigationToStartError(null);
                          
                          // Zoom camera to show full route
                          if (cameraRef.current && route && route.coordinates.length > 1) {
                            console.log('[NAV] Zooming to show full route');
                            setTimeout(() => {
                              const coords = route.coordinates;
                              cameraRef.current?.fitBounds(
                                [coords[0][0], coords[0][1]], // Start point
                                [coords[coords.length - 1][0], coords[coords.length - 1][1]], // End point
                                [80, 250, 80, 150], // Padding [top, right, bottom, left]
                                3000 // Animation duration
                              );
                            }, 500);
                          }
                        }
                      }
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="play-circle" size={20} color="#FFFFFF" />
                <Text style={styles.skipButtonCompactText}>Skip</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.skipInfoSubtext}>
              {navigationToStartError 
                ? 'Tap Skip to start route from your current location'
                : 'You can skip navigation and start the route directly'
              }
            </Text>
          </View>
        </View>
      )}

      {/* Enhanced Progress Card with Real Major Points */}
      {navigationPhase === 'ON_ROUTE' && (
        <View style={styles.progressCard}>
          {/* Show loading state */}
          {loadingMajorPoints && (
            <View style={styles.progressLoading}>
              <ActivityIndicator size="small" color="#4285F4" />
              <Text style={styles.progressLoadingText}>Loading...</Text>
            </View>
          )}
          
          {/* Show all waypoints */}
          {!loadingMajorPoints && majorPoints.length > 0 && (
            <>
              {/* Progress Line and Waypoints Side by Side */}
              <View style={styles.progressAndWaypointsContainer}>

                {/* Scrollable Waypoints with Bike Icon - Right side */}
              <ScrollView 
                ref={scrollViewRef}
                style={styles.waypointsScrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.waypointsScrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => setIsScrolling(true)}
                onScrollEndDrag={() => {
                  // Start timeout when user stops dragging
                  if (scrollTimeout) clearTimeout(scrollTimeout);
                  const timeout = setTimeout(() => {
                    snapToCurrentPosition();
                    setIsScrolling(false);
                  }, 2000);
                  setScrollTimeout(timeout);
                }}
              >
                {/* Combine and sort all waypoints by distance */}
                {(() => {
                  const allWaypoints = [
                    ...majorPoints.map(p => ({ ...p, isMajor: true })),
                    ...navigationWaypoints.map(p => ({ ...p, isMajor: false }))
                  ].sort((a, b) => b.distance_from_start - a.distance_from_start);
                  
                  return allWaypoints.map((point, index) => {
                    // Calculate bike position based on current progress
                    const currentPosition = mockCurrentPosition; // 35%
                    const waypointProgress = (index / (allWaypoints.length - 1)) * 100;
                    const nextWaypointProgress = ((index + 1) / (allWaypoints.length - 1)) * 100;
                    
                    // Show bike if current position is between this waypoint and the next
                    const shouldShowBike = currentPosition >= waypointProgress && 
                                          currentPosition < nextWaypointProgress && 
                                          index < allWaypoints.length - 1;
                    
                    // Determine waypoint status based on reversed order
                    // Points below bike (closer to start) = completed, points above = upcoming
                    const isCompleted = waypointProgress > currentPosition;
                    
                    return (
                      <View key={point.id}>
                        <View style={[
                          styles.waypointSection,
                          !point.isMajor && styles.navWaypointSection
                        ]}>
                          <View style={[
                            styles.waypointIconContainer,
                            !point.isMajor && styles.navWaypointIconContainer
                          ]}>
                            <Ionicons 
                              name={point.isMajor 
                                ? getPointIcon(point.point_type) as any
                                : getNavWaypointIcon(point.point_type) as any
                              } 
                              size={point.isMajor ? 12 : 8} 
                              color={isCompleted 
                                ? "#34A853"  // Green for completed
                                : point.isMajor 
                                  ? "#5f6368"  // Dark gray for major waypoints
                                  : "#B0BEC5"  // Light gray for navigation waypoints
                              } 
                            />
            </View>
            <View style={styles.waypointTextContainer}>
                            <Text style={[
                              point.isMajor ? styles.waypointStatusNext : styles.navWaypointStatus,
                              isCompleted && styles.waypointStatus
                            ]}>
                              {isCompleted ? 'Passed' : 
                               point.isMajor ? 'Next' : 'Nav'}
              </Text>
                            <Text style={[
                              point.isMajor ? styles.waypointName : styles.navWaypointName,
                              isCompleted && styles.completedWaypointName
                            ]} numberOfLines={1}>
                              {point.name}
                            </Text>
                            <Text style={[
                              point.isMajor ? styles.waypointDistance : styles.navWaypointDistance,
                              isCompleted && styles.completedWaypointDistance
                            ]}>
                              {point.distance_from_start.toFixed(1)} km
                  </Text>
            </View>
          </View>

                        {/* User Profile Picture with Time to Next Stop */}
                        {shouldShowBike && (
                          <View style={styles.bikeIconContainer}>
                            <View style={styles.bikeIcon}>
                              {userProfile?.avatar_url || user?.avatar ? (
                                <Image 
                                  source={{ uri: userProfile?.avatar_url || user?.avatar }} 
                                  style={styles.profilePicture}
                                  onError={(error) => {
                                    console.log('[NAVIGATION] Image load error:', error);
                                    console.log('[NAVIGATION] Failed to load avatar URL:', userProfile?.avatar_url || user?.avatar);
                                  }}
                                  onLoad={() => {
                                    console.log('[NAVIGATION] Successfully loaded avatar:', userProfile?.avatar_url || user?.avatar);
                                  }}
                                />
                              ) : (
                                <Ionicons name="person" size={16} color="#FF6B35" />
                              )}
            </View>
                            <Text style={styles.bikeIconText}>You are here</Text>
                            <View style={styles.timeToNextStop}>
                              <Text style={styles.timeToNextStopLabel}>Next: {mockNextStopName}</Text>
                              <Text style={styles.timeToNextStopTime}>{mockTimeToNextStop} min</Text>
          </View>
            </View>
                        )}
            </View>
                    );
                  });
                })()}
              </ScrollView>
          </View>
            </>
          )}
          
          {/* No major points available */}
          {!loadingMajorPoints && majorPoints.length === 0 && (
            <View style={styles.noWaypoints}>
              <Text style={styles.noWaypointsText}>No waypoints</Text>
            </View>
          )}
          
        </View>
      )}

      {/* Google Maps Style - Bottom Actions */}
      <View style={styles.bottomActionsContainer}>
        {/* Speed Display - Real GPS Speed */}
        <View style={styles.speedCard}>
          <Text style={styles.speedNumber}>{navigationState.currentSpeed}</Text>
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
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#9AA0A6',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  
  // Back Button - Top Left
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  
  // Google Maps Style - Top Card
  topContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  
  // Phase Badge
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  phaseBadgeOrange: {
    backgroundColor: '#FF9500',
  },
  phaseBadgeBlue: {
    backgroundColor: '#4285F4',
  },
  phaseBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  
  topCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 68, // Position below back button (44px button + 12px margin + 12px gap)
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  
  // Large Turn Icon (Google Style)
  turnIconLarge: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  
  // Turn Information
  turnInfo: {
    flex: 1,
  },
  distanceLarge: {
    fontSize: 24,
    fontWeight: '600',
    color: '#202124',
    letterSpacing: -0.5,
  },
  streetName: {
    fontSize: 13,
    fontWeight: '400',
    color: '#5f6368',
    marginTop: 2,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  etaText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#5f6368',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#5f6368',
    marginHorizontal: 6,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    minWidth: 65,
  },
  speedNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
    lineHeight: 24,
  },
  speedUnit: {
    fontSize: 11,
    fontWeight: '400',
    color: '#5f6368',
    marginTop: 1,
  },
  
  // Recenter Button
  recenterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },

  // Redesigned Progress Card - Left Side (Compact with Scroll)
  progressCard: {
    position: 'absolute',
    left: 12,
    bottom: 180, // Moved to bottom to avoid overlap
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 6,
    width: 80, // Made thinner
    maxHeight: 250, // Made taller
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  
  waypointSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  
  waypointIconContainer: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  
  waypointTextContainer: {
    flex: 1,
  },
  
  waypointStatus: {
    fontSize: 7,
    fontWeight: '500',
    color: '#34A853',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    marginBottom: 1,
  },
  
  waypointStatusNext: {
    fontSize: 7,
    fontWeight: '500',
    color: '#9AA0A6',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    marginBottom: 1,
  },
  
  waypointName: {
    fontSize: 8,
    fontWeight: '500',
    color: '#202124',
    lineHeight: 10,
  },
  
  progressLineContainer: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  
  progressLine: {
    width: 2,
    height: 120, // Match the waypoints container height
    backgroundColor: '#E8EAED',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 6,
  },
  
  progressLineActive: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#34A853', // Green for completed waypoints
    borderRadius: 2,
  },
  
  // Current Position Indicator
  currentPositionIndicator: {
    position: 'absolute',
    left: -3,
    width: 8,
    height: 8,
    backgroundColor: '#FF6B35',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  
  progressPercentage: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4285F4',
    letterSpacing: -0.3,
  },
  
  upcomingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#5f6368',
  },
  
  // New styles for major points
  progressLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  progressLoadingText: {
    fontSize: 9,
    color: '#5f6368',
    fontWeight: '500',
  },
  waypointDistance: {
    fontSize: 7,
    color: '#9AA0A6',
    marginTop: 1,
  },
  waypointStatusApproaching: {
    color: '#FBBC04',
  },

  // Navigation Waypoint Styles (Smaller, Lighter)
  navWaypointSection: {
    opacity: 0.7,
    paddingVertical: 1,
  },
  navWaypointIconContainer: {
    width: 12,
    height: 12,
    marginRight: 4,
  },
  navWaypointStatus: {
    fontSize: 6,
    fontWeight: '400',
    color: '#B0BEC5',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    marginBottom: 1,
  },
  navWaypointName: {
    fontSize: 7,
    fontWeight: '400',
    color: '#9AA0A6',
    lineHeight: 8,
  },
  navWaypointDistance: {
    fontSize: 6,
    color: '#B0BEC5',
    marginTop: 1,
  },

  // Completed Waypoint Styles (Green highlighting)
  completedWaypointName: {
    color: '#34A853',
    fontWeight: '600',
  },
  completedWaypointDistance: {
    color: '#34A853',
    fontWeight: '500',
  },
  noWaypoints: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  noWaypointsText: {
    fontSize: 9,
    color: '#9AA0A6',
    fontStyle: 'italic',
  },

  // Progress and Waypoints Container
  progressAndWaypointsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Scrollable Waypoints Styles
  waypointsScrollView: {
    flex: 1,
    maxHeight: 170, // Increased to match taller container
  },
  waypointsScrollContent: {
    paddingVertical: 2,
  },


  // Bike Icon Styles
  bikeIconContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  bikeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  profilePicture: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  bikeIconText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FF6B35',
    marginTop: 2,
    textAlign: 'center',
  },
  timeToNextStop: {
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 2,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#FF6B35',
    minWidth: 80,
  },
  timeToNextStopLabel: {
    fontSize: 6,
    fontWeight: '500',
    color: '#5f6368',
    marginBottom: 1,
    textAlign: 'center',
  },
  timeToNextStopTime: {
    fontSize: 5,
    fontWeight: '700',
    color: '#FF6B35',
    textAlign: 'center',
  },

  // Start Point Marker (Orange Flag)
  startPointMarker: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPointPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF9500',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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
  
  // Error Message Card
  errorMessageContainer: {
    position: 'absolute',
    top: 170, // Position below smaller top card
    left: 12,
    right: 12,
  },
  errorCard: {
    backgroundColor: '#FFF3F3',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
    shadowColor: '#EA4335',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  errorIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#C62828',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 13,
    fontWeight: '400',
    color: '#5f6368',
    lineHeight: 18,
  },
  
  // Start Reminder Banner
  reminderBannerContainer: {
    position: 'absolute',
    top: 170, // Position below smaller top card
    left: 12,
    right: 12,
  },
  reminderBanner: {
    backgroundColor: '#E8F0FE',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start', // Changed back to flex-start to accommodate button
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#AECBFA',
    shadowColor: '#1967D2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  reminderIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2, // Align with title line
  },
  reminderTextContainer: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1967D2',
    marginBottom: 3,
  },
  reminderDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 0,
  },
  reminderDistanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
  },
  reminderDismissButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2, // Align with title line
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#AECBFA',
  },
  directionsButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1967D2',
  },
  
  // Enhanced Skip Button
  skipButtonContainer: {
    position: 'absolute',
    bottom: 110,
    left: 12,
    right: 12,
  },
  skipInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: '#FF9500',
  },
  skipInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  skipInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  skipInfoTextContainer: {
    flex: 1,
  },
  skipInfoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  skipInfoDistance: {
    fontSize: 20,
    fontWeight: '700',
    color: '#202124',
    letterSpacing: -0.5,
  },
  skipButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF9500',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  skipButtonCompactText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  skipInfoSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5f6368',
    lineHeight: 16,
    marginTop: 4,
  },
  
   // Custom User Location Marker Styles
  userLocationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
   userLocationPuck: {
     width: 40,
     height: 40,
     borderRadius: 20,
     backgroundColor: '#FFFFFF',
     borderWidth: 3,
     borderColor: '#4285F4',
    alignItems: 'center',
     justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
   userLocationAvatar: {
     width: 34,
     height: 34,
     borderRadius: 17,
     backgroundColor: '#f0f0f0', // Debug background to see if image container is there
   },
   userLocationFallback: {
     position: 'absolute',
     width: 34,
     height: 34,
     borderRadius: 17,
     backgroundColor: '#4285F4',
     justifyContent: 'center',
     alignItems: 'center',
   },
   userLocationInitials: {
     color: 'white',
     fontSize: 16,
     fontWeight: 'bold',
  },
  userLocationPulse: {
     position: 'absolute',
     width: 60,
     height: 60,
     borderRadius: 30,
    backgroundColor: '#4285F4',
     opacity: 0.3,
     // Animation will be handled by Mapbox's built-in pulsing
   },
   
   // Clean User Location Styles
   cleanUserLocation: {
     width: 24,
     height: 24,
     borderRadius: 12,
     backgroundColor: '#4285F4',
     borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
     justifyContent: 'center',
     alignItems: 'center',
   },
   cleanUserLocationInner: {
     width: 8,
     height: 8,
     borderRadius: 4,
     backgroundColor: '#FFFFFF',
   },
   
  testMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF0000', // Bright red for visibility
    zIndex: 1000,
  },
});

export default NavigationScreen;

