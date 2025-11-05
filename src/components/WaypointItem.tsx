import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Waypoint } from '../types/waypoint';

interface WaypointItemProps {
  waypoint: Waypoint;
  isLast?: boolean;
  isSkipped?: boolean;
  onToggleSkip?: () => void;
}

const WaypointItem: React.FC<WaypointItemProps> = ({ 
  waypoint, 
  isLast = false,
  isSkipped = false,
  onToggleSkip
}) => {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'gas_station':
        return 'car-outline';
      case 'restaurant':
        return 'restaurant-outline';
      case 'coffee_shop':
        return 'cafe-outline';
      case 'hotel':
        return 'bed-outline';
      case 'shop':
        return 'storefront-outline';
      default:
        return 'location-outline';
    }
  };

  const formatTime = (timeString: string) => {
    // Handle both "HH:MM" and "H:MM AM/PM" formats
    if (timeString.includes('AM') || timeString.includes('PM')) {
      return timeString;
    } else {
      const [hours, minutes] = timeString.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
  };

  return (
    <View style={[
      styles.container,
      isSkipped && styles.containerSkipped
    ]}>
      {/* Timeline */}
      <View style={styles.timelineContainer}>
        {/* Dot */}
        <View style={[
          styles.dot,
          waypoint.is_major && styles.dotMajor,
          isSkipped && styles.dotSkipped
        ]}>
          <Ionicons 
            name={getCategoryIcon(waypoint.category)} 
            size={waypoint.is_major ? 10 : 8} 
            color={isSkipped ? '#999' : (waypoint.is_major ? '#000' : '#666')}
          />
        </View>
        
        {/* Connecting line */}
        {!isLast && <View style={[styles.line, isSkipped && styles.lineSkipped]} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <Text style={[
            styles.name,
            waypoint.is_major && styles.nameMajor,
            isSkipped && styles.nameSkipped
          ]} numberOfLines={1}>
            {waypoint.name}
          </Text>
          
          <Text style={[styles.time, isSkipped && styles.timeSkipped]}>
            {formatTime(waypoint.estimated_arrival_time)}
          </Text>
        </View>

        <View style={styles.secondaryInfo}>
          {isSkipped && (
            <View style={styles.skippedBadge}>
              <Text style={styles.skippedBadgeText}>SKIPPED</Text>
            </View>
          )}
          <Text style={[styles.category, isSkipped && styles.categorySkipped]}>
            {waypoint.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Text>
        </View>

        {waypoint.address && (
          <Text style={[styles.address, isSkipped && styles.addressSkipped]} numberOfLines={1}>
            {waypoint.address}
          </Text>
        )}
      </View>

      {/* Skip Button */}
      {onToggleSkip && (
        <TouchableOpacity 
          style={[styles.skipButton, isSkipped && styles.skipButtonActive]}
          onPress={onToggleSkip}
          activeOpacity={0.7}
        >
          <Ionicons 
            name={isSkipped ? 'checkmark-circle' : 'close-circle-outline'} 
            size={20} 
            color={isSkipped ? '#34C759' : '#FF3B30'} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 1,
    alignItems: 'center',
  },
  containerSkipped: {
    opacity: 0.6,
  },
  timelineContainer: {
    alignItems: 'center',
    marginRight: 14,
    width: 20,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  dotMajor: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#000',
  },
  dotSkipped: {
    backgroundColor: '#F5F5F5',
    borderColor: '#CCC',
  },
  line: {
    position: 'absolute',
    top: 24,
    bottom: -12,
    width: 1.5,
    backgroundColor: '#E8E8E8',
    zIndex: 1,
  },
  lineSkipped: {
    backgroundColor: '#DDD',
    opacity: 0.5,
  },
  content: {
    flex: 1,
    paddingBottom: 4,
  },
  mainInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '400',
    color: '#333',
    flex: 1,
    marginRight: 12,
    letterSpacing: 0.2,
  },
  nameMajor: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    letterSpacing: 0.3,
  },
  nameSkipped: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  time: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
    letterSpacing: 0.3,
  },
  timeSkipped: {
    color: '#999',
  },
  secondaryInfo: {
    marginBottom: 2,
  },
  category: {
    fontSize: 11,
    fontWeight: '400',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  categorySkipped: {
    color: '#BBB',
  },
  address: {
    fontSize: 11,
    fontWeight: '300',
    color: '#AAA',
    fontStyle: 'normal',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  addressSkipped: {
    color: '#CCC',
  },
  skippedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF3B3020',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  skippedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FF3B30',
    letterSpacing: 0.5,
  },
  skipButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF3B3010',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  skipButtonActive: {
    backgroundColor: '#34C75910',
  },
});

export default WaypointItem;
