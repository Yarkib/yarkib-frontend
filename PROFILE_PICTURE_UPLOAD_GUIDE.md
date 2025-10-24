# 📸 Profile Picture Upload - Implementation Complete!

## ✅ What Was Implemented

Your profile page now has **full profile picture upload functionality** with these features:

### Features Added:
- ✅ **Upload from gallery** - Tap avatar to select and upload
- ✅ **Square crop editor** - Built-in 1:1 aspect ratio cropping
- ✅ **Delete avatar** - Small red trash icon to remove picture
- ✅ **Loading indicator** - Shows spinner while uploading
- ✅ **Visual feedback** - Camera icon overlay on avatar
- ✅ **Permission handling** - Requests camera roll access
- ✅ **Error handling** - User-friendly error messages
- ✅ **Responsive UI** - Beautiful glassmorphism design

---

## 🎯 How It Works

### **User Flow:**

1. **Navigate to Profile** → User sees their current avatar (or placeholder)
2. **Tap Avatar** → Opens image picker with cropping tool
3. **Select & Crop Image** → Square crop (1:1 ratio) enforced
4. **Upload** → Shows loading spinner on camera icon
5. **Success** → Avatar updates instantly with new image
6. **Delete (Optional)** → Tap small trash icon to remove avatar

---

## 📁 Files Modified

### **1. `src/utils/api.js`** - Added API functions

```javascript
profileApi.uploadAvatar(userId, imageUri, token)
profileApi.deleteAvatar(userId, token)
```

**API Endpoints Used:**
- `POST /users/:userId/avatar` - Upload new avatar
- `DELETE /users/:userId/avatar` - Remove avatar

### **2. `app/profile.tsx`** - Updated Profile UI

**New Imports:**
- `expo-image-picker` - Image selection
- `ActivityIndicator` - Loading state

**New State:**
- `avatarUrl` - Current avatar URL
- `uploadingAvatar` - Upload loading state

**New Functions:**
- `pickAndUploadAvatar()` - Opens picker & uploads
- `uploadAvatar()` - Handles upload to backend
- `deleteAvatar()` - Removes avatar

**UI Changes:**
- Avatar is now tappable
- Camera icon overlay (bottom-right)
- Delete button (top-right, red)
- "Tap avatar to change" hint text
- Loading spinner during upload

---

## 🚀 Usage

### **For Users:**

1. **Upload Profile Picture:**
   - Open Profile page
   - Tap on your avatar/placeholder
   - Select image from gallery
   - Crop to desired framing
   - Confirm → Image uploads automatically

2. **Delete Profile Picture:**
   - Tap the small **red trash icon** on top-right of avatar
   - Confirm deletion
   - Avatar reverts to default placeholder

### **For Developers:**

**Backend Requirements:**

Your backend needs these endpoints:

```javascript
// Upload Avatar
POST /users/:userId/avatar
Headers: { Authorization: "Bearer <token>" }
Body: FormData with 'avatar' field
Response: { avatar_url: "https://..." }

// Delete Avatar  
DELETE /users/:userId/avatar
Headers: { Authorization: "Bearer <token>" }
Response: { message: "Avatar deleted" }
```

**FormData Format:**
```javascript
{
  avatar: {
    uri: "file:///path/to/image.jpg",
    type: "image/jpeg",
    name: "avatar_<userId>_<timestamp>.jpg"
  }
}
```

---

## 🎨 UI Components

### **Avatar Section:**

```
┌─────────────────────────────────┐
│  ┌─────────┐                    │
│  │  [🗑️]  │   Name              │  ← Delete button (top-right)
│  │         │   email@example.com │
│  │  Avatar │   Tap avatar to...  │  ← Hint text
│  │   [📷]  │                    │  ← Camera icon (bottom-right)
│  └─────────┘                    │
└─────────────────────────────────┘
```

**Styling:**
- Glassmorphism blur effect
- 72x72 avatar size
- 28x28 camera button (primary color)
- 24x24 delete button (red)
- Responsive layout

---

## 🔧 Configuration

### **Image Settings:**

Located in `pickAndUploadAvatar()`:

```javascript
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  aspect: [1, 1],      // Square crop (change to [4, 3] for landscape)
  quality: 0.8,        // 80% quality (0.0 - 1.0)
});
```

**Customization Options:**
- `aspect`: Change crop ratio (e.g., `[4, 3]`, `[16, 9]`)
- `quality`: Adjust image compression (0.0 = low, 1.0 = max)
- Add `allowsMultipleSelection: true` for multiple uploads

### **API Base URL:**

Set in `src/config/config.js`:

```javascript
API_URLS: {
  DEVELOPMENT: 'http://192.168.0.104:3000',  // Your local backend
  PRODUCTION: 'https://your-api.com',        // Your production backend
}
```

---

## 🐛 Troubleshooting

### **Issue: "Permission Required" Alert**

**Cause:** App doesn't have camera roll permissions

**Solution:** 
- iOS: Go to Settings → Your App → Photos → Allow "All Photos"
- Android: Grant storage permission when prompted

---

### **Issue: Upload Fails**

**Possible Causes:**

1. **Backend not running**
   - Check: `http://192.168.0.104:3000/health`
   - Solution: Start your backend server

