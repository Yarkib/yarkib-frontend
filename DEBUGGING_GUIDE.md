# Button Functionality Debugging Guide

## Overview
This guide helps troubleshoot why the save and complete buttons might not be working in the Yarkib app. The buttons are implemented in both `RouteCard.tsx` and `route-details.tsx` components.

## What Was Implemented

### ✅ **Button Components**
- **RouteCard.tsx**: Save button with toggle functionality
- **route-details.tsx**: Save and Complete buttons with full functionality
- **ButtonTest.tsx**: Test component to verify basic button functionality

### ✅ **Event Handlers**
- **onPress**: Properly attached to all TouchableOpacity components
- **Console Logging**: Comprehensive logging for debugging
- **Error Handling**: Try-catch blocks with user feedback

### ✅ **API Integration**
- **Mock Mode**: Full mock implementation for testing
- **Real API**: Ready for production backend
- **Token Handling**: Automatic JWT extraction from AuthContext

## Debugging Steps

### 1. **Enable Mock Mode for Testing**
```javascript
// In yarkib/src/config/config.js
MOCK_MODE: true, // Change from false to true
```

### 2. **Check Console Logs**
Look for these log prefixes in your Metro bundler console:

#### RouteCard Logs
```
[FRONTEND] RouteCard: Component mounted for route: {routeId}
[FRONTEND] RouteCard: User state: {userObject}
[FRONTEND] RouteCard: Token extracted: true/false
[FRONTEND] RouteCard: Checking saved status for route: {routeId}
[FRONTEND] RouteCard: Calling listUserRoutes API for saved routes
[FRONTEND] RouteCard: Saved routes response: {response}
[FRONTEND] RouteCard: Is route saved: true/false
```

#### RouteDetails Logs
```
[FRONTEND] RouteDetails: Component mounted
[FRONTEND] RouteDetails: Route data: {routeObject}
[FRONTEND] RouteDetails: User state: {userObject}
[FRONTEND] RouteDetails: Token extracted: true/false
[FRONTEND] RouteDetails: Checking route status for route: {routeId}
[FRONTEND] RouteDetails: Checking saved routes...
[FRONTEND] RouteDetails: Checking completed routes...
```

#### Button Click Logs
```
[FRONTEND] Save button clicked for route: {routeId}
[FRONTEND] Current user: {userObject}
[FRONTEND] Token available: true/false
[FRONTEND] Current save status: true/false
[FRONTEND] Starting save/unsave operation for route: {routeId}
[FRONTEND] Calling saveRoute/unsaveRoute API for route: {routeId}
[FRONTEND] Save API response: {response}
```

### 3. **Common Issues and Solutions**

#### Issue: No Console Logs Appear
**Symptoms**: No `[FRONTEND]` logs in console when buttons are pressed
**Causes**:
- Button `onPress` not properly bound
- Component not rendering
- TouchableOpacity not receiving touch events

**Solutions**:
1. **Verify Button Rendering**:
   ```tsx
   // Check if this appears in console
   console.log('[FRONTEND] RouteCard: Component mounted for route:', route?.id);
   ```

2. **Test Basic Button Functionality**:
   ```tsx
   // Add this to RouteCard temporarily
   const testPress = () => {
     console.log('[TEST] Button pressed!');
     Alert.alert('Test', 'Button works!');
   };
   
   // Use in button
   <TouchableOpacity onPress={testPress}>
     <Text>Test Button</Text>
   </TouchableOpacity>
   ```

3. **Check Component Hierarchy**:
   - Ensure RouteCard is being rendered in parent component
   - Verify no conditional rendering that might hide the component

#### Issue: Console Logs Appear But API Calls Fail
**Symptoms**: Frontend logs appear but no API logs
**Causes**:
- Missing or invalid token
- API functions not properly imported
- Mock mode not enabled

**Solutions**:
1. **Check Token Extraction**:
   ```tsx
   console.log('[DEBUG] User object:', user);
   console.log('[DEBUG] Access token:', user?.access_token);
   console.log('[DEBUG] Session token:', user?.session?.access_token);
   ```

