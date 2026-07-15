import { largeSecureStore } from '@/src/lib/LargeSecureStore';

export const RESET_COOLDOWN_MS = 60_000;
export const RESET_WINDOW_MS = 15 * 60_000;
export const MAX_RESET_ATTEMPTS = 3;

export interface RateLimitState {
  attempts: number[];
  cooldownUntil: number;
}

// Simple deterministic non-cryptographic hash (cyrb53)
const cyrb53 = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

export const getStorageKey = (email: string) => {
  const normalized = email.trim().toLowerCase();
  return `forgot_password_rl_${cyrb53(normalized)}`;
};

export const loadRateLimitState = async (email: string): Promise<RateLimitState> => {
  const defaultState: RateLimitState = { attempts: [], cooldownUntil: 0 };
  if (!email || email.trim() === '') return defaultState;

  const key = getStorageKey(email);
  try {
    const raw = await largeSecureStore.getItem(key);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw);
    const now = Date.now();

    const state: RateLimitState = {
      attempts: Array.isArray(parsed.attempts) 
        ? parsed.attempts.filter((ts: any) => typeof ts === 'number' && isFinite(ts) && now - ts <= RESET_WINDOW_MS)
        : [],
      cooldownUntil: typeof parsed.cooldownUntil === 'number' && isFinite(parsed.cooldownUntil) 
        ? parsed.cooldownUntil 
        : 0,
    };

    return state;
  } catch (err) {
    // Safely fallback to empty state for malformed JSON
    return defaultState;
  }
};

export const saveRateLimitState = async (email: string, state: RateLimitState): Promise<void> => {
  const key = getStorageKey(email);
  try {
    await largeSecureStore.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save rate limit state', err);
  }
};
