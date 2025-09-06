# Configuration Guide

## Centralized Configuration

All API URLs and settings are now centralized in `src/config/config.js`. This means you only need to change URLs in one place!

## Quick Setup

### 1. Development Setup
Open `src/config/config.js` and update the `DEVELOPMENT` URL:

```javascript
API_URLS: {
  DEVELOPMENT: 'http://192.168.100.1:3000', // Replace with your actual IP
  PRODUCTION: 'https://api.yarkib.com',
  // ...
}
```

### 2. Production Setup
When you deploy your backend, update the `PRODUCTION` URL:

```javascript
API_URLS: {
  DEVELOPMENT: 'http://192.168.100.100:3000',
  PRODUCTION: 'https://your-deployed-backend.com', // TODO: Replace with your actual deployed URL
  // ...
}
```

### 3. Mock Mode
To use mock data instead of real API calls:

```javascript
MOCK_MODE: false, // Set to true for mock data
```

## Environment Detection

The app automatically detects the environment:
- **Development**: Uses `DEVELOPMENT` URL when running in development mode
- **Production**: Uses `PRODUCTION` URL when running in production mode

## Available Settings

### API URLs
- `DEVELOPMENT`: Local development server URL
- `PRODUCTION`: Production server URL
- `STAGING`: Staging server URL (optional)

### Timeouts
- `CONNECTION_CHECK`: Timeout for backend connection checks (default: 5000ms)
- `API_CALLS`: Timeout for API calls (default: 10000ms)

### Features
- `MOCK_MODE`: Enable/disable mock data
- `ENABLE_LOGGING`: Enable/disable debug logging
- `ENABLE_ERROR_REPORTING`: Enable/disable error reporting

## Helper Functions

```javascript
import { getApiBaseUrl, getTimeout, isMockMode, getEnvironment } from '../config/config.js';

// Get current API base URL
const baseUrl = getApiBaseUrl();

// Get timeout for specific operation
const timeout = getTimeout('CONNECTION_CHECK');

// Check if mock mode is enabled
const isMock = isMockMode();

// Get current environment
const env = getEnvironment();
```

## Migration Notes

- All existing API calls will continue to work without changes
- The `getBaseUrl()` function now uses centralized configuration
- `MOCK_MODE` is now controlled by the config file
- Timeouts are now configurable per operation type