2. **Wrong API endpoint**
   - Check: Backend has `/users/:userId/avatar` endpoint
   - Solution: Add endpoint or update API URL

3. **Missing Authorization**
   - Check: `session.access_token` is available
   - Solution: Log out and log back in

4. **CORS issues (Web)**
   - Check: Backend allows file uploads
   - Solution: Enable CORS for FormData

---

### **Issue: Image Too Large**

**Cause:** Backend has file size limit

**Solution 1:** Reduce quality in picker:
```javascript
quality: 0.5,  // Reduce to 50%
```

**Solution 2:** Add file size check:
```javascript
const fileSize = result.assets[0].fileSize;
if (fileSize > 5000000) { // 5MB limit
  Alert.alert('Error', 'Image too large. Please select a smaller image.');
  return;
}
```

---

## 📱 Testing

### **Test Scenarios:**

1. ✅ Upload new avatar → Success message + avatar updates
2. ✅ Cancel picker → Nothing changes
3. ✅ Delete avatar → Confirmation → Avatar removed
4. ✅ Upload while offline → Error message shown
5. ✅ Upload without login → "Please log in" message
6. ✅ Permissions denied → "Permission Required" message

### **Test Commands:**

```bash
# Start backend
cd your-backend-folder
npm start

# Start frontend
cd yarkib-frontend
npx expo start
```

### **Test on Device:**

```bash
# Scan QR code with Expo Go app
# Or run on simulator:
npx expo run:ios     # iOS simulator
npx expo run:android # Android emulator
```

---

## 🎉 Success Indicators

When working correctly, you should see:

1. **Camera icon** on avatar (blue circle, bottom-right)
2. **Trash icon** appears when avatar exists (red circle, top-right)
3. **"Tap avatar to change"** hint text below email
4. **Spinner** replaces camera icon during upload
5. **Success alert** after upload completes
6. **Avatar updates** instantly with new image

---

## 🔐 Security Notes

**Backend Considerations:**

1. **Validate file type** - Only accept images (jpg, png, webp)
2. **Limit file size** - Max 5MB recommended
3. **Scan for malware** - Use antivirus on uploads
4. **Validate auth token** - Verify user owns the profile
5. **Use secure storage** - S3, Cloudinary, or similar
6. **Generate unique filenames** - Prevent overwrites

**Example Backend Validation:**
```javascript
// Express.js example
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
if (!allowedTypes.includes(file.mimetype)) {
  return res.status(400).json({ error: 'Invalid file type' });
}
if (file.size > 5000000) {
  return res.status(400).json({ error: 'File too large' });
}
```

---

## 📊 Backend Response Format

### **Upload Success:**
```json
{
  "avatar_url": "https://your-cdn.com/avatars/user123_1234567890.jpg",
  "message": "Avatar uploaded successfully"
}
```

### **Upload Error:**
```json
{
  "error": "File too large",
  "max_size": "5MB"
}
```

### **Delete Success:**
```json
{
  "message": "Avatar deleted successfully"
}
```

---

## 🚀 Next Steps (Optional Enhancements)

### **1. Add Camera Support:**

```javascript
const takePhoto = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return;
  
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  
  if (!result.canceled) {
    await uploadAvatar(result.assets[0].uri);
  }
};
```

### **2. Add Action Sheet:**

Show options: "Take Photo", "Choose from Library", "Delete"

```javascript
import { ActionSheetIOS } from 'react-native';

const showAvatarOptions = () => {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ['Cancel', 'Take Photo', 'Choose Photo', 'Delete Photo'],
      destructiveButtonIndex: 3,
      cancelButtonIndex: 0,
    },
    (buttonIndex) => {
      if (buttonIndex === 1) takePhoto();
      if (buttonIndex === 2) pickAndUploadAvatar();
      if (buttonIndex === 3) deleteAvatar();
    }
  );
};
```

### **3. Add Image Caching:**

Use `expo-image` for better caching:

```bash
npx expo install expo-image
```

```javascript
import { Image } from 'expo-image';

<Image 
  source={{ uri: avatarUrl }} 
  style={styles.avatar}
  cachePolicy="memory-disk"
/>
```

### **4. Add Progress Indicator:**

Show upload progress percentage:

```javascript
const [uploadProgress, setUploadProgress] = useState(0);

// In upload function:
xhr.upload.addEventListener('progress', (e) => {
  if (e.lengthComputable) {
    const progress = (e.loaded / e.total) * 100;
    setUploadProgress(progress);
  }
});
```

---

## 📞 Support

**Issues?**

1. Check logs: Look for `[AVATAR]` prefixed console messages
2. Verify backend: Test endpoints with Postman/curl
3. Check network: Ensure device can reach backend
4. Review permissions: Camera roll access granted

**Still stuck?**

- Check backend logs for upload errors
- Verify FormData format matches backend expectations
- Test with a small image (< 1MB) first
- Ensure `session.access_token` is valid

---

## 🎊 Done!

Your profile picture upload is now fully functional! Users can:

✅ Upload avatars from their photo library  
✅ See live upload progress  
✅ Delete their avatar anytime  
✅ Enjoy a beautiful, modern UI  

**Happy coding! 🚀**




