// Configuration file for API endpoints and settings
// Change these values once and they will be used throughout the app

const CONFIG = {
  // API Base URLs - Change these based on your environment
  API_URLS: {
    // Development - Using local IP for mobile testing
    DEVELOPMENT: 'http://192.168.100.31:3000',
    
    // Production - Update this when you deploy your backend
    PRODUCTION: 'https://7477b4c1d1b3.ngrok-free.app', // TODO: Replace with your actual production URL
    
    // Staging (optional) - Update this if you have a staging environment
    STAGING: 'https://7477b4c1d1b3.ngrok-free.app', // TODO: Replace with your staging URL
  },
  
  // Environment detection
  ENVIRONMENT: __DEV__ ? 'DEVELOPMENT' : 'PRODUCTION',
  
  // API Timeout settings
  TIMEOUT: {
    CONNECTION_CHECK: 5000, // 5 seconds
    API_CALLS: 10000,       // 10 seconds
  },
  
  // Mock mode settings
  MOCK_MODE: false, // Set to true to use mock data instead of real API calls (useful for testing)
  
  // Feature flags
  FEATURES: {
    ENABLE_LOGGING: true,
    ENABLE_ERROR_REPORTING: true,
  },
  
  // Mapbox Configuration
  MAPBOX: {
    // The access token will be fetched from backend for security
    // But you can also store it here for development if needed
    ACCESS_TOKEN: "pk.eyJ1Ijoic3phaWQwMDEiLCJhIjoiY21meTlqdThrMGJweTJycTA2MG1meTBndCJ9.ovCqcSmbW2orUFkmPq_mAQ", // Will be fetched from backend API
  }
};

// Helper function to get the current API base URL
export const getApiBaseUrl = () => {
  return CONFIG.API_URLS[CONFIG.ENVIRONMENT];
};

// Helper function to get timeout settings
export const getTimeout = (type = 'API_CALLS') => {
  return CONFIG.TIMEOUT[type];
};

// Helper function to check if mock mode is enabled
export const isMockMode = () => {
  return CONFIG.MOCK_MODE;
};

// Helper function to get environment
export const getEnvironment = () => {
  return CONFIG.ENVIRONMENT;
};

// Export the full config for advanced usage
export default CONFIG;
