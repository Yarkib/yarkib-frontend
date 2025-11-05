import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { theme } from '../theme';
import { StartTimeSettings, Waypoint } from '../types/waypoint';
import { waypointsApi } from '../utils/api';
import WaypointItem from './WaypointItem';

interface WaypointsSectionProps {
  routeId: string;
  onTimeUpdate?: (waypoints: Waypoint[]) => void;
}

const WaypointsSection: React.FC<WaypointsSectionProps> = ({
  routeId,
  onTimeUpdate,
}) => {
  const [showAllWaypoints, setShowAllWaypoints] = useState(false);
  const [startTimeSettings, setStartTimeSettings] = useState<StartTimeSettings>({
    use_current_time: true,
  });
  const [customTime, setCustomTime] = useState('08:00');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [displayedWaypoints, setDisplayedWaypoints] = useState<Waypoint[]>([]);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [timeInput, setTimeInput] = useState(customTime);
  const [loadingWaypoints, setLoadingWaypoints] = useState(false);
  const [waypointsError, setWaypointsError] = useState<string | null>(null);
  const [skippedWaypointIds, setSkippedWaypointIds] = useState<Set<string>>(new Set());

  // Animation values
  const fadeAnim = new Animated.Value(1);
  const slideAnim = new Animated.Value(0);

  useEffect(() => {
    filterWaypoints();
  }, [showAllWaypoints]);

  // Load waypoints on component mount
  useEffect(() => {
    if (routeId) {
      filterWaypoints();
    }
  }, [routeId]);

  // Sync timeInput with customTime
  useEffect(() => {
    setTimeInput(customTime);
  }, [customTime]);

  // Define major categories - show all waypoints from these categories
  const MAJOR_CATEGORIES = ['gas_station', 'restaurant', 'coffee_shop', 'hotel', 'shop', 'unknown'];

  const fetchWaypoints = async (showAll = false) => {
    if (!routeId) return;
    
    try {
      setLoadingWaypoints(true);
      setWaypointsError(null);
      
      // Always fetch ALL waypoints from the API
      console.log(`[WAYPOINTS] Fetching all waypoints for route ${routeId}`);
      const waypointsData = await waypointsApi.getAllWaypoints(routeId);
      
      // Transform backend data to frontend format
      const transformedWaypoints = waypointsData.map((wp: any) => ({
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
        is_major: MAJOR_CATEGORIES.includes(wp.point_type),
      }));

      // Filter based on toggle: if showAll is false, only show major category waypoints
      const filteredWaypoints = showAll 
        ? transformedWaypoints 
        : transformedWaypoints.filter((wp: Waypoint) => MAJOR_CATEGORIES.includes(wp.category));

      // Sort waypoints by distance from start to maintain route order
      const sortedWaypoints = filteredWaypoints.sort(
        (a: typeof filteredWaypoints[0], b: typeof filteredWaypoints[0]) =>
          a.distance_from_start - b.distance_from_start
      );

      setDisplayedWaypoints(sortedWaypoints);
      console.log(`[WAYPOINTS] Loaded ${sortedWaypoints.length} waypoints (${showAll ? 'all' : 'major categories only'})`);
      
    } catch (error: any) {
      console.error('[WAYPOINTS] Error fetching waypoints:', error);
      setWaypointsError(error.message || 'Failed to load waypoints');
      setDisplayedWaypoints([]);
    } finally {
      setLoadingWaypoints(false);
    }
  };

  const filterWaypoints = () => {
    fetchWaypoints(showAllWaypoints);
  };

  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const formatDisplayTime = () => {
    if (startTimeSettings.use_current_time) {
      return `Current Time (${getCurrentTime()})`;
    }
    return `Custom Time (${customTime})`;
  };

  const handleStartTimeChange = async (newSettings: StartTimeSettings) => {
    setIsUpdating(true);
    
    // Animate loading state
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.6,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      setStartTimeSettings(newSettings);
      
      // Update waypoint times using real API
      await updateWaypointTimes(newSettings);
      
      if (onTimeUpdate) {
        onTimeUpdate(displayedWaypoints);
      }
      
    } catch (error) {
      console.error('Error updating waypoint times:', error);
      Alert.alert('Error', 'Failed to update waypoint times. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const updateWaypointTimes = async (settings: StartTimeSettings) => {
    try {
      setLoadingWaypoints(true);
      setWaypointsError(null);
      
      // Convert start time to ISO format for API
      let startTimeISO = null;
      if (!settings.use_current_time && settings.custom_time) {
        const today = new Date();
        const [hours, minutes] = settings.custom_time.split(':').map(Number);
        today.setHours(hours, minutes, 0, 0);
        startTimeISO = today.toISOString();
      }
      
      console.log(`[WAYPOINTS] Updating waypoint times with start time:`, startTimeISO || 'current time');
      
      // Fetch updated waypoints from API
      let waypointsData;
      if (showAllWaypoints) {
        waypointsData = await waypointsApi.getAllWaypoints(routeId, startTimeISO as any);
      } else {
        waypointsData = await waypointsApi.getMajorWaypoints(routeId, startTimeISO as any);
      }
      
      // Transform backend data to frontend format
      const transformedWaypoints = waypointsData.map((wp: any) => ({
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
        is_major: ['gas_station', 'restaurant', 'coffee_shop', 'hotel', 'shop', 'unknown'].includes(wp.point_type),
      }));
      
      // Sort waypoints by distance from start to maintain route order
      const sortedWaypoints = transformedWaypoints.sort((a: any, b: any) => 
        a.distance_from_start - b.distance_from_start
      );
      
      setDisplayedWaypoints(sortedWaypoints);
      console.log(`[WAYPOINTS] Updated ${sortedWaypoints.length} waypoint times`);
      
    } catch (error: any) {
      console.error('[WAYPOINTS] Error updating waypoint times:', error);
      setWaypointsError(error.message || 'Failed to update waypoint times');
    } finally {
      setLoadingWaypoints(false);
    }
  };

  const handleTimePickerConfirm = (selectedTime: string) => {
    const newSettings: StartTimeSettings = {
      use_current_time: false,
      custom_time: selectedTime,
    };
    setCustomTime(selectedTime);
    setShowTimePicker(false);
    setShowTimeDropdown(false);
    handleStartTimeChange(newSettings);
  };

  const adjustTime = (type: 'hour' | 'minute', direction: 'up' | 'down') => {
    const [hour, minute] = timeInput.split(':').map(Number);
    
    if (type === 'hour') {
      let newHour = direction === 'up' ? hour + 1 : hour - 1;
      if (newHour < 0) newHour = 23;
      if (newHour > 23) newHour = 0;
      const newTime = `${newHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      setTimeInput(newTime);
    } else {
      let newMinute = direction === 'up' ? minute + 1 : minute - 1;
      if (newMinute < 0) newMinute = 59;
      if (newMinute > 59) newMinute = 0;
      const newTime = `${hour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
      setTimeInput(newTime);
    }
  };

  const handleTimeInputChange = (text: string) => {
    // Allow only digits and colon
    const cleaned = text.replace(/[^0-9:]/g, '');
    
    // Basic validation for HH:MM format
    if (cleaned.length <= 5) {
      setTimeInput(cleaned);
    }
  };

  const handleTimeInputSubmit = () => {
    // Validate and format the time input
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5]?[0-9])$/;
    if (timeRegex.test(timeInput)) {
      const [hour, minute] = timeInput.split(':').map(Number);
      const formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      handleTimePickerConfirm(formattedTime);
    } else {
      // Reset to current time if invalid
      setTimeInput(customTime);
    }
  };

  const renderTimeDropdown = () => {
    if (!showTimeDropdown) return null;

    return (
      <View style={styles.timeDropdownContainer}>
        <View style={styles.timeInputSection}>
          {/* Time Input Field */}
          <TextInput
            style={styles.timeInputField}
            value={timeInput}
            onChangeText={handleTimeInputChange}
            placeholder="HH:MM"
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="numeric"
            maxLength={5}
            onSubmitEditing={handleTimeInputSubmit}
            autoFocus={false}
          />

          {/* Quick Adjustment Buttons */}
          <View style={styles.timeAdjustButtons}>
            <View style={styles.timeAdjustGroup}>
              <Text style={styles.timeAdjustLabel}>Hour</Text>
              <View style={styles.timeAdjustControls}>
                <TouchableOpacity
                  style={styles.timeAdjustButton}
                  onPress={() => adjustTime('hour', 'up')}
                >
                  <Ionicons name="chevron-up" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.timeAdjustButton}
                  onPress={() => adjustTime('hour', 'down')}
                >
                  <Ionicons name="chevron-down" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timeAdjustGroup}>
              <Text style={styles.timeAdjustLabel}>Minute</Text>
              <View style={styles.timeAdjustControls}>
                <TouchableOpacity
                  style={styles.timeAdjustButton}
                  onPress={() => adjustTime('minute', 'up')}
                >
                  <Ionicons name="chevron-up" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.timeAdjustButton}
                  onPress={() => adjustTime('minute', 'down')}
                >
                  <Ionicons name="chevron-down" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.timeDropdownActions}>
            <TouchableOpacity
              style={styles.timeDropdownCancelButton}
              onPress={() => {
                setTimeInput(customTime);
                setShowTimeDropdown(false);
              }}
            >
              <Text style={styles.timeDropdownCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.timeDropdownConfirmButton}
              onPress={handleTimeInputSubmit}
            >
              <Text style={styles.timeDropdownConfirmText}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const toggleWaypointsView = () => {
    // Animate the toggle
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    setShowAllWaypoints(!showAllWaypoints);
  };

  const handleToggleSkipWaypoint = (waypointId: string) => {
    setSkippedWaypointIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(waypointId)) {
        newSet.delete(waypointId);
      } else {
        newSet.add(waypointId);
      }
      return newSet;
    });
  };


  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Section Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="location" size={18} color={theme.colors.primary} />
          <Text style={styles.headerTitle}>Waypoints</Text>
        </View>
        <Text style={styles.waypointCount}>
          {displayedWaypoints.length} waypoints
        </Text>
      </View>

      {/* Start Time Button */}
      <TouchableOpacity
        style={[styles.startTimeButton, isUpdating && styles.startTimeButtonDisabled]}
        onPress={() => {
          if (startTimeSettings.use_current_time) {
            setShowTimeDropdown(!showTimeDropdown);
          } else {
            // Reset to current time
            handleStartTimeChange({ use_current_time: true });
          }
        }}
        disabled={isUpdating}
      >
        <Ionicons 
          name={startTimeSettings.use_current_time ? (showTimeDropdown ? "chevron-up" : "time-outline") : "refresh-outline"} 
          size={20} 
          color={theme.colors.primary} 
        />
        <Text style={styles.startTimeText}>
          {isUpdating ? 'Updating...' : formatDisplayTime()}
        </Text>
        {!startTimeSettings.use_current_time && (
          <Ionicons name="checkmark-circle" size={20} color="#34C759" />
        )}
      </TouchableOpacity>

      {/* Time Dropdown */}
      {renderTimeDropdown()}

      {/* Toggle Switch */}
      <View style={styles.toggleContainer}>
        <View style={styles.toggleLabel}>
          <Ionicons name="eye-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.toggleText}>Show all waypoints</Text>
        </View>
        <Switch
          value={showAllWaypoints}
          onValueChange={toggleWaypointsView}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
          thumbColor={showAllWaypoints ? theme.colors.primary : theme.colors.textSecondary}
          ios_backgroundColor={theme.colors.border}
        />
      </View>

      {/* Waypoints List */}
      <Animated.View style={[
        styles.waypointsList,
        {
          transform: [{
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 10],
            }),
          }],
        },
      ]}>
        {loadingWaypoints ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading waypoints...</Text>
          </View>
        ) : waypointsError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={24} color="#FF3B30" />
            <Text style={styles.errorText}>{waypointsError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => filterWaypoints()}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : displayedWaypoints.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No waypoints available for this route</Text>
          </View>
        ) : (
          displayedWaypoints.map((waypoint, index) => (
            <WaypointItem
              key={waypoint.id}
              waypoint={waypoint}
              isLast={index === displayedWaypoints.length - 1}
              isSkipped={skippedWaypointIds.has(waypoint.id)}
              onToggleSkip={() => handleToggleSkipWaypoint(waypoint.id)}
            />
          ))
        )}
      </Animated.View>

    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  waypointCount: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  startTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
    marginBottom: theme.spacing.sm,
  },
  startTimeButtonDisabled: {
    opacity: 0.6,
  },
  startTimeText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 13,
    marginHorizontal: theme.spacing.sm,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginLeft: theme.spacing.sm,
  },
  waypointsList: {
    paddingBottom: theme.spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  errorText: {
    ...theme.typography.body,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  retryButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Time Dropdown Styles
  timeDropdownContainer: {
    backgroundColor: theme.colors.background,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  timeInputSection: {
    padding: theme.spacing.md,
  },
  timeInputField: {
    ...theme.typography.h2,
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timeAdjustButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  timeAdjustGroup: {
    alignItems: 'center',
  },
  timeAdjustLabel: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  timeAdjustControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeAdjustButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
  },
  timeDropdownActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeDropdownCancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginRight: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timeDropdownConfirmButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginLeft: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primary,
  },
  timeDropdownCancelText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  timeDropdownConfirmText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default WaypointsSection;

