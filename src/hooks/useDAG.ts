/**
 * useDAG Hook
 * 
 * Fetches DAG data from /api/dag/[id] endpoint
 * Handles loading, error states, and client-side caching
 * 
 * Usage:
 * ```tsx
 * const { data, isLoading, error } = useDAG(nodeId, { maxDepth: 50 });
 * ```
 */

import { useState, useEffect, useCallback } from 'react';

export interface DAGHookOptions {
  maxDepth?: number;
  fresh?: boolean;
  skip?: boolean;
  currentSnapshot?: string;
  previousSnapshot?: string;
  previousManifestPath?: string;
  previousCatalogPath?: string;
}

export interface DAGHookReturnType<T = any> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isCached: boolean;
  computeTimeMs?: number;
}

// Simple in-memory cache for DAG responses
const dagCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes client-side cache

export function useDAG(
  nodeId: string | null,
  options: DAGHookOptions = {}
): DAGHookReturnType {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [computeTimeMs, setComputeTimeMs] = useState<number | undefined>();

  const {
    maxDepth = 50,
    fresh = false,
    skip = false,
    currentSnapshot,
    previousSnapshot,
    previousManifestPath,
    previousCatalogPath,
  } = options;

  const fetchDAG = useCallback(async () => {
    if (!nodeId || skip) {
      return;
    }

    const cacheKey = `dag:${nodeId}:${maxDepth}:${currentSnapshot || 'current'}:${previousSnapshot || 'auto'}:${previousManifestPath || 'auto'}:${previousCatalogPath || 'auto'}`;

    // Check client-side cache first (unless fresh is requested)
    if (!fresh && dagCache.has(cacheKey)) {
      const cached = dagCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setData(cached.data);
        setIsCached(true);
        setError(null);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setIsCached(false);
    setError(null);

    try {
      const params = new URLSearchParams({
        maxDepth: maxDepth.toString(),
        fresh: fresh.toString(),
      });
      if (currentSnapshot) params.set('currentSnapshot', currentSnapshot);
      if (previousSnapshot) params.set('previousSnapshot', previousSnapshot);
      if (previousManifestPath) params.set('previousManifestPath', previousManifestPath);
      if (previousCatalogPath) params.set('previousCatalogPath', previousCatalogPath);

      const response = await fetch(`/api/dag/${encodeURIComponent(nodeId)}?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: Failed to fetch DAG for ${nodeId}`
        );
      }

      const result = await response.json();
      const { data: dagData, cached, computeTimeMs: time } = result;

      setData(dagData);
      setIsCached(cached);
      setComputeTimeMs(time);

      // Cache in client-side store
      dagCache.set(cacheKey, {
        data: dagData,
        timestamp: Date.now(),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setData(null);
      console.error(`[useDAG] Error fetching DAG for ${nodeId}:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [
    nodeId,
    maxDepth,
    fresh,
    skip,
    currentSnapshot,
    previousSnapshot,
    previousManifestPath,
    previousCatalogPath,
  ]);

  // Fetch when nodeId changes
  useEffect(() => {
    fetchDAG();
  }, [fetchDAG]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchDAG,
    isCached,
    computeTimeMs,
  };
}

/**
 * useErrors Hook
 * 
 * Fetches error/test metadata from /api/errors/[id] endpoint
 * Similar interface to useDAG but for test failures and data quality metrics
 */

export interface ErrorsHookOptions {
  testType?: string;
  statusFilter?: string;
  skip?: boolean;
  currentSnapshot?: string;
  previousSnapshot?: string;
  previousManifestPath?: string;
  previousCatalogPath?: string;
}

export interface ErrorsHookReturnType<T = any> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isCached: boolean;
  computeTimeMs?: number;
}

const errorsCache = new Map<string, { data: any; timestamp: number }>();
const ERRORS_CACHE_TTL = 1 * 60 * 1000; // 1 minute client-side cache (hot layer is 5-10 min server-side)

export function useErrors(
  nodeId: string | null,
  options: ErrorsHookOptions = {}
): ErrorsHookReturnType {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [computeTimeMs, setComputeTimeMs] = useState<number | undefined>();

  const {
    testType,
    statusFilter,
    skip = false,
    currentSnapshot,
    previousSnapshot,
    previousManifestPath,
    previousCatalogPath,
  } = options;

  const fetchErrors = useCallback(async () => {
    if (!nodeId || skip) {
      return;
    }

    const cacheKey = `errors:${nodeId}:${testType}:${statusFilter}:${currentSnapshot || 'current'}:${previousSnapshot || 'auto'}:${previousManifestPath || 'auto'}:${previousCatalogPath || 'auto'}`;

    // Check client-side cache first
    if (errorsCache.has(cacheKey)) {
      const cached = errorsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ERRORS_CACHE_TTL) {
        setData(cached.data);
        setIsCached(true);
        setError(null);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setIsCached(false);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (testType) params.append('testType', testType);
      if (statusFilter) params.append('statusFilter', statusFilter);
      if (currentSnapshot) params.set('currentSnapshot', currentSnapshot);
      if (previousSnapshot) params.set('previousSnapshot', previousSnapshot);
      if (previousManifestPath) params.set('previousManifestPath', previousManifestPath);
      if (previousCatalogPath) params.set('previousCatalogPath', previousCatalogPath);

      const response = await fetch(
        `/api/errors/${encodeURIComponent(nodeId)}?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: Failed to fetch errors for ${nodeId}`
        );
      }

      const result = await response.json();
      const { data: errorsData, cached, computeTimeMs: time } = result;

      setData(errorsData);
      setIsCached(cached);
      setComputeTimeMs(time);

      // Cache in client-side store
      errorsCache.set(cacheKey, {
        data: errorsData,
        timestamp: Date.now(),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setData(null);
      console.error(`[useErrors] Error fetching errors for ${nodeId}:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [
    nodeId,
    testType,
    statusFilter,
    skip,
    currentSnapshot,
    previousSnapshot,
    previousManifestPath,
    previousCatalogPath,
  ]);

  // Fetch when nodeId changes
  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchErrors,
    isCached,
    computeTimeMs,
  };
}

/**
 * Clear client-side caches
 * Useful for manual refresh after manifest update
 */
export function clearDAGCaches() {
  dagCache.clear();
  errorsCache.clear();
}