2. **Verify API Import**:
   ```tsx
   import { userRoutesApi } from '../utils/api';
   console.log('[DEBUG] userRoutesApi:', userRoutesApi);
   ```

3. **Enable Mock Mode**:
   ```javascript
   // In config.js
   MOCK_MODE: true
   ```

#### Issue: API Calls Succeed But UI Doesn't Update
**Symptoms**: API logs show success but button state doesn't change
**Causes**:
- State update not triggering re-render
- Component unmounted before state update
- State variable not properly bound to UI

**Solutions**:
1. **Verify State Updates**:
   ```tsx
   console.log('[DEBUG] Before state update - isSaved:', isSaved);
   setIsSaved(true);
   console.log('[DEBUG] After state update - isSaved:', isSaved);
   ```

2. **Check State Binding**:
   ```tsx
   // Ensure this is properly bound
   style={[styles.saveButton, isSaved && styles.saveButtonActive]}
   ```

3. **Force Re-render**:
   ```tsx
   // Add this temporarily to debug
   const [, forceUpdate] = useReducer(x => x + 1, 0);
   
   // After state update
   forceUpdate();
   ```

### 4. **Testing the ButtonTest Component**

To isolate button functionality issues, temporarily add the ButtonTest component to your main screen:

```tsx
// In your main screen (e.g., home.tsx, explore.tsx)
import ButtonTest from '../components/ButtonTest';

// Add to your render method
<ButtonTest />
```

**Expected Behavior**:
- Two buttons should appear
- "Test Button" should show alert when pressed
- "Toggle Button" should change state and appearance
- Console should show `[BUTTON_TEST]` logs

**If ButtonTest Doesn't Work**:
- Basic TouchableOpacity functionality is broken
- Check React Native installation
- Verify expo/vector-icons is working

### 5. **Authentication Issues**

#### Check User Login Status
```tsx
// In RouteCard or RouteDetails
const { user } = useAuth();
console.log('[AUTH] User context:', user);
console.log('[AUTH] Is authenticated:', !!user);
console.log('[AUTH] Has token:', !!(user?.access_token || user?.session?.access_token));
```

#### Verify AuthContext Setup
```tsx
// In _layout.tsx
<AuthProvider>
  {/* Your app content */}
</AuthProvider>
```

### 6. **Network and API Issues**

#### Check Mock Mode
```javascript
// In api.js, look for this log
console.log(`[CONFIG] Using API base URL: ${BASE_URL}`);
console.log(`[CONFIG] Mock mode enabled: ${MOCK_MODE}`);
```

#### Test API Functions Directly
```tsx
// In your component, test API directly
const testAPI = async () => {
  try {
    const result = await userRoutesApi.saveRoute('test-route', 'test-token');
    console.log('[API_TEST] Success:', result);
  } catch (error) {
    console.error('[API_TEST] Error:', error);
  }
};

// Call this function to test API
testAPI();
```

## Quick Debug Checklist

- [ ] **Mock Mode Enabled**: `MOCK_MODE: true` in config.js
- [ ] **Console Logs Visible**: Metro bundler console shows `[FRONTEND]` logs
- [ ] **Component Mounting**: Component mount logs appear
- [ ] **User Authentication**: User object and token are available
- [ ] **Button Rendering**: Buttons are visible and styled correctly
- [ ] **Touch Events**: Basic button press logs appear
- [ ] **API Calls**: API function logs appear
- [ ] **State Updates**: UI reflects state changes
- [ ] **Error Handling**: Errors are caught and logged

## Next Steps

1. **Run the app** with mock mode enabled
2. **Check console logs** for the `[FRONTEND]` prefix
3. **Test button clicks** and verify logs appear
4. **If no logs**: Check component rendering
5. **If logs but no API**: Check authentication and imports
6. **If API but no UI**: Check state management

## Support

If you're still experiencing issues after following this guide:

1. **Share console logs** showing the issue
2. **Describe expected vs actual behavior**
3. **Mention which component** (RouteCard or RouteDetails)
4. **Include device/platform** information

The enhanced logging should provide clear visibility into where the issue occurs in the button interaction flow.
