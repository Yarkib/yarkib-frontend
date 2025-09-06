export interface Route {
  id: string;                   // UUID
  name: string;                 // Route name
  description?: string;         // Route description
  distance: number;             // Distance in kilometers
  duration: number;             // Duration in minutes
  difficulty: 'easy' | 'intermediate' | 'hard';  // Difficulty level
  elevation_gain?: number;      // Elevation gain in meters
  start_location?: {            // Starting point
    latitude: number;
    longitude: number;
    address?: string;
  };
  end_location?: {              // Ending point
    latitude: number;
    longitude: number;
    address?: string;
  };
  start_point_name?: string | null; // Name of the starting point
  end_point_name?: string | null;   // Name of the ending point
  route_points?: Array<{        // Array of points along the route
    latitude: number;
    longitude: number;
  }>;
  elevation_profile?: Array<{   // Array of elevation data points
    distance: number;           // Distance from start in kilometers
    elevation: number;          // Elevation at this point in meters
  }> | null;
  max_elevation?: number | null; // Maximum elevation in meters
  category_id?: string;         // UUID of the category
  images?: string[];            // Array of image URLs
  rating?: number;              // Average rating (0-5)
  review_count?: number;        // Number of reviews
  tags?: string[];              // Array of tags
  created_at?: string;          // ISO date string
  updated_at?: string;          // ISO date string
  gpx_file_url?: string | null; // URL to GPX file
  google_maps_url?: string | null; // Google Maps URL
  categories?: {                // Category information
    name: string;
    icon: string;
  };
  // User interaction states
  is_saved?: boolean;           // Whether the current user has saved this route
  is_completed?: boolean;       // Whether the current user has completed this route
}

// Route action button states
export interface RouteActionState {
  isSaved: boolean;
  isCompleted: boolean;
  savingLoading: boolean;
  completingLoading: boolean;
}

// Route action button props
export interface RouteActionButtonsProps {
  routeId: string;
  userId: string;
  accessToken: string;
  initialSaved?: boolean;
  initialCompleted?: boolean;
  onSaveChange?: (saved: boolean) => void;
  onCompleteChange?: (completed: boolean) => void;
  onRouteUpdate?: (updates: { is_saved?: boolean; is_completed?: boolean }) => void;
  style?: 'compact' | 'full'; // Button style variant
}
