# Authentication API Documentation

This document provides detailed information about the authentication endpoints and how to integrate them with your frontend application.

## Base URL

### Web Development
```
http://localhost:3000
```

### React Native Development
```javascript
// Platform-specific base URLs
const getBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000'; // Android Emulator
      // return 'http://YOUR_MACHINE_IP:3000'; // Physical Android device
    }
    return 'http://localhost:3000'; // iOS
  }
  return 'https://your-production-api.com'; // Production
};
```

## Authentication Endpoints

### 1. Email Registration
Register a new user with email and password.

```
POST /auth/email/signup
```

#### Request
- Method: `POST`
- Content-Type: `application/json`

#### Request Body
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe",
  "date_of_birth": "1990-01-01",  // Optional
  "fuel_capacity_km": 200         // Optional
}
```

#### Response
```json
{
  "message": "Registration successful. Please check your email to confirm your account.",
  "user": {
    "id": "...",
    "email": "user@example.com",
    // ... other user data
  }
}
```

#### Example Usage (React Web)
```javascript
const register = async (userData) => {
  try {
    const response = await fetch('http://localhost:3000/auth/email/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    console.log('Registration successful:', data.message);
    // Redirect to login page or show verification message
  } catch (error) {
    console.error('Registration error:', error.message);
  }
};
```

#### Example Usage (React Native)
```javascript
const register = async (userData) => {
  try {
    const response = await fetch(`${getBaseUrl()}/auth/email/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    console.log('Registration successful:', data.message);
    // Navigate to login screen or show verification message
  } catch (error) {
    console.error('Registration error:', error.message);
  }
};
```

### 2. Email Login
Authenticate a user with email and password.

```
POST /auth/email/login
```

#### Request
- Method: `POST`
- Content-Type: `application/json`

#### Request Body
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### Response
```json
{
  "message": "Login successful",
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "user": {
      "id": "...",
      "email": "user@example.com",
      // ... other user data
    }
  }
}
```

#### Example Usage (React Web)
```javascript
const login = async (credentials) => {
  try {
    const response = await fetch('http://localhost:3000/auth/email/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    // Store session and redirect
    localStorage.setItem('session', JSON.stringify(data.session));
    navigate('/dashboard');
  } catch (error) {
    console.error('Login error:', error.message);
  }
};
```

#### Example Usage (React Native)
```javascript
const login = async (credentials) => {
  try {
    const response = await fetch(`${getBaseUrl()}/auth/email/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    // Store session securely and navigate
    await storeAuthToken(data.session);
    navigation.navigate('Dashboard');
  } catch (error) {
    console.error('Login error:', error.message);
  }
};
```

### 3. Initiate OAuth Sign In
Starts the OAuth authentication process with a specified provider.

```
POST /auth/signin
```

#### Request
- Method: `POST`
- Content-Type: `application/json`

#### Request Body
```json
{
  "provider": "google" | "apple"
}
```

#### Response
```json
{
  "url": "https://your-oauth-url",
  "provider": "google",
  "session": null
}
```

#### Example Usage (React Web)
```javascript
const signIn = async (provider) => {
  try {
    const response = await fetch('http://localhost:3000/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider }),
    });
    const data = await response.json();
    
    // Redirect to OAuth provider
    window.location.href = data.url;
  } catch (error) {
    console.error('Sign in error:', error);
  }
};
```

#### Example Usage (React Native)
```javascript
import { Platform } from 'react-native';

const getBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000'; // Android Emulator
    }
    return 'http://localhost:3000'; // iOS
  }
  return 'https://your-production-api.com';
};

const signIn = async (provider) => {
  try {
    const response = await fetch(`${getBaseUrl()}/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider }),
    });
    const data = await response.json();
    
    // Handle OAuth redirect for mobile
    // You'll need to implement WebView or deep linking here
    console.log('OAuth URL:', data.url);
  } catch (error) {
    console.error('Sign in error:', error);
  }
};
```

### 4. OAuth Callback Handler
Handles the OAuth callback and exchanges the code for a session.

```
GET /auth/callback
```

#### Query Parameters
- `code`: The authorization code from the OAuth provider

#### Response (Existing User)
```json
{
  "message": "Logged in",
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "user": {
      "id": "...",
      "email": "user@example.com",
      // ... other user data
    }
  }
}
```

#### Response (New User)
Redirects to `/signup` page for completing registration

#### Example Usage (React Web)
```javascript
// In your OAuth callback component
useEffect(() => {
  const handleCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      try {
        const response = await fetch(`http://localhost:3000/auth/callback?code=${code}`);
        const data = await response.json();
        
        if (response.redirected) {
          // New user - redirect to signup
          navigate('/signup');
        } else {
          // Existing user - store session
          localStorage.setItem('session', JSON.stringify(data.session));
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Callback error:', error);
      }
    }
  };

  handleCallback();
}, []);
```

#### Example Usage (React Native)
```javascript
import { Linking } from 'react-native';

