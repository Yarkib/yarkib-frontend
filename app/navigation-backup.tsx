import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
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
import { waypointsApi } from '../src/utils/api';

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
  const [route, setRoute] = useState<RouteData | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);
  
  // Navigation phase management
  const [navigationPhase, setNavigationPhase] = useState<'TO_START' | 'ON_ROUTE'>('TO_START');
  const [navigationToStartRoute, setNavigationToStartRoute] = useState<[number, number][] | null>(null);
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
  
  // Image picker state
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);
  
  // Waypoints list state
  const [allWaypoints, setAllWaypoints] = useState<any[]>([]);
  const [showWaypointsList, setShowWaypointsList] = useState(false);
  const [loadingAllWaypoints, setLoadingAllWaypoints] = useState(false);
  
  // Navigation thresholds
  const NAVIGATION_THRESHOLDS = {
    AT_START: 0.15,        // 150 meters - auto-skip
    NEAR_START: 0.5,       // 500 meters - show skip button
    ARRIVED_AT_START: 0.05, // 50 meters - auto-transition
    MAX_NAV_DISTANCE: 500  // 500 km - max distance for navigation to start
  };
  
  // Major points state
  const [majorPoints, setMajorPoints] = useState<MajorPoint[]>([]);
  const [loadingMajorPoints, setLoadingMajorPoints] = useState(false);
  
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
    userLocation: null,
    heading: 0,
    currentStepIndex: 0,
  });

  // Get major points progress (real data from database)
  const completedPoints = majorPoints.filter(p => p.status === 'completed');
  const upcomingPoints = majorPoints.filter(p => p.status === 'upcoming' || p.status === 'approaching');
  
  const recentCompleted = completedPoints.length > 0 
    ? completedPoints[completedPoints.length - 1] 
    : null;
    
  const nextUpcoming = upcomingPoints.length > 0 
    ? upcomingPoints[0] 
    : null;
  
  // Calculate progress between these two waypoints
  const progressBetweenWaypoints = recentCompleted && nextUpcoming && route
    ? ((navigationState.currentProgress * (route.distance || 0) - recentCompleted.distance_from_start) / 
       (nextUpcoming.distance_from_start - recentCompleted.distance_from_start)) * 100
    : 0;

  const mapRef = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // Parse route data
  useEffect(() => {
    console.log('[NAVIGATION] Route data received:', routeData);
    if (routeData) {
      try {
        const parsedRoute = JSON.parse(routeData);
        setRoute(parsedRoute);
        console.log('[NAVIGATION] Route loaded successfully:', parsedRoute);
      } catch (error) {
        console.error('[NAVIGATION] Error parsing route data:', error);
        Alert.alert('Error', 'Failed to load route data');
      }
    } else {
      console.log('[NAVIGATION] No route data provided');
    }
  }, [routeData]);

  // Initialize Mapbox and request location permissions
  useEffect(() => {
    const initializeMapbox = async () => {
      const token = 'pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ';
      setMapboxToken(token);
      MapboxGL.setAccessToken(token);
      
      // Request location permissions
      try {
        const granted = await MapboxGL.requestAndroidLocationPermissions();
        setLocationPermission(granted);
        console.log('[NAVIGATION] Location permission:', granted);
      } catch (error) {
        console.error('[NAVIGATION] Error requesting location permission:', error);
      }
    };
    
    initializeMapbox();
  }, []);

  // Manual location tracking using Mapbox Location Manager
  useEffect(() => {
    if (!locationPermission) return;
    
    const startLocationTracking = () => {
      console.log('[NAV] Starting location tracking...');
      
      // Get initial location immediately
      MapboxGL.locationManager.getLastKnownLocation()
        .then(location => {
          if (location && location.coords) {
            console.log('[NAV] Initial location acquired:', location.coords);
            handleLocationUpdate(location);
          }
        })
        .catch(error => console.log('[NAV] Error getting initial location:', error));
      
      // Use a polling interval to get location updates
      const locationInterval = setInterval(async () => {
        try {
          const location = await MapboxGL.locationManager.getLastKnownLocation();
          
          if (location && location.coords) {
            handleLocationUpdate(location);
          }
        } catch (error) {
          console.log('[NAV] Error getting location:', error);
        }
      }, 2000); // Update every 2 seconds

      return () => {
        console.log('[NAV] Stopping location tracking');
        clearInterval(locationInterval);
      };
    };
    
    const cleanup = startLocationTracking();
    return cleanup;
  }, [locationPermission]);

  // Handle real-time location updates from Mapbox
  const handleLocationUpdate = (location: any) => {
    if (!location || !location.coords) return;
    
    const { coords } = location;
    console.log('[NAVIGATION] Location update:', coords);
    
    // Convert speed from m/s to km/h
    const speedKmh = (coords.speed || 0) * 3.6;
    
    // Update navigation state with real GPS data
    setNavigationState(prev => {
      const userLoc = { latitude: coords.latitude, longitude: coords.longitude };
      
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

  // Fetch navigation route from current location to start point using Mapbox Directions API
  const fetchNavigationToStart = async (userLocation: [number, number], startPoint: [number, number]) => {
    if (!mapboxToken) {
      console.log('[NAV] No Mapbox token available yet');
      return;
    }

    try {
      setIsLoadingNavToStart(true);
      setNavigationToStartError(null);
      console.log('[NAV] Fetching route to start point...', { userLocation, startPoint });
      
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation[0]},${userLocation[1]};${startPoint[0]},${startPoint[1]}?geometries=geojson&steps=true&banner_instructions=true&voice_instructions=true&alternatives=false&continue_straight=true&access_token=${mapboxToken}`;
      
      console.log('[NAV] Mapbox API URL:', url);
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
        setNavigationSteps(steps);
        setDistanceToStart(distance);
        setNavigationToStartError(null);
        
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

  // Image picker functions
  const pickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library to select images.');
        return;
      }

      // Open gallery
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map((asset: any) => asset.uri);
        setSelectedImages(prev => [...prev, ...newImages]);
        console.log('[IMAGE PICKER] Selected images:', newImages.length);
        
    Alert.alert(
          'Images Selected',
          `Added ${newImages.length} image(s) to your collection.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[IMAGE PICKER] Error:', error);
      Alert.alert('Error', 'Failed to select images. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your camera to take photos.');
        return;
      }

      // Open camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const newImage = result.assets[0].uri;
        setSelectedImages(prev => [...prev, newImage]);
        console.log('[CAMERA] Photo taken:', newImage);
        
        Alert.alert(
          'Photo Taken',
          'Photo added to your collection.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[CAMERA] Error:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Image',
      'Choose how you want to add an image',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Gallery', onPress: pickImage },
        { text: 'Camera', onPress: takePhoto },
      ]
    );
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
  
  // Helper to get icon for major point type
  const getPointIcon = (pointType: string): string => {
    const iconMap: { [key: string]: string } = {
      'gas_station': '⛽',
      'restaurant': '🍽️',
      'coffee_shop': '☕',
      'hotel': '🏨',
      'shop': '🛍️',
      'scenic_point': '🏔️',
      'rest_area': '🅿️',
      'custom': '📍',
    };
    return iconMap[pointType] || '📍';
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

  // Fetch major points when route loads
  useEffect(() => {
    const loadMajorPoints = async () => {
      if (!route?.id) return;
      
      try {
        setLoadingMajorPoints(true);
        console.log('[MAJOR POINTS] Fetching for route:', route.id);
        
        const points = await waypointsApi.getMajorWaypoints(route.id);
        
        // Initialize all points as 'upcoming'
        const initializedPoints: MajorPoint[] = points.map((point: any) => ({
          ...point,
          status: 'upcoming' as const,
        }));
        
        // Sort by distance from start
        initializedPoints.sort((a, b) => a.distance_from_start - b.distance_from_start);
        
        setMajorPoints(initializedPoints);
        console.log('[MAJOR POINTS] Loaded:', initializedPoints.length, 'points');
        
      } catch (error) {
        console.error('[MAJOR POINTS] Error loading:', error);
        // Fallback to empty array - navigation will still work
        setMajorPoints([]);
      } finally {
        setLoadingMajorPoints(false);
      }
    };
    
    loadMajorPoints();
  }, [route?.id]);

  // Fetch all waypoints (major + navigation)
  const loadAllWaypoints = async () => {
    if (!route?.id) return;
    
    try {
      setLoadingAllWaypoints(true);
      console.log('[ALL WAYPOINTS] Fetching for route:', route.id);
      
      const allPoints = await waypointsApi.getAllWaypoints(route.id);
      
      // Transform and sort waypoints
      const transformedWaypoints = allPoints.map((wp: any) => ({
        id: wp.id,
        name: wp.name,
        category: wp.point_type || 'other',
        estimated_arrival_time: wp.estimated_arrival_time_formatted || wp.estimated_arrival_time,
        distance_from_start: wp.distance_from_start || 0,
        coordinates: {
          latitude: wp.lat,
          longitude: wp.lon,
        },
        address: wp.description,
        is_major: ['gas_station', 'restaurant', 'coffee_shop', 'hotel', 'shop'].includes(wp.point_type),
      }));
      
      // Sort by distance from start
      const sortedWaypoints = transformedWaypoints.sort(
        (a: any, b: any) => a.distance_from_start - b.distance_from_start
      );
      
      setAllWaypoints(sortedWaypoints);
      console.log('[ALL WAYPOINTS] Loaded', sortedWaypoints.length, 'waypoints');
      
    } catch (error) {
      console.error('[ALL WAYPOINTS] Error loading waypoints:', error);
      setAllWaypoints([]);
    } finally {
      setLoadingAllWaypoints(false);
    }
  };

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
        {(() => {
          console.log('[NAV RENDER] Orange line check:', {
            navigationPhase,
            hasNavToStartRoute: !!navigationToStartRoute,
            routeLength: navigationToStartRoute?.length || 0
          });
          return navigationPhase === 'TO_START' && navigationToStartRoute && navigationToStartRoute.length > 0;
        })() && navigationToStartRoute && (
          <>
            {/* Route Casing (Border) - Darker outline */}
            <MapboxGL.ShapeSource 
              id="navToStartCasingSource" 
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: navigationToStartRoute!,
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
              id="navToStartSource" 
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: navigationToStartRoute!,
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
              id="navToStartArrowsSource" 
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: navigationToStartRoute!,
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

        {/* Mapbox Native Location Puck (Real GPS) */}
        <MapboxGL.LocationPuck
          puckBearingEnabled={true}
          puckBearing="heading"
          pulsing={{
            isEnabled: true,
            color: '#4285F4',
            radius: 50,
          }}
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
          
          {/* Show major points progress */}
          {!loadingMajorPoints && majorPoints.length > 0 && recentCompleted && nextUpcoming && (
            <>
              {/* Recent Completed Point */}
          <View style={styles.waypointSection}>
            <View style={styles.waypointIconContainer}>
                  <Text style={styles.pointEmoji}>{getPointIcon(recentCompleted.point_type)}</Text>
            </View>
            <View style={styles.waypointTextContainer}>
              <Text style={styles.waypointStatus}>Passed</Text>
              <Text style={styles.waypointName} numberOfLines={1}>
                {recentCompleted.name}
              </Text>
                  <Text style={styles.waypointDistance}>
                    {recentCompleted.distance_from_start.toFixed(1)} km
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
                  {completedPoints.length}/{majorPoints.length}
            </Text>
          </View>

              {/* Next Upcoming Point */}
          <View style={styles.waypointSection}>
            <View style={styles.waypointIconContainer}>
                  <Text style={styles.pointEmoji}>{getPointIcon(nextUpcoming.point_type)}</Text>
            </View>
            <View style={styles.waypointTextContainer}>
                  <Text style={[
                    styles.waypointStatusNext,
                    nextUpcoming.status === 'approaching' && styles.waypointStatusApproaching
                  ]}>
                    {nextUpcoming.status === 'approaching' ? 'Approaching' : 'Next'}
                  </Text>
              <Text style={styles.waypointName} numberOfLines={1}>
                {nextUpcoming.name}
              </Text>
                  <Text style={styles.waypointDistance}>
                    {nextUpcoming.distance_from_start.toFixed(1)} km
              </Text>
            </View>
          </View>
            </>
          )}
          
          {/* No major points available */}
          {!loadingMajorPoints && majorPoints.length === 0 && (
            <View style={styles.noWaypoints}>
              <Text style={styles.noWaypointsText}>No waypoints</Text>
            </View>
          )}
          
          {/* Show message when no completed/upcoming points yet */}
          {!loadingMajorPoints && majorPoints.length > 0 && (!recentCompleted || !nextUpcoming) && (
            <View style={styles.noWaypoints}>
              <Text style={styles.noWaypointsText}>
                {!recentCompleted ? 'Starting route...' : 'Almost there!'}
              </Text>
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

        {/* Waypoints List Button */}
        <TouchableOpacity
          style={styles.waypointsButton}
          onPress={() => {
            if (!showWaypointsList) {
              loadAllWaypoints();
            }
            setShowWaypointsList(!showWaypointsList);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="list" size={24} color="#5f6368" />
        </TouchableOpacity>

        {/* Image Picker Button */}
        <TouchableOpacity
          style={styles.imagePickerButton}
          onPress={showImageOptions}
          activeOpacity={0.8}
        >
          <Ionicons name="camera" size={24} color="#5f6368" />
        </TouchableOpacity>
      </View>

      {/* Selected Images Gallery */}
      {selectedImages.length > 0 && (
        <View style={styles.imageGalleryContainer}>
          <View style={styles.imageGalleryHeader}>
            <Text style={styles.imageGalleryTitle}>Your Photos ({selectedImages.length})</Text>
            <TouchableOpacity
              style={styles.addMoreButton}
              onPress={showImageOptions}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color="#4285F4" />
              <Text style={styles.addMoreText}>Add More</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.imageGrid}>
            {selectedImages.map((imageUri, index) => (
              <View key={index} style={styles.imageItem}>
                <Image source={{ uri: imageUri }} style={styles.selectedImage} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={20} color="#EA4335" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Waypoints List */}
      {showWaypointsList && (
        <View style={styles.waypointsListContainer}>
          <View style={styles.waypointsListHeader}>
            <Text style={styles.waypointsListTitle}>
              All Waypoints ({allWaypoints.length})
            </Text>
            <TouchableOpacity
              style={styles.closeWaypointsButton}
              onPress={() => setShowWaypointsList(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#5f6368" />
            </TouchableOpacity>
          </View>
          
          {loadingAllWaypoints ? (
            <View style={styles.waypointsLoadingContainer}>
              <ActivityIndicator size="small" color="#4285F4" />
              <Text style={styles.waypointsLoadingText}>Loading waypoints...</Text>
            </View>
          ) : allWaypoints.length === 0 ? (
            <View style={styles.waypointsEmptyContainer}>
              <Ionicons name="location-outline" size={48} color="#9AA0A6" />
              <Text style={styles.waypointsEmptyText}>No waypoints available</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.waypointsScrollView}
              showsVerticalScrollIndicator={true}
            >
              {allWaypoints.map((waypoint, index) => (
                <View key={waypoint.id} style={styles.waypointListItem}>
                  <View style={styles.waypointListItemLeft}>
                    <View style={[
                      styles.waypointListItemIcon,
                      waypoint.is_major && styles.waypointListItemIconMajor
                    ]}>
                      <Text style={styles.waypointListItemEmoji}>
                        {getPointIcon(waypoint.category)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.waypointListItemContent}>
                    <View style={styles.waypointListItemHeader}>
                      <Text style={[
                        styles.waypointListItemName,
                        waypoint.is_major && styles.waypointListItemNameMajor
                      ]} numberOfLines={1}>
                        {waypoint.name}
                      </Text>
                      <Text style={styles.waypointListItemTime}>
                        {waypoint.estimated_arrival_time || '--:--'}
                      </Text>
                    </View>
                    
                    <Text style={styles.waypointListItemCategory}>
                      {waypoint.category.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </Text>
                    
                    {waypoint.address && (
                      <Text style={styles.waypointListItemAddress} numberOfLines={1}>
                        {waypoint.address}
                      </Text>
                    )}
                    
                    <Text style={styles.waypointListItemDistance}>
                      {waypoint.distance_from_start.toFixed(1)} km from start
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
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

  // Image Picker Button
  imagePickerButton: {
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

  // Image Gallery
  imageGalleryContainer: {
    position: 'absolute',
    bottom: 200,
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    maxHeight: 200,
  },
  imageGalleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageGalleryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F0FE',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  addMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4285F4',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageItem: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  selectedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },

  // Redesigned Progress Card - Left Side (Compact)
  progressCard: {
    position: 'absolute',
    left: 12,
    bottom: 180, // Moved to bottom to avoid overlap
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 6,
    width: 100, // Made smaller
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  
  waypointSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  waypointIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  waypointTextContainer: {
    flex: 1,
    marginLeft: 4,
  },
  
  waypointStatus: {
    fontSize: 8,
    fontWeight: '600',
    color: '#34A853',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  
  waypointStatusNext: {
    fontSize: 8,
    fontWeight: '600',
    color: '#5f6368',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  
  waypointName: {
    fontSize: 9,
    fontWeight: '600',
    color: '#202124',
    lineHeight: 12,
  },
  
  progressLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  
  progressLine: {
    width: 2,
    height: 28,
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
    backgroundColor: '#4285F4',
    borderRadius: 2,
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
  pointEmoji: {
    fontSize: 16,
  },
  waypointDistance: {
    fontSize: 8,
    color: '#9AA0A6',
    marginTop: 1,
  },
  waypointStatusApproaching: {
    color: '#FBBC04',
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
  
  // Waypoints List Styles
  waypointsButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  waypointsListContainer: {
    position: 'absolute',
    bottom: 80,
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  waypointsListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  waypointsListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
  },
  closeWaypointsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointsLoadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  waypointsLoadingText: {
    fontSize: 14,
    color: '#5f6368',
    marginTop: 8,
  },
  waypointsEmptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  waypointsEmptyText: {
    fontSize: 14,
    color: '#9AA0A6',
    marginTop: 8,
  },
  waypointsScrollView: {
    maxHeight: 300,
  },
  waypointListItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  waypointListItemLeft: {
    marginRight: 12,
  },
  waypointListItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointListItemIconMajor: {
    backgroundColor: '#E3F2FD',
  },
  waypointListItemEmoji: {
    fontSize: 16,
  },
  waypointListItemContent: {
    flex: 1,
  },
  waypointListItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  waypointListItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#202124',
    flex: 1,
    marginRight: 8,
  },
  waypointListItemNameMajor: {
    fontWeight: '700',
    color: '#1967D2',
  },
  waypointListItemTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
  },
  waypointListItemCategory: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5f6368',
    marginBottom: 2,
  },
  waypointListItemAddress: {
    fontSize: 12,
    color: '#9AA0A6',
    marginBottom: 2,
  },
  waypointListItemDistance: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9AA0A6',
  },
});

export default NavigationScreen;

