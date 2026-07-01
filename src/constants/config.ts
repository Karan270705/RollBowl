/**
 * Application configuration constants.
 * Toggle USE_MOCK to switch between mock and real API calls.
 */

export const AppConfig = {
  APP_NAME: 'RollBowl',
  APP_VERSION: '1.0.0',
  APP_TAGLINE: 'Healthy Choice. Zero Compromise.',

  // API Configuration
  API_BASE_URL: __DEV__ ? 'http://localhost:3000/api' : 'https://api.rollbowl.in/api',
  USE_MOCK: true, // Set to false when backend is ready

  // Timing
  MOCK_DELAY_MIN: 300,
  MOCK_DELAY_MAX: 800,
  QUERY_STALE_TIME: 5 * 60 * 1000, // 5 minutes
  QUERY_CACHE_TIME: 10 * 60 * 1000, // 10 minutes

  // Pagination
  DEFAULT_PAGE_SIZE: 20,

  // Feature Flags
  FEATURES: {
    SUBSCRIPTION_ENABLED: true,
    NOTIFICATIONS_ENABLED: true,
    SOCIAL_LOGIN_ENABLED: false,
    PAYMENT_GATEWAY_ENABLED: false,
  },
  
  // Business Operations
  BUSINESS: {
    PICKUP_START_TIME: '12:00', // 24h format HH:mm
    PICKUP_END_TIME: '14:00',
  }
} as const;
