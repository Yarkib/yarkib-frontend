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
  Animated,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { getApiBaseUrl } from '../src/config/config';
import { useAuth } from '../src/context/AuthContext';
import { waypointsApi } from '../src/utils/api';
import { createDynamicRouteCoordinates, findClosestPointOnRoute, haversineDistanceMeters, projectPointOntoSegment } from './utils/navigationRouteHelpers';

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
  // Keep a normalized copy of the library route for ON_ROUTE calculations
  const normalizedRouteCoordsRef = useRef<Array<[number, number]> | null>(null);
  const totalRouteMetersRef = useRef<number>(0);
  // State to track when route coordinates are ready (for camera effect dependency)
  const [routeCoordsReady, setRouteCoordsReady] = useState(false);
  
  useEffect(() => {
    console.log('[NAV] Route normalization effect triggered, route:', route?.id || 'no-id', 'coords:', route?.coordinates?.length || 0);
    if (route && Array.isArray(route.coordinates) && route.coordinates.length > 1) {
      const normalized = (route.coordinates as Array<[number, number]>).map(ensureLngLat);
      normalizedRouteCoordsRef.current = normalized;
      let total = 0;
      for (let i = 0; i < normalized.length - 1; i++) {
        const A = normalized[i];
        const B = normalized[i + 1];
        total += haversineDistanceMeters(A[1], A[0], B[1], B[0]);
      }
      totalRouteMetersRef.current = total;
      setRouteCoordsReady(true); // Signal that route coordinates are ready
      console.log('[NAV] Route normalized:', normalized.length, 'points, total meters:', total.toFixed(0));
    } else {
      normalizedRouteCoordsRef.current = null;
      totalRouteMetersRef.current = 0;
      setRouteCoordsReady(false);
      console.warn('[NAV] Route coordinates invalid or missing');
    }
  }, [route]);
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
  const [mapOrientationMode, setMapOrientationMode] = useState<'north-up' | 'heading-up'>('north-up');
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
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Navigation waypoints state
  const [navigationWaypoints, setNavigationWaypoints] = useState<any[]>([]);
  const [loadingNavigationWaypoints, setLoadingNavigationWaypoints] = useState(false);
  const [showMileWaypoints, setShowMileWaypoints] = useState(false); // Toggle state

  // Skipped waypoints state
  const [skippedWaypointIds, setSkippedWaypointIds] = useState<Set<string>>(new Set());
  const [selectedWaypoint, setSelectedWaypoint] = useState<MajorPoint | null>(null);
  const [showWaypointActionSheet, setShowWaypointActionSheet] = useState(false);
  const [showWaypointManagementModal, setShowWaypointManagementModal] = useState(false);
  const [showMajorWaypointsModal, setShowMajorWaypointsModal] = useState(false);
  
  // Animation values for major waypoints modal
  const majorWaypointsModalSlideAnim = useRef(new Animated.Value(300)).current;
  const majorWaypointsModalOpacityAnim = useRef(new Animated.Value(0)).current;
  const majorWaypointsCardAnims = useRef<{ [key: string]: Animated.Value }>({}).current;

  // Generate navigation waypoints every 1 mile along the current route
  const MILE_IN_METERS = 1609.344;
  const generateMileWaypointsFromLine = (coords: Array<[number, number]>) => {
    if (!coords || coords.length < 2) return [] as any[];
    const cumulative: number[] = [0];
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      const d = haversineDistanceMeters(a[1], a[0], b[1], b[0]);
      cumulative.push(cumulative[i - 1] + d);
    }
    const total = cumulative[cumulative.length - 1];
    if (total < MILE_IN_METERS) return [] as any[];
    const results: any[] = [];
    for (let target = MILE_IN_METERS, n = 1; target < total; target += MILE_IN_METERS, n++) {
      let seg = -1;
      for (let i = 0; i < cumulative.length - 1; i++) {
        if (cumulative[i] <= target && target <= cumulative[i + 1]) { seg = i; break; }
      }
      if (seg === -1) continue;
      const A = coords[seg];
      const B = coords[seg + 1];
      const segLen = cumulative[seg + 1] - cumulative[seg];
      const t = segLen > 0 ? (target - cumulative[seg]) / segLen : 0;
      const lng = A[0] + (B[0] - A[0]) * t;
      const lat = A[1] + (B[1] - A[1]) * t;
      results.push({
        id: `nav-mile-${n}`,
        name: `📍 ${n} mi`, // Clear mile marker prefix
        point_type: 'nav_mile',
        distance_from_start: target / 1000,
        lon: lng,
        lat,
      });
    }
    return results;
  };

  // Handler for skipping/unskipping waypoints
  const handleToggleSkipWaypoint = (waypointId: string) => {
    setSkippedWaypointIds(prev => {
      const newSet = new Set(prev);
      const wasSkipped = newSet.has(waypointId);
      if (wasSkipped) {
        newSet.delete(waypointId);
      } else {
        newSet.add(waypointId);
      }
      // Update the major point status
      setMajorPoints(prevPoints => prevPoints.map(p => 
        p.id === waypointId 
          ? { ...p, status: wasSkipped ? 'upcoming' : 'skipped' }
          : p
      ));
      return newSet;
    });
  };

  // Handler for waypoint action sheet (tap on marker)
  const handleWaypointPress = (waypointId: string) => {
    const waypoint = majorPoints.find(p => p.id === waypointId) || 
                     navigationWaypoints.find((p: any) => p.id === waypointId);
    if (waypoint) {
      setSelectedWaypoint(waypoint as MajorPoint);
      setShowWaypointActionSheet(true);
    }
  };

  const handleToggleMileWaypoints = () => {
    // Toggle the visibility state
    const newState = !showMileWaypoints;
    setShowMileWaypoints(newState);
    
    if (newState) {
      // Generate waypoints when toggling ON
      try {
        setLoadingNavigationWaypoints(true);
        let base: Array<[number, number]> | null = null;
        if (
          navigationPhase === 'ON_ROUTE' &&
          route && Array.isArray((route as any).coordinates) && (route as any).coordinates.length > 1
        ) {
          base = (route as any).coordinates as Array<[number, number]>;
        } else if (navigationPhase === 'TO_START') {
          if (dynamicRouteCoordinates && dynamicRouteCoordinates.length > 1) {
            base = dynamicRouteCoordinates as Array<[number, number]>;
          } else if (navigationToStartRouteRef.current && navigationToStartRouteRef.current.length > 1) {
            base = navigationToStartRouteRef.current as Array<[number, number]>;
          }
        }
        if (!base) {
          setNavigationWaypoints([]);
          setShowMileWaypoints(false); // Revert toggle if no route available
          return;
        }
        setNavigationWaypoints(generateMileWaypointsFromLine(base));
      } finally {
        setLoadingNavigationWaypoints(false);
      }
    } else {
      // Clear waypoints when toggling OFF
      setNavigationWaypoints([]);
    }
  };

  // Calculate distance_from_start for any waypoint based on route coordinates
  const calculateDistanceFromRouteStart = (
    waypointLat: number,
    waypointLon: number,
    routeCoords: Array<[number, number]>
  ): number => {
    if (!routeCoords || routeCoords.length < 2) return 0;
    
    // Find the closest segment on the route
    let minDist = Infinity;
    let closestSegmentIndex = 0;
    let closestProjection: [number, number] | null = null;
    
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const A = routeCoords[i];
      const B = routeCoords[i + 1];
      const { proj } = projectPointOntoSegment(A, B, [waypointLon, waypointLat]);
      const dist = haversineDistanceMeters(waypointLat, waypointLon, proj[1], proj[0]);
      
      if (dist < minDist) {
        minDist = dist;
        closestSegmentIndex = i;
        closestProjection = proj;
      }
    }
    
    if (!closestProjection) return 0;
    
    // Calculate cumulative distance from start to the projected point
    let totalDist = 0;
    for (let i = 0; i <= closestSegmentIndex; i++) {
      if (i < routeCoords.length - 1) {
        const A = routeCoords[i];
        const B = routeCoords[i + 1];
        
        if (i === closestSegmentIndex) {
          // For the closest segment, calculate distance to the projected point
          totalDist += haversineDistanceMeters(A[1], A[0], closestProjection[1], closestProjection[0]);
        } else {
          // For previous segments, add full segment distance
          totalDist += haversineDistanceMeters(A[1], A[0], B[1], B[0]);
        }
      }
    }
    
    return totalDist / 1000; // Return in kilometers
  };
  
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

  // Get major points progress (real data from database)
  const completedPoints = majorPoints.filter(p => p.status === 'completed');
  const totalPoints = majorPoints.length;
  const progressPercentage = totalPoints > 0 ? (completedPoints.length / totalPoints) * 100 : 0;
  
  // Calculate current position percentage based on remaining distance
  const currentPositionPercentage = (() => {
    const total = totalRouteMetersRef.current || 0;
    if (!total || navigationState.distanceRemaining <= 0) {
      return 0;
    }
    const completed = Math.max(0, Math.min(total, total - navigationState.distanceRemaining));
    return (completed / total) * 100;
  })();
  
  // Progress line completion (reversed list UI)
  const currentPositionProgress = currentPositionPercentage; // percent from start → used in UI

  const mapRef = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  
  // Guidance tuning (metrics)
  const OFF_ROUTE_THRESHOLD_M = 30;   // mark off-route
  const REROUTE_THRESHOLD_M = 50;     // trigger reroute
  const TURN_WARNING_DISTANCES_M = [400, 200, 50];
  
  // Smoothing caches
  const recentBearingsRef = useRef<number[]>([]);
  const recentSpeedsRef = useRef<number[]>([]);
  
  // Off-route and reroute gating
  const [isOffRoute, setIsOffRoute] = useState(false);
  const lastRerouteMsRef = useRef<number>(0);
  
  // Region-change debounce to avoid flicker
  const lastRegionUserMsRef = useRef<number>(0);
  const isRecenterInProgressRef = useRef<boolean>(false);

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
    }, 4000); // 2 seconds after scrolling stops
    
    setScrollTimeout(timeout);
  };


  const snapToCurrentPosition = () => {
    if (!scrollViewRef.current) return;
    
    // Build the same waypoint list and order as the UI (destination → start)
    const routeCoords = (route?.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 1)
      ? route.coordinates as Array<[number, number]>
      : null;
    
    const allWaypoints = [
      ...majorPoints.map(p => ({
        ...p,
        isMajor: true,
        distance_from_start: routeCoords
          ? calculateDistanceFromRouteStart(p.lat, p.lon, routeCoords)
          : p.distance_from_start || 0
      })),
      ...(showMileWaypoints ? navigationWaypoints.map(p => ({
        ...p,
        isMajor: false,
        point_type: p.point_type || 'nav_mile',
        distance_from_start: routeCoords
          ? calculateDistanceFromRouteStart(p.lat, p.lon, routeCoords)
          : p.distance_from_start || 0
      })) : [])
    ].sort((a, b) => b.distance_from_start - a.distance_from_start);

    const totalRouteMeters = totalRouteMetersRef.current || 1;
    const currentPosition = currentPositionPercentage; // 0..100

    // Compute percentage positions for each waypoint based on real distance
    const waypointPercents = allWaypoints.map(wp => {
      const meters = (wp.distance_from_start || 0) * 1000;
      return Math.max(0, Math.min(100, (meters / totalRouteMeters) * 100));
    });

    // Find segment containing the rider (descending order): prev >= current >= curr
    let targetIndex = 0;
    for (let i = 0; i < waypointPercents.length; i++) {
      const currPct = waypointPercents[i];
      const prevPct = i === 0 ? 100 : waypointPercents[i - 1];
      if (currentPosition <= prevPct && currentPosition >= currPct) {
        targetIndex = i;
        break;
      }
    }

    // Calculate scroll position to center on the target waypoint
    const itemHeight = 32; // item height in this list
    const containerHeight = 120; // visible container height
    const visibleItems = Math.floor(containerHeight / itemHeight);
    const centerOffset = Math.floor(visibleItems / 2);
    const scrollPosition = Math.max(0, (targetIndex - centerOffset) * itemHeight);

    scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
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

  // Track route ID to detect changes
  const prevRouteIdRef = useRef<string | null>(null);
  
  // Reset navigation state when route changes (prevents stale cached values from previous routes)
  useEffect(() => {
    const currentRouteId = route?.id || null;
    if (currentRouteId && currentRouteId !== prevRouteIdRef.current) {
      console.log('[NAVIGATION] Route changed (ID:', currentRouteId, '), resetting navigation state to clear cache');
      prevRouteIdRef.current = currentRouteId;
      
      // Reset navigation state - distanceRemaining will be calculated on next GPS update
      setNavigationState(prev => ({
        ...prev,
        distanceRemaining: 0, // Reset to 0, will be recalculated from actual GPS position
        timeRemaining: 0,
        nextTurnDistance: 0,
        nextTurnInstruction: 'Loading navigation...',
        nextTurnType: 'straight',
        currentProgress: 0,
        currentStepIndex: 0,
      }));
      // Reset navigation routes
      setNavigationToStartRoute(null);
      setDynamicRouteCoordinates(null);
      navigationToStartRouteRef.current = null;
      dynamicRouteCoordinatesRef.current = null;
    }
  }, [route?.id]); // Reset when route ID changes

  // Trigger position calculation when route coordinates become available and we have a user location
  useEffect(() => {
    if (
      navigationPhase === 'ON_ROUTE' &&
      route?.coordinates &&
      route.coordinates.length > 0 &&
      normalizedRouteCoordsRef.current &&
      normalizedRouteCoordsRef.current.length > 0 &&
      navigationState.userLocation &&
      navigationState.distanceRemaining === 0
    ) {
      console.log('[NAVIGATION] Route coordinates available, triggering position calculation');
      // Trigger a position update by calling handleLocationUpdate with current location
      if (navigationState.userLocation) {
        const fakeLocation = {
          coords: {
            latitude: navigationState.userLocation.latitude,
            longitude: navigationState.userLocation.longitude,
            altitude: null,
            accuracy: 5,
            altitudeAccuracy: null,
            heading: navigationState.heading || 0,
            speed: navigationState.currentSpeed ? navigationState.currentSpeed / 3.6 : 0,
          },
          timestamp: Date.now(),
        } as Location.LocationObject;
        // Use setTimeout to avoid calling during render
        setTimeout(() => {
          handleLocationUpdate(fakeLocation);
        }, 50);
      }
    }
  }, [route?.coordinates?.length, navigationState.userLocation?.latitude, navigationState.distanceRemaining, navigationPhase]);

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
    // Smooth heading & speed caches
    if (typeof coords.heading === 'number') {
      recentBearingsRef.current.push(coords.heading);
      if (recentBearingsRef.current.length > 5) recentBearingsRef.current.shift();
    }
    recentSpeedsRef.current.push((coords.speed || 0) * 3.6);
    if (recentSpeedsRef.current.length > 5) recentSpeedsRef.current.shift();
      
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
  // Update top navigation card while ON_ROUTE (using library route geometry)
  else if (navigationPhase === 'ON_ROUTE') {
    try {
      const normalized = normalizedRouteCoordsRef.current;
      if (normalized && normalized.length > 1) {
        console.log('[NAV] ON_ROUTE: Calculating position, normalized coords:', normalized.length, 'points, totalRouteMeters:', totalRouteMetersRef.current);
        const userPoint: [number, number] = [userLoc.longitude, userLoc.latitude];
        const closest = findClosestPointOnRoute(normalized as Array<[number,number]>, userPoint);
        // Off-route detection
        const offRouteNow = closest.distanceMeters > OFF_ROUTE_THRESHOLD_M;
        if (offRouteNow !== isOffRoute) setIsOffRoute(offRouteNow);

        // Compute remaining distance from projected point to end of route
        let remaining = 0;
        const proj = closest.projectedPoint as [number, number];
        // distance from projected point to end of its segment end
        const segEnd = normalized[closest.segmentIndex + 1] as [number, number];
        remaining += haversineDistanceMeters(proj[1], proj[0], segEnd[1], segEnd[0]);
        for (let i = closest.segmentIndex + 1; i < normalized.length - 1; i++) {
          const A = normalized[i] as [number, number];
          const B = normalized[i + 1] as [number, number];
          remaining += haversineDistanceMeters(A[1], A[0], B[1], B[0]);
        }

        // Clamp to total route meters to avoid spikes
        const totalMeters = totalRouteMetersRef.current || remaining;
        remaining = Math.max(0, Math.min(remaining, totalMeters));

        // Time remaining fallback: distance / max(speed, 5 km/h)
        const speedMs = (coords.speed ?? 0);
        const speedKmh = Math.max(speedMs * 3.6, 5); // cap minimum for stable ETA
        const timeSec = (remaining / 1000) / (speedKmh / 60) * 60; // km / (km/h) → h → s

        // Infer upcoming turn based on bearing change at segment boundary
        const segIdx = closest.segmentIndex;
        const segEndPt = normalized[Math.min(segIdx + 1, normalized.length - 1)] as [number, number];
        const afterIdx = Math.min(segIdx + 2, normalized.length - 1);
        const afterPt = normalized[afterIdx] as [number, number];
        const b1 = computeBearing([proj[0], proj[1]], [segEndPt[0], segEndPt[1]]);
        const b2 = computeBearing([segEndPt[0], segEndPt[1]], [afterPt[0], afterPt[1]]);
        let delta = ((b2 - b1 + 540) % 360) - 180; // normalize to [-180,180]
        const isLeft = delta < -35; // threshold degrees
        const isRight = delta > 35;

        const nextTurnDist = haversineDistanceMeters(userLoc.latitude, userLoc.longitude, segEndPt[1], segEndPt[0]);
        let nextType: 'turn-right' | 'turn-left' | 'straight' | 'arrive' = 'straight';
        if (isLeft) nextType = 'turn-left';
        else if (isRight) nextType = 'turn-right';
        else nextType = 'straight';

        // Multi-stage warnings
        let nextInstr = '';
        const distLabel = nextTurnDist < 1000 ? `${Math.round(nextTurnDist)} m` : `${(nextTurnDist/1000).toFixed(1)} km`;
        if (nextTurnDist <= 15) {
          nextInstr = nextType === 'straight' ? 'Arrive ahead' : (nextType === 'turn-left' ? 'Turn left now' : 'Turn right now');
        } else if (nextTurnDist <= TURN_WARNING_DISTANCES_M[2]) {
          nextInstr = nextType === 'straight' ? 'Continue' : `${nextType === 'turn-left' ? 'Turn left' : 'Turn right'} in ${distLabel}`;
        } else if (nextTurnDist <= TURN_WARNING_DISTANCES_M[1]) {
          nextInstr = nextType === 'straight' ? 'Continue' : `${nextType === 'turn-left' ? 'Prepare to turn left' : 'Prepare to turn right'} (${distLabel})`;
        } else if (nextTurnDist <= TURN_WARNING_DISTANCES_M[0]) {
          nextInstr = nextType === 'straight' ? 'Continue' : `${nextType === 'turn-left' ? 'In 400 m, turn left' : 'In 400 m, turn right'}`;
        } else {
          nextInstr = nextType === 'straight' ? 'Continue' : `${nextType === 'turn-left' ? 'Ahead: left turn' : 'Ahead: right turn'}`;
        }

        const distanceRemainingMeters = Math.max(0, Math.round(remaining));
        console.log('[NAV] ON_ROUTE: Updated position - distanceRemaining:', distanceRemainingMeters, 'm, totalRoute:', totalRouteMetersRef.current, 'm, position%:', ((totalRouteMetersRef.current - distanceRemainingMeters) / totalRouteMetersRef.current * 100).toFixed(1));
        
        const newSpeed = Math.round((coords.speed || 0) * 3.6);
        const newTurnDistance = Math.max(0, Math.round(nextTurnDist));
        
        setNavigationState(prev => ({
          ...prev,
          currentSpeed: newSpeed,
          userLocation: userLoc,
          heading: coords.heading || 0,
          distanceRemaining: distanceRemainingMeters, // meters
          timeRemaining: Math.max(0, Math.round(timeSec)), // seconds
          nextTurnDistance: newTurnDistance,
          nextTurnInstruction: nextInstr,
          nextTurnType: nextType,
        }));
        
        // Immediate camera update if speed, turn distance, or heading changed significantly
        // In heading-up mode, update immediately on any heading change for smooth rotation
        if (
          cameraRef.current &&
          followUserLocation &&
          normalizedRouteCoordsRef.current &&
          normalizedRouteCoordsRef.current.length > 1
        ) {
          const prevSpeed = navigationState.currentSpeed || 0;
          const prevTurnDist = navigationState.nextTurnDistance || 0;
          const prevHeading = navigationState.heading || 0;
          const newHeading = coords.heading || 0;
          
          const speedChanged = Math.abs(newSpeed - prevSpeed) > 10;
          const turnDistChanged = Math.abs(newTurnDistance - prevTurnDist) > 50;
          // In heading-up mode, update on any heading change (even small ones) for smooth rotation
          const headingChanged = mapOrientationMode === 'heading-up' 
            ? Math.abs(newHeading - prevHeading) > 5 // 5 degree threshold for heading-up
            : false;
          
          if (speedChanged || turnDistChanged || headingChanged) {
            // Immediate camera update for significant changes
            const dynamicZoom = calculateDynamicZoom(newSpeed, newTurnDistance);
            const heading = mapOrientationMode === 'heading-up' ? newHeading : 0;
            
            let cameraCenter: { latitude: number; longitude: number };
            
            if (mapOrientationMode === 'north-up') {
              // In north-up mode: center the user location in the middle of the screen
              cameraCenter = { latitude: userLoc.latitude, longitude: userLoc.longitude };
            } else {
              // In heading-up mode: position user at bottom-third, show route ahead
              const predictivePos = calculatePredictivePosition(userLoc, heading, newSpeed);
              
              if (normalizedRouteCoordsRef.current) {
                const userPoint: [number, number] = [userLoc.longitude, userLoc.latitude];
                const closest = findClosestPointOnRoute(normalizedRouteCoordsRef.current, userPoint);
                const routeCoords = normalizedRouteCoordsRef.current;
                const zoomFactor = dynamicZoom / 17;
                const screenOffsetMeters = 150 / zoomFactor;
                let aheadPoint: [number, number] | null = null;
                const proj = closest.projectedPoint;
                
                if (closest.segmentIndex + 1 < routeCoords.length) {
                  const segEnd = routeCoords[closest.segmentIndex + 1];
                  const segDist = haversineDistanceMeters(proj[1], proj[0], segEnd[1], segEnd[0]);
                  if (segDist >= screenOffsetMeters) {
                    const t = screenOffsetMeters / segDist;
                    aheadPoint = [
                      proj[0] + (segEnd[0] - proj[0]) * t,
                      proj[1] + (segEnd[1] - proj[1]) * t
                    ];
                  }
                }
                
                cameraCenter = aheadPoint 
                  ? { latitude: aheadPoint[1], longitude: aheadPoint[0] }
                  : (predictivePos || userLoc);
              } else {
                cameraCenter = userLoc;
              }
            }
            
            const dynamicPitch = dynamicZoom > 18 ? 55 : 50;
            
            (cameraRef.current as any).setCamera({
              centerCoordinate: [cameraCenter.longitude, cameraCenter.latitude],
              zoomLevel: dynamicZoom,
              pitch: dynamicPitch,
              heading: heading, // This will rotate map in heading-up mode
              animationMode: 'flyTo',
              animationDuration: headingChanged ? 400 : 600, // Faster rotation for heading changes
            });
            
            if (headingChanged) {
              console.log('[NAV] Heading changed, rotating camera:', {
                prevHeading: prevHeading.toFixed(1) + '°',
                newHeading: newHeading.toFixed(1) + '°',
                delta: (newHeading - prevHeading).toFixed(1) + '°'
              });
            }
          }
        }
      } else {
        console.warn('[NAV] ON_ROUTE: normalizedRouteCoordsRef.current is null or empty. Route coordinates:', route?.coordinates?.length || 0);
      }
    } catch (e) {
      console.warn('[NAV] ON_ROUTE update failed:', e);
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

        // Google Maps-style: fitBounds with padding 80, duration 800, then set followUserLocation = true
        if (cameraRef.current && coordinates.length > 0) {
          setTimeout(() => {
            cameraRef.current?.fitBounds(
              [coordinates[0][0], coordinates[0][1]],
              [coordinates[coordinates.length - 1][0], coordinates[coordinates.length - 1][1]],
              [80, 80, 80, 80], // Google Maps-style padding
              800 // Google Maps-style duration
            );
            
            // Re-enable follow mode after showing route
            setTimeout(() => {
              setFollowUserLocation(true);
            }, 850);
          }, 500);
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
    isRecenterInProgressRef.current = true; // Mark that we're programmatically recentering
    try {
      const loc = navigationState.userLocation;
      if (cameraRef.current && loc) {
        // Google Maps-style recenter with easeTo
        const currentSpeed = navigationState.currentSpeed || 0;
        const dynamicZoom = calculateDynamicZoom(currentSpeed, navigationState.nextTurnDistance || 0);
        const dynamicPitch = 35 + ((dynamicZoom - 14) / (19 - 14)) * (45 - 35);
        
        (cameraRef.current as any).setCamera({
          centerCoordinate: [loc.longitude, loc.latitude],
          zoomLevel: dynamicZoom,
          pitch: Math.round(dynamicPitch),
          heading: mapOrientationMode === 'heading-up' ? (navigationState.heading || 0) : 0,
          animationMode: 'easeTo', // Google Maps-style
          animationDuration: 300,
        });
        // Clear flag after animation completes
        setTimeout(() => {
          isRecenterInProgressRef.current = false;
        }, 650); // Slightly longer than animation duration
      } else {
        isRecenterInProgressRef.current = false;
      }
    } catch {
      isRecenterInProgressRef.current = false;
    }
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

  // Helper to get vibrant colors for waypoint cards based on type
  const getWaypointCardColors = (pointType: string, status: string) => {
    if (status === 'skipped') {
      return {
        cardBg: '#F5F5F5',
        iconBg: '#E0E0E0',
        iconColor: '#9CA3AF',
        borderColor: '#D1D5DB',
        accentColor: '#9CA3AF',
      };
    }
    if (status === 'completed') {
      return {
        cardBg: '#F0FDF4',
        iconBg: '#D1FAE5',
        iconColor: '#059669',
        borderColor: '#86EFAC',
        accentColor: '#10B981',
      };
    }
    
    // Vibrant colors based on point type
    const colorMap: { [key: string]: any } = {
      'gas_station': {
        cardBg: '#FFF7ED',
        iconBg: '#FFEDD5',
        iconColor: '#F97316',
        borderColor: '#FDBA74',
        accentColor: '#EA580C',
      },
      'restaurant': {
        cardBg: '#FEF2F2',
        iconBg: '#FEE2E2',
        iconColor: '#EF4444',
        borderColor: '#FCA5A5',
        accentColor: '#DC2626',
      },
      'coffee_shop': {
        cardBg: '#F5F3FF',
        iconBg: '#EDE9FE',
        iconColor: '#8B5CF6',
        borderColor: '#C4B5FD',
        accentColor: '#7C3AED',
      },
      'scenic_point': {
        cardBg: '#ECFDF5',
        iconBg: '#D1FAE5',
        iconColor: '#10B981',
        borderColor: '#86EFAC',
        accentColor: '#059669',
      },
      'rest_area': {
        cardBg: '#EFF6FF',
        iconBg: '#DBEAFE',
        iconColor: '#3B82F6',
        borderColor: '#93C5FD',
        accentColor: '#2563EB',
      },
      'hotel': {
        cardBg: '#FDF4FF',
        iconBg: '#F3E8FF',
        iconColor: '#A855F7',
        borderColor: '#C084FC',
        accentColor: '#9333EA',
      },
      'shop': {
        cardBg: '#FFFBEB',
        iconBg: '#FEF3C7',
        iconColor: '#F59E0B',
        borderColor: '#FCD34D',
        accentColor: '#D97706',
      },
    };
    
    return colorMap[pointType] || {
      cardBg: '#F0F9FF',
      iconBg: '#E0F2FE',
      iconColor: '#0EA5E9',
      borderColor: '#7DD3FC',
      accentColor: '#0284C7',
    };
  };

  // Helper to get icon for navigation waypoint type
  const getNavWaypointIcon = (pointType: string): string => {
    // For navigation waypoints, use generic navigation icons based on point type
    const iconMap: { [key: string]: string } = {
      'nav_mile': 'ellipse-outline', // Distinct icon for mile markers (small circle)
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
        [{ text: 'OK', onPress: () => {
          setNavigationPhase('ON_ROUTE');
          setFollowUserLocation(true); // Google Maps-style: always true after route start
        }}]
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
              onPress: () => {
                setNavigationPhase('ON_ROUTE');
                setFollowUserLocation(true); // Google Maps-style: always true after route start
              }
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

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate dynamic zoom level based on speed and turn distance
  const calculateDynamicZoom = (speedKmh: number, turnDistanceMeters: number): number => {
    // Google Maps-style zoom formula: 17 - (speedKmh / 50)
    // 20 km/h → 16.6, 100 km/h → 15
    let zoomBase = 17 - (speedKmh / 50);
    zoomBase = Math.max(15, Math.min(zoomBase, 18));
    
    // Turn anticipation - zoom in when approaching turns
    if (turnDistanceMeters > 0 && turnDistanceMeters < 100) {
      // Very close to turn - zoom in for precision
      zoomBase += 0.7;
    } else if (turnDistanceMeters >= 100 && turnDistanceMeters < 200) {
      // Approaching turn - slightly zoom in
      zoomBase += 0.5;
    }
    
    // Clamp zoom between 14-19 (Google Maps range)
    return Math.max(14, Math.min(19, zoomBase));
  };

  // Calculate predictive camera position (slightly ahead of user)
  const calculatePredictivePosition = (
    userLoc: { latitude: number; longitude: number },
    heading: number,
    speedKmh: number
  ): { latitude: number; longitude: number } | null => {
    if (!normalizedRouteCoordsRef.current || normalizedRouteCoordsRef.current.length < 2) {
      return null;
    }
    
    // Google Maps-style ahead distance: min(200, speed × 1.2)
    const aheadDistance = Math.min(200, speedKmh * 1.2);
    
    // Project user position forward along the route
    const userPoint: [number, number] = [userLoc.longitude, userLoc.latitude];
    const closest = findClosestPointOnRoute(normalizedRouteCoordsRef.current, userPoint);
    
    // Find point ahead along route using aheadDistance
    const routeCoords = normalizedRouteCoordsRef.current;
    let distanceAhead = 0;
    let aheadIndex = closest.segmentIndex;
    let aheadPoint: [number, number] | null = null;
    
    // Start from the projected point
    const proj = closest.projectedPoint;
    
    // Calculate distance from projected point to end of segment
    const segEnd = routeCoords[closest.segmentIndex + 1];
    if (segEnd) {
      const segDist = haversineDistanceMeters(proj[1], proj[0], segEnd[1], segEnd[0]);
      if (distanceAhead + segDist >= aheadDistance) {
        // Interpolate within this segment
        const t = (aheadDistance - distanceAhead) / segDist;
        aheadPoint = [
          proj[0] + (segEnd[0] - proj[0]) * t,
          proj[1] + (segEnd[1] - proj[1]) * t
        ];
      } else {
        distanceAhead += segDist;
        aheadIndex++;
      }
    }
    
    // Continue along route if needed
    if (!aheadPoint) {
      for (let i = aheadIndex; i < routeCoords.length - 1; i++) {
        const A = routeCoords[i];
        const B = routeCoords[i + 1];
        const segDist = haversineDistanceMeters(A[1], A[0], B[1], B[0]);
        
        if (distanceAhead + segDist >= aheadDistance) {
          const t = (aheadDistance - distanceAhead) / segDist;
          aheadPoint = [
            A[0] + (B[0] - A[0]) * t,
            A[1] + (B[1] - A[1]) * t
          ];
          break;
        }
        distanceAhead += segDist;
      }
    }
    
    // Fallback to user location if can't calculate ahead
    if (!aheadPoint) {
      return userLoc;
    }
    
    return {
      latitude: aheadPoint[1],
      longitude: aheadPoint[0]
    };
  };

  // Update camera when orientation mode changes
  useEffect(() => {
    if (cameraRef.current && followUserLocation && navigationState.userLocation) {
      const loc = navigationState.userLocation;
      const heading = mapOrientationMode === 'heading-up' ? (navigationState.heading || 0) : 0;
      
      console.log('[NAV] Orientation mode changed, updating camera:', mapOrientationMode, 'heading:', heading);
      
      // Calculate dynamic zoom and pitch (Google Maps-style)
      const dynamicZoom = calculateDynamicZoom(navigationState.currentSpeed, navigationState.nextTurnDistance);
      const dynamicPitch = 35 + ((dynamicZoom - 14) / (19 - 14)) * (45 - 35);
      
      // Update camera with new orientation
      (cameraRef.current as any).setCamera({
        centerCoordinate: [loc.longitude, loc.latitude],
        zoomLevel: dynamicZoom,
        pitch: Math.round(dynamicPitch), // Round to nearest 1°
        heading: heading,
        animationMode: 'easeTo', // Google Maps-style
        animationDuration: 300,
      });
    }
  }, [mapOrientationMode, followUserLocation]);

  // Update camera dynamically during navigation (ON_ROUTE)
  // This continuously updates camera position, zoom, and rotation based on user location
  useEffect(() => {
    console.log('[CAMERA] useEffect triggered:', {
      navigationPhase,
      followUserLocation,
      hasCameraRef: !!cameraRef.current,
      hasUserLocation: !!navigationState.userLocation,
      hasRouteCoords: !!normalizedRouteCoordsRef.current,
      mapOrientationMode
    });

    if (navigationPhase !== 'ON_ROUTE') {
      console.log('[CAMERA] Not ON_ROUTE, skipping. Phase:', navigationPhase);
      return;
    }

    if (!cameraRef.current) {
      console.warn('[CAMERA] cameraRef.current is null, cannot update camera');
      return;
    }

    let isActive = true;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL_MS = 250; // Google Maps-style: 250ms for smooth, responsive updates

    const updateCamera = () => {
      // Check if we should still update
      if (!isActive) {
        return;
      }

      if (!cameraRef.current) {
        console.warn('[CAMERA] cameraRef.current is null in updateCamera');
        return;
      }

      // During ON_ROUTE navigation, always update camera to follow user movement
      // (followUserLocation can be false if user manually moved map, but we still want camera updates during navigation)

      // Get fresh state values (not from closure)
      const currentLocation = navigationState.userLocation;
      const currentSpeed = navigationState.currentSpeed || 0;
      const currentTurnDistance = navigationState.nextTurnDistance || 0;
      const currentHeading = navigationState.heading || 0;
      const routeCoords = normalizedRouteCoordsRef.current;

      if (!currentLocation) {
        console.warn('[CAMERA] No user location available');
        return;
      }

      if (!routeCoords || routeCoords.length < 2) {
        console.warn('[CAMERA] No route coordinates available');
        return;
      }

      // Calculate dynamic zoom based on speed and turn distance
      const dynamicZoom = calculateDynamicZoom(currentSpeed, currentTurnDistance);
      
      // Determine heading based on orientation mode
      const heading = mapOrientationMode === 'heading-up' ? currentHeading : 0;
      
      // Calculate camera center position
      let cameraCenter: { latitude: number; longitude: number };
      
      if (mapOrientationMode === 'north-up') {
        // North-up: center user location in middle of screen
        cameraCenter = { 
          latitude: currentLocation.latitude, 
          longitude: currentLocation.longitude 
        };
      } else {
        // Heading-up: position user at bottom-third, route extending upward
        // Google Maps-style: center = ahead point computed forward along route
        const userPoint: [number, number] = [currentLocation.longitude, currentLocation.latitude];
        const closest = findClosestPointOnRoute(routeCoords, userPoint);
        
        // Google Maps-style ahead distance: min(200, speed × 1.2)
        const aheadDistance = Math.min(200, currentSpeed * 1.2);
        
        // Find point ahead along route for camera center
        let aheadPoint: [number, number] | null = null;
        const proj = closest.projectedPoint;
        let distanceAhead = 0;
        
        if (closest.segmentIndex + 1 < routeCoords.length) {
          const segEnd = routeCoords[closest.segmentIndex + 1];
          const segDist = haversineDistanceMeters(proj[1], proj[0], segEnd[1], segEnd[0]);
          
          if (segDist >= aheadDistance) {
            const t = aheadDistance / segDist;
            aheadPoint = [
              proj[0] + (segEnd[0] - proj[0]) * t,
              proj[1] + (segEnd[1] - proj[1]) * t
            ];
          } else {
            distanceAhead = segDist;
            for (let i = closest.segmentIndex + 1; i < routeCoords.length - 1; i++) {
              const A = routeCoords[i];
              const B = routeCoords[i + 1];
              const segDist = haversineDistanceMeters(A[1], A[0], B[1], B[0]);
              
              if (distanceAhead + segDist >= aheadDistance) {
                const t = (aheadDistance - distanceAhead) / segDist;
                aheadPoint = [
                  A[0] + (B[0] - A[0]) * t,
                  A[1] + (B[1] - A[1]) * t
                ];
                break;
              }
              distanceAhead += segDist;
            }
          }
        }
        
        // Fallback: use predictive position if we can't find ahead point
        const predictivePos = calculatePredictivePosition(currentLocation, heading, currentSpeed);
        cameraCenter = aheadPoint 
          ? { latitude: aheadPoint[1], longitude: aheadPoint[0] }
          : (predictivePos || currentLocation);
      }
      
      // Google Maps-style dynamic pitch: map(zoomLevel, 14, 19, 35, 45)
      const dynamicPitch = 35 + ((dynamicZoom - 14) / (19 - 14)) * (45 - 35);
      
      // Google Maps-style camera update with easing
      try {
        // Determine animation duration: 250-350ms (longer for big jumps)
        const lastCenter = lastUpdateTime > 0 ? cameraCenter : null;
        const distanceChange = lastCenter 
          ? haversineDistanceMeters(
              lastCenter.latitude, lastCenter.longitude,
              cameraCenter.latitude, cameraCenter.longitude
            )
          : 0;
        const animationDuration = distanceChange > 100 ? 350 : 300; // 350ms for big jumps, 300ms normal
        
        (cameraRef.current as any).setCamera({
          centerCoordinate: [cameraCenter.longitude, cameraCenter.latitude],
          zoomLevel: dynamicZoom,
          pitch: Math.round(dynamicPitch), // Round to nearest 1° to prevent flickers
          heading: heading,
          animationMode: 'easeTo', // Google Maps-style: natural, linear movement
          animationDuration: animationDuration,
        });
        
        lastUpdateTime = Date.now();
        console.log('[CAMERA] Camera updated successfully:', {
          center: [cameraCenter.longitude.toFixed(6), cameraCenter.latitude.toFixed(6)],
          zoom: dynamicZoom.toFixed(2),
          pitch: dynamicPitch,
          heading: heading.toFixed(1),
          mode: mapOrientationMode,
          speed: currentSpeed.toFixed(1) + ' km/h'
        });
      } catch (error) {
        console.warn('[CAMERA] Camera update failed:', error);
      }
    };

    // Initial update
    console.log('[CAMERA] Setting up camera updates, initial update...');
    updateCamera();

    // Set up continuous updates
    console.log('[CAMERA] Starting interval updates every', UPDATE_INTERVAL_MS, 'ms');
    const intervalId = setInterval(() => {
      updateCamera();
    }, UPDATE_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [
    navigationPhase,
    followUserLocation,
    mapOrientationMode,
    routeCoordsReady, // Trigger when route coordinates become available
    // These dependencies trigger re-evaluation but values are read fresh in updateCamera
    navigationState.userLocation?.latitude,
    navigationState.userLocation?.longitude,
    navigationState.currentSpeed,
    navigationState.nextTurnDistance,
    navigationState.heading,
  ]);

  // Animate major waypoints modal
  useEffect(() => {
    if (showMajorWaypointsModal) {
      // Reset card animations
      majorPoints.forEach(point => {
        if (!majorWaypointsCardAnims[point.id]) {
          majorWaypointsCardAnims[point.id] = new Animated.Value(0);
        } else {
          majorWaypointsCardAnims[point.id].setValue(0);
        }
      });

      // Animate overlay fade-in and modal slide-up
      Animated.parallel([
        Animated.timing(majorWaypointsModalOpacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(majorWaypointsModalSlideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();

      // Stagger card animations
      majorPoints.forEach((point, index) => {
        if (!majorWaypointsCardAnims[point.id]) {
          majorWaypointsCardAnims[point.id] = new Animated.Value(0);
        }
        Animated.timing(majorWaypointsCardAnims[point.id], {
          toValue: 1,
          duration: 300,
          delay: 100 + (index * 50),
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Animate modal close
      Animated.parallel([
        Animated.timing(majorWaypointsModalOpacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(majorWaypointsModalSlideAnim, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showMajorWaypointsModal]);

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
  // Use normalized coordinates if available, otherwise use raw route coordinates
  const routeCoordsForGeoJSON = normalizedRouteCoordsRef.current && normalizedRouteCoordsRef.current.length > 0
    ? normalizedRouteCoordsRef.current
    : (route.coordinates.length > 0 
        ? (route.coordinates as Array<[number, number]>).map(ensureLngLat)
        : [[0, 0], [0, 0]]);
  
  const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: routeCoordsForGeoJSON,
    },
  };

  // Build GeoJSON for major points (no hook to maintain stable hook order)
  const majorPointsGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: (majorPoints || []).map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        name: p.name,
        point_type: p.point_type,
        status: p.status,
        isSkipped: skippedWaypointIds.has(p.id) ? 1 : 0, // Add skipped flag for Mapbox expressions
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lon, p.lat],
      },
    })) as GeoJSON.Feature<GeoJSON.Point>[],
  };

  // GeoJSON for generated navigation mile waypoints
  const navWaypointsGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: (navigationWaypoints || []).map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        name: p.name,
        point_type: p.point_type,
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lon, p.lat],
      },
    })) as GeoJSON.Feature<GeoJSON.Point>[],
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Mapbox Map - Full Screen */}
      <View style={styles.mapContainer}>
      <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        compassEnabled={true}
        compassViewPosition={3}
        logoEnabled={false}
        attributionEnabled={false}
        onRegionIsChanging={(e: any) => {
          // Ignore region changes during programmatic recenter
          if (isRecenterInProgressRef.current) {
            return;
          }
          // If the user manually pans/zooms/rotates, stop following
          try {
            const isUser = e?.properties?.isUserInteraction ?? true;
            const now = Date.now();
            if (isUser) lastRegionUserMsRef.current = now;
            if (isUser && followUserLocation) {
              // Debounce: only disable follow if interaction sustained
              if (now - lastRegionUserMsRef.current < 150) return;
              console.log('[NAV] User interaction detected → disabling follow');
              setFollowUserLocation(false);
            }
          } catch {
            // Fallback: disable follow on any region change (only if not recentering)
            if (followUserLocation) setFollowUserLocation(false);
          }
        }}
      >
        {/* Register category icons for major points (simple 3D-like PNGs) */}
        <MapboxGL.Images
          images={{
            // Pin-styled icons (appear 3D-ish and hover from the location)
            'pin-gas': { uri: 'https://img.icons8.com/color/96/gas-pump--v1.png' },
            'pin-food': { uri: 'https://img.icons8.com/color/96/restaurant--v1.png' },
            'pin-coffee': { uri: 'https://img.icons8.com/color/96/cafe--v1.png' },
            'pin-scenic': { uri: 'https://img.icons8.com/color/96/landscape.png' },
            'pin-rest': { uri: 'https://img.icons8.com/color/96/bench-press.png' },
            'pin-hotel': { uri: 'https://img.icons8.com/color/96/hotel-information.png' },
            'pin-shop': { uri: 'https://img.icons8.com/color/96/shop.png' },
            'pin-unknown': { uri: 'https://img.icons8.com/color/96/marker.png' },
            'pin-custom': { uri: 'https://img.icons8.com/color/96/marker.png' },

            // Flat glyph icons to place INSIDE circles (cleaner than pins)
            'glyph-gas': { uri: 'https://img.icons8.com/fluency/96/gas-station.png' },
            'glyph-food': { uri: 'https://img.icons8.com/color/96/meal.png' },
            'glyph-coffee': { uri: 'https://img.icons8.com/color/96/coffee.png' },
            'glyph-scenic': { uri: 'https://img.icons8.com/fluency/96/trees.png' },
            'glyph-rest': { uri: 'https://img.icons8.com/color/96/bench.png' },
            'glyph-hotel': { uri: 'https://img.icons8.com/color/96/hotel-bed.png' },
            'glyph-shop': { uri: 'https://img.icons8.com/color/96/shopping-bag.png' },
            'glyph-unknown': { uri: 'https://img.icons8.com/color/96/marker.png' },
            'glyph-custom': { uri: 'https://img.icons8.com/color/96/marker.png' },
          }}
        />
        <MapboxGL.Camera
          ref={cameraRef}
          // Disable automatic following - we'll control camera manually via setCamera()
          // This prevents conflicts between automatic following and manual setCamera() calls
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
          <MapboxGL.ShapeSource 
            id="routeSource" 
            shape={routeGeoJSON}
          >
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

        {/* Generated Navigation Waypoints (every mile) - only show when toggle is active */}
        {showMileWaypoints && navigationWaypoints.length > 0 && (
          <MapboxGL.ShapeSource id="navMileWaypointsSource" shape={navWaypointsGeoJSON}>
            <MapboxGL.CircleLayer
              id="navMileWaypointsCircle"
              aboveLayerID="routeLine"
              style={{
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  12, 3.0,
                  15, 4.0,
                  17, 5.0,
                ],
                circleColor: '#FFFFFF',
                circleStrokeColor: '#9AA0A6',
                circleStrokeWidth: 1,
                circleOpacity: 0.95,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Major waypoints moved to bottom to guarantee draw order above routes */}



        {/* Destination Marker */}
        {route && route.coordinates && route.coordinates.length > 1 && (
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

        {/* Destination marker assets */}
        <MapboxGL.Images
          images={{
            'dest-pin': { uri: 'https://img.icons8.com/color/96/marker.png' },
            'start-pin': { uri: 'https://img.icons8.com/color/96/flag-2.png' },
          }}
        />

        {/* Major Waypoints on Route - render last to ensure above polylines */}
        {majorPointsGeoJSON.features.length > 0 && (
          <MapboxGL.ShapeSource
            id="majorPointsSource"
            shape={majorPointsGeoJSON}
            onPress={(e) => {
              const feat = e.features?.[0];
              if (feat && feat.properties) {
                const waypointId = feat.properties.id;
                console.log('[MAP] Major point pressed:', feat.properties);
                handleWaypointPress(waypointId);
              }
            }}
          >
            <MapboxGL.CircleLayer
              id="majorPointsCircle"
              aboveLayerID="routeLine"
              style={{
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  12, 8.5,
                  15, 11.0,
                  17, 13.0,
                ],
                circleColor: '#FFFFFF',
                circleStrokeColor: [
                  'case',
                  ['==', ['get', 'isSkipped'], 1],
                  '#9AA0A6', // Gray for skipped waypoints
                  '#202124', // Default dark color
                ],
                circleStrokeWidth: 1.4,
                circleOpacity: [
                  'case',
                  ['==', ['get', 'isSkipped'], 1],
                  0.6, // Reduced opacity for skipped waypoints
                  0.95,
                ],
              }}
            />
            <MapboxGL.SymbolLayer
              id="majorPointsLayer"
              aboveLayerID="majorPointsCircle"
              style={{
                iconImage: [
                  'match',
                  ['get', 'point_type'],
                  'gas_station', 'glyph-gas',
                  'restaurant', 'glyph-food',
                  'coffee_shop', 'glyph-coffee',
                  'scenic_point', 'glyph-scenic',
                  'rest_area', 'glyph-rest',
                  'hotel', 'glyph-hotel',
                  'shop', 'glyph-shop',
                  'unknown', 'glyph-unknown',
                  'glyph-custom',
                ],
                iconSize: [
                  'interpolate', ['linear'], ['zoom'],
                  12, 0.24,
                  15, 0.32,
                  17, 0.40,
                ],
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
                iconAnchor: 'center',
                iconOffset: [0, 0],
                iconPitchAlignment: 'viewport',
                symbolZOrder: 'source',
                iconOpacity: [
                  'case',
                  ['==', ['get', 'isSkipped'], 1],
                  0.4, // Reduced opacity for skipped waypoints
                  1,
                ],
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Destination Marker (rendered last to stay on top) */}
        {route && route.coordinates && route.coordinates.length > 1 && (
          <MapboxGL.ShapeSource
            key={`dest-${route.coordinates[route.coordinates.length - 1][0]}-${route.coordinates[route.coordinates.length - 1][1]}`}
            id="destinationSource"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: route.coordinates[route.coordinates.length - 1],
              },
            }}
          >
            <MapboxGL.SymbolLayer
              id="destinationLayer"
              aboveLayerID="routeLine"
              style={{
                iconImage: 'dest-pin',
                iconSize: [
                  'interpolate', ['linear'], ['zoom'],
                  12, 0.38,
                  15, 0.48,
                  17, 0.58,
                ],
                iconAnchor: 'bottom',
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
                iconPitchAlignment: 'viewport',
                symbolZOrder: 'source',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Start Marker (rendered VERY LAST to be above everything - major waypoints, destination, etc.) */}
        {route && route.coordinates && route.coordinates.length > 0 && (
          <MapboxGL.PointAnnotation
            id="startPoint"
            coordinate={route.coordinates[0]}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.startPointMarker}>
              <View style={styles.startPointPin}>
                <Ionicons name="flag" size={20} color="#FFFFFF" />
              </View>
            </View>
          </MapboxGL.PointAnnotation>
        )}

      </MapboxGL.MapView>
      </View>

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

      {/* Top Turn Card */}
      {navigationPhase === 'TO_START' && (
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
      )}

      {/* New ON_ROUTE Navigation Card (simple, robust) */}
      {navigationPhase === 'ON_ROUTE' && (
        <SafeAreaView style={styles.topContainer}>
          <View style={styles.onRouteCard}>
            <View style={styles.onRouteIconBox}>
              <Ionicons name={getTurnIcon(navigationState.nextTurnType)} size={28} color="#202124" />
            </View>
            <View style={styles.onRouteInfo}>
              <Text style={styles.onRoutePrimary} numberOfLines={1}>
                {navigationState.nextTurnInstruction || 'Continue straight'}
              </Text>
              <View style={styles.onRouteRow}>
                <Text style={styles.onRouteMeta}>
                  {navigationState.nextTurnDistance < 1000
                    ? `${Math.round(navigationState.nextTurnDistance)} m`
                    : `${(navigationState.nextTurnDistance/1000).toFixed(1)} km`}
                </Text>
                <View style={styles.dot} />
                <Text style={styles.onRouteMeta}>
                  {Math.max(1, Math.round((navigationState.timeRemaining||0)/60))} min
                </Text>
                <View style={styles.dot} />
                <Text style={styles.onRouteMeta}>
                  {navigationState.distanceRemaining < 1000
                    ? `${Math.round(navigationState.distanceRemaining)} m`
                    : `${(navigationState.distanceRemaining/1000).toFixed(1)} km`}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      )}

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
                          
                          // Google Maps-style: fitBounds with padding 80, duration 800, then set followUserLocation = true
                          if (cameraRef.current && route && route.coordinates.length > 1) {
                            console.log('[NAV] Zooming to show full route');
                            setTimeout(() => {
                              const coords = route.coordinates;
                              cameraRef.current?.fitBounds(
                                [coords[0][0], coords[0][1]], // Start point
                                [coords[coords.length - 1][0], coords[coords.length - 1][1]], // End point
                                [80, 80, 80, 80], // Google Maps-style padding
                                800 // Google Maps-style duration
                              );
                              
                              // Re-enable follow mode after showing route
                              setTimeout(() => {
                                setFollowUserLocation(true);
                              }, 850);
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


      {/* Google Maps Style - Bottom Actions */}
      <View style={styles.bottomActionsContainer}>
        {/* Direction Toggle - moved here (swap with speed) */}
        <TouchableOpacity
          style={[
            styles.directionToggleButton,
            mapOrientationMode === 'heading-up' && styles.directionToggleButtonActive
          ]}
          onPress={() => {
            console.log('[NAV] Toggling orientation mode, current:', mapOrientationMode);
            const newMode = mapOrientationMode === 'north-up' ? 'heading-up' : 'north-up';
            setMapOrientationMode(newMode);
            // Force camera update immediately
            if (cameraRef.current && navigationState.userLocation) {
              const loc = navigationState.userLocation;
              const heading = newMode === 'heading-up' ? (navigationState.heading || 0) : 0;
              (cameraRef.current as any).setCamera({
                centerCoordinate: [loc.longitude, loc.latitude],
                zoomLevel: calculateDynamicZoom(navigationState.currentSpeed || 0, navigationState.nextTurnDistance || 0),
                pitch: Math.round(35 + ((calculateDynamicZoom(navigationState.currentSpeed || 0, navigationState.nextTurnDistance || 0) - 14) / (19 - 14)) * (45 - 35)),
                heading,
                animationMode: 'easeTo',
                animationDuration: 300,
              });
            }
            if (followUserLocation) {
              setFollowUserLocation(false);
              setTimeout(() => setFollowUserLocation(true), 200);
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons 
            name={mapOrientationMode === 'heading-up' ? 'navigate' : 'compass'} 
            size={22} 
            color={mapOrientationMode === 'heading-up' ? '#4285F4' : '#5f6368'} 
          />
        </TouchableOpacity>

        {/* Toggle 1 mile waypoints */}
        <TouchableOpacity
          style={[
            styles.generateWpsButton,
            showMileWaypoints && styles.generateWpsButtonActive
          ]}
          onPress={handleToggleMileWaypoints}
          activeOpacity={0.8}
        >
          <Ionicons 
            name={showMileWaypoints ? "flag" : "flag-outline"} 
            size={18} 
            color={showMileWaypoints ? "#4285F4" : "#202124"} 
          />
          <Text style={[
            styles.generateWpsText,
            showMileWaypoints && styles.generateWpsTextActive
          ]}>
            {loadingNavigationWaypoints ? '…' : '1 mi'}
          </Text>
        </TouchableOpacity>

        {/* Manage Waypoints Button removed */}

        {/* Recenter Button - Only show when not following */}
        {!followUserLocation && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={24} color="#5f6368" />
        </TouchableOpacity>
        )}
      </View>

      {/* Waypoint Action Sheet - Centered card design */}
      {showWaypointActionSheet && selectedWaypoint && (
        <View style={styles.actionCardOverlay}>
          <View style={styles.actionCard}>
            <View style={styles.actionCardHeader}>
              <View style={styles.actionCardIconContainer}>
                <Ionicons
                  name={getPointIcon(selectedWaypoint.point_type) as any}
                  size={24}
                  color={skippedWaypointIds.has(selectedWaypoint.id) ? "#9AA0A6" : "#5f6368"}
                />
            </View>
              <View style={styles.actionCardTitleContainer}>
                <Text style={styles.actionCardTitle} numberOfLines={2}>
                  {selectedWaypoint.name}
              </Text>
                <Text style={styles.actionCardSubtitle}>
                  {(selectedWaypoint.distance_from_start / 1000).toFixed(1)} km away
                  </Text>
            </View>
              <TouchableOpacity
                style={styles.actionCardClose}
                onPress={() => setShowWaypointActionSheet(false)}
              >
                <Ionicons name="close" size={20} color="#5f6368" />
              </TouchableOpacity>
          </View>

            <TouchableOpacity
                style={[
                styles.actionCardButton,
                skippedWaypointIds.has(selectedWaypoint.id) && styles.actionCardButtonInclude
              ]}
              activeOpacity={0.8}
              onPress={() => {
                handleToggleSkipWaypoint(selectedWaypoint.id);
                setShowWaypointActionSheet(false);
              }}
            >
              <Ionicons
                name={skippedWaypointIds.has(selectedWaypoint.id) ? "checkmark-circle" : "close-circle"}
                size={22}
                color={skippedWaypointIds.has(selectedWaypoint.id) ? "#34A853" : "#EA4335"}
              />
              <Text style={[
                styles.actionCardButtonText,
                skippedWaypointIds.has(selectedWaypoint.id) && styles.actionCardButtonTextInclude
              ]}>
                {skippedWaypointIds.has(selectedWaypoint.id) ? 'Include Waypoint' : 'Skip Waypoint'}
            </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Waypoint Management Modal - Shown when long-pressing route line */}
      <Modal
        visible={showWaypointManagementModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWaypointManagementModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.managementModalContainer}>
            <View style={styles.managementModalHeader}>
              <Text style={styles.managementModalTitle}>Manage Waypoints</Text>
              <TouchableOpacity
                onPress={() => setShowWaypointManagementModal(false)}
                style={styles.managementModalCloseButton}
              >
                <Ionicons name="close" size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            
            <ScrollView
              style={styles.managementModalContent}
              showsVerticalScrollIndicator={true}
            >
              {/* Combine all waypoints */}
              {(() => {
                const routeCoords = (route?.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 1)
                  ? route.coordinates as Array<[number, number]>
                  : null;
                
                const allWaypoints = [
                  ...majorPoints.map(p => ({
                    ...p,
                    isMajor: true,
                    distance_from_start: routeCoords
                      ? calculateDistanceFromRouteStart(p.lat, p.lon, routeCoords)
                      : p.distance_from_start || 0
                  })),
                  ...(showMileWaypoints ? navigationWaypoints.map((p: any) => ({
                    ...p,
                    isMajor: false,
                    point_type: p.point_type || 'nav_mile',
                    distance_from_start: routeCoords
                      ? calculateDistanceFromRouteStart(p.lat, p.lon, routeCoords)
                      : p.distance_from_start || 0
                  })) : [])
                ].sort((a, b) => b.distance_from_start - a.distance_from_start);
                
                return allWaypoints.map((point: any) => {
                  const isSkipped = skippedWaypointIds.has(point.id);
                  const isCompleted = point.status === 'completed';
                  
                  return (
                    <TouchableOpacity
                      key={point.id}
                      style={[
                        styles.managementWaypointItem,
                        isSkipped && styles.managementWaypointItemSkipped
                      ]}
                      onPress={() => handleToggleSkipWaypoint(point.id)}
                    >
                      <View style={styles.managementWaypointIconContainer}>
                        <Ionicons
                          name={point.isMajor
                            ? getPointIcon(point.point_type) as any
                            : getNavWaypointIcon(point.point_type) as any
                          }
                          size={20}
                          color={isSkipped ? "#9AA0A6" : isCompleted ? "#34A853" : point.isMajor ? "#5f6368" : "#B0BEC5"}
                        />
                      </View>
                      <View style={styles.managementWaypointTextContainer}>
                        <Text
                          style={[
                            styles.managementWaypointName,
                            isSkipped && styles.managementWaypointNameSkipped
                          ]}
                          numberOfLines={2}
                        >
                          {point.name}
                        </Text>
                        <Text style={styles.managementWaypointDistance}>
                          {(point.distance_from_start / 1000).toFixed(1)} km
                        </Text>
                      </View>
                      <View style={styles.managementWaypointToggleContainer}>
                        <Ionicons
                          name={isSkipped ? "checkbox-outline" : "checkbox"}
                          size={24}
                          color={isSkipped ? "#9AA0A6" : "#4285F4"}
                        />
                  <Text style={[
                          styles.managementWaypointToggleText,
                          isSkipped && styles.managementWaypointToggleTextSkipped
                  ]}>
                          {isSkipped ? "Skipped" : "Active"}
                  </Text>
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Major Waypoints Modal - Shows all major waypoints as cards */}
      <Modal
        visible={showMajorWaypointsModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowMajorWaypointsModal(false)}
      >
        <Animated.View 
          style={[
            styles.majorWaypointsModalOverlay,
            {
              opacity: majorWaypointsModalOpacityAnim,
            }
          ]}
        >
          <Animated.View 
            style={[
              styles.majorWaypointsModalContainer,
              {
                transform: [{ translateY: majorWaypointsModalSlideAnim }],
              }
            ]}
          >
            {/* Header */}
            <View style={styles.majorWaypointsModalHeader}>
              <Text style={styles.majorWaypointsModalTitle}>Major Waypoints</Text>
              <TouchableOpacity
                onPress={() => setShowMajorWaypointsModal(false)}
                style={styles.majorWaypointsModalCloseButton}
              >
                <Ionicons name="close" size={20} color="#5f6368" />
              </TouchableOpacity>
            </View>
            
            {/* Waypoints List */}
            <ScrollView
              style={styles.majorWaypointsModalContent}
              showsVerticalScrollIndicator={true}
            >
              {majorPoints.length === 0 ? (
                <View style={styles.majorWaypointsEmptyContainer}>
                  <Ionicons name="location-outline" size={48} color="#9AA0A6" />
                  <Text style={styles.majorWaypointsEmptyText}>No major waypoints available</Text>
                </View>
              ) : (
                majorPoints
                  .sort((a, b) => (a.distance_from_start || 0) - (b.distance_from_start || 0))
                  .map((point, index) => {
                    const isSkipped = skippedWaypointIds.has(point.id);
                    const isCompleted = point.status === 'completed';
                    const isApproaching = point.status === 'approaching';
                    
                    // Initialize animation value if not exists
                    if (!majorWaypointsCardAnims[point.id]) {
                      majorWaypointsCardAnims[point.id] = new Animated.Value(0);
                    }
                    
                    const cardOpacity = majorWaypointsCardAnims[point.id] || new Animated.Value(0);
                    const cardTranslateY = majorWaypointsCardAnims[point.id]?.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }) || new Animated.Value(0);
                    
                    return (
                      <Animated.View
                        key={point.id}
                        style={{
                          opacity: cardOpacity,
                          transform: [{ translateY: cardTranslateY }],
                        }}
                      >
                        <TouchableOpacity
                          style={[
                            styles.majorWaypointCard,
                            isSkipped && styles.majorWaypointCardSkipped,
                            { 
                              backgroundColor: getWaypointCardColors(point.point_type, point.status).cardBg,
                              borderColor: getWaypointCardColors(point.point_type, point.status).borderColor,
                            }
                          ]}
                          onPress={() => {
                            setSelectedWaypoint(point);
                            setShowMajorWaypointsModal(false);
                            setShowWaypointActionSheet(true);
                          }}
                          activeOpacity={0.7}
                        >
                        <View style={styles.majorWaypointCardContent}>
                          {/* Left Icon */}
                          <View style={[
                            styles.majorWaypointIconContainer,
                            {
                              backgroundColor: getWaypointCardColors(point.point_type, point.status).iconBg,
                              borderColor: getWaypointCardColors(point.point_type, point.status).accentColor,
                            }
                          ]}>
                            <Ionicons
                              name={getPointIcon(point.point_type) as any}
                              size={30}
                              color={getWaypointCardColors(point.point_type, point.status).iconColor}
                            />
                          </View>
                          
                          {/* Main Content */}
                          <View style={styles.majorWaypointCardMain}>
                            {/* Title */}
                            <Text style={[
                              styles.majorWaypointCardTitle,
                              isSkipped && styles.majorWaypointCardTitleSkipped,
                            ]} numberOfLines={1}>
                              {point.name}
              </Text>
                            
                            {/* Distance and Time Row */}
                            <View style={styles.majorWaypointCardTimeRow}>
                              <Text style={styles.majorWaypointCardTimeText}>
                                ⏰ {(() => {
                                  // Calculate remaining distance from current position
                                  let remainingDistanceKm = 0;
                                  
                                  if (navigationPhase === 'ON_ROUTE' && navigationState.userLocation) {
                                    // Calculate distance traveled from start (in meters)
                                    const totalRouteMeters = totalRouteMetersRef.current || 0;
                                    const distanceRemainingMeters = navigationState.distanceRemaining || 0;
                                    const distanceTraveledMeters = Math.max(0, totalRouteMeters - distanceRemainingMeters);
                                    
                                    // Waypoint distance from start (in meters)
                                    const waypointDistanceMeters = (point.distance_from_start || 0) * 1000;
                                    
                                    // Remaining distance to waypoint (in meters)
                                    const remainingDistanceMeters = Math.max(0, waypointDistanceMeters - distanceTraveledMeters);
                                    remainingDistanceKm = remainingDistanceMeters / 1000;
                                  } else {
                                    // For TO_START phase, show distance from start
                                    remainingDistanceKm = point.distance_from_start || 0;
                                  }
                                  
                                  const distanceMi = remainingDistanceKm * 0.621371;
                                  const currentSpeedKmh = navigationState.currentSpeed || 30;
                                  const minSpeed = 5;
                                  const speedToUse = Math.max(currentSpeedKmh, minSpeed);
                                  const timeMinutes = remainingDistanceKm > 0 ? Math.round((remainingDistanceKm / speedToUse) * 60) : 0;
                                  
                                  if (remainingDistanceKm <= 0) {
                                    return 'Passed';
                                  }
                                  return `${distanceMi.toFixed(1)} mi | ${timeMinutes} min`;
                                })()}
                  </Text>
            </View>
                            
                            {/* Distance from Start (for reference) */}
                            <View style={styles.majorWaypointCardDistanceRow}>
                              <Text style={styles.majorWaypointCardDistanceText}>
                                📍 {(() => {
                                  const distanceKm = point.distance_from_start || 0;
                                  const distanceMi = distanceKm * 0.621371;
                                  return `${distanceMi.toFixed(1)} mi from start`;
                                })()}
                              </Text>
            </View>
                            
                            {/* Status Text - Only show for skipped/completed */}
                            {(isSkipped || isCompleted) && (
                              <Text style={[
                                styles.majorWaypointCardStatus,
                                isSkipped && styles.majorWaypointCardStatusSkipped,
                                isCompleted && styles.majorWaypointCardStatusCompleted,
                              ]}>
                                {isSkipped ? 'Skipped' : 'Completed'}
                              </Text>
                            )}
            </View>
                          
                          {/* Right Skip Button */}
                          <TouchableOpacity
                            style={[
                              styles.majorWaypointSkipButton,
                              isSkipped && styles.majorWaypointSkipButtonActive
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleToggleSkipWaypoint(point.id);
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons 
                              name={isSkipped ? "checkmark-circle" : "close-circle-outline"} 
                              size={22} 
                              color={isSkipped ? "#059669" : "#6B7280"} 
                            />
                            <Text style={[
                              styles.majorWaypointSkipButtonText,
                              isSkipped && styles.majorWaypointSkipButtonTextActive
                            ]}>
                              {isSkipped ? 'Unskip' : 'Skip'}
              </Text>
                          </TouchableOpacity>
            </View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })
              )}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Direction Toggle Button - Above bottom bar, right side */}
      {navigationPhase === 'ON_ROUTE' && (
        <View
          style={[
            styles.directionToggleButtonAboveBar,
          ]}
        >
          {/* Speed Display - moved here (swap with direction toggle) */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.speedNumber}>{navigationState.currentSpeed}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
        </View>
      )}

      {/* Bottom Navigation Bar - Only show when ON_ROUTE */}
      {navigationPhase === 'ON_ROUTE' && (
        <View style={styles.bottomBar}>
          {/* Search Button */}
        <TouchableOpacity
            style={styles.bottomBarButton}
            onPress={() => {
              // TODO: Implement search functionality
              console.log('Search pressed');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={24} color="#000" />
        </TouchableOpacity>

          {/* Time Section */}
          <View style={styles.timeSection}>
            <Text style={styles.currentTime}>
              {currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              })}
            </Text>
            {(() => {
              // Find next upcoming major stop (not completed or skipped)
              const nextMajorStop = majorPoints
                .filter(p => p.status === 'upcoming' && !skippedWaypointIds.has(p.id))
                .sort((a, b) => (a.distance_from_start || 0) - (b.distance_from_start || 0))[0];
              
              if (!nextMajorStop) return null;
              
              return (
                <View style={styles.nextStopInfo}>
                  <Text style={styles.nextStopText}>
                    {(() => {
                      // Calculate time based on distance and current speed
                      const distanceKm = nextMajorStop.distance_from_start || 0;
                      const currentSpeedKmh = navigationState.currentSpeed || 30; // Default 30 km/h if no speed
                      const minSpeed = 5; // Minimum speed for calculation
                      const speedToUse = Math.max(currentSpeedKmh, minSpeed);
                      
                      if (distanceKm <= 0) return '—';
                      
                      // Calculate time in minutes
                      const timeMinutes = Math.round((distanceKm / speedToUse) * 60);
                      
                      if (timeMinutes < 60) return `${timeMinutes}m`;
                      const hours = Math.floor(timeMinutes / 60);
                      const mins = timeMinutes % 60;
                      return `${hours}h ${mins}m`;
                    })()}
                  </Text>
                  <Text style={styles.nextStopDistance}>
                    {nextMajorStop.distance_from_start ? `${(nextMajorStop.distance_from_start / 1000).toFixed(1)} km` : '—'}
                  </Text>
      </View>
              );
            })()}
        </View>

          {/* Directions Button (Y-shaped navigation icon) */}
        <TouchableOpacity
            style={styles.bottomBarButton}
            onPress={() => setShowMajorWaypointsModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="git-branch" size={24} color="#000" />
        </TouchableOpacity>
      </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  longPressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 0, // Below all other elements but can detect gestures
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

  // New ON_ROUTE card styles
  onRouteCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 68,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  onRouteIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  onRouteInfo: {
    flex: 1,
  },
  onRoutePrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
  },
  onRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  onRouteMeta: {
    fontSize: 13,
    color: '#5f6368',
  },

  // Bottom Actions (Google Style)
  bottomActionsContainer: {
    position: 'absolute',
    bottom: 80, // Moved up from 40 to 60
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
    elevation: 4,
    minWidth: 65,
  },
  speedNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  speedUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 1,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  
  // Manage Waypoints Button
  manageWaypointsButton: {
    backgroundColor: '#FFFFFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginHorizontal: 6,
  },
  
  // Direction Toggle Button (in bottom actions)
  directionToggleButton: {
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // Direction Toggle Button (above bottom bar) - Now used for Speed Display
  directionToggleButtonAboveBar: {
    position: 'absolute',
    bottom: 117, // Above the bottom bar (bar height ~80px + padding)
    left: 16,
    minWidth: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    zIndex: 10,
  },
  directionToggleButtonActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#4285F4',
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

  // Generate waypoints button
  generateWpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  generateWpsText: {
    fontSize: 13,
    color: '#202124',
    fontWeight: '600',
  },
  generateWpsButtonActive: {
    backgroundColor: '#E8F0FE',
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  generateWpsTextActive: {
    color: '#4285F4',
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
  
  waypointSectionSkipped: {
    opacity: 0.6,
  },
  waypointIconContainerSkipped: {
    backgroundColor: '#F5F5F5',
  },
  waypointStatusSkipped: {
    color: '#9AA0A6',
  },
  waypointNameSkipped: {
    color: '#9AA0A6',
    textDecorationLine: 'line-through',
  },
  waypointDistanceSkipped: {
    color: '#9AA0A6',
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
    width: 48,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPointPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF9500',
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
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
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  
  // Action Card - Centered card design
  actionCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
  },
  actionCard: {
    width: '85%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  actionCardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionCardTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 4,
    lineHeight: 22,
  },
  actionCardSubtitle: {
    fontSize: 13,
    color: '#9AA0A6',
  },
  actionCardClose: {
    padding: 4,
    marginTop: -4,
  },
  actionCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE5E5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
  },
  actionCardButtonInclude: {
    backgroundColor: '#E6F7ED',
  },
  actionCardButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EA4335',
  },
  actionCardButtonTextInclude: {
    color: '#34A853',
  },
  
  // Management Modal styles
  managementModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  managementModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  managementModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
  },
  managementModalCloseButton: {
    padding: 4,
  },
  managementModalContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  managementWaypointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  managementWaypointItemSkipped: {
    opacity: 0.6,
  },
  managementWaypointIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  managementWaypointTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  managementWaypointName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#202124',
    marginBottom: 4,
  },
  managementWaypointNameSkipped: {
    textDecorationLine: 'line-through',
    color: '#9AA0A6',
  },
  managementWaypointDistance: {
    fontSize: 14,
    color: '#9AA0A6',
  },
  managementWaypointToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  managementWaypointToggleText: {
    fontSize: 14,
    color: '#4285F4',
    marginLeft: 8,
    fontWeight: '500',
  },
  managementWaypointToggleTextSkipped: {
    color: '#9AA0A6',
  },
  // Bottom Navigation Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 34, // Extra padding for safe area
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomBarButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeSection: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  currentTime: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.5,
  },
  nextStopInfo: {
    alignItems: 'center',
    marginTop: 4,
  },
  nextStopText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 2,
  },
  nextStopDistance: {
    fontSize: 11,
    fontWeight: '400',
    color: '#9CA3AF',
  },
  // Major Waypoints Modal
  majorWaypointsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  majorWaypointsModalContainer: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  majorWaypointsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  majorWaypointsModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  majorWaypointsModalCloseButton: {
    padding: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  majorWaypointsModalContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: 'transparent',
  },
  majorWaypointsEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: 'transparent',
  },
  majorWaypointsEmptyText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Major Waypoint Card
  majorWaypointCard: {
    borderRadius: 24,
    marginBottom: 14,
    marginHorizontal: 0,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  majorWaypointCardSkipped: {
    opacity: 0.6,
  },
  majorWaypointCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  majorWaypointIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
    borderWidth: 2.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  majorWaypointIconContainerSkipped: {
    backgroundColor: '#F0F0F0',
    borderColor: '#E5E5E5',
  },
  majorWaypointIconContainerCompleted: {
    backgroundColor: '#ECFDF5',
    borderColor: '#D1FAE5',
  },
  majorWaypointIconContainerApproaching: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  majorWaypointCardMain: {
    flex: 1,
    paddingRight: 8,
  },
  majorWaypointCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 10,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  majorWaypointCardTitleSkipped: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  majorWaypointCardTimeRow: {
    marginBottom: 4,
  },
  majorWaypointCardTimeText: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  majorWaypointCardDistanceRow: {
    marginBottom: 8,
  },
  majorWaypointCardDistanceText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  majorWaypointCardStatus: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  majorWaypointCardStatusSkipped: {
    color: '#6B7280',
    backgroundColor: '#E5E7EB',
  },
  majorWaypointCardStatusCompleted: {
    color: '#047857',
    backgroundColor: '#A7F3D0',
  },
  majorWaypointSkipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginLeft: 4,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  majorWaypointSkipButtonActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  majorWaypointSkipButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.1,
  },
  majorWaypointSkipButtonTextActive: {
    color: '#059669',
  },
});

export default NavigationScreen;