// Handle deep links for OAuth callback
const handleDeepLink = ({ url }) => {
  if (url.includes('auth/callback')) {
    const code = extractCodeFromUrl(url);
    handleOAuthCallback(code);
  }
};

const handleOAuthCallback = async (code) => {
  try {
    const response = await fetch(`${getBaseUrl()}/auth/callback?code=${code}`);
    const data = await response.json();
    
    if (response.redirected) {
      // New user - navigate to signup
      navigation.navigate('Signup');
    } else {
      // Existing user - store session
      await storeAuthToken(data.session);
      navigation.navigate('Dashboard');
    }
  } catch (error) {
    console.error('Callback error:', error);
  }
};

// Set up deep link listener
useEffect(() => {
  Linking.addEventListener('url', handleDeepLink);
  return () => {
    Linking.removeEventListener('url', handleDeepLink);
  };
}, []);
```

### 5. Complete User Registration
Completes the registration process for new users after OAuth authentication.

```
POST /auth/signup
```

#### Request
- Method: `POST`
- Content-Type: `application/json`
- Authentication: Requires active session from OAuth callback

#### Request Body
```json
{
  "name": "John Doe",
  "date_of_birth": "1990-01-01",
  "fuel_capacity_km": 200
}
```

#### Response
```json
{
  "message": "Signed up",
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "user": {
      "id": "...",
      "email": "user@example.com",
      // ... other user data
    }
  }
}
```

#### Example Usage (React Web)
```javascript
const completeSignup = async (userData) => {
  try {
    const response = await fetch('http://localhost:3000/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    
    // Store session and redirect
    localStorage.setItem('session', JSON.stringify(data.session));
    navigate('/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
  }
};
```

#### Example Usage (React Native)
```javascript
const completeSignup = async (userData) => {
  try {
    const response = await fetch(`${getBaseUrl()}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    
    // Store session securely and navigate
    await storeAuthToken(data.session);
    navigation.navigate('Dashboard');
  } catch (error) {
    console.error('Signup error:', error);
  }
};
```

## Routes Endpoints

### 1. Get All Routes
Retrieves a paginated list of all routes.

```
GET /routes
```

#### Query Parameters
- `page`: Page number (default: 1)
- `limit`: Number of items per page (default: 10)
- `category_id`: Filter by category ID (optional)

#### Response
```json
{
  "routes": [
    {
      "id": "uuid",
      "name": "Scenic Mountain Trail",
      "description": "Beautiful mountain trail with stunning views",
      "distance": 25.5,
      "duration": 120,
      "difficulty": "intermediate",
      "elevation_gain": 450,
      "start_location": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "address": "Central Park, New York"
      },
      "end_location": {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "address": "Times Square, New York"
      },
      "route_points": [...],
      "category_id": "uuid",
      "images": ["url1", "url2"],
      "rating": 4.5,
      "review_count": 10,
      "tags": ["scenic", "mountain"],
      "gpx_file_url": "https://example.com/route.gpx",
      "google_maps_url": "https://maps.google.com/?q=...",
      "categories": {
        "name": "Mountain Biking",
        "icon": "mountain"
      }
    },
    // More routes...
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "pages": 10
  }
}
```

#### Example Usage (React)
```javascript
const fetchRoutes = async (page = 1, limit = 10, categoryId = null) => {
  try {
    let url = `${baseUrl}/routes?page=${page}&limit=${limit}`;
    if (categoryId) {
      url += `&category_id=${categoryId}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch routes');
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching routes:', error);
    throw error;
  }
};
```

### 2. Get Route Details
Retrieves details for a specific route.

```
GET /routes/:id
```

#### Path Parameters
- `id`: Route ID (UUID)

#### Response
```json
{
  "id": "uuid",
  "name": "Scenic Mountain Trail",
  "description": "Beautiful mountain trail with stunning views",
  "distance": 25.5,
  "duration": 120,
  "difficulty": "intermediate",
  "elevation_gain": 450,
  "start_location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "Central Park, New York"
  },
  "end_location": {
    "latitude": 40.7589,
    "longitude": -73.9851,
    "address": "Times Square, New York"
  },
  "route_points": [...],
  "category_id": "uuid",
  "images": ["url1", "url2"],
  "rating": 4.5,
  "review_count": 10,
  "tags": ["scenic", "mountain"],
  "gpx_file_url": "https://example.com/route.gpx",
  "google_maps_url": "https://maps.google.com/?q=...",
  "categories": {
    "name": "Mountain Biking",
    "icon": "mountain"
  }
}
```

#### Example Usage (React)
```javascript
const fetchRouteDetails = async (routeId) => {
  try {
    const response = await fetch(`${baseUrl}/routes/${routeId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch route details');
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching route details:', error);
    throw error;
  }
};
```

### 2.1 Get Route Elevation Profile
Retrieves elevation profile data for a specific route.

```
GET /routes/:id/elevation
```

#### Path Parameters
- `id`: Route ID (UUID)

#### Response
```json
{
  "id": "uuid",
  "name": "Scenic Mountain Trail",
  "elevation_profile": [
    { "distance": 0, "elevation": 100 },
    { "distance": 1, "elevation": 120 },
    { "distance": 2, "elevation": 150 },
    // More elevation points
  ],
  "max_elevation": 450,
  "start_point_name": "Central Park",
  "end_point_name": "Times Square"
}
```

#### Example Usage (React)
```javascript
const fetchRouteElevation = async (routeId) => {
  try {
    const response = await fetch(`${baseUrl}/routes/${routeId}/elevation`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch route elevation data');
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching route elevation:', error);
    throw error;
  }
};
```

### 3. Search Routes
Search for routes with various filters.

```
GET /routes/search
```

#### Query Parameters
- `q`: Search query (searches in name and description)
- `difficulty`: Filter by difficulty (easy, intermediate, hard)
- `min_distance`: Minimum distance in kilometers
- `max_distance`: Maximum distance in kilometers
- `min_elevation`: Minimum elevation in meters
- `max_elevation`: Maximum elevation in meters
- `category_id`: Filter by category ID
- `tags`: Filter by tags (can be a single tag or an array)
- `page`: Page number (default: 1)
- `limit`: Number of items per page (default: 10)

#### Response
```json
{
  "routes": [
    {
      "id": "uuid",
      "name": "Scenic Mountain Trail",
      "description": "Beautiful mountain trail with stunning views",
      "distance": 25.5,
      "duration": 120,
      "difficulty": "intermediate",
      "elevation_gain": 450,
      "start_location": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "address": "Central Park, New York"
      },
      "end_location": {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "address": "Times Square, New York"
      },
      "route_points": [...],
      "category_id": "uuid",
      "images": ["url1", "url2"],
      "rating": 4.5,
      "review_count": 10,
      "tags": ["scenic", "mountain"],
      "gpx_file_url": "https://example.com/route.gpx",
      "google_maps_url": "https://maps.google.com/?q=...",
      "categories": {
        "name": "Mountain Biking",
        "icon": "mountain"
      }
    },
    // More routes...
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "pages": 10
  }
}
```

#### Example Usage (React)
```javascript
const searchRoutes = async (searchParams) => {
  try {
    const queryParams = new URLSearchParams();
    
    // Add all search parameters to query string
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        queryParams.append(key, value);
      }
    });
    
    const response = await fetch(`${baseUrl}/routes/search?${queryParams.toString()}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to search routes');
    }
    
    return data;
  } catch (error) {
    console.error('Error searching routes:', error);
    throw error;
  }
};
```

## Route Schema

The route object has the following structure:

```typescript
interface Route {
  id: string;                   // UUID
  name: string;                 // Route name
  description: string;          // Route description
  distance: number;             // Distance in kilometers
  duration: number;             // Duration in minutes
  difficulty: 'easy' | 'intermediate' | 'hard';  // Difficulty level
  elevation_gain: number;       // Elevation gain in meters
  start_location: {             // Starting point
    latitude: number;
    longitude: number;
    address?: string;
  };
  end_location: {               // Ending point
    latitude: number;
    longitude: number;
    address?: string;
  };
  start_point_name: string | null; // Name of the starting point
  end_point_name: string | null;   // Name of the ending point
  route_points: Array<{         // Array of points along the route
    latitude: number;
    longitude: number;
  }>;
  elevation_profile: Array<{    // Array of elevation data points
    distance: number;           // Distance from start in kilometers
    elevation: number;          // Elevation at this point in meters
  }> | null;
  max_elevation: number | null; // Maximum elevation in meters
  category_id: string;          // UUID of the category
  images: string[];             // Array of image URLs
  rating: number;               // Average rating (0-5)
  review_count: number;         // Number of reviews
  tags: string[];               // Array of tags
  created_at: string;           // ISO date string
  updated_at: string;           // ISO date string
  gpx_file_url: string | null;  // URL to GPX file
  google_maps_url: string | null; // Google Maps URL
  categories: {                 // Category information
    name: string;
    icon: string;
  };
}
```

## Error Handling

All endpoints return error responses in the following format:

```json
{
  "error": "Error message description"
}
```

Common error status codes:
- `400`: Invalid request (e.g., invalid provider)
- `401`: Unauthorized (missing or invalid session)
- `404`: Resource not found
- `500`: Server error

## Frontend Implementation Tips

### Web Implementation

1. **Session Management**
```javascript
// Store session after successful auth
const storeSession = (session) => {
  localStorage.setItem('session', JSON.stringify(session));
};

// Get current session
const getSession = () => {
  const session = localStorage.getItem('session');
  return session ? JSON.parse(session) : null;
};

// Clear session on logout
const clearSession = () => {
  localStorage.removeItem('session');
};
```

### React Native Implementation

1. **Secure Session Management**
```javascript
import * as SecureStore from 'expo-secure-store';

// Store session securely
const storeAuthToken = async (session) => {
  await SecureStore.setItemAsync('authToken', JSON.stringify(session));
};

// Get current session
const getAuthToken = async () => {
  const token = await SecureStore.getItemAsync('authToken');
  return token ? JSON.parse(token) : null;
};

// Clear session on logout
const clearAuthToken = async () => {
  await SecureStore.deleteItemAsync('authToken');
};
```

2. **API Client Setup**
```javascript
// api/config.js
import { Platform } from 'react-native';

export const getBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000'; // Android Emulator
      // return 'http://YOUR_MACHINE_IP:3000'; // Physical Android device
    }
    return 'http://localhost:3000'; // iOS
  }
  return 'https://your-production-api.com'; // Production
};
```

## Security Considerations

### Web Security
1. Always use HTTPS in production
2. Implement CSRF protection
3. Set appropriate CORS headers
4. Store tokens securely (HttpOnly cookies in production)
5. Implement token refresh mechanism
6. Validate all user inputs
7. Set appropriate session timeouts

### React Native Security
1. Use secure storage (expo-secure-store) for sensitive data
2. Implement certificate pinning for API calls
3. Validate all user inputs
4. Use HTTPS for all API communications
5. Implement proper session management
6. Handle deep links securely
7. Implement proper error handling without exposing sensitive information

## User Routes Endpoints

All endpoints below require authentication via Supabase JWT.

### Auth
- Header (required on all endpoints below):
```
Authorization: Bearer <access_token>
```

### Save a route
```
POST /user/routes/:routeId/save
```
- Purpose: Mark a route as saved for the current user
- Body: none
- Responses:
  - 204 No Content (idempotent; repeat calls are OK)
  - 400 Invalid routeId
  - 401 Missing/invalid token
  - 404 Route not found

Example (cURL):
```bash
curl -X POST "$BASE_URL/user/routes/<routeId>/save" \
  -H "Authorization: Bearer $TOKEN"
