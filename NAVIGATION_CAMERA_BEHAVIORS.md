# Navigation Camera Movement Behaviors
## Based on Google Maps, Waze, Apple Maps, and other navigation apps

### 1. **User Location Positioning**
**Behavior:**
- User's location marker is **NOT** centered on the screen
- Instead, it's positioned at the **bottom third** of the screen (approximately 1/3 from bottom)
- This allows the route ahead to be visible above the user's position
- The marker stays in this fixed screen position as the user moves

**Implementation Notes:**
- Use `paddingBottom` or `centerCoordinate` offset to position user location at bottom
- In Mapbox, this can be achieved with camera `centerCoordinate` offset or padding
- User location should remain at fixed screen coordinates (e.g., bottom 30-35% of screen)

---

### 2. **Route Preview Ahead**
**Behavior:**
- The route line extends **straight up** from the user's position
- Route is visible **ahead** of the user (in the upper portion of the screen)
- Shows upcoming turns, intersections, and route geometry
- The camera focuses on showing what's **ahead**, not what's behind

**Implementation Notes:**
- Camera should show route geometry ahead of the user
- Route should appear to extend "forward" from the user's position
- Upcoming turns should be visible in the upper portion of the screen

---

### 3. **Automatic Zoom Adjustment**
**Behavior:**
- **Zoom Level** automatically adjusts based on:
  - **Speed**: Higher speed = zoom out (see more ahead), lower speed = zoom in
  - **Road Type**: Highway = more zoom out, city streets = more zoom in
  - **Upcoming Turns**: Zooms in before major turns, zooms out on straight roads
  - **Turn Distance**: Zooms in when approaching turns (< 200m), zooms out when far away

**Typical Zoom Levels:**
- **Highway/Freeway**: 14-16 (zoomed out to see far ahead)
- **City Streets**: 16-18 (zoomed in for detail)
- **Approaching Turn**: 18-19 (zoomed in for precision)
- **Parking/Navigation Start**: 19-20 (maximum detail)

**Implementation Notes:**
- Use speed-based zoom calculation
- Smooth transitions between zoom levels (animated)
- Consider road classification from route data

---

### 4. **Camera Following Behavior**
**Behavior:**
- Camera **smoothly follows** the user's location
- Updates happen **in real-time** as user moves
- **Predictive positioning**: Camera slightly leads ahead of user position
- Smooth animations (no jerky movements)
- Camera movement is **synchronized** with user's actual movement

**Implementation Notes:**
- Use `followUserLocation` with smooth interpolation
- Update frequency: Every 1-2 seconds or based on distance traveled
- Use easing functions for smooth camera transitions
- Consider using `animationMode: "flyTo"` with short duration for smooth updates

---

### 5. **Heading-Based Rotation (Heading Up Mode)**
**Behavior:**
- When in **Heading Up** mode:
  - Map rotates so user's heading is always **pointing up** (toward top of screen)
  - Route appears straight ahead from user's perspective
  - North can be at any angle (bottom, left, right, etc.) depending on user's direction
  - Rotation is smooth and updates with heading changes

**When in North Up Mode:**
- Map stays fixed with north at top
- User's location marker rotates to show heading direction
- Route may appear at angles relative to screen

**Implementation Notes:**
- Use `followUserMode: FollowWithHeading` for heading-up
- Use `followUserMode: Follow` for north-up
- Smooth rotation transitions when heading changes

---

### 6. **Camera Pitch/Tilt**
**Behavior:**
- **3D Perspective**: Camera is tilted (pitched) at an angle (typically 45-60 degrees)
- Provides depth perception and better route visualization
- Shows elevation changes and 3D buildings
- More immersive navigation experience

**Typical Pitch Values:**
- **Navigation Mode**: 45-60 degrees
- **Overview Mode**: 0-30 degrees (more top-down)
- **Approaching Turn**: Slightly increases pitch for better visibility

**Implementation Notes:**
- Use `pitch: 50-60` for navigation
- Adjust pitch based on zoom level (higher zoom = more pitch)
- Smooth pitch transitions

---

### 7. **Predictive Camera Positioning**
**Behavior:**
- Camera **slightly leads ahead** of user's actual position
- Shows what's coming up, not just current location
- Helps users anticipate upcoming turns and route changes
- Offset is based on speed and road type

**Implementation Notes:**
- Calculate offset based on current speed
- Project user position forward along route (e.g., 50-100m ahead)
- Use this projected point as camera center (but keep user marker at bottom)

---

### 8. **Automatic Adjustments While Moving**
**Behavior:**
- Camera **automatically adjusts** as user moves:
  - **Zoom changes** based on speed and road context
  - **Position updates** to keep route ahead visible
  - **Rotation** updates with heading changes (in heading-up mode)
  - **Smooth transitions** between all changes

**Implementation Notes:**
- Update camera on every location update
- Use debouncing/throttling for performance (update every 1-2 seconds)
- Smooth animations between updates
- Prevent camera from jumping or jerking

---

### 9. **Turn Anticipation**
**Behavior:**
- Before upcoming turns:
  - **Zooms in** to show turn detail
  - **Adjusts camera angle** to better show turn direction
  - **Highlights** upcoming turn in route
  - Returns to normal view after turn is completed

**Distance Thresholds:**
- **200-400m before turn**: Start zooming in
- **50-100m before turn**: Maximum zoom for detail
- **After turn**: Zoom out to normal level

**Implementation Notes:**
- Monitor distance to next turn/waypoint
- Adjust zoom dynamically based on turn proximity
- Use smooth zoom transitions

---

### 10. **User Interaction Handling**
**Behavior:**
- When user **manually interacts** with map (pan, zoom, rotate):
  - **Temporarily disables** automatic camera following
  - Shows "recenter" button to return to navigation view
  - After short period of inactivity, can auto-re-enable following

**Implementation Notes:**
- Detect user interaction (onRegionIsChanging)
- Disable `followUserLocation` when user manually pans/zooms
- Provide "recenter" button to re-enable following
- Optionally auto-re-enable after timeout

---

## Summary of Key Behaviors to Implement:

1. ✅ **User location at bottom-third** of screen (not center)
2. ✅ **Route extends straight up** from user position
3. ✅ **Automatic zoom** based on speed and road type
4. ✅ **Smooth camera following** with real-time updates
5. ✅ **Heading-based rotation** (when in heading-up mode)
6. ✅ **3D perspective** with camera pitch/tilt
7. ✅ **Predictive positioning** (camera slightly ahead)
8. ✅ **Dynamic adjustments** while moving
9. ✅ **Turn anticipation** (zoom in before turns)
10. ✅ **User interaction handling** (disable auto-follow when user interacts)

---

## Implementation Priority:

### High Priority (Core Navigation Experience):
1. User location at bottom-third positioning
2. Route preview ahead (straight up from user)
3. Smooth camera following
4. Heading-based rotation toggle

### Medium Priority (Enhanced Experience):
5. Automatic zoom based on speed
6. Turn anticipation zooming
7. Predictive camera positioning
8. User interaction handling

### Low Priority (Polish):
9. Road type-based zoom adjustments
10. Dynamic pitch adjustments

