/**
 * Route Utilities
 * Helper functions for route geometry calculations and Mapbox integration
 */

import { getApiBaseUrl } from '../config/config';

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

export interface RoutePreferences {
  type: 'fastest' | 'shortest' | 'scenic';
  profile?: 'cycling' | 'driving' | 'walking';
}

/**
 * Calculate bounds from an array of route points
 */
export const calculateRouteBounds = (points: RoutePoint[]): RouteBounds | null => {
  if (!points || points.length === 0) {
    return null;
  }

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  points.forEach(point => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
};

/**
 * Format route data for Mapbox rendering
 */
export const formatRouteForMapbox = (route: any) => {
  if (!route) return null;

  const routePoints = route.route_points || [];
  
  // Convert route points to GeoJSON LineString format
  const coordinates = routePoints.map((point: RoutePoint) => [
    point.longitude,
    point.latitude,
  ]);

  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates,
    },
    properties: {
      name: route.name,
      distance: route.distance,
      duration: route.duration,
    },
  };
};

/**
 * Validate route points for correct coordinate ranges
 */
export const validateRoutePoints = (points: RoutePoint[]): boolean => {
  if (!Array.isArray(points) || points.length < 2) {
    return false;
  }

  return points.every(point => {
    const lat = point.latitude;
    const lng = point.longitude;
    
    // Check if coordinates are valid numbers
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return false;
    }
    
    // Check if coordinates are in valid ranges
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  });
};

/**
 * Recalculate route using backend API (which proxies to Mapbox Directions API)
 */
export const recalculateRoute = async (
  waypoints: RoutePoint[],
  preferences: RoutePreferences,
  accessToken: string
): Promise<any> => {
  try {
    if (!validateRoutePoints(waypoints)) {
      throw new Error('Invalid route points provided');
    }

    const response = await fetch(`${getApiBaseUrl()}/api/routes/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        waypoints,
        preferences,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to calculate route');
    }

    const data = await response.json();
    return data.route;
  } catch (error) {
    console.error('[ROUTE UTILS] Error recalculating route:', error);
    throw error;
  }
};

/**
 * Fetch Mapbox access token from backend
 */
export const fetchMapboxToken = async (accessToken: string): Promise<string> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/mapbox/token`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Mapbox token');
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('[ROUTE UTILS] Error fetching Mapbox token:', error);
    throw error;
  }
};

/**
 * Convert route points array to Mapbox coordinates string
 * Format: "lng,lat;lng,lat;lng,lat"
 */
export const routePointsToCoordinatesString = (points: RoutePoint[]): string => {
  return points
    .map(point => `${point.longitude},${point.latitude}`)
    .join(';');
};

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in kilometers
 */
export const calculateDistance = (
  point1: RoutePoint,
  point2: RoutePoint
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(point2.latitude - point1.latitude);
  const dLon = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.latitude)) *
      Math.cos(toRadians(point2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

/**
 * Calculate total route distance from array of points
 */
export const calculateTotalDistance = (points: RoutePoint[]): number => {
  if (points.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += calculateDistance(points[i], points[i + 1]);
  }

  return totalDistance;
};

