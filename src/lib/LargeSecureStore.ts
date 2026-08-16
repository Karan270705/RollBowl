import * as SecureStore from 'expo-secure-store';

class Mutex {
  private _queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    let release: () => void;
    const ticket = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previousQueue = this._queue;
    this._queue = previousQueue.then(() => ticket);

    await previousQueue;
    try {
      return await task();
    } finally {
      release!();
    }
  }
}

type SecureStoreResult<T> = { success: true; value: T } | { success: false; error: any };

/**
 * Helper to prevent SecureStore from hanging indefinitely on Android Expo Go.
 */
async function executeSecureStoreOp<T>(
  operation: () => Promise<T>,
  opName: string
): Promise<SecureStoreResult<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`SecureStore operation timed out (${opName})`));
      }, 1500);
    });

    const result = await Promise.race([operation(), timeoutPromise]);
    return { success: true, value: result };
  } catch (error) {
    console.warn(`[LargeSecureStore] Error in ${opName}:`, error);
    return { success: false, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class LargeSecureStore {
  private _mutex = new Mutex();

  private async _encrypt(key: string, value: string): Promise<void> {
    const MAX_CHUNK_SIZE = 2000;
    const numChunks = Math.ceil(value.length / MAX_CHUNK_SIZE);

    // Determine old chunk count to know what to clean up
    const countRes = await executeSecureStoreOp(
      () => SecureStore.getItemAsync(`${key}_chunk_count`),
      `getItemAsync(${key}_chunk_count) for write`
    );
    const oldNumChunks = (countRes.success && countRes.value) ? parseInt(countRes.value, 10) : 0;

    // 1. Write all new chunks concurrently
    const chunkPromises = [];
    for (let i = 0; i < numChunks; i++) {
      const chunk = value.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
      chunkPromises.push(
        executeSecureStoreOp(
          () => SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk),
          `setItemAsync(${key}_chunk_${i})`
        )
      );
    }

    const chunkResults = await Promise.all(chunkPromises);
    const hasChunkError = chunkResults.some(r => !r.success);
    if (hasChunkError) {
      throw new Error(`[LargeSecureStore] Failed to write one or more chunks for key ${key}. Metadata update aborted.`);
    }

    // 2. Update chunk count only after chunks succeed
    const newCountRes = await executeSecureStoreOp(
      () => SecureStore.setItemAsync(`${key}_chunk_count`, numChunks.toString()),
      `setItemAsync(${key}_chunk_count)`
    );

    if (!newCountRes.success) {
      throw new Error(`[LargeSecureStore] Failed to write chunk_count for key ${key}`);
    }

    // 3. Clean up orphaned chunks
    if (Number.isFinite(oldNumChunks) && oldNumChunks > numChunks) {
      const cleanupPromises = [];
      for (let i = numChunks; i < oldNumChunks; i++) {
        cleanupPromises.push(
          executeSecureStoreOp(
            () => SecureStore.deleteItemAsync(`${key}_chunk_${i}`),
            `deleteItemAsync(${key}_chunk_${i})`
          )
        );
      }
      await Promise.all(cleanupPromises);
    }
  }

  private async _decrypt(key: string): Promise<string | null> {
    const countRes = await executeSecureStoreOp(
      () => SecureStore.getItemAsync(`${key}_chunk_count`),
      `getItemAsync(${key}_chunk_count)`
    );

    if (!countRes.success || !countRes.value) {
      // Legacy compatibility: fall back to non-chunked key
      const legacyRes = await executeSecureStoreOp(
        () => SecureStore.getItemAsync(key),
        `getItemAsync(${key})`
      );
      return (legacyRes.success && legacyRes.value) ? legacyRes.value : null;
    }

    const numChunks = parseInt(countRes.value, 10);
    if (!Number.isFinite(numChunks) || numChunks <= 0) {
      return null;
    }

    // Read all chunks concurrently
    const chunkPromises = [];
    for (let i = 0; i < numChunks; i++) {
      chunkPromises.push(
        executeSecureStoreOp(
          () => SecureStore.getItemAsync(`${key}_chunk_${i}`),
          `getItemAsync(${key}_chunk_${i})`
        )
      );
    }

    const chunkResults = await Promise.all(chunkPromises);

    // Validate every chunk
    let fullString = '';
    for (let i = 0; i < numChunks; i++) {
      const res = chunkResults[i];
      if (!res.success || res.value === null || res.value === undefined) {
        console.warn(`[LargeSecureStore] Missing or failed to read chunk ${i} for key ${key}. Aborting read.`);
        return null; // DO NOT partially reconstruct
      }
      fullString += res.value;
    }

    return fullString;
  }

  async getItem(key: string): Promise<string | null> {
    return this._mutex.runExclusive(async () => {
      try {
        return await this._decrypt(key);
      } catch (e) {
        console.warn(`[LargeSecureStore] Failed getItem(${key}):`, e);
        return null;
      }
    });
  }

  async removeItem(key: string): Promise<void> {
    return this._mutex.runExclusive(async () => {
      try {
        const countRes = await executeSecureStoreOp(
          () => SecureStore.getItemAsync(`${key}_chunk_count`),
          `getItemAsync(${key}_chunk_count)`
        );

        const deletePromises = [];

        if (countRes.success && countRes.value) {
          const numChunks = parseInt(countRes.value, 10);
          if (Number.isFinite(numChunks)) {
            for (let i = 0; i < numChunks; i++) {
              deletePromises.push(
                executeSecureStoreOp(
                  () => SecureStore.deleteItemAsync(`${key}_chunk_${i}`),
                  `deleteItemAsync(${key}_chunk_${i})`
                )
              );
            }
          }
          deletePromises.push(
            executeSecureStoreOp(
              () => SecureStore.deleteItemAsync(`${key}_chunk_count`),
              `deleteItemAsync(${key}_chunk_count)`
            )
          );
        }

        // Always try to delete the legacy key
        deletePromises.push(
          executeSecureStoreOp(
            () => SecureStore.deleteItemAsync(key),
            `deleteItemAsync(${key})`
          )
        );

        await Promise.all(deletePromises);
      } catch (e) {
        console.warn(`[LargeSecureStore] Failed removeItem(${key}):`, e);
      }
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    return this._mutex.runExclusive(async () => {
      try {
        await this._encrypt(key, value);
      } catch (e) {
        console.warn(`[LargeSecureStore] Failed setItem(${key}):`, e);
      }
    });
  }
}

export const largeSecureStore = new LargeSecureStore();
