import * as SecureStore from 'expo-secure-store';

/**
 * Helper to prevent SecureStore from hanging indefinitely on Android Expo Go.
 */
async function safeSecureStoreOp<T>(
  operation: () => Promise<T>,
  fallback: T,
  opName: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`SecureStore operation timed out (${opName})`));
      }, 1500);
    });

    const result = await Promise.race([operation(), timeoutPromise]);
    return result;
  } catch (error) {
    console.warn(`[LargeSecureStore] Error in ${opName}:`, error);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class LargeSecureStore {
  private async _encrypt(key: string, value: string): Promise<void> {
    const MAX_CHUNK_SIZE = 2000;
    const numChunks = Math.ceil(value.length / MAX_CHUNK_SIZE);

    await safeSecureStoreOp(
      () => SecureStore.setItemAsync(`${key}_chunk_count`, numChunks.toString()),
      undefined,
      `setItemAsync(${key}_chunk_count)`
    );

    for (let i = 0; i < numChunks; i++) {
      const chunk = value.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
      await safeSecureStoreOp(
        () => SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk),
        undefined,
        `setItemAsync(${key}_chunk_${i})`
      );
    }
  }

  private async _decrypt(key: string): Promise<string | null> {
    const numChunksStr = await safeSecureStoreOp(
      () => SecureStore.getItemAsync(`${key}_chunk_count`),
      null,
      `getItemAsync(${key}_chunk_count)`
    );

    if (!numChunksStr) {
      return await safeSecureStoreOp(
        () => SecureStore.getItemAsync(key),
        null,
        `getItemAsync(${key})`
      );
    }

    const numChunks = parseInt(numChunksStr, 10);
    if (!Number.isFinite(numChunks) || numChunks <= 0) {
      return null;
    }

    let fullString = '';
    for (let i = 0; i < numChunks; i++) {
      const chunk = await safeSecureStoreOp(
        () => SecureStore.getItemAsync(`${key}_chunk_${i}`),
        null,
        `getItemAsync(${key}_chunk_${i})`
      );
      if (chunk) {
        fullString += chunk;
      }
    }

    return fullString || null;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return await this._decrypt(key);
    } catch (e) {
      console.warn(`[LargeSecureStore] Failed getItem(${key}):`, e);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      const numChunksStr = await safeSecureStoreOp(
        () => SecureStore.getItemAsync(`${key}_chunk_count`),
        null,
        `getItemAsync(${key}_chunk_count)`
      );
      if (numChunksStr) {
        const numChunks = parseInt(numChunksStr, 10);
        for (let i = 0; i < numChunks; i++) {
          await safeSecureStoreOp(
            () => SecureStore.deleteItemAsync(`${key}_chunk_${i}`),
            undefined,
            `deleteItemAsync(${key}_chunk_${i})`
          );
        }
        await safeSecureStoreOp(
          () => SecureStore.deleteItemAsync(`${key}_chunk_count`),
          undefined,
          `deleteItemAsync(${key}_chunk_count)`
        );
      }
      await safeSecureStoreOp(
        () => SecureStore.deleteItemAsync(key),
        undefined,
        `deleteItemAsync(${key})`
      );
    } catch (e) {
      console.warn(`[LargeSecureStore] Failed removeItem(${key}):`, e);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await this._encrypt(key, value);
    } catch (e) {
      console.warn(`[LargeSecureStore] Failed setItem(${key}):`, e);
    }
  }
}

export const largeSecureStore = new LargeSecureStore();
