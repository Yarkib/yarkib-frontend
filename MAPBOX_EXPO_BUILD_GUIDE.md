# Building Mapbox with Expo - Complete Guide

## ⚠️ Important: Why Mapbox Doesn't Work with Expo Go

The `@rnmapbox/maps` library requires **native code** that must be compiled into your app. This means:

- ❌ **Cannot run in Expo Go** (the standard Expo app)
- ✅ **Requires a custom development build**

## Solution: Create a Custom Development Build

You have two options:

### Option 1: Local Development Build (Faster, Free)

#### For Android:

1. **Install Android Studio** and set up Android SDK
2. **Build the development client:**
   ```bash
   npx expo run:android
   ```
3. This will:
   - Install the native modules
   - Create a custom development app on your Android device/emulator
   - Start the Metro bundler

#### For iOS (Mac only):

1. **Install Xcode** from Mac App Store
2. **Install CocoaPods:**
   ```bash
   sudo gem install cocoapods
   ```
3. **Build the development client:**
   ```bash
   npx expo run:ios
   ```

### Option 2: EAS Build (Easier, Cloud-based)

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo:**
   ```bash
   eas login
   ```

3. **Configure EAS:**
   ```bash
   eas build:configure
   ```

4. **Create development build:**
   
   For Android:
   ```bash
   eas build --profile development --platform android
   ```
   
   For iOS:
   ```bash
   eas build --profile development --platform ios
   ```

5. **Wait for build to complete** (10-20 minutes)

6. **Download and install** the built app on your device

7. **Start the development server:**
   ```bash
   cd yarkib
   npx expo start --dev-client
   ```

## After Building

Once you have your custom development build installed:

1. **Uncomment the MapRouteCard** in `route-details.tsx`:
   ```typescript
   import MapRouteCard from '../src/components/MapRouteCard';
   
   // In the render:
   <MapRouteCard route={route} />
   ```

2. **Restart your development server**

3. **The Mapbox map should now work!**

## Current Status

✅ Mapbox code is ready and configured
✅ Your token is set up
❌ Currently disabled to let the app run in Expo Go
⏳ Waiting for custom development build

## Alternative: Using react-native-maps (Works with Expo Go)

If you want maps to work immediately without a custom build, you can use `react-native-maps` instead, which is included in Expo Go:

```bash
npx expo install react-native-maps
```

However, this won't have all the Mapbox features like the route modification page. For full Mapbox functionality, you need a custom build.

## Estimated Time

- **Local build**: 5-10 minutes (first time setup may take longer)
- **EAS build**: 15-30 minutes

## Need Help?

1. Follow Expo's guide: https://docs.expo.dev/develop/development-builds/create-a-build/
2. Check Mapbox Expo docs: https://rnmapbox.github.io/docs/install

---

**For now, your app will work without the map features. When you're ready to add them back, follow this guide to create a custom development build.**

