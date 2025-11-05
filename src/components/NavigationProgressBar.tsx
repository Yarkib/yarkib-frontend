import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Types
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

interface NavigationProgressBarProps {
  majorPoints: MajorPoint[];
  navigationWaypoints: any[];
  loadingMajorPoints: boolean;
  showMileWaypoints: boolean;
  skippedWaypointIds: Set<string>;
  navigationPhase: 'TO_START' | 'ON_ROUTE';
  navigationState: {
    userLocation: { latitude: number; longitude: number } | null;
    distanceRemaining: number; // meters
    currentSpeed: number; // km/h
    nextTurnInstruction: string;
    timeRemaining: number; // seconds
  };
  route: {
    coordinates: Array<[number, number]>;
    id: string;
  } | null;
  totalRouteMetersRef: React.MutableRefObject<number>;
  currentPositionPercentage: number;
  userProfile: { avatar_url?: string } | null;
  user: { avatar?: string } | null;
  onWaypointLongPress: (waypoint: MajorPoint) => void;
  calculateDistanceFromRouteStart: (lat: number, lon: number, routeCoords: Array<[number, number]>) => number;
}

const NavigationProgressBar: React.FC<NavigationProgressBarProps> = ({
  majorPoints,
  navigationWaypoints,
  loadingMajorPoints,
  showMileWaypoints,
  skippedWaypointIds,
  navigationPhase,
  navigationState,
  route,
  totalRouteMetersRef,
  currentPositionPercentage,
  userProfile,
  user,
  onWaypointLongPress,
  calculateDistanceFromRouteStart,
}) => {
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Helper function to get icon for major waypoint type
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
    const iconMap: { [key: string]: string } = {
      'nav_mile': 'ellipse-outline',
      'turn': 'arrow-forward',
      'straight': 'arrow-up',
      'merge': 'git-merge',
      'exit': 'exit',
      'default': 'location',
    };
    return iconMap[pointType] || 'location';
  };

  // Scroll snap-back functionality
  const handleScroll = () => {
    setIsScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    
    // Set new timeout to snap back after scrolling stops
    const timeout = setTimeout(() => {
      snapToCurrentPosition();
      setIsScrolling(false);
    }, 4000); // 4 seconds after scrolling stops
    
    scrollTimeout.current = timeout;
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
      const prevPct = i > 0 ? waypointPercents[i - 1] : 100;
      const currPct = waypointPercents[i];
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  // Don't render if not ON_ROUTE
  if (navigationPhase !== 'ON_ROUTE') {
    return null;
  }

  return (
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
                if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
                const timeout = setTimeout(() => {
                  snapToCurrentPosition();
                  setIsScrolling(false);
                }, 2000);
                scrollTimeout.current = timeout;
              }}
            >
              {/* Combine and sort all waypoints by distance */}
              {(() => {
                // Get the current route coordinates for distance calculation
                const routeCoords = (route?.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 1)
                  ? route.coordinates as Array<[number, number]>
                  : null;
                
                // Recalculate distance_from_start for all waypoints based on route position
                // Only include navigation waypoints if toggle is active
                const allWaypoints = [
                  ...majorPoints.map(p => ({
                    ...p,
                    isMajor: true, // Major waypoints are always marked as major
                    distance_from_start: routeCoords
                      ? calculateDistanceFromRouteStart(p.lat, p.lon, routeCoords)
                      : p.distance_from_start || 0
                  })),
                  ...(showMileWaypoints ? navigationWaypoints.map(p => ({
                    ...p,
                    isMajor: false, // Navigation waypoints (mile markers) are NEVER major waypoints
                    point_type: p.point_type || 'nav_mile', // Ensure point_type is set
                    distance_from_start: routeCoords
                      ? calculateDistanceFromRouteStart(p.lat, p.lon, routeCoords)
                      : p.distance_from_start || 0
                  })) : [])
                ].sort((a, b) => b.distance_from_start - a.distance_from_start);
                
                // Distance-based completion reference (meters)
                const currentDistanceFromStartMeters = Math.max(0, (totalRouteMetersRef.current || 0) - (navigationState.distanceRemaining || 0));
                const totalRouteMeters = totalRouteMetersRef.current || 1; // Avoid division by zero
                const currentPosition = currentPositionPercentage;

                // Pre-calculate which waypoint should show the bike icon
                // Find the waypoint segment where the rider is positioned, then place icon ONE WAYPOINT AHEAD
                // Waypoints are sorted descending (destination first, start last)
                // We want to find the segment where: prevWaypointProgress >= currentPosition >= waypointProgress
                let riderSegmentIndex = -1;
                for (let i = 0; i < allWaypoints.length; i++) {
                  const wpDistMeters = (allWaypoints[i].distance_from_start || 0) * 1000;
                  const wpProgress = totalRouteMeters > 0 ? (wpDistMeters / totalRouteMeters) * 100 : 0;
                  const prevWpDistMeters = i > 0 ? (allWaypoints[i - 1].distance_from_start || 0) * 1000 : totalRouteMeters;
                  const prevWpProgress = totalRouteMeters > 0 && i > 0 ? (prevWpDistMeters / totalRouteMeters) * 100 : 100;
                  
                  // Check if rider is between previous waypoint and this waypoint
                  if (currentPosition >= wpProgress && currentPosition <= prevWpProgress) {
                    riderSegmentIndex = i;
                    break;
                  }
                }
                
                // Calculate bike icon index: place it ONE WAYPOINT AHEAD (one index earlier in descending order)
                let bikeIconIndex = -1;
                if (riderSegmentIndex >= 0) {
                  // Rider is between waypoint[riderSegmentIndex] and waypoint[riderSegmentIndex-1]
                  // Place icon ONE AHEAD: at waypoint[riderSegmentIndex - 1] if it exists, otherwise at riderSegmentIndex
                  bikeIconIndex = Math.max(0, riderSegmentIndex - 1);
                } else {
                  // Fallback: if at destination (currentPosition >= first waypoint), show at first
                  // If at start (currentPosition <= last waypoint), show at last
                  if (allWaypoints.length > 0) {
                    const firstWpDist = (allWaypoints[0].distance_from_start || 0) * 1000;
                    const firstWpProgress = totalRouteMeters > 0 ? (firstWpDist / totalRouteMeters) * 100 : 100;
                    const lastWpDist = (allWaypoints[allWaypoints.length - 1].distance_from_start || 0) * 1000;
                    const lastWpProgress = totalRouteMeters > 0 ? (lastWpDist / totalRouteMeters) * 100 : 0;
                    
                    if (currentPosition >= firstWpProgress) {
                      bikeIconIndex = 0; // At/past destination
                    } else if (currentPosition <= lastWpProgress) {
                      bikeIconIndex = Math.max(0, allWaypoints.length - 2); // One ahead of last (if possible)
                    }
                  }
                }

                return allWaypoints.map((point, index) => {
                  // Calculate waypoint position percentage based on actual distance (not index)
                  const pointDistMeters = (point.distance_from_start || 0) * 1000; // distance_from_start is in km
                  const waypointProgress = totalRouteMeters > 0 
                    ? (pointDistMeters / totalRouteMeters) * 100 
                    : 0;
                  
                  // Calculate previous waypoint's position percentage (waypoints are sorted descending)
                  // Previous waypoint in array (index - 1) is farther along the route
                  const prevWaypointDistMeters = index > 0
                    ? ((allWaypoints[index - 1].distance_from_start || 0) * 1000)
                    : totalRouteMeters;
                  const prevWaypointProgress = totalRouteMeters > 0 && index > 0
                    ? (prevWaypointDistMeters / totalRouteMeters) * 100
                    : 100; // First waypoint (destination) has no previous, use 100%
                  
                  // Calculate next waypoint's position percentage (waypoints are sorted descending)
                  // Next waypoint in array (index + 1) is closer to start
                  const nextWaypointDistMeters = index < allWaypoints.length - 1
                    ? ((allWaypoints[index + 1].distance_from_start || 0) * 1000)
                    : 0;
                  const nextWaypointProgress = totalRouteMeters > 0 && index < allWaypoints.length - 1
                    ? (nextWaypointDistMeters / totalRouteMeters) * 100
                    : 0; // Last waypoint (start) has no next, use 0%
                  
                  // Show bike icon at the pre-calculated waypoint index
                  const shouldShowBike = index === bikeIconIndex;
                  
                  // Determine waypoint status using physical distance (robust to scrolling and list size)
                  const isCompleted = pointDistMeters <= (currentDistanceFromStartMeters - 15);
                  const isSkipped = skippedWaypointIds.has(point.id);
                  
                  return (
                    <TouchableOpacity
                      key={point.id}
                      activeOpacity={0.7}
                      onLongPress={() => {
                        console.log('[PROGRESS BAR] Waypoint long-pressed:', point.name);
                        onWaypointLongPress(point as MajorPoint);
                      }}
                    >
                      <View style={[
                        styles.waypointSection,
                        !point.isMajor && styles.navWaypointSection,
                        isSkipped && styles.waypointSectionSkipped
                      ]}>
                        <View style={[
                          styles.waypointIconContainer,
                          !point.isMajor && styles.navWaypointIconContainer,
                          isSkipped && styles.waypointIconContainerSkipped
                        ]}>
                          <Ionicons 
                            name={point.isMajor 
                              ? getPointIcon(point.point_type) as any
                              : getNavWaypointIcon(point.point_type) as any
                            } 
                            size={point.isMajor ? 12 : 8} 
                            color={isSkipped
                              ? "#9AA0A6"  // Gray for skipped waypoints
                              : isCompleted 
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
                            isCompleted && styles.waypointStatus,
                            isSkipped && styles.waypointStatusSkipped
                          ]}>
                            {isSkipped ? 'Skipped' :
                             isCompleted ? 'Passed' : 
                             point.isMajor ? 'Next' : 'Nav'}
                          </Text>
                          <Text style={[
                            point.isMajor ? styles.waypointName : styles.navWaypointName,
                            isCompleted && styles.completedWaypointName,
                            isSkipped && styles.waypointNameSkipped
                          ]} numberOfLines={1}>
                            {point.name}
                          </Text>
                          <Text style={[
                            point.isMajor ? styles.waypointDistance : styles.navWaypointDistance,
                            isCompleted && styles.completedWaypointDistance,
                            isSkipped && styles.waypointDistanceSkipped
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
                            <Text style={styles.timeToNextStopLabel}>
                              {navigationState.nextTurnInstruction || 'Continue'}
                            </Text>
                            <Text style={styles.timeToNextStopTime}>
                              {Math.max(1, Math.round(navigationState.timeRemaining / 60))} min
                            </Text>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
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
  );
};

const styles = StyleSheet.create({
  progressCard: {
    position: 'absolute',
    left: 12,
    bottom: 180, // Moved to bottom to avoid overlap
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    width: 120,
    maxHeight: 170,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
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
  progressAndWaypointsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  waypointsScrollView: {
    flex: 1,
    maxHeight: 170, // Increased to match taller container
  },
  waypointsScrollContent: {
    paddingVertical: 2,
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
  waypointDistance: {
    fontSize: 7,
    color: '#9AA0A6',
    marginTop: 1,
  },
  waypointStatusApproaching: {
    color: '#FBBC04',
  },
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
});

export default NavigationProgressBar;

