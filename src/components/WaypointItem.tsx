import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Waypoint } from '../types/waypoint';
import { theme } from '../theme';

interface WaypointItemProps {
  waypoint: Waypoint;
  isLast?: boolean;
}

const WaypointItem: React.FC<WaypointItemProps> = ({ waypoint, isLast = false }) => {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'gas_station':
        return 'car-outline';
      case 'restaurant':
        return 'restaurant-outline';
      case 'coffee_shop':
        return 'cafe-outline';
      default:
        return 'location-outline';
    }
  };

  const getCategoryColor = (category: string, isMajor: boolean) => {
    if (!isMajor) return theme.colors.textSecondary;
    
    switch (category) {
      case 'gas_station':
        return '#FF9500'; // Orange
      case 'restaurant':
        return '#FF3B30'; // Red
      case 'coffee_shop':
        return '#8B4513'; // Brown
      default:
        return theme.colors.primary;
    }
  };

  const getBackgroundColor = (isMajor: boolean) => {
    if (!isMajor) return theme.colors.cardBackground;
    
    return theme.colors.primary + '10'; // Primary color with 10% opacity
  };

  const formatTime = (timeString: string) => {
    // Handle both "HH:MM" and "H:MM AM/PM" formats
    if (timeString.includes('AM') || timeString.includes('PM')) {
      // Already in AM/PM format, return as is
      return timeString;
    } else {
      // Convert "HH:MM" to "H:MM AM/PM" format
      const [hours, minutes] = timeString.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
  };

  const categoryColor = getCategoryColor(waypoint.category, waypoint.is_major);
  const backgroundColor = getBackgroundColor(waypoint.is_major);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.timelineContainer}>
        {/* Timeline line */}
        <View style={[styles.timelineLine, { backgroundColor: categoryColor }]} />
        
        {/* Waypoint icon */}
        <View style={[styles.iconContainer, { backgroundColor: categoryColor }]}>
          <Ionicons 
            name={getCategoryIcon(waypoint.category)} 
            size={waypoint.is_major ? 14 : 12} 
            color="#FFFFFF" 
          />
        </View>
        
        {/* Timeline line to next item (if not last) */}
        {!isLast && (
          <View style={[styles.timelineLineNext, { backgroundColor: theme.colors.border }]} />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[
            styles.waypointName, 
            waypoint.is_major && styles.majorWaypointName
          ]}>
            {waypoint.name}
          </Text>
          
          {waypoint.is_major && (
            <View style={[styles.badge, { backgroundColor: categoryColor }]}>
              <Text style={styles.badgeText}>
                {waypoint.category.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          <Text style={styles.category}>
            {waypoint.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Text>
          
          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.arrivalTime}>
              {formatTime(waypoint.estimated_arrival_time)}
            </Text>
          </View>
        </View>

        {waypoint.address && (
          <Text style={styles.address} numberOfLines={1}>
            {waypoint.address}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginHorizontal: theme.spacing.md,
    marginVertical: 2,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  timelineContainer: {
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    position: 'relative',
  },
  timelineLine: {
    width: 2,
    height: 8,
    borderRadius: 1,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  timelineLineNext: {
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  waypointName: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  majorWaypointName: {
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: theme.spacing.xs,
  },
  badgeText: {
    ...theme.typography.body,
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  category: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrivalTime: {
    ...theme.typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    marginLeft: 4,
  },
  address: {
    ...theme.typography.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
});

export default WaypointItem;