```

### Unsave a route
```
DELETE /user/routes/:routeId/save
```
- Purpose: Remove saved state
- Responses:
  - 204 No Content
  - 400 Invalid routeId
  - 401 Missing/invalid token
  - 404 Route not found

Example (cURL):
```bash
curl -X DELETE "$BASE_URL/user/routes/<routeId>/save" \
  -H "Authorization: Bearer $TOKEN"
```

### Mark route as completed
```
POST /user/routes/:routeId/complete
```
- Purpose: Mark a route as completed for the current user
- Body (optional):
```json
{ "distance_km": number, "started_at": "ISO string", "ended_at": "ISO string" }
```
- Responses:
  - 204 No Content (idempotent; repeat calls are OK)
  - 400 Invalid routeId
  - 401 Missing/invalid token
  - 404 Route not found

Example (cURL):
```bash
curl -X POST "$BASE_URL/user/routes/<routeId>/complete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"distance_km": 12.3}'
```

### List user routes (saved/completed)
```
GET /user/routes?status=saved|completed&limit=<n>&offset=<n>
```
- Purpose: List the current user's saved or completed routes (with embedded route objects)
- Query params:
  - `status`: `saved` or `completed` (required)
  - `limit`: number (default 20)
  - `offset`: number (default 0)
- Response 200:
```json
{
  "data": [
    {
      "id": "<user_route_id>",
      "status": "saved",
      "route": {
        "id": "<id>",
        "name": "...",
        "description": "...",
        "distance": 25.5,
        "duration": 120,
        "difficulty": "intermediate",
        "images": ["..."],
        "tags": ["..."]
      },
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```
- Errors: 401 unauthorized

Example (cURL):
```bash
curl "$BASE_URL/user/routes?status=saved&limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Totals (distance)
```
GET /user/stats/total-distance
```
- Purpose: Totals for profile stats
- Response 200:
```json
{ "totalCompletedKm": 123.4, "totalSavedKm": 50.0 }
```
- Errors: 401 unauthorized

### Business rules
- Use the token's userId; never accept `userId` from the request body.
- Validate route existence; return 404 if not found.
- Idempotent writes for Save/Complete; repeat requests return 204.
- CORS: allow `Authorization` header for mobile/web.
- Log userId, routeId, action; do not leak stack traces in responses.