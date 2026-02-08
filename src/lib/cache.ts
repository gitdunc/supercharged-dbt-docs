/**
 * Tiered Cache System for DAG Computation
 * 
 * Implements 3-layer caching strategy:
 * - Hot (5-10 min): Error metrics and test failures for Production Support
 * - Warm (30-60 min): DAG lineage and computed metadata for Data Engineers
 * - Cold (24 hours): Static catalog, glossary, business metadata for BA/Business
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlSeconds: number;
  layer: 'hot' | 'warm' | 'cold';
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

class TieredCache {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private stats: Map<string, CacheStats> = new Map();

  // Default TTLs (in seconds)
  private readonly DEFAULT_TTL = {
    hot: 5 * 60, // 5 minutes: Real-time error metrics
    warm: 45 * 60, // 45 minutes: DAG computation for DE review
    cold: 24 * 60 * 60, // 24 hours: Static catalog/glossary
  };

  /**
   * Set cache entry with automatic TTL based on layer
   */
  set<T>(
    key: string,
    data: T,
    layer: 'hot' | 'warm' | 'cold' = 'warm',
    customTtlSeconds?: number
  ): void {
    const ttl = customTtlSeconds ?? this.DEFAULT_TTL[layer];
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttlSeconds: ttl,
      layer,
    });
  }

  /**
   * Get cache entry if valid (not expired)
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.recordMiss(key);
      return null;
    }

    const ageSeconds = (Date.now() - entry.timestamp) / 1000;
    if (ageSeconds > entry.ttlSeconds) {
      // Expired - clean up both store and stats
      this.store.delete(key);
      this.stats.delete(key);
      this.recordMiss(key);
      return null;
    }

    // Valid hit
    this.recordHit(key);
    return entry.data;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete entry
   */
  delete(key: string): boolean {
    this.stats.delete(key);
    return this.store.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const count = this.store.size;
    this.store.clear();
    this.stats.clear();
    console.log(`[Cache] Cleared ${count} entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(key?: string): Record<string, CacheStats> | CacheStats {
    if (key) {
      return this.stats.get(key) || { hits: 0, misses: 0, evictions: 0 };
    }
    return Object.fromEntries(this.stats.entries());
  }

  /**
   * Get all cache entries with metadata (for debugging)
   */
  getDebugInfo() {
    const entries = Array.from(this.store.entries()).map(([key, entry]) => {
      const ageSeconds = (Date.now() - (entry as CacheEntry<unknown>).timestamp) / 1000;
      return {
        key,
        layer: (entry as CacheEntry<unknown>).layer,
        ageSeconds: Math.round(ageSeconds * 100) / 100,
        ttlSeconds: (entry as CacheEntry<unknown>).ttlSeconds,
        expired: ageSeconds > (entry as CacheEntry<unknown>).ttlSeconds,
      };
    });

    return {
      totalEntries: this.store.size,
      entries,
      stats: Object.fromEntries(this.stats.entries()),
    };
  }

  /**
   * Invalidate a specific layer (useful for manifest updates)
   */
  invalidateLayer(layer: 'hot' | 'warm' | 'cold'): number {
    const entriesOfLayer = Array.from(this.store.entries()).filter(
      ([, entry]) => (entry as CacheEntry<unknown>).layer === layer
    );

    let count = 0;
    for (const [key] of entriesOfLayer) {
      if (this.store.delete(key)) {
        count++;
        // Record eviction and clean up stats
        const stats = this.stats.get(key) || { hits: 0, misses: 0, evictions: 0 };
        stats.evictions++;
        // Don't keep stats for evicted entries
        this.stats.delete(key);
      }
    }

    console.log(`[Cache] Invalidated ${count} entries from ${layer} layer`);
    return count;
  }

  /**
   * Warm cache by preloading data (e.g., pre-compute popular DAGs)
   * Useful for reducing cold-start latency
   */
  warmUp<T>(key: string, loaderFn: () => Promise<T>, layer: 'hot' | 'warm' | 'cold' = 'warm'): Promise<T> {
    return loaderFn()
      .then((data) => {
        this.set(key, data, layer);
        console.log(`[Cache] Warmed up: ${key}`);
        return data;
      })
      .catch((error) => {
        console.error(`[Cache] Warm-up failed for ${key}:`, error);
        throw error;
      });
  }

  private recordHit(key: string): void {
    const stats = this.stats.get(key) || { hits: 0, misses: 0, evictions: 0 };
    stats.hits++;
    this.stats.set(key, stats);
  }

  private recordMiss(key: string): void {
    const stats = this.stats.get(key) || { hits: 0, misses: 0, evictions: 0 };
    stats.misses++;
    this.stats.set(key, stats);
  }
}

// Singleton instance
let instance: TieredCache | null = null;

/**
 * Get the global cache instance
 */
export function getCache(): TieredCache {
  if (!instance) {
    instance = new TieredCache();
  }
  return instance;
}

/**
 * Reset cache (for testing)
 */
export function resetCache(): void {
  instance = null;
}

export default TieredCache;
