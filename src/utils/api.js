// import { Platform } from 'react-native';
import { getApiBaseUrl, getTimeout, isMockMode } from '../config/config.js';
import { getRedirectUri } from '../config/oauth';

export const getBaseUrl = () => {
  // Use centralized configuration
  return getApiBaseUrl();
};

// For debugging, log the base URL
const BASE_URL = getBaseUrl();
console.log(`[CONFIG] Using API base URL: ${BASE_URL}`);

// Function to check if the backend is available
export const checkBackendConnection = async () => {
  try {
    console.log(`[CONFIG] Checking backend connection at ${BASE_URL}/health...`);
    
    // Add a timeout to the fetch request to avoid long waits
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), getTimeout('CONNECTION_CHECK'))
    );
    
    const fetchPromise = fetch(`${BASE_URL}/health`, { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Race between fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[CONFIG] Backend is available: ${JSON.stringify(data)}`);
      return true;
    } else {
      console.log(`[CONFIG] Backend returned status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`[CONFIG] Backend connection failed: ${error.message}`);
    console.log(`[CONFIG] Please check that your backend server is running at ${BASE_URL}`);
    console.log(`[CONFIG] If using a physical device, make sure it's on the same network as your server`);
    console.log(`[CONFIG] Update the IP address in src/utils/api.js if needed`);
    return false;
  }
};

// Try to check backend connection immediately
checkBackendConnection().then(isAvailable => {
  console.log(`[CONFIG] Backend availability: ${isAvailable}`);
  
  // If backend is available, test all endpoints
  if (isAvailable) {
    testBackendEndpoints();
  }
});

// Function to test all backend endpoints
const testBackendEndpoints = async () => {
  const endpoints = [
    '/auth/email/signup',
    '/auth/email/login',
    '/auth/signin',
    '/auth/callback',
    '/auth/signup',
    '/auth/user'
  ];
  
  console.log('[CONFIG] Testing all backend endpoints...');
  
  for (const endpoint of endpoints) {
    try {
      console.log(`[CONFIG] Testing endpoint: ${BASE_URL}${endpoint}`);
      
      // Use OPTIONS request to check if endpoint exists without modifying data
      const response = await fetch(`${BASE_URL}${endpoint}`, { 
        method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log(`[CONFIG] Endpoint ${endpoint} status: ${response.status}`);
    } catch (error) {
      console.error(`[CONFIG] Error testing endpoint ${endpoint}: ${error.message}`);
    }
  }
};

// IMPORTANT: Mock mode is now controlled by centralized configuration
export const MOCK_MODE = isMockMode();

// Helper function to transform backend route data to frontend format
const transformRouteData = (data) => {
  console.log('[ROUTE TRANSFORM] Route:', data.id, data.name, '| Coords:', !!data.coordinates, '| Waypoints:', !!data.waypoints, '| RoutePoints:', !!data.route_points, '| Elevation:', !!data.elevation_profile, '| GPX:', !!data.gpx_file_url);
  
  // If data already has the correct format, return as-is
  if (data.route_points && data.start_location && data.end_location) {
    console.log('[ROUTE TRANSFORM] Data already in correct format - no transformation needed');
    return data;
  }
  
  // Log what data sources are missing
  if (!data.coordinates && !data.waypoints && !data.route_points && !data.elevation_profile) {
    console.warn('[ROUTE TRANSFORM] ⚠️ No coordinate data available!', {
      hasGPX: !!data.gpx_file_url,
      gpxUrl: data.gpx_file_url
    });
  }
  
  // If we have coordinates from the dedicated endpoint, use them directly
  if (data.coordinates && Array.isArray(data.coordinates) && data.coordinates.length > 0) {
    console.log('[ROUTE TRANSFORM] Using coordinates from dedicated endpoint');
    return {
      ...data,
      route_points: data.coordinates,
      // start_location and end_location should already be in the response
    };
  }
  
  const transformed = { ...data };
  let transformApplied = false;
  
  // Transform waypoints array if it exists (with lat/lon format)
  if (data.waypoints && Array.isArray(data.waypoints) && data.waypoints.length > 0) {
    console.log('[ROUTE TRANSFORM] Found waypoints array with', data.waypoints.length, 'points');
    
    transformApplied = true;
    transformed.route_points = data.waypoints.map(wp => ({
      latitude: wp.lat || wp.latitude,
      longitude: wp.lon || wp.longitude,
    }));
    
    console.log('[ROUTE TRANSFORM] Created route_points:', transformed.route_points.length, 'points');
    
    // Set start and end locations from first and last waypoints
    const firstWaypoint = data.waypoints[0];
    const lastWaypoint = data.waypoints[data.waypoints.length - 1];
    
    transformed.start_location = {
      latitude: firstWaypoint.lat || firstWaypoint.latitude,
      longitude: firstWaypoint.lon || firstWaypoint.longitude,
      address: firstWaypoint.address || data.start_point_name,
    };
    
    transformed.end_location = {
      latitude: lastWaypoint.lat || lastWaypoint.latitude,
      longitude: lastWaypoint.lon || lastWaypoint.longitude,
      address: lastWaypoint.address || data.end_point_name,
    };
    
    console.log('[ROUTE TRANSFORM] Created start_location and end_location');
  } 
  // Try elevation_profile if it has lat/lon coordinates
  else if (data.elevation_profile && Array.isArray(data.elevation_profile) && data.elevation_profile.length > 0) {
    const firstPoint = data.elevation_profile[0];
    
    // Check if elevation_profile contains lat/lon (some routes store coordinates here)
    if (firstPoint.lat !== undefined && firstPoint.lon !== undefined) {
      console.log('[ROUTE TRANSFORM] Found elevation_profile with coordinates, converting to route_points');
      console.log('[ROUTE TRANSFORM] Elevation profile has', data.elevation_profile.length, 'points');
      
      transformApplied = true;
      transformed.route_points = data.elevation_profile.map(point => ({
        latitude: point.lat || point.latitude,
        longitude: point.lon || point.longitude,
      }));
      
      console.log('[ROUTE TRANSFORM] Created route_points from elevation:', transformed.route_points.length, 'points');
      
      // Set start and end locations
      const firstElevPoint = data.elevation_profile[0];
      const lastElevPoint = data.elevation_profile[data.elevation_profile.length - 1];
      
      transformed.start_location = {
        latitude: firstElevPoint.lat || firstElevPoint.latitude,
        longitude: firstElevPoint.lon || firstElevPoint.longitude,
        address: data.start_point_name,
      };
      
      transformed.end_location = {
        latitude: lastElevPoint.lat || lastElevPoint.latitude,
        longitude: lastElevPoint.lon || lastElevPoint.longitude,
        address: data.end_point_name,
      };
      
      console.log('[ROUTE TRANSFORM] Created start/end locations from elevation data');
    } else {
      console.log('[ROUTE TRANSFORM] Elevation profile exists but has no coordinates (distance/elevation only)');
    }
  } else {
    console.log('[ROUTE TRANSFORM] No waypoints or elevation_profile with coordinates found');
  }
  
  // Transform elevation_profile if it exists
  if (data.elevation_profile && Array.isArray(data.elevation_profile)) {
    transformed.elevation_profile = data.elevation_profile.map(point => ({
      distance: point.distance,
      elevation: point.elevation,
    }));
  }
  
  console.log('[ROUTE TRANSFORM] Complete. Applied:', transformApplied, '| Points:', transformed.route_points?.length || 0, '| Start:', !!transformed.start_location, '| End:', !!transformed.end_location);
  
  return transformed;
};

// Function to fetch individual route details
export const fetchRouteDetails = async (routeId) => {
  try {
    const baseUrl = getBaseUrl();
    const routeUrl = `${baseUrl}/routes/${routeId}`;
    console.log(`[ROUTE DETAILS] Fetching route details from ${routeUrl}`);
    
    const response = await fetch(routeUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ROUTE DETAILS] HTTP error! status: ${response.status}, body: ${errorText}`);
      
      if (response.status === 404) {
        throw new Error('Route not found');
      }
      
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[ROUTE DETAILS] Received:', data.id, data.name, '| Dist:', data.distance, 'km | Duration:', data.duration, 'min');
    console.log('[ROUTE DETAILS] Data: Waypoints:', data.waypoints?.length || 0, '| RoutePoints:', data.route_points?.length || 0, '| Elevation:', data.elevation_profile?.length || 0);
    
    // Transform the data to match frontend expectations
    const transformedData = transformRouteData(data);
    
    console.log('[ROUTE DETAILS] Transformed: RoutePoints:', transformedData.route_points?.length || 0);
    
    return transformedData;
  } catch (error) {
    console.error('[ROUTE DETAILS] Error fetching route details:', error);
    throw error;
  }
};

// Function to fetch route coordinates (geometry)
export const fetchRouteCoordinates = async (routeId) => {
  try {
    const baseUrl = getBaseUrl();
    const coordinatesUrl = `${baseUrl}/routes/${routeId}/coordinates`;
    console.log(`[ROUTE COORDINATES] Fetching coordinates from ${coordinatesUrl}`);
    
    const response = await fetch(coordinatesUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ROUTE COORDINATES] HTTP error! status: ${response.status}, body: ${errorText}`);
      
      if (response.status === 404) {
        throw new Error('Route coordinates not available');
      }
      
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[ROUTE COORDINATES] Received:', data.route_id, '| Points:', data.coordinates?.length || 0);
    return data;
  } catch (error) {
    console.error('[ROUTE COORDINATES] Error fetching route coordinates:', error);
    throw error;
  }
};

// Function to fetch route elevation profile
export const fetchRouteElevation = async (routeId) => {
  try {
    const baseUrl = getBaseUrl();
    const elevationUrl = `${baseUrl}/routes/${routeId}/elevation`;
    console.log(`[ELEVATION] Fetching route elevation profile from ${elevationUrl}`);
    
    const response = await fetch(elevationUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ELEVATION] HTTP error! status: ${response.status}, body: ${errorText}`);
      
      if (response.status === 404) {
        throw new Error('Elevation data not available for this route');
      }
      
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[ELEVATION] Received: Points:', data?.elevation_profile?.length || 0, '| Max:', data?.max_elevation || 0);
    return data;
  } catch (error) {
    console.error('[ELEVATION] Error fetching route elevation profile:', error);
    throw error;
  }
};

export const authApi = {
  login: async (userData) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log('[MOCK] Login with email:', userData.email);
      
      // Simulate email verification check
      // In a real app, this would be determined by the backend
      const isVerified = true; // Set to false to test unverified email flow
      
      if (!isVerified) {
        return {
          message: 'Email not verified',
          success: false,
          error: 'Please verify your email before logging in'
        };
      }
      
      return {
        message: 'Logged in',
        success: true,
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            email: userData.email,
            name: 'Rider'
          }
        }
      };
    }
    
    try {
      // Only use mock data if MOCK_MODE is true
      // This ensures we always try to connect to the real backend when MOCK_MODE is false
      
      console.log('[REAL] Calling backend /auth/email/login...');
      console.log(`[REAL] Full URL: ${BASE_URL}/auth/email/login`);
      console.log('[REAL] Login payload:', userData);
      
      const response = await fetch(`${BASE_URL}/auth/email/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[REAL] HTTP error! status: ${response.status}, body: ${errorText}`);
        
        // Try to parse the error as JSON
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            throw new Error(errorJson.error);
          }
        } catch (_e) {
          // If it's not valid JSON, use the text as is
          if (errorText && errorText.length < 100) {
            throw new Error(errorText);
          }
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[REAL] Received login response:', data);
      return data;
    } catch (error) {
      console.error('[REAL] Login error:', error);
      // Do not fall back to mock data when MOCK_MODE is false
      throw error;
    }
  },
  
  signIn: async (provider, options = null, platform = null) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log(`[MOCK] Sign in with ${provider}`);
      return {
        url: 'https://mock-oauth-url.com',
        provider: provider,
        session: null
      };
    }
    
    try {
      // Use mobile-specific endpoint for mobile platform
      const endpoint = platform === 'mobile' ? '/auth/mobile/signin' : '/auth/signin';
      console.log(`[REAL] Calling backend ${endpoint} for ${provider}...`);
      console.log(`[REAL] Full URL: ${BASE_URL}${endpoint}`);
      
      // Get the redirect URI for the app
      const redirectUri = getRedirectUri(provider);
      console.log(`[REAL] Using redirect URI: ${redirectUri}`);
      
      // Include the redirect URI and platform in the request
      const payload = { 
        provider,
        redirect_uri: redirectUri, // Send the app's redirect URI to the backend (using snake_case for backend compatibility)
        platform: platform || 'web' // Include platform parameter
      };
      
      console.log('[REAL] Request payload:', payload);
      
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[REAL] HTTP error! status: ${response.status}, body: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[REAL] Received response from backend:`, data);
      
      // Return the data as-is from the backend
      return data;
    } catch (error) {
      console.error('[REAL] Sign in error:', error);
      throw error;
    }
  },

  signup: async (userData) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log('[MOCK] Sign up with user data:', userData);
      
      // Email/password signup path
      if (userData.email && userData.password) {
        console.log('[MOCK] Email signup detected');
        return {
          message: 'New user',
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            user: {
              id: 'mock-user-id',
              email: userData.email,
              name: userData.name || 'Rider',
              username: userData.username || 'rider'
            }
          }
        };
      }
      
      // Otherwise, it's completing signup after OAuth
      return {
        message: 'Signed up',
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
                      user: {
              id: 'mock-user-id',
              email: 'rider@example.com',
              name: userData.name || 'Rider'
            }
        }
      };
    }
    
    try {
      // Determine email/password signup vs OAuth completion if needed in future
      
      // Use the correct endpoint based on your backend configuration
      const endpoint = `${BASE_URL}/auth/email/signup`;
      
      console.log(`[REAL] Calling backend ${endpoint}...`);
      console.log('[REAL] Request payload:', userData);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorText = await response.text();
          console.error(`[REAL] HTTP error! status: ${response.status}, body: ${errorText}`);
          
          // Try to parse the error as JSON
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              errorMessage = errorJson.error;
            }
          } catch (_e) {
            // If it's not valid JSON, use the text as is
            if (errorText) {
              errorMessage = errorText;
            }
          }
        } catch (_e) {
          console.error('[REAL] Could not read error response:', _e);
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('[REAL] Received signup response:', data);
      return data;
    } catch (error) {
      console.error('[REAL] Signup error:', error);
      // Do not fall back to mock data when MOCK_MODE is false
      throw error;
    }
  },

  handleOAuthCallback: async (code, codeVerifier) => {
    if (MOCK_MODE) {
      // Return mock data for development
      console.log('[MOCK] OAuth callback with code:', code);
      return {
        message: 'Logged in',
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            email: 'rider@example.com',
            name: 'Rider'
          }
        }
      };
    }
    
    try {
      console.log('[REAL] Handling OAuth callback with code:', code);
      
      // For direct OAuth flow, we need to exchange the code for tokens
      // We'll use the backend's callback endpoint for this
      const body = { code };
      
      // Add code_verifier if provided (for PKCE)
      if (codeVerifier) {
        body.code_verifier = codeVerifier;
      }
      
      console.log(`[REAL] Callback request body:`, body);
      
      const response = await fetch(`${BASE_URL}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[REAL] HTTP error! status: ${response.status}, body: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[REAL] Received callback response:', data);
      return data;
    } catch (error) {
      console.error('[REAL] OAuth callback error:', error);
      throw error;
    }
  },
  
  // Get all routes
  getRoutes: async () => {
    if (MOCK_MODE) {
      console.log('[MOCK] Getting routes');
      // Return mock data for development
      return [
        {
          id: "route_1",
          name: "Scenic Mountain Trail",
          description: "Beautiful mountain trail with stunning views",
          distance: 25.5,
          duration: 120,
          difficulty: "intermediate",
          elevation_gain: 450,
          rating: 4.5,
          review_count: 128,
          tags: ["scenic", "mountain", "paved"],
        },
        {
          id: "route_2",
          name: "City Loop",
          description: "Popular urban route through downtown",
          distance: 15.2,
          duration: 60,
          difficulty: "easy",
          elevation_gain: 120,
          rating: 4.2,
          review_count: 95,
          tags: ["urban", "flat", "popular"],
        },
        {
          id: "route_3",
          name: "Coastal Highway",
          description: "Breathtaking views along the coast",
          distance: 40.0,
          duration: 180,
          difficulty: "hard",
          elevation_gain: 850,
          rating: 4.8,
          review_count: 76,
          tags: ["coastal", "scenic", "challenging"],
        }
      ];
    }
    
    try {
      console.log('[REAL] Getting routes from backend');
      const response = await fetch(`${BASE_URL}/routes`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching routes:', error);
      throw error;
    }
  },
};

// Profile-related API helpers
export const profileApi = {
  getUserProfile: async () => {
    try {
      const response = await fetch(`${BASE_URL}/me`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[REAL] getUserProfile error:', error);
      throw error;
    }
  },

  getUserStats: async () => {
    try {
      const response = await fetch(`${BASE_URL}/me/stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[REAL] getUserStats error:', error);
      throw error;
    }
  },

  getSavedRoutes: async () => {
    try {
      const response = await fetch(`${BASE_URL}/me/saved-routes`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[REAL] getSavedRoutes error:', error);
      throw error;
    }
  },

  getCompletedRides: async () => {
    try {
      const response = await fetch(`${BASE_URL}/me/completed-rides`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[REAL] getCompletedRides error:', error);
      throw error;
    }
  },

  updateUserSummary: async (summary) => {
    try {
      const response = await fetch(`${BASE_URL}/me/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ summary }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[REAL] updateUserSummary error:', error);
      throw error;
    }
  },

  uploadAvatar: async (userId, imageUri, token) => {
    try {
      console.log('[AVATAR API] Uploading avatar for user:', userId);
      console.log('[AVATAR API] Image URI:', imageUri);
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Extract file extension from URI
      const fileExtension = imageUri.split('.').pop() || 'jpg';
      const fileName = `avatar_${userId}_${Date.now()}.${fileExtension}`;
      
      // Add the image file to FormData
      formData.append('avatar', {
        uri: imageUri,
        type: `image/${fileExtension}`,
        name: fileName,
      });
      
      console.log('[AVATAR API] Uploading to:', `${BASE_URL}/users/${userId}/avatar`);
      
      const response = await fetch(`${BASE_URL}/users/${userId}/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - let FormData set it with boundary
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AVATAR API] Upload failed:', response.status, errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[AVATAR API] Upload successful:', data);
      return data;
    } catch (error) {
      console.error('[AVATAR API] uploadAvatar error:', error);
      throw error;
    }
  },

  uploadAvatarFromFile: async (userId, file, token) => {
    try {
      console.log('[AVATAR API] Uploading avatar from file for user:', userId);
      console.log('[AVATAR API] File:', file.name, file.type, file.size);
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Add the file directly (works on web)
      formData.append('avatar', file, file.name);
      
      console.log('[AVATAR API] Uploading to:', `${BASE_URL}/users/${userId}/avatar`);
      
      const response = await fetch(`${BASE_URL}/users/${userId}/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - let FormData set it with boundary
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AVATAR API] Upload failed:', response.status, errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[AVATAR API] Upload successful:', data);
      return data;
    } catch (error) {
      console.error('[AVATAR API] uploadAvatarFromFile error:', error);
      throw error;
    }
  },

  deleteAvatar: async (userId, token) => {
    try {
      console.log('[AVATAR API] Deleting avatar for user:', userId);
      
      const response = await fetch(`${BASE_URL}/users/${userId}/avatar`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AVATAR API] Delete failed:', response.status, errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[AVATAR API] Delete successful:', data);
      return data;
    } catch (error) {
      console.error('[AVATAR API] deleteAvatar error:', error);
      throw error;
    }
  },
};

// User routes endpoints using Supabase JWT (Authorization: Bearer <token>)
export const userRoutesApi = {
  saveRoute: async (routeId, token, userId, notes = null) => {
    if (MOCK_MODE) {
      console.log(`[MOCK] Saving route ${routeId} with notes:`, notes);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Simulate random success/failure for testing
      const success = Math.random() > 0.1; // 90% success rate
      
      if (!success) {
        throw new Error('Route already saved or server error');
      }
      
      return {
        success: true,
        message: 'Route saved successfully',
        route_id: routeId,
        saved_at: new Date().toISOString(),
        notes: notes
      };
    }
    
    const response = await fetch(`${BASE_URL}/user/routes/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        user_id: userId, 
        route_id: routeId 
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  unsaveRoute: async (routeId, token, userId) => {
    if (MOCK_MODE) {
      console.log(`[MOCK] Unsaving route ${routeId}`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 600));
      
      return {
        success: true,
        message: 'Route removed from saved routes',
        route_id: routeId
      };
    }
    
    const response = await fetch(`${BASE_URL}/user/routes/unsave`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        user_id: userId, 
        route_id: routeId 
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  completeRoute: async (routeId, token, userId, completionData = {}) => {
    if (MOCK_MODE) {
      console.log(`[MOCK] Completing route ${routeId} with data:`, completionData);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate random success/failure for testing
      const success = Math.random() > 0.05; // 95% success rate
      
      if (!success) {
        throw new Error('Failed to complete route - please try again');
      }
      
      return {
        success: true,
        message: 'Route completed successfully!',
        route_id: routeId,
        completed_at: new Date().toISOString(),
        rating: completionData.rating || null,
        notes: completionData.notes || null,
        completion_stats: {
          total_distance: Math.floor(Math.random() * 100) + 50,
          total_time: Math.floor(Math.random() * 120) + 60,
          calories_burned: Math.floor(Math.random() * 500) + 200
        }
      };
    }
    
    const response = await fetch(`${BASE_URL}/user/routes/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        user_id: userId, 
        route_id: routeId,
        ...completionData 
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  listUserRoutes: async (status, token) => {
    if (MOCK_MODE) {
      console.log(`[MOCK] Listing user routes with status: ${status}`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Return mock data based on status
      if (status === 'saved') {
        return [
          {
            id: 'route_1',
            name: 'Scenic Mountain Trail',
            distance: 25.5,
            duration: 120,
            difficulty: 'intermediate',
            saved_at: '2024-01-15T10:30:00Z',
            notes: 'Great weekend ride'
          },
          {
            id: 'route_2',
            name: 'City Loop',
            distance: 15.2,
            duration: 60,
            difficulty: 'easy',
            saved_at: '2024-01-10T14:20:00Z',
            notes: 'Quick evening ride'
          }
        ];
      } else if (status === 'completed') {
        return [
          {
            id: 'route_3',
            name: 'Coastal Highway',
            distance: 40.0,
            duration: 180,
            difficulty: 'hard',
            completed_at: '2024-01-12T09:15:00Z',
            rating: 5,
            notes: 'Amazing views, challenging climb'
          }
        ];
      }
      
      return [];
    }
    
    const response = await fetch(`${BASE_URL}/user/routes?status=${encodeURIComponent(status)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    // Transform embedded route objects if they exist
    if (data.data && Array.isArray(data.data)) {
      console.log('[USER ROUTES] Transforming user routes data');
      data.data = data.data.map(userRoute => {
        if (userRoute.route) {
          return {
            ...userRoute,
            route: transformRouteData(userRoute.route)
          };
        }
        return userRoute;
      });
    } else if (Array.isArray(data)) {
      // If data is directly an array of routes
      console.log('[USER ROUTES] Transforming routes array');
      data = data.map(route => transformRouteData(route));
    }
    
    return data;
  },

  // ✨ Get route status for a specific user and route
  getRouteStatus: async (routeId, userId, token) => {
    if (MOCK_MODE) {
      console.log(`[MOCK] Getting route status for route ${routeId} and user ${userId}`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Return mock status data
      return {
        route_id: routeId,
        user_id: userId,
        is_saved: Math.random() > 0.5, // Random for testing
        is_completed: Math.random() > 0.7, // Random for testing
        saved_at: Math.random() > 0.5 ? new Date().toISOString() : null,
        completed_at: Math.random() > 0.7 ? new Date().toISOString() : null,
      };
    }
    
    const response = await fetch(`${BASE_URL}/user/routes/status/${userId}/${routeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        // Route not found in user's saved/completed routes
        return {
          route_id: routeId,
          user_id: userId,
          is_saved: false,
          is_completed: false,
          saved_at: null,
          completed_at: null,
        };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  },

  getTotals: async (token) => {
    if (MOCK_MODE) {
      console.log(`[MOCK] Getting user totals`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 400));
      
      return {
        total_distance: 1250.5,
        total_routes: 8,
        total_time: 7200,
        average_rating: 4.6
      };
    }
    
    const response = await fetch(`${BASE_URL}/user/stats/total-distance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
};

// Test backend connectivity
export const testBackendConnection = async () => {
  const baseUrl = getBaseUrl();
  console.log(`[CONNECTION TEST] Testing connection to: ${baseUrl}`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000, // 5 second timeout
    });
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.ok) {
      console.log(`[CONNECTION TEST] ✅ Success! Response time: ${responseTime}ms`);
      return { success: true, responseTime, status: response.status };
    } else {
      console.log(`[CONNECTION TEST] ❌ HTTP Error: ${response.status}`);
      return { success: false, status: response.status, error: 'HTTP Error' };
    }
  } catch (error) {
    console.error(`[CONNECTION TEST] ❌ Connection failed:`, error.message);
    return { 
      success: false, 
      error: error.message,
      details: error.toString(),
      baseUrl 
    };
  }
};

// Group Ride API helpers
export const groupRideApi = {
  // Create a new group ride
  createGroupRide: async (routeId, createdBy) => {
    try {
      console.log(`[GROUP RIDE API] Creating group ride for route ${routeId} by user ${createdBy}`);
      
      const response = await fetch(`${getBaseUrl()}/group-rides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route_id: routeId,
          created_by: createdBy,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Create failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to create group ride: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GROUP RIDE API] Group ride created successfully:', data);
      return data;
    } catch (error) {
      console.error('[GROUP RIDE API] Error creating group ride:', error);
      throw error;
    }
  },

  // Invite user to group ride by username
  inviteUser: async (groupRideId, senderId, receiverUsername) => {
    try {
      console.log(`[GROUP RIDE API] Inviting user ${receiverUsername} to group ride ${groupRideId}`);
      
      const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_id: senderId,
          receiver_username: receiverUsername,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Invite failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to invite user: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[GROUP RIDE API] User ${receiverUsername} invited successfully:`, data);
      return data;
    } catch (error) {
      console.error(`[GROUP RIDE API] Error inviting user ${receiverUsername}:`, error);
      throw error;
    }
  },

  // Get group ride details
  getGroupRideDetails: async (groupRideId) => {
    try {
      console.log(`[GROUP RIDE API] Getting details for group ride ${groupRideId}`);
      
      const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Only log non-404 errors as errors, 404s are expected for deleted group rides
        if (response.status === 404) {
          console.log(`[GROUP RIDE API] Group ride not found: ${groupRideId}`);
        } else {
          console.error(`[GROUP RIDE API] Get details failed: ${response.status} - ${errorText}`);
        }
        throw new Error(`Failed to get group ride details: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GROUP RIDE API] Group ride details retrieved:', data);
      return data;
    } catch (error) {
      console.error('[GROUP RIDE API] Error getting group ride details:', error);
      throw error;
    }
  },

  // Accept group ride invitation
  acceptInvitation: async (groupRideId, userId) => {
    try {
      console.log(`[GROUP RIDE API] User ${userId} accepting invitation for group ride ${groupRideId}`);
      
      const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Accept failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to accept invitation: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[GROUP RIDE API] User ${userId} accepted invitation successfully:`, data);
      return data;
    } catch (error) {
      console.error(`[GROUP RIDE API] Error accepting invitation:`, error);
      throw error;
    }
  },

  // Reject group ride invitation
  rejectInvitation: async (groupRideId, userId) => {
    try {
      console.log(`[GROUP RIDE API] User ${userId} rejecting invitation for group ride ${groupRideId}`);
      console.log(`[GROUP RIDE API] Request URL: ${getBaseUrl()}/group-rides/${groupRideId}/reject`);
      console.log(`[GROUP RIDE API] Request body:`, { user_id: userId });
      
      const response = await fetch(`${getBaseUrl()}/group-rides/${groupRideId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
        }),
      });

      console.log(`[GROUP RIDE API] Response status: ${response.status}`);
      console.log(`[GROUP RIDE API] Response headers:`, response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Reject failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to reject invitation: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`[GROUP RIDE API] User ${userId} rejected invitation successfully:`, data);
      return data;
    } catch (error) {
      console.error(`[GROUP RIDE API] Error rejecting invitation:`, error);
      console.error(`[GROUP RIDE API] Error details:`, {
        message: error.message,
        stack: error.stack,
        groupRideId,
        userId
      });
      throw error;
    }
  },

  // Get user's group rides
  getUserGroupRides: async (userId, options = {}) => {
    try {
      const { status = 'active', page = 1, limit = 10 } = options;
      console.log(`[GROUP RIDE API] Getting group rides for user ${userId}`);
      
      const params = new URLSearchParams({
        status,
        page: page.toString(),
        limit: limit.toString(),
      });

      const url = `${getBaseUrl()}/group-rides/user/${userId}?${params}`;
      console.log('[GROUP RIDE API] Requesting URL:', url);
      console.log('[GROUP RIDE API] User ID:', userId);
      console.log('[GROUP RIDE API] Params:', params.toString());
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Get user rides failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get user group rides: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GROUP RIDE API] User group rides retrieved:', JSON.stringify(data, null, 2));
      console.log('[GROUP RIDE API] Response type:', typeof data);
      console.log('[GROUP RIDE API] Is array:', Array.isArray(data));
      console.log('[GROUP RIDE API] Response keys:', data ? Object.keys(data) : 'null');
      return data;
    } catch (error) {
      console.error('[GROUP RIDE API] Error getting user group rides:', error);
      throw error;
    }
  },

  // Search users by query (username or full name)
  searchUsers: async (query) => {
    try {
      console.log(`[GROUP RIDE API] Searching for users with query: ${query}`);
      
      // Use the new comprehensive search endpoint that searches both username and full_name
      const response = await fetch(`${getBaseUrl()}/users/search?q=${encodeURIComponent(query)}&page=1&limit=20`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Search failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to search users: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GROUP RIDE API] User search results:', data);
      return data;
      
    } catch (error) {
      console.error('[GROUP RIDE API] Error searching users:', error);
      throw error;
    }
  },

  // Get user profile by username
  getUserByUsername: async (username) => {
    try {
      console.log(`[GROUP RIDE API] Getting user profile by username: ${username}`);
      
      const response = await fetch(`${getBaseUrl()}/users/username/${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROUP RIDE API] Get user by username failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get user by username: ${response.status}`);
      }

      const data = await response.json();
      console.log('[GROUP RIDE API] User profile by username:', data);
      return data;
      
    } catch (error) {
      console.error('[GROUP RIDE API] Error getting user by username:', error);
      throw error;
    }
  },
};

// Notifications API helpers
export const notificationsApi = {
  // Get user notifications
  getUserNotifications: async (userId, options = {}) => {
    try {
      const { is_read = false, page = 1, limit = 20 } = options;
      console.log(`[NOTIFICATIONS API] Getting notifications for user ${userId}`);
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      // Only add is_read parameter if it's not null (null means fetch all)
      if (is_read !== null) {
        params.append('is_read', is_read.toString());
      }

      const response = await fetch(`${getBaseUrl()}/notifications/${userId}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[NOTIFICATIONS API] Get notifications failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get notifications: ${response.status}`);
      }

      const data = await response.json();
      console.log('[NOTIFICATIONS API] Notifications retrieved:', data);
      return data;
      
    } catch (error) {
      console.error('[NOTIFICATIONS API] Error getting notifications:', error);
      throw error;
    }
  },

  // Mark notification as read
  markNotificationAsRead: async (notificationId, userId) => {
    try {
      console.log(`[NOTIFICATIONS API] Marking notification ${notificationId} as read for user ${userId}`);
      
      const response = await fetch(`${getBaseUrl()}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[NOTIFICATIONS API] Mark as read failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to mark notification as read: ${response.status}`);
      }

      const data = await response.json();
      console.log('[NOTIFICATIONS API] Notification marked as read:', data);
      return data;
      
    } catch (error) {
      console.error('[NOTIFICATIONS API] Error marking notification as read:', error);
      throw error;
    }
  },

  // Get notification count (unread)
  getUnreadCount: async (userId) => {
    try {
      console.log(`[NOTIFICATIONS API] Getting unread count for user ${userId}`);
      
      // Since the backend is not properly filtering by is_read=false, 
      // we'll fetch all notifications and filter on the frontend
      const url = `${getBaseUrl()}/notifications/${userId}?page=1&limit=100`;
      console.log(`[NOTIFICATIONS API] Requesting URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[NOTIFICATIONS API] Get count failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get notification count: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[NOTIFICATIONS API] Raw response data:`, JSON.stringify(data, null, 2));
      
      // Extract notifications from response
      let notificationsData = [];
      if (Array.isArray(data)) {
        notificationsData = data;
      } else if (data.notifications && Array.isArray(data.notifications)) {
        notificationsData = data.notifications;
      } else if (data.data && Array.isArray(data.data)) {
        notificationsData = data.data;
      }
      
      // Filter to only unread notifications (is_read === false or is_read === 0)
      const unreadNotifications = notificationsData.filter(notification => 
        notification.is_read === false || notification.is_read === 0
      );
      
      const count = unreadNotifications.length;
      console.log(`[NOTIFICATIONS API] Total notifications: ${notificationsData.length}, Unread: ${count}`);
      console.log(`[NOTIFICATIONS API] Unread notification IDs:`, unreadNotifications.map(n => n.id));
      
      return count;
      
    } catch (error) {
      console.error('[NOTIFICATIONS API] Error getting unread count:', error);
      throw error;
    }
  },
};

// Waypoints API
export const waypointsApi = {
  // Get major waypoints (gas stations, restaurants, coffee shops)
  getMajorWaypoints: async (routeId, startTime = null) => {
    try {
      console.log(`[WAYPOINTS API] Fetching major waypoints for route ${routeId}`);
      
      let url = `${BASE_URL}/routes/${routeId}/major-waypoints`;
      if (startTime) {
        // Convert to ISO 8601 format if needed
        const isoTime = startTime instanceof Date ? startTime.toISOString() : startTime;
        url += `?start_time=${encodeURIComponent(isoTime)}`;
        console.log(`[WAYPOINTS API] Using custom start time: ${isoTime}`);
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Route not found');
        } else if (response.status === 400) {
          throw new Error('Invalid route ID or parameters');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const data = await response.json();
      console.log(`[WAYPOINTS API] Received response:`, data);
      
      // Handle different response structures
      if (Array.isArray(data)) {
        console.log(`[WAYPOINTS API] Received ${data.length} major waypoints (array format)`);
        return data;
      } else if (data.waypoints && Array.isArray(data.waypoints)) {
        console.log(`[WAYPOINTS API] Received ${data.waypoints.length} major waypoints (object format)`);
        return data.waypoints;
      } else if (data.waypoints_sample) {
        // If only sample data is returned, create array with sample
        console.log(`[WAYPOINTS API] Received sample waypoint, creating array`);
        return [data.waypoints_sample];
      } else {
        console.log(`[WAYPOINTS API] Unexpected response format, returning empty array`);
        return [];
      }
      
    } catch (error) {
      console.error('[WAYPOINTS API] Error fetching major waypoints:', error);
      throw error;
    }
  },

  // Get all waypoints (navigation + major points)
  getAllWaypoints: async (routeId, startTime = null) => {
    try {
      console.log(`[WAYPOINTS API] Fetching all waypoints for route ${routeId}`);
      
      let url = `${BASE_URL}/routes/${routeId}/all-waypoints`;
      if (startTime) {
        // Convert to ISO 8601 format if needed
        const isoTime = startTime instanceof Date ? startTime.toISOString() : startTime;
        url += `?start_time=${encodeURIComponent(isoTime)}`;
        console.log(`[WAYPOINTS API] Using custom start time: ${isoTime}`);
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Route not found');
        } else if (response.status === 400) {
          throw new Error('Invalid route ID or parameters');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const data = await response.json();
      console.log(`[WAYPOINTS API] Received response:`, data);
      
      // Handle different response structures
      if (Array.isArray(data)) {
        console.log(`[WAYPOINTS API] Received ${data.length} total waypoints (array format)`);
        return data;
      } else if (data.waypoints && Array.isArray(data.waypoints)) {
        console.log(`[WAYPOINTS API] Received ${data.waypoints.length} total waypoints (object format)`);
        return data.waypoints;
      } else if (data.waypoints_sample) {
        // If only sample data is returned, create array with sample
        console.log(`[WAYPOINTS API] Received sample waypoint, creating array`);
        return [data.waypoints_sample];
      } else {
        console.log(`[WAYPOINTS API] Unexpected response format, returning empty array`);
        return [];
      }
      
    } catch (error) {
      console.error('[WAYPOINTS API] Error fetching all waypoints:', error);
      throw error;
    }
  },
};