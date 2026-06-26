import { AppConfig } from '@/src/constants/config';

/** Simulates network delay for mock API calls */
export const mockDelay = (ms?: number): Promise<void> => {
  const delay = ms ?? Math.random() * (AppConfig.MOCK_DELAY_MAX - AppConfig.MOCK_DELAY_MIN) + AppConfig.MOCK_DELAY_MIN;
  return new Promise((resolve) => setTimeout(resolve, delay));
};
