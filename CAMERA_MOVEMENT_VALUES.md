# Camera Movement Values - Navigation Screen
## All values responsible for North Up, Heading Up, and camera positioning

---

## 1. ZOOM LEVEL VALUES

### Function: `calculateDynamicZoom(speedKmh, turnDistanceMeters)`

#### Speed-Based Zoom Thresholds:
```typescript
// Speed thresholds (km/h)
if (speedKmh > 80)     → baseZoom = 15    // Highway speeds
if (speedKmh > 50)     → baseZoom = 16    // Fast city driving
if (speedKmh > 20)     → baseZoom = 17    // Normal city driving
else                   → baseZoom = 18    // Slow/parking
```

**Purpose:** 
- Higher speed = zoom out (see more ahead)
- Lower speed = zoom in (more detail)
- Highway driving needs wider view, city needs detail

---

#### Turn Anticipation Zoom:
```typescript
// Turn distance thresholds (meters)
if (turnDistanceMeters > 0 && turnDistanceMeters < 200)  → baseZoom = max(baseZoom, 18.5)
if (turnDistanceMeters >= 200 && turnDistanceMeters < 400) → baseZoom = max(baseZoom, 17.5)
```

**Purpose:**
- Zoom in when approaching turns for precision
- <200m = maximum zoom (18.5)
- 200-400m = moderate zoom (17.5)
- >400m = normal zoom (based on speed)

---

#### Zoom Clamping:
```typescript
return Math.max(14, Math.min(20, baseZoom));
```

**Purpose:**
- Minimum zoom: 14 (very wide view)
- Maximum zoom: 20 (very close detail)
- Prevents zoom from going too extreme

---

## 2. USER POSITIONING VALUES

### Screen Offset for Bottom-Third Positioning:
```typescript
const zoomFactor = dynamicZoom / 17;  // Normalize to zoom 17
const screenOffsetMeters = 150 / zoomFactor;
```

**Current Value:** `150` meters (at zoom 17)

**Purpose:**
- Offsets camera center upward from user position
- Positions user at bottom-third of screen (~33% from bottom)
- Adjusts based on zoom level (higher zoom = smaller offset needed)
- Shows route ahead in upper portion of screen

**How it works:**
- Camera center = point ahead along route by `screenOffsetMeters`
- User appears at bottom-third because camera is looking ahead
- Route extends upward from user position

---

## 3. PREDICTIVE POSITIONING VALUES

### Function: `calculatePredictivePosition(userLoc, heading, speedKmh)`

#### Offset Distance Calculation:
```typescript
const offsetMeters = Math.max(50, Math.min(150, speedKmh * 1.5));
```

**Current Values:**
- Minimum: `50` meters
- Maximum: `150` meters
- Formula: `speedKmh * 1.5`

**Purpose:**
- Camera center positioned ahead of user based on speed
- Faster = more ahead (up to 150m)
- Slower = less ahead (minimum 50m)
- Helps show what's coming up, not just current position

---

## 4. PITCH VALUES

### Dynamic Pitch Calculation:
```typescript
const dynamicPitch = dynamicZoom > 18 ? 55 : 50;
```

**Current Values:**
- Normal navigation: `50` degrees
- When zoomed in (>18): `55` degrees

**Purpose:**
- 3D perspective angle for depth perception
- Higher pitch when zoomed in = better detail visibility
- Lower pitch when zoomed out = wider view

---

## 5. ANIMATION DURATION VALUES

### Camera Update Animation Durations:
```typescript
// Orientation mode change
animationDuration: 300  // When toggling North Up/Heading Up

// Regular updates (interval)
animationDuration: 600  // Normal camera updates

// Heading changes (immediate)
animationDuration: 400  // When heading changes in Heading Up mode

// Camera followUserLocation
animationDuration: 800  // In MapboxGL.Camera component
```

**Purpose:**
- Faster animations (300-400ms) for quick responses
- Medium animations (600ms) for smooth transitions
- Slower animations (800ms) for follow mode

---

## 6. UPDATE INTERVAL VALUES

### Camera Update Frequency:
```typescript
// Heading Up mode
updateInterval: 1000  // 1 second (1000ms)

// North Up mode
updateInterval: 2000  // 2 seconds (2000ms)
```

