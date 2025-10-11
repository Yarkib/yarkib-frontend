import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Waypoint } from '../types/waypoint';

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
    <View style={styles.container}>
      {/* Timeline */}
      <View style={styles.timelineContainer}>
        {/* Dot */}
        <View style={[
          styles.dot,
          waypoint.is_major && styles.dotMajor
        ]}>
          <Ionicons 
            name={getCategoryIcon(waypoint.category)} 
            size={waypoint.is_major ? 10 : 8} 
            color={waypoint.is_major ? '#000' : '#666'}
          />
        </View>
        
        {/* Connecting line */}
        {!isLast && <View style={styles.line} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <Text style={[
            styles.name,
            waypoint.is_major && styles.nameMajor
          ]} numberOfLines={1}>
            {waypoint.name}
          </Text>
          
          <Text style={styles.time}>
            {formatTime(waypoint.estimated_arrival_time)}
          </Text>
        </View>

        <View style={styles.secondaryInfo}>
          <Text style={styles.category}>
            {waypoint.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Text>
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 1,
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
  line: {
    position: 'absolute',
    top: 24,
    bottom: -12,
    width: 1.5,
    backgroundColor: '#E8E8E8',
    zIndex: 1,
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
  time: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
    letterSpacing: 0.3,
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
  address: {
    fontSize: 11,
    fontWeight: '300',
    color: '#AAA',
    fontStyle: 'normal',
    marginTop: 2,
    letterSpacing: 0.1,
  },
});

export default WaypointItem;
