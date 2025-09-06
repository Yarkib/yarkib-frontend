# OAuth Setup Guide

## Overview

Your application has a complete OAuth implementation using Supabase for authentication. This guide will help you set up OAuth providers (Google and Apple) for both development and production.

## Backend OAuth Flow (Already Implemented ✅)

Your backend already has these endpoints:

1. **`POST /auth/signin`** - Initiates OAuth flow
2. **`GET /auth/callback`** - Handles OAuth callback with HTML page
3. **`POST /auth/callback`** - Processes OAuth tokens
4. **`POST /auth/signup`** - Completes signup for new OAuth users

## Frontend OAuth Flow (Already Implemented ✅)

Your frontend has:
- OAuth configuration in `src/config/oauth.js`
- AuthButton component for OAuth providers
- AuthContext with OAuth sign-in logic
- Proper session management

## Required Setup Steps

### 1. Supabase Configuration

#### A. Enable OAuth Providers
1. Go to your Supabase Dashboard
2. Navigate to **Authentication > Providers**
3. Enable **Google** and/or **Apple**

#### B. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to **Credentials > Create Credentials > OAuth 2.0 Client IDs**
5. Configure OAuth consent screen
6. Create OAuth 2.0 Client ID for **Web application**
7. Add these Authorized redirect URIs:
   ```
   https://your-project.supabase.co/auth/v1/callback
   http://192.168.0.100:3000/auth/callback
   bikeridingapp://oauth/google
   ```
8. Copy the **Client ID** and **Client Secret**

#### C. Apple OAuth Setup
1. Go to [Apple Developer Console](https://developer.apple.com/)
2. Create an App ID
3. Enable Sign In with Apple
4. Create a Services ID
5. Configure the Services ID with your domain
6. Add redirect URIs:
   ```
   https://your-project.supabase.co/auth/v1/callback
   bikeridingapp://oauth/apple
   ```

### 2. Environment Variables

#### A. Backend (.env)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_client_secret
```

#### B. Frontend (.env)
```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
EXPO_PUBLIC_APPLE_CLIENT_ID=your_apple_client_id
```

### 3. Deep Link Configuration

#### A. app.json Configuration
```json
{
  "expo": {
    "scheme": "bikeridingapp",
    "ios": {
      "bundleIdentifier": "com.yourcompany.bikeridingapp"
    },
    "android": {
      "package": "com.yourcompany.bikeridingapp"
    }
  }
}
```

#### B. Supabase Redirect URLs
Add these to your Supabase OAuth settings:
```
bikeridingapp://oauth/google
bikeridingapp://oauth/apple
http://192.168.0.100:3000/auth/callback
https://your-production-domain.com/auth/callback
```

## Testing OAuth

### 1. Development Testing
1. Start your backend server: `npm start`
2. Start your frontend: `npx expo start`
3. Test OAuth flow on device/simulator
4. Check console logs for debugging

### 2. Production Testing
1. Deploy backend to your server
2. Update production URLs in configuration
3. Test OAuth flow in production environment

## OAuth Flow Explanation

### 1. User Initiates OAuth
```javascript
// User taps "Continue with Google"
const { url } = await authApi.signIn('google');
// Opens browser with Google OAuth
```

### 2. User Authenticates with Provider
- User is redirected to Google/Apple
- User enters credentials
- Provider redirects back with tokens

### 3. Backend Processes Tokens
```javascript
// Backend receives tokens
// Validates with Supabase
// Checks if user exists in database
// Returns session or requires signup
```

### 4. Frontend Handles Response
```javascript
// If existing user: Store session, go to home
// If new user: Store temp session, go to signup
```

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**
   - Check that redirect URIs match exactly in OAuth provider settings
   - Ensure scheme is properly configured in app.json

2. **"OAuth callback not working"**
   - Verify backend is running and accessible
   - Check that callback URL is correct
   - Ensure CORS is properly configured

3. **"Session not persisting"**
   - Check SecureStore implementation
   - Verify session storage logic
   - Ensure proper error handling

### Debug Steps

1. **Check Console Logs**
   - Backend logs show OAuth flow
   - Frontend logs show authentication steps

2. **Test Backend Endpoints**
   ```bash
   curl -X POST http://192.168.0.100:3000/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"provider": "google"}'
   ```

3. **Verify Environment Variables**
   - Ensure all required variables are set
   - Check that values are correct

## Security Considerations

1. **Never expose client secrets in frontend**
2. **Use HTTPS in production**
3. **Validate all OAuth responses**
4. **Implement proper session management**
5. **Add rate limiting to OAuth endpoints**

## Next Steps

1. Configure OAuth providers in Supabase
2. Set up environment variables
3. Test OAuth flow in development
4. Deploy and test in production
5. Monitor OAuth usage and errors

Your OAuth implementation is already complete and well-structured. Just follow this guide to configure the providers and you'll have a fully functional OAuth system! 🎉
