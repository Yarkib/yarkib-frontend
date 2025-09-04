# Assets Setup Guide

## Current Status
✅ Welcome image: `assets/images/welcome.png` (already placed)
✅ Google/Apple buttons: Using text-based buttons with Ionicons (no images needed)
✅ App icon: SVG created at `assets/icon.svg`
✅ Splash screen: SVG created at `assets/splash.svg`

## Converting SVG to PNG

### Option 1: Online Converter
1. Go to https://convertio.co/svg-png/ or https://cloudconvert.com/svg-to-png
2. Upload the SVG files
3. Set the output size:
   - `icon.svg` → `icon.png` (1024x1024px)
   - `splash.svg` → `splash.png` (2048x2048px)
   - `icon.svg` → `adaptive-icon.png` (1024x1024px)

### Option 2: Using Inkscape (Free)
1. Download Inkscape: https://inkscape.org/
2. Open the SVG file
3. File → Export PNG Image
4. Set the dimensions and export

### Option 3: Using GIMP (Free)
1. Download GIMP: https://www.gimp.org/
2. Open the SVG file
3. File → Export As → PNG
4. Set the dimensions and export

## Required PNG Files
After conversion, you should have:
- `assets/icon.png` (1024x1024px)
- `assets/splash.png` (2048x2048px)
- `assets/adaptive-icon.png` (1024x1024px)

## Button Icons
The Google and Apple sign-in buttons now use:
- Ionicons: `logo-google` and `logo-apple`
- No image files required
- Automatically styled with proper colors

## Testing
Once you have the PNG files:
1. Run `npm start` to test the app
2. The welcome screen should show your image
3. The sign-in buttons should display with icons
4. The app icon and splash screen will be used when building the app
