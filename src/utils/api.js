// import { Platform } from 'react-native';
import { getRedirectUri } from '../config/oauth';
import { getApiBaseUrl, getTimeout, isMockMode } from '../config/config.js';

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

// Function to fetch route elevation profile
export const fetchRouteElevation = async (routeId) => {
  if (MOCK_MODE) {
    console.log('[MOCK] Fetching route elevation profile for route:', routeId);
    
    // Return different mock data based on route ID for more realistic testing
    if (routeId === 'route_1') {
      return {
        id: routeId,
        name: "Scenic Mountain Trail",
        elevation_profile: Array(20).fill(0).map((_, i) => ({
          distance: i * 1.2,
          elevation: 100 + Math.sin(i / 3) * 100 + i * 10 + (i > 10 ? 50 : 0) // Add more variation
        })),
        max_elevation: 400,
        start_point_name: "Central Park",
        end_point_name: "Times Square"
      };
    } else if (routeId === 'route_2') {
      return {
        id: routeId,
        name: "City River Loop",
        elevation_profile: Array(15).fill(0).map((_, i) => ({
          distance: i * 1.0,
          elevation: 50 + Math.cos(i / 2) * 30 + Math.sin(i) * 40 + i * 5 // More variation
        })),
        max_elevation: 180,
        start_point_name: "Battery Park",
        end_point_name: "Battery Park"
      };
    } else {
      // Generic data for any other route
      return {
        id: routeId,
        name: "Generic Route",
        elevation_profile: Array(25).fill(0).map((_, i) => ({
          distance: i * 0.8,
          elevation: 200 + Math.sin(i / 4) * 50 + Math.cos(i / 2) * 30 + (i % 3 === 0 ? 40 : 0) // Add peaks
        })),
        max_elevation: 320,
        start_point_name: "Starting Point",
        end_point_name: "Ending Point"
      };
    }
  }

  try {
    console.log(`[REAL] Fetching route elevation profile from ${getBaseUrl()}/routes/${routeId}/elevation`);
    const response = await fetch(`${getBaseUrl()}/routes/${routeId}/elevation`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[REAL] HTTP error! status: ${response.status}, body: ${errorText}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[REAL] Received elevation profile data:', data);
    return data;
  } catch (error) {
    console.error('[REAL] Error fetching route elevation profile:', error);
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
              name: userData.name || 'Rider'
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
    return response.json();
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