import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import { Route } from '../src/types/route';
import { RoutePoint, RoutePreferences, recalculateRoute, validateRoutePoints, calculateRouteBounds } from '../src/utils/routeUtils';
import { useAuth } from '../src/context/AuthContext';
import { AuthContextType } from '../src/types/auth';
import { theme } from '../src/theme';

const ModifyRoute = () => {
  const { routeId, routeData } = useLocalSearchParams<{ routeId: string; routeData?: string }>();
  const initialRoute = routeData ? JSON.parse(routeData) : null;
  
  const [route, setRoute] = useState<Route | null>(initialRoute);
  const [waypoints, setWaypoints] = useState<RoutePoint[]>([]);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [routePreferences, setRoutePreferences] = useState<RoutePreferences>({
    type: 'fastest',
    profile: 'cycling',
  });
  const [isModified, setIsModified] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  
  const { session } = useAuth() as AuthContextType;
  const mapRef = useRef<MapboxGL.MapView>(null);

  // Initialize waypoints from route data
  useEffect(() => {
    // Only use start and end points as editable waypoints, not all route_points
    if (route?.start_location && route?.end_location) {
      setWaypoints([
        {
          latitude: route.start_location.latitude,
          longitude: route.start_location.longitude,
        },
        {
          latitude: route.end_location.latitude,
          longitude: route.end_location.longitude,
        },
      ]);
    } else if (route?.route_points && route.route_points.length > 0) {
      // Fallback: use first and last route point only
      const firstPoint = route.route_points[0];
      const lastPoint = route.route_points[route.route_points.length - 1];
      setWaypoints([firstPoint, lastPoint]);
    }
  }, [route]);

  // Handle map tap to add waypoint
  const handleMapPress = async (feature: any) => {
    const { geometry } = feature;
    if (!geometry || !geometry.coordinates) return;

    const [longitude, latitude] = geometry.coordinates;
    const newWaypoint: RoutePoint = { latitude, longitude };

    // Add waypoint before the last point (which is typically the end point)
    const newWaypoints = [...waypoints];
    newWaypoints.splice(waypoints.length - 1, 0, newWaypoint);
    
    setWaypoints(newWaypoints);
    setIsModified(true);
    
    // Recalculate route with new waypoint
    await handleRecalculateRoute(newWaypoints);
  };

  // Handle waypoint drag
  const handleWaypointDrag = async (index: number, coordinate: [number, number]) => {
    const [longitude, latitude] = coordinate;
    const newWaypoints = [...waypoints];
    newWaypoints[index] = { latitude, longitude };
    
    setWaypoints(newWaypoints);
    setIsModified(true);
  };

  // Handle waypoint long press to remove
  const handleWaypointLongPress = (index: number) => {
    if (waypoints.length <= 2) {
      Alert.alert('Cannot Remove', 'You must have at least 2 waypoints (start and end).');
      return;
    }

    Alert.alert(
      'Remove Waypoint',
      'Are you sure you want to remove this waypoint?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const newWaypoints = waypoints.filter((_, i) => i !== index);
            setWaypoints(newWaypoints);
            setIsModified(true);
            await handleRecalculateRoute(newWaypoints);
          },
        },
      ]
    );
  };

  // Recalculate route based on waypoints
  const handleRecalculateRoute = async (waypointsToUse?: RoutePoint[]) => {
    const pointsToCalculate = waypointsToUse || waypoints;
    
    if (!validateRoutePoints(pointsToCalculate)) {
      Alert.alert('Error', 'Invalid waypoints. Please check your route.');
      return;
    }

    if (!session?.access_token) {
      Alert.alert('Error', 'You must be logged in to recalculate routes.');
      return;
    }

    try {
      setIsRecalculating(true);
      const calculatedRoute = await recalculateRoute(
        pointsToCalculate,
        routePreferences,
        session.access_token
      );

      // Update route with new data
      setRoute(prev => prev ? {
        ...prev,
        route_points: calculatedRoute.route_points,
        route_geometry: calculatedRoute.geometry,
        distance: calculatedRoute.distance,
        duration: calculatedRoute.duration,
      } : null);

      console.log('[MODIFY ROUTE] Route recalculated:', calculatedRoute);
    } catch (error) {
      console.error('[MODIFY ROUTE] Error recalculating route:', error);
      Alert.alert('Error', 'Failed to recalculate route. Please try again.');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Save modified route
  const handleSave = async () => {
    if (!isModified) {
      router.back();
      return;
    }

    if (!validateRoutePoints(waypoints)) {
      Alert.alert('Error', 'Invalid waypoints. Please check your route.');
      return;
    }

    if (!session?.access_token) {
      Alert.alert('Error', 'You must be logged in to save routes.');
      return;
    }

    try {
      setIsSaving(true);
      
      // TODO: Call backend API to save route
      // const response = await fetch(`${getApiBaseUrl()}/api/routes/${routeId}`, {
      //   method: 'PUT',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${session.access_token}`,
      //   },
      //   body: JSON.stringify({
      //     route_points: waypoints,
      //     route_geometry: route?.route_geometry,
      //     route_preferences: routePreferences,
      //     distance: route?.distance,
      //     duration: route?.duration,
      //   }),
      // });

      console.log('[MODIFY ROUTE] Saving route:', {
        routeId,
        waypoints,
        preferences: routePreferences,
      });

      Alert.alert('Success', 'Route saved successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('[MODIFY ROUTE] Error saving route:', error);
      Alert.alert('Error', 'Failed to save route. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel and go back
  const handleCancel = () => {
    if (isModified) {
      Alert.alert(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  // Change route preferences
  const handlePreferenceChange = async (type: 'fastest' | 'shortest' | 'scenic') => {
    setRoutePreferences(prev => ({ ...prev, type }));
    setIsModified(true);
    setShowPreferences(false);
    
    // Recalculate with new preferences
    await handleRecalculateRoute();
  };

  if (!route) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading route...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Format route line for display
  // Use route_geometry (all 685 points) for the line, NOT waypoints (just start/end)
  const routeGeoJSON = route.route_geometry ? {
    type: 'Feature' as const,
    geometry: route.route_geometry,
    properties: {},
  } : route.route_points && route.route_points.length > 0 ? {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: route.route_points.map(wp => [wp.longitude, wp.latitude]),
    },
    properties: {},
  } : {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: waypoints.map(wp => [wp.longitude, wp.latitude]),
    },
    properties: {},
  };

  // Calculate bounds to fit entire route in view
  const routePointsForBounds = route.route_points && route.route_points.length > 0 
    ? route.route_points 
    : waypoints;
  const bounds = calculateRouteBounds(routePointsForBounds);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleCancel}>
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Modify Route</Text>
          {isModified && <View style={styles.modifiedIndicator} />}
        </View>
        
        <TouchableOpacity 
          style={[styles.headerButton, styles.saveButton]} 
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapboxGL.MapView
          ref={mapRef}
          style={styles.map}
          styleURL={MapboxGL.StyleURL.Light}
          onPress={handleMapPress}
        >
          <MapboxGL.Camera
            bounds={bounds ? {
              ne: [bounds.maxLng, bounds.maxLat],
              sw: [bounds.minLng, bounds.minLat],
              paddingTop: 60,
              paddingBottom: 60,
              paddingLeft: 60,
              paddingRight: 60,
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
                  lineWidth: 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </MapboxGL.ShapeSource>
          )}

          {/* Waypoint Markers */}
          {waypoints.map((waypoint, index) => {
            const isStart = index === 0;
            const isEnd = index === waypoints.length - 1;
            
            return (
              <MapboxGL.PointAnnotation
                key={`waypoint-${index}`}
                id={`waypoint-${index}`}
                coordinate={[waypoint.longitude, waypoint.latitude]}
                draggable
                onDragEnd={(feature) => handleWaypointDrag(index, feature.geometry.coordinates as [number, number])}
                onSelected={() => setSelectedWaypointIndex(index)}
                onDeselected={() => setSelectedWaypointIndex(null)}
              >
                <View style={styles.waypointMarker}>
                  {isStart ? (
                    <Ionicons name="play-circle" size={36} color="#10B981" />
                  ) : isEnd ? (
                    <Ionicons name="flag" size={36} color="#EF4444" />
                  ) : (
                    <View style={styles.intermediateMarker}>
                      <Ionicons name="ellipse" size={20} color="#FFFFFF" />
                    </View>
                  )}
                </View>
              </MapboxGL.PointAnnotation>
            );
          })}
        </MapboxGL.MapView>

        {/* Recalculating Overlay */}
        {isRecalculating && (
          <View style={styles.recalculatingOverlay}>
            <View style={styles.recalculatingCard}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.recalculatingText}>Recalculating route...</Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        {/* Route Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="map-outline" size={20} color="#6B7280" />
            <Text style={styles.statValue}>{route.distance?.toFixed(1) || '—'} km</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={20} color="#6B7280" />
            <Text style={styles.statValue}>
              {route.duration ? `${Math.round(route.duration / 60)} hrs` : '—'}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="location-outline" size={20} color="#6B7280" />
            <Text style={styles.statValue}>{waypoints.length} points</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowPreferences(!showPreferences)}
          >
            <Ionicons name="options-outline" size={20} color="#000" />
            <Text style={styles.actionButtonText}>Preferences</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.recalculateButton]}
            onPress={() => handleRecalculateRoute()}
            disabled={isRecalculating}
          >
            <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
            <Text style={[styles.actionButtonText, styles.recalculateButtonText]}>
              Recalculate
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preferences Panel */}
        {showPreferences && (
          <View style={styles.preferencesPanel}>
            <Text style={styles.preferencesPanelTitle}>Route Type</Text>
            <View style={styles.preferencesOptions}>
              {(['fastest', 'shortest', 'scenic'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.preferenceOption,
                    routePreferences.type === type && styles.preferenceOptionActive,
                  ]}
                  onPress={() => handlePreferenceChange(type)}
                >
                  <Text
                    style={[
                      styles.preferenceOptionText,
                      routePreferences.type === type && styles.preferenceOptionTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
            {' '}Tap map to add waypoints • Drag markers to move • Long press to remove
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerButton: {
    padding: 8,
    width: 80,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  modifiedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  waypointMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  intermediateMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  recalculatingOverlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  recalculatingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  recalculatingText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  bottomControls: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  recalculateButton: {
    backgroundColor: '#3B82F6',
  },
  recalculateButtonText: {
    color: '#FFFFFF',
  },
  preferencesPanel: {
    marginTop: 12,
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  preferencesPanelTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  preferencesOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  preferenceOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  preferenceOptionActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  preferenceOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  preferenceOptionTextActive: {
    color: '#FFFFFF',
  },
  instructionsContainer: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  instructionsText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
});

export default ModifyRoute;

