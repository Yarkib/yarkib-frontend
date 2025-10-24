export interface Waypoint {
  id: string;
  name: string;
  category: 'gas_station' | 'restaurant' | 'coffee_shop' | 'hotel' | 'shop' | 'other';
  estimated_arrival_time: string; // Format: "HH:MM" (24-hour)
  distance_from_start: number; // Distance in kilometers from route start
  coordinates: {
    latitude: number;
    longitude: number;
  };
  address?: string;
  is_major: boolean; // true for gas_station, restaurant, coffee_shop
}

export interface WaypointTimeUpdate {
  waypoint_id: string;
  estimated_arrival_time: string;
}

export interface StartTimeSettings {
  use_current_time: boolean;
  custom_time?: string; // Format: "HH:MM" (24-hour)
}
