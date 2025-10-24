import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface AvatarUploadWebViewProps {
  visible: boolean;
  onClose: () => void;
  onUploadSuccess: (avatarUrl: string) => void;
  userId: string;
  token: string;
  apiBaseUrl: string;
}

const AvatarUploadWebView: React.FC<AvatarUploadWebViewProps> = ({
  visible,
  onClose,
  onUploadSuccess,
  userId,
  token,
  apiBaseUrl,
}) => {
  const [loading, setLoading] = useState(true);

  // HTML content with file upload functionality
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 400px;
          width: 100%;
          text-align: center;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 24px;
        }
        p {
          color: #666;
          margin-bottom: 25px;
          font-size: 14px;
        }
        .upload-area {
          border: 3px dashed #667eea;
          border-radius: 15px;
          padding: 40px 20px;
          margin-bottom: 20px;
          cursor: pointer;
          transition: all 0.3s;
          background: #f8f9ff;
        }
        .upload-area:hover {
          border-color: #764ba2;
          background: #f0f2ff;
        }
        .upload-area.dragover {
          border-color: #764ba2;
          background: #e8eaff;
          transform: scale(1.02);
        }
        .upload-icon {
          font-size: 48px;
          margin-bottom: 15px;
        }
        input[type="file"] {
          display: none;
        }
        .btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 25px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .preview {
          margin: 20px 0;
          border-radius: 15px;
          overflow: hidden;
          max-height: 300px;
        }
        .preview img {
          width: 100%;
          height: auto;
          display: block;
        }
        .message {
          padding: 12px;
          border-radius: 10px;
          margin-top: 15px;
          font-size: 14px;
          animation: fadeIn 0.3s;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        .loading {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 10px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .file-info {
          background: #f8f9ff;
          padding: 12px;
          border-radius: 10px;
          margin: 15px 0;
          font-size: 13px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📸 Upload Profile Picture</h1>
        <p>Choose an image to upload as your profile picture</p>
        
        <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
          <div class="upload-icon">📤</div>
          <div>
            <strong>Click to select image</strong><br>
            <small>or drag and drop here</small><br>
            <small style="color: #999;">Max 5MB • JPG, PNG, WebP</small>
          </div>
        </div>
        
        <input type="file" id="fileInput" accept="image/*">
        
        <div id="preview" class="preview" style="display: none;"></div>
        <div id="fileInfo" class="file-info" style="display: none;"></div>
        
        <button id="uploadBtn" class="btn" disabled>
          Upload Picture
        </button>
        
        <div id="message"></div>
      </div>

      <script>
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const preview = document.getElementById('preview');
        const fileInfo = document.getElementById('fileInfo');
        const message = document.getElementById('message');
        
        let selectedFile = null;

        // File input change
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) handleFile(file);
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
          uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragover');
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        });

        function handleFile(file) {
          // Validate file type
          if (!file.type.startsWith('image/')) {
            showMessage('Please select an image file', 'error');
            return;
          }

          // Validate file size (5MB)
          if (file.size > 5 * 1024 * 1024) {
            showMessage('File too large. Maximum size is 5MB', 'error');
            return;
          }

          selectedFile = file;
          
          // Show preview
          const reader = new FileReader();
          reader.onload = (e) => {
            preview.innerHTML = '<img src="' + e.target.result + '" alt="Preview">';
            preview.style.display = 'block';
          };
          reader.readAsDataURL(file);

          // Show file info
          fileInfo.innerHTML = '<strong>' + file.name + '</strong><br>' + 
                              'Size: ' + (file.size / 1024).toFixed(1) + ' KB';
          fileInfo.style.display = 'block';

          // Enable upload button
          uploadBtn.disabled = false;
          message.innerHTML = '';
        }

        // Upload button click
        uploadBtn.addEventListener('click', async () => {
          if (!selectedFile) return;

          try {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<span class="loading"></span>Uploading...';
            
            const formData = new FormData();
            formData.append('avatar', selectedFile);

            const response = await fetch('${apiBaseUrl}/users/${userId}/avatar', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ${token}'
              },
              body: formData
            });

            if (!response.ok) {
              const error = await response.text();
              throw new Error(error || 'Upload failed');
            }

            const data = await response.json();
            
            showMessage('✅ Upload successful!', 'success');
            
            // Send success message to React Native
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'UPLOAD_SUCCESS',
                avatarUrl: data.avatar_url
              }));
            }

            // Reset after 1 second
            setTimeout(() => {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'CLOSE'
                }));
              }
            }, 1500);

          } catch (error) {
            showMessage('❌ ' + error.message, 'error');
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = 'Upload Picture';
          }
        });

        function showMessage(text, type) {
          message.innerHTML = '<div class="message ' + type + '">' + text + '</div>';
        }

        // Notify React Native that page is loaded
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LOADED'
          }));
        }
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'UPLOAD_SUCCESS') {
        onUploadSuccess(data.avatarUrl);
        onClose();
      } else if (data.type === 'CLOSE') {
        onClose();
      } else if (data.type === 'LOADED') {
        setLoading(false);
      }
    } catch (error) {
      console.error('[WEBVIEW] Error parsing message:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Upload Avatar</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        <WebView
          source={{ html: htmlContent }}
          style={styles.webview}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          mixedContentMode="always"
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
});

export default AvatarUploadWebView;




