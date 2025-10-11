# Mapbox Route Visualization Setup Guide

## Overview
This guide will help you set up and configure the new Mapbox-powered route visualization and modification features in your Yarkib app.

## Features Implemented

### 1. Interactive Route Card (`MapRouteCard`)
- **Location**: Displays on the route details page
- **Features**:
  - Collapsed state (250px): Shows route overview
  - Expanded state (500px): Larger view for better visualization
  - Smooth expand/collapse animation
  - Route line visualization with start/end markers
  - "Modify" button to open the route editor

### 2. Route Modification Page (`modify-route.tsx`)
- **Full-screen interactive map editor**
- **Capabilities**:
  - Drag waypoint markers to reposition them
  - Tap map to add new waypoints
  - Long-press markers to remove them (must keep at least 2)
  - Draggable start/end points
  - Route preferences (fastest/shortest/scenic)
  - Real-time route statistics (distance, duration, waypoint count)
  - Save/Cancel with unsaved changes warning

## Setup Instructions

### Step 1: Get Mapbox Tokens

You need TWO tokens from Mapbox:

1. **Public Access Token** (starts with `pk.`)
   - Go to [https://www.mapbox.com/](https://www.mapbox.com/)
   - Sign up or log in to your account
   - Navigate to your [Account page](https://account.mapbox.com/)
   - Find your **Default public token** or create a new token
   - Copy this token (starts with `pk.`)

2. **Secret Download Token** (starts with `sk.`)
   - On the same Account page, scroll to **Access tokens**
   - Create a new token with **DOWNLOADS:READ** scope
   - Copy this secret token (starts with `sk.`)
   - ⚠️ This is for downloading the SDK, not for runtime use

### Step 2: Configure Backend (Send to Backend Developer)

Share the `BACKEND_MAPBOX_PLAN.md` file with your backend developer. They need to:

1. **Add Mapbox token to environment variables**:
   ```env
   MAPBOX_ACCESS_TOKEN=pk.your_token_here
   ```

2. **Implement required API endpoints**:
   - `GET /api/mapbox/token` - Returns Mapbox token to authenticated users
   - `POST /api/routes/calculate` - Proxies Mapbox Directions API for route calculation
   - `PUT /api/routes/:routeId` - Saves modified route data

3. **Update database schema**:
   ```sql
   ALTER TABLE routes 
   ADD COLUMN IF NOT EXISTS route_geometry JSONB,
   ADD COLUMN IF NOT EXISTS route_preferences JSONB DEFAULT '{"type": "fastest"}';
   ```

### Step 3: Configure Expo app.json

Add your Mapbox download token to `yarkib/app.json`:

1. Open `yarkib/app.json`
2. Find the `plugins` section (around line 43)
3. Replace `YOUR_MAPBOX_DOWNLOAD_TOKEN_HERE` with your secret token (starts with `sk.`)
4. Save the file

```json
"plugins": [
  [
    "@rnmapbox/maps",
    {
      "RNMapboxMapsDownloadToken": "sk.your_secret_token_here"
    }
  ]
]
```

### Step 4: Temporary Development Token (Optional)

For development/testing before the backend is ready:

1. Open `yarkib/src/components/MapRouteCard.tsx`
2. Find line ~40: `setMapboxToken('YOUR_MAPBOX_TOKEN_HERE');`
3. Replace `YOUR_MAPBOX_TOKEN_HERE` with your actual Mapbox PUBLIC token (starts with `pk.`)
4. **⚠️ IMPORTANT**: Never commit this token to version control!
5. Remove this before production deployment

### Step 5: Restart Development Server

After adding the download token:

```bash
# Stop the current dev server (Ctrl+C)
# Then restart it
npm start
```

Or clear cache and restart:
```bash
npm start -- --clear
```

### Step 6: Configure Mapbox for React Native (Advanced - Usually Not Needed with Expo)

For Android (if needed), add to `android/app/build.gradle`:

```gradle
repositories {
    maven {
        url 'https://api.mapbox.com/downloads/v2/releases/maven'
        authentication {
            basic(BasicAuthentication)
        }
        credentials {
            username = 'mapbox'
            password = project.properties['MAPBOX_DOWNLOADS_TOKEN'] ?: ""
        }
    }
}
```

Add to `android/gradle.properties`:
```properties
MAPBOX_DOWNLOADS_TOKEN=YOUR_SECRET_TOKEN_HERE
```

For iOS (if needed), add to `ios/Podfile`:
```ruby
pre_install do |installer|
  $RNMBGL.pre_install(installer)
end

post_install do |installer|
  $RNMBGL.post_install(installer)
end
```

## Usage

### Viewing Routes

1. Navigate to any route details page
2. Scroll to the "Route Map" card (below action buttons, above elevation profile)
3. Tap the card to expand for a larger view
4. Tap again to collapse

### Modifying Routes

1. On the route details page, tap the **"Modify"** button on the map card
2. The route modification page opens with:
   - Full-screen interactive map
   - All waypoints displayed as markers
   - Route line connecting waypoints

3. **Add waypoints**:
   - Tap anywhere on the map
   - A new waypoint is inserted before the end point

4. **Move waypoints**:
   - Drag any marker to a new position
   - The route updates automatically

5. **Remove waypoints**:
   - Long-press on a waypoint marker
   - Confirm removal in the alert dialog
   - Note: You must keep at least 2 waypoints (start and end)

6. **Change route preferences**:
   - Tap the "Preferences" button
   - Choose: Fastest, Shortest, or Scenic
   - Route recalculates automatically

7. **Save changes**:
   - Tap "Save" in the top-right corner
   - Route is saved to the backend

8. **Cancel/Discard**:
   - Tap the close button (X) in top-left
   - If modified, confirms before discarding

## Component Files

### Created Files
- `yarkib/src/components/MapRouteCard.tsx` - Interactive route visualization card
- `yarkib/app/modify-route.tsx` - Full route editor page
- `yarkib/src/utils/routeUtils.ts` - Route calculation and utility functions
- `BACKEND_MAPBOX_PLAN.md` - Backend implementation guide
- `MAPBOX_SETUP_GUIDE.md` - This file

### Modified Files
- `yarkib/src/config/config.js` - Added Mapbox configuration
- `yarkib/src/types/route.ts` - Added route_geometry and route_preferences
- `yarkib/app/route-details.tsx` - Added MapRouteCard component

## Data Flow

1. **Route Display**:
   - Route data loaded from backend
   - `route_points` array converted to GeoJSON for Mapbox
   - Map renders route line and markers

2. **Route Modification**:
   - User modifies waypoints on map
   - Frontend calls `POST /api/routes/calculate` to recalculate route
   - Backend proxies request to Mapbox Directions API
   - Updated route data returned and displayed
   - User saves, frontend calls `PUT /api/routes/:routeId`
   - Backend updates database with new route data

## Troubleshooting

### Map Not Showing
- **Issue**: Black screen or no map visible
- **Solution**: 
  - Check that Mapbox token is valid
  - Check browser console/React Native logs for errors
  - Verify `@rnmapbox/maps` is properly installed

### Route Not Displaying
- **Issue**: Map shows but no route line
- **Solution**:
  - Verify `route.route_points` exists and has valid coordinates
  - Check that coordinates are in format: `{latitude: number, longitude: number}`
  - Ensure at least 2 points exist

### Cannot Add/Remove Waypoints
- **Issue**: Map doesn't respond to taps
- **Solution**:
  - Verify you're on the modify-route page (not just viewing)
  - Check that map interactions aren't blocked by overlays
  - Ensure user is authenticated

### Backend Errors
- **Issue**: "Failed to calculate route" or "Failed to fetch token"
- **Solution**:
  - Verify backend endpoints are implemented (see BACKEND_MAPBOX_PLAN.md)
  - Check that Mapbox token is set in backend environment
  - Verify user authentication token is valid

## API Integration Checklist

Before going to production, ensure:

- [ ] Backend implements `GET /api/mapbox/token`
- [ ] Backend implements `POST /api/routes/calculate`
- [ ] Backend implements `PUT /api/routes/:routeId`
- [ ] Database schema updated with new columns
- [ ] Mapbox token stored securely in backend environment
- [ ] Remove any hardcoded tokens from frontend code
- [ ] Test route modification and saving
- [ ] Test route recalculation with different preferences
- [ ] Implement rate limiting on backend endpoints
- [ ] Set up error monitoring and logging

## Performance Considerations

- Route calculations are proxied through your backend to protect the Mapbox token
- Backend should implement caching for calculated routes
- Rate limiting should be applied to prevent Mapbox API abuse
- Consider implementing optimistic UI updates for better UX

## Security Notes

- ⚠️ **Never commit Mapbox tokens to version control**
- ⚠️ **Always fetch tokens from backend, not hardcoded in frontend**
- Backend should validate all coordinates before calling Mapbox API
- Backend should implement proper authentication and authorization
- Consider implementing usage limits per user

## Future Enhancements

Potential features to add:
- Undo/redo for route modifications
- Multiple route alternatives display
- Save route variants
- Share modified routes
- Export modified routes as GPX
- Offline route caching
- Route waypoint search/geocoding
- Custom route styles (colors, line width)

## Support

For issues or questions:
1. Check this guide first
2. Review `BACKEND_MAPBOX_PLAN.md` for backend-related issues
3. Check [Mapbox Documentation](https://docs.mapbox.com/)
4. Review [@rnmapbox/maps Documentation](https://github.com/rnmapbox/maps)

---

**Last Updated**: October 9, 2025

