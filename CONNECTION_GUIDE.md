# Frontend Connection Guide for Yarkib Backend

## Overview
This guide will help you connect your Yarkib frontend app to the backend server, focusing on the authentication endpoints we've implemented.

## Backend Configuration

The backend server is configured with:
- Express.js for API endpoints
- CORS enabled to allow cross-origin requests
- Authentication endpoints for both email and OAuth flows
- Health check endpoint for connection testing

## Connection Details

### Base URLs

#### For Web Development:
```javascript
const API_URL = 'http://localhost:3000';
```

#### For React Native Development:
```javascript
// Already implemented in src/utils/api.js
const getBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      // For both Android and iOS devices (emulator or physical)
      return 'http://192.168.0.103:3000';
    } else {
      // For web
      return 'http://localhost:3000';
    }
  }
  // Production URL
  return 'https://your-production-api.com';
};
```

### Authentication Endpoints

1. **Email Registration**:
   ```
   POST /auth/email/signup
   ```
   Request body:
   ```json
   {
     "email": "user@example.com",
     "password": "securepassword",
     "name": "User Name"
   }
   ```
   Response:
   ```json
   {
     "message": "Email verification required",
     "success": true,
     "email": "user@example.com"
   }
   ```

2. **Email Login**:
   ```
   POST /auth/email/login
   ```
   Request body:
   ```json
   {
     "email": "user@example.com",
     "password": "securepassword"
   }
   ```
   Response:
   ```json
   {
     "message": "Logged in",
     "success": true,
     "session": {
       "access_token": "token",
       "refresh_token": "token",
       "user": {
         "id": "user-id",
         "email": "user@example.com",
         "name": "User Name"
       }
     }
   }
   ```

3. **OAuth Authentication**:
   ```
   POST /auth/signin
   ```
   Request body:
   ```json
   {
     "provider": "google",
     "redirect_uri": "bikeridingapp://oauth/google"
   }
   ```
   Response:
   ```json
   {
     "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
     "provider": "google"
   }
   ```

4. **OAuth Callback**:
   ```
   POST /auth/callback
   ```
   Request body:
   ```json
   {
     "code": "authorization_code",
     "code_verifier": "pkce_verifier"
   }
   ```
   Response:
   ```json
   {
     "message": "Logged in",
     "session": {
       "access_token": "token",
       "refresh_token": "token",
       "user": {
         "id": "user-id",
         "email": "user@example.com",
         "name": "User Name"
       }
     }
   }
   ```

5. **Complete Profile**:
   ```
   POST /auth/signup
   ```
   Request body:
   ```json
   {
     "name": "User Name",
     "date_of_birth": "1990-01-01",
     "fuel_capacity_km": 200
   }
   ```
   Response:
   ```json
   {
     "message": "Signed up",
     "session": {
       "access_token": "token",
       "refresh_token": "token",
       "user": {
         "id": "user-id",
         "email": "user@example.com",
         "name": "User Name"
       }
     }
   }
   ```

6. **Get Current User**:
   ```
   GET /auth/user
   ```
   Headers:
   ```
   Authorization: Bearer <access_token>
   ```
   Response:
   ```json
   {
     "user": {
       "id": "user-id",
       "email": "user@example.com",
       "name": "User Name"
     }
   }
   ```

## Troubleshooting Connection Issues

### Common Issues

1. **CORS Errors**
   - The backend should have CORS enabled with `app.use(cors())`
   - If you're seeing CORS errors, check your browser console for details

2. **Network Connection**
   - Ensure the backend server is running (`node index.js`)
   - Check the terminal for the startup message confirming the server is running on port 3000
   - Use the health check endpoint to verify connectivity: `GET /health`

3. **Platform-Specific Issues**

   **Android:**
   - Android emulator uses `10.0.2.2` to access your computer's localhost
   - Physical devices need your computer's actual IP address
   - Add this to your Android app's `network_security_config.xml`:
     ```xml
     <?xml version="1.0" encoding="utf-8"?>
     <network-security-config>
         <domain-config cleartextTrafficPermitted="true">
             <domain includeSubdomains="true">10.0.2.2</domain>
             <!-- Add your computer's IP if using physical device -->
             <domain includeSubdomains="true">192.168.X.X</domain>
         </domain-config>
     </network-security-config>
     ```

   **iOS:**
   - iOS simulator can use `localhost` directly
   - For physical devices, update your `Info.plist`:
     ```xml
     <key>NSAppTransportSecurity</key>
     <dict>
       <key>NSAllowsLocalNetworking</key>
       <true/>
     </dict>
     ```

### Debugging Steps

1. **Check Backend Logs**
   - Look for logs indicating requests are reaching the backend
   - If you don't see these logs, requests aren't reaching the backend

2. **Test with Postman or curl**
   ```bash
   curl -X POST http://localhost:3000/auth/email/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
   ```

3. **Use the Connection Testing Tools**
   - The app includes connection testing in `src/utils/api.js`
   - Check the logs for `[CONFIG] Backend availability: true` to confirm connection
   - Look for endpoint status logs to see which endpoints are working

4. **Mock Mode for Development**
   - Set `MOCK_MODE = true` in `src/utils/api.js` to develop without a backend
   - This allows you to test the UI flow without a working backend connection

## Email Verification Flow

The app implements an email verification flow:

1. User signs up with email/password
2. Backend sends verification email
3. App shows "Email Verification Required" message and redirects to login
4. User clicks verification link in email
5. User can now log in with verified email

## OAuth Authentication Flow

The app implements OAuth authentication with PKCE:

1. App requests OAuth URL from backend
2. User is redirected to OAuth provider (Google/Apple)
3. After authentication, provider redirects back to app via deep linking
4. App exchanges authorization code for session tokens
5. User is logged in and redirected to home screen

## Next Steps

If you're still having connection issues after implementing these suggestions:

1. Check if the backend is running and accessible
2. Verify network connectivity between frontend and backend
3. Ensure you're using the correct URL for your development environment
4. Look for any error messages in both frontend and backend logs
5. Try toggling `MOCK_MODE` to isolate UI vs. backend issues

For detailed implementation, refer to:
- `src/utils/api.js` - API client with connection settings
- `src/context/AuthContext.js` - Authentication state management
- `app/login.tsx` and `app/signup.tsx` - Authentication UI
