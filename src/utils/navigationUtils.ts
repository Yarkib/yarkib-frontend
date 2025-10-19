/**
 * Navigation utility functions
 * These will be enhanced with real GPS functionality later
 */

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

/**
 * Convert degrees to radians
 */
const toRad = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

/**
 * Calculate bearing between two points
 */
export const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x);
  bearing = (bearing * 180) / Math.PI;
  bearing = (bearing + 360) % 360;
  
  return bearing;
};

/**
 * Find closest point on route to user's current location
 */
export const findClosestPointOnRoute = (
  userLat: number,
  userLon: number,
  routeCoordinates: Array<[number, number]>
): { index: number; distance: number } => {
  let closestIndex = 0;
  let minDistance = Infinity;

  routeCoordinates.forEach((coord, index) => {
    const distance = calculateDistance(userLat, userLon, coord[1], coord[0]);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = index;
    }
  });

  return { index: closestIndex, distance: minDistance };
};

/**
 * Calculate remaining distance on route from current position
 */
export const calculateRemainingDistance = (
  currentIndex: number,
  routeCoordinates: Array<[number, number]>
): number => {
  let totalDistance = 0;

  for (let i = currentIndex; i < routeCoordinates.length - 1; i++) {
    const [lon1, lat1] = routeCoordinates[i];
    const [lon2, lat2] = routeCoordinates[i + 1];
    totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
  }

  return totalDistance;
};

/**
 * Determine turn direction and type
 */
export const determineTurnType = (
  bearingBefore: number,
  bearingAfter: number
): {
  type: 'straight' | 'turn-slight-right' | 'turn-right' | 'turn-sharp-right' | 
        'turn-slight-left' | 'turn-left' | 'turn-sharp-left' | 'u-turn';
  angle: number;
} => {
  let angle = bearingAfter - bearingBefore;
  
  // Normalize angle to -180 to 180
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;

  const absAngle = Math.abs(angle);

  if (absAngle < 15) {
    return { type: 'straight', angle };
  } else if (absAngle > 165) {
    return { type: 'u-turn', angle };
  } else if (angle > 0) {
    // Right turns
    if (absAngle < 45) return { type: 'turn-slight-right', angle };
    if (absAngle < 135) return { type: 'turn-right', angle };
    return { type: 'turn-sharp-right', angle };
  } else {
    // Left turns
    if (absAngle < 45) return { type: 'turn-slight-left', angle };
    if (absAngle < 135) return { type: 'turn-left', angle };
    return { type: 'turn-sharp-left', angle };
  }
};

/**
 * Format distance for display
 */
export const formatDistance = (distanceKm: number): string => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
};

/**
 * Format time for display
 */
export const formatNavigationTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

/**
 * Calculate ETA
 */
export const calculateETA = (distanceKm: number, speedKmh: number): Date => {
  const hoursRemaining = distanceKm / speedKmh;
  const minutesRemaining = hoursRemaining * 60;
  
  const eta = new Date();
  eta.setMinutes(eta.getMinutes() + minutesRemaining);
  
  return eta;
};

/**
 * Check if user is off route
 */
export const isOffRoute = (
  userLat: number,
  userLon: number,
  routeCoordinates: Array<[number, number]>,
  thresholdMeters: number = 50
): boolean => {
  const { distance } = findClosestPointOnRoute(userLat, userLon, routeCoordinates);
  return distance * 1000 > thresholdMeters; // Convert km to meters
};

/**
 * Generate turn instruction text
 */
export const generateTurnInstruction = (
  turnType: string,
  distanceKm: number,
  streetName?: string
): string => {
  const distance = formatDistance(distanceKm);
  const street = streetName ? ` onto ${streetName}` : '';

  const instructions: { [key: string]: string } = {
    'straight': `Continue straight for ${distance}${street}`,
    'turn-slight-right': `Slight right turn in ${distance}${street}`,
    'turn-right': `Turn right in ${distance}${street}`,
    'turn-sharp-right': `Sharp right turn in ${distance}${street}`,
    'turn-slight-left': `Slight left turn in ${distance}${street}`,
    'turn-left': `Turn left in ${distance}${street}`,
    'turn-sharp-left': `Sharp left turn in ${distance}${street}`,
    'u-turn': `Make a U-turn in ${distance}${street}`,
    'arrive': `Arrive at destination in ${distance}`,
  };

  return instructions[turnType] || `Continue for ${distance}`;
};

/**
 * Get icon name for turn type
 */
export const getTurnIcon = (turnType: string): string => {
  const iconMap: { [key: string]: string } = {
    'straight': 'arrow-up',
    'turn-slight-right': 'arrow-forward',
    'turn-right': 'arrow-forward',
    'turn-sharp-right': 'arrow-forward',
    'turn-slight-left': 'arrow-back',
    'turn-left': 'arrow-back',
    'turn-sharp-left': 'arrow-back',
    'u-turn': 'return-up-back',
    'arrive': 'flag',
  };

  return iconMap[turnType] || 'arrow-forward';
};

/**
 * Smooth coordinates using moving average
 */
export const smoothCoordinates = (
  coordinates: Array<[number, number]>,
  windowSize: number = 3
): Array<[number, number]> => {
  if (coordinates.length < windowSize) return coordinates;

  const smoothed: Array<[number, number]> = [];

  for (let i = 0; i < coordinates.length; i++) {
    let sumLon = 0;
    let sumLat = 0;
    let count = 0;

    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(coordinates.length, i + Math.ceil(windowSize / 2));

    for (let j = start; j < end; j++) {
      sumLon += coordinates[j][0];
      sumLat += coordinates[j][1];
      count++;
    }

    smoothed.push([sumLon / count, sumLat / count]);
  }

  return smoothed;
};

/**
 * Calculate route bounds for map fitting
 */
export const calculateRouteBounds = (
  coordinates: Array<[number, number]>
): {
  ne: [number, number];
  sw: [number, number];
} => {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  coordinates.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return {
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
};

/**
 * Convert speed from m/s to km/h
 */
export const metersPerSecondToKmh = (mps: number): number => {
  return mps * 3.6;
};

/**
 * Convert speed from km/h to m/s
 */
export const kmhToMetersPerSecond = (kmh: number): number => {
  return kmh / 3.6;
};