**Purpose:**
- More frequent updates in Heading Up mode for smooth rotation
- Less frequent in North Up mode (map doesn't rotate)
- Balances smoothness with performance

---

## 7. HEADING CHANGE DETECTION VALUES

### Immediate Update Threshold:
```typescript
const headingChanged = mapOrientationMode === 'heading-up' 
  ? Math.abs(newHeading - prevHeading) > 5  // 5 degree threshold
  : false;
```

**Current Value:** `5` degrees

**Purpose:**
- Triggers immediate camera update when heading changes >5°
- Only in Heading Up mode
- Prevents excessive updates on tiny heading fluctuations
- Ensures smooth rotation when user turns

---

## 8. SPEED CHANGE DETECTION VALUES

### Immediate Update Threshold:
```typescript
const speedChanged = Math.abs(newSpeed - prevSpeed) > 10;  // 10 km/h threshold
```

**Current Value:** `10` km/h

**Purpose:**
- Triggers immediate camera update when speed changes >10 km/h
- Updates zoom level based on new speed
- Prevents excessive updates on minor speed variations

---

## 9. TURN DISTANCE DETECTION VALUES

### Immediate Update Threshold:
```typescript
const turnDistChanged = Math.abs(newTurnDistance - prevTurnDist) > 50;  // 50 meters threshold
```

**Current Value:** `50` meters

**Purpose:**
- Triggers immediate camera update when turn distance changes >50m
- Updates zoom level for turn anticipation
- Prevents excessive updates on minor distance changes

---

## 10. MAPBOX CAMERA PROPERTIES

### followUserLocation:
```typescript
followUserLocation={followUserLocation}  // true/false
```

**Purpose:**
- Enables/disables automatic camera following
- When true: camera follows user location
- When false: camera stays fixed (user can pan/zoom)

---

### followUserMode:
```typescript
// Heading Up mode
MapboxGL.UserTrackingMode.FollowWithHeading  // Map rotates with heading

// North Up mode
MapboxGL.UserTrackingMode.Follow  // Map stays fixed, north at top
```

**Purpose:**
- Controls how camera follows user
- `FollowWithHeading`: Map rotates to keep heading pointing up
- `Follow`: Map stays fixed, user marker rotates

---

### followZoomLevel:
```typescript
followZoomLevel={calculateDynamicZoom(navigationState.currentSpeed, navigationState.nextTurnDistance)}
```

**Purpose:**
- Sets zoom level based on speed and turn distance
- Automatically adjusts as conditions change
- Range: 14-20 (clamped in calculateDynamicZoom)

---

### followPitch:
```typescript
followPitch={calculateDynamicZoom(...) > 18 ? 55 : 50}
```

**Current Values:**
- Normal: `50` degrees
- Zoomed in (>18): `55` degrees

**Purpose:**
- Sets camera tilt angle
- 3D perspective for better route visualization

---

## 11. CAMERA CENTER CALCULATION

### Point Ahead Calculation:
```typescript
// Find point along route for camera center
const screenOffsetMeters = 150 / zoomFactor;

// Calculate point ahead along route segments
// Uses haversineDistanceMeters to find exact point
```

**Current Value:** `150` meters (at zoom 17)

**Purpose:**
- Calculates where to position camera center
- Camera center = point ahead of user along route
- This positions user at bottom-third of screen
- Route extends upward from user

---

## 12. SMOOTHING VALUES

### Bearing Smoothing:
```typescript
BEARING_SMOOTHING_SAMPLES = 5  // Number of samples for smoothing
```

**Purpose:**
- Smooths out GPS heading noise
- Uses last 5 heading samples
- Prevents jittery rotation

---

## SUMMARY OF ALL VALUES:

### Zoom Values:
- Highway zoom (>80 km/h): `15`
- Fast city zoom (50-80 km/h): `16`
- Normal city zoom (20-50 km/h): `17`
- Slow zoom (<20 km/h): `18`
- Turn zoom close (<200m): `18.5`
- Turn zoom approaching (200-400m): `17.5`
- Min zoom: `14`
- Max zoom: `20`

### Positioning Values:
- Screen offset (bottom-third): `150` meters (at zoom 17)
- Predictive offset min: `50` meters
- Predictive offset max: `150` meters
- Predictive formula: `speedKmh * 1.5`

### Pitch Values:
- Normal pitch: `50` degrees
- Zoomed in pitch (>18): `55` degrees

### Animation Durations:
- Orientation toggle: `300` ms
- Heading change: `400` ms
- Regular update: `600` ms
- Follow mode: `800` ms

### Update Intervals:
- Heading Up mode: `1000` ms (1 second)
- North Up mode: `2000` ms (2 seconds)

### Detection Thresholds:
- Heading change: `5` degrees
- Speed change: `10` km/h
- Turn distance change: `50` meters

---

## WHAT EACH VALUE AFFECTS:

1. **Zoom Values** → How close/far the map view is
2. **Screen Offset (150m)** → Where user appears on screen (bottom-third)
3. **Predictive Offset (50-150m)** → How far ahead camera looks
4. **Pitch (50-55°)** → Camera tilt angle (3D perspective)
5. **Animation Duration (300-800ms)** → How fast camera moves
6. **Update Interval (1-2s)** → How often camera updates
7. **Heading Threshold (5°)** → When to rotate camera
8. **Speed Threshold (10 km/h)** → When to update zoom
9. **Turn Distance Threshold (50m)** → When to zoom in for turns

