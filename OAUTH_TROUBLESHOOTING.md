# OAuth Troubleshooting Guide

## Current Issue: "No matching browser activity found"

This error occurs when the OAuth flow tries to open a browser but can't find a suitable browser app on the device.

## Quick Fixes

### 1. **For Development (Recommended)**
Since you're in development mode, you can use mock OAuth for testing:

1. **Enable Mock Mode**:
   ```javascript
   // In src/config/config.js
   MOCK_MODE: true, // Set to true for mock data
   ```

2. **Test OAuth Flow**:
   - Tap "Continue with Google" or "Continue with Apple"
   - It will use mock data and simulate successful login
   - No browser needed

### 2. **For Real OAuth Testing**

#### A. **Android Emulator**
1. Make sure you have a browser installed (Chrome, Firefox, etc.)
2. Test OAuth flow in the emulator
3. The browser should open automatically

#### B. **Physical Device**
1. Ensure you have a browser app installed
2. Test OAuth flow on the device
3. The browser should open for OAuth

#### C. **iOS Simulator**
1. Safari should be available by default
2. Test OAuth flow in the simulator
3. Safari should open automatically

## Debugging Steps

### 1. **Check Console Logs**
Look for these log messages:
```
[AUTH] Starting sign in with google using real backend...
[AUTH] Received OAuth URL: https://accounts.google.com/oauth/...
[AUTH] Using redirect URI: http://192.168.0.100:3000/auth/callback
[AUTH] Opening browser with URL: https://accounts.google.com/oauth/...
```

### 2. **Test Backend OAuth Endpoint**
```bash
curl -X POST http://192.168.0.100:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"provider": "google", "redirect_uri": "http://192.168.0.100:3000/auth/callback"}'
```

Expected response:
```json
{
  "url": "https://accounts.google.com/oauth/authorize?..."
}
```

### 3. **Check Browser Availability**
- Ensure you have a browser app installed
- Try opening a URL manually in the browser
- Check if the browser can access your backend URL

## Alternative Solutions

### 1. **Use Mock Mode for Development**
```javascript
// In src/config/config.js
MOCK_MODE: true
```

### 2. **Test OAuth in Web Browser**
1. Open your app in a web browser
2. OAuth should work normally in web environment
3. No browser activity issues

### 3. **Use Expo Go App**
1. Install Expo Go on your device
2. Run the app through Expo Go
3. OAuth should work with Expo Go's browser

## Configuration Checklist

### ✅ **Backend Configuration**
- [ ] Backend server running on `http://192.168.0.100:3000`
- [ ] OAuth endpoints working (`/auth/signin`, `/auth/callback`)
- [ ] CORS properly configured

### ✅ **Frontend Configuration**
- [ ] OAuth config using correct backend URL
- [ ] Redirect URIs properly set
- [ ] Mock mode available for testing

### ✅ **Device/Emulator Setup**
- [ ] Browser app installed
- [ ] Network connectivity to backend
- [ ] Proper development environment

## Next Steps

1. **For Development**: Use mock mode to test the app flow
2. **For Production**: Configure real OAuth providers in Supabase
3. **For Testing**: Use web browser or ensure device has browser app

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "No matching browser activity" | Install browser app or use mock mode |
| "Invalid redirect URI" | Check OAuth provider settings |
| "Network request failed" | Verify backend is running and accessible |
| "OAuth callback not working" | Check backend callback endpoint |

Your OAuth implementation is correct - this is just a development environment issue. Use mock mode for now and configure real OAuth when deploying to production! 🎉
