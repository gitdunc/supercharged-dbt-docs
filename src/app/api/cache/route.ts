/**
 * Cache Admin Endpoint
 * 
 * GET /api/cache/stats - Get cache statistics and debug info
 * POST /api/cache/clear - Clear specific cache layers
 * 
 * Provides visibility into cache hit rates, TTLs, and memory usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCache } from '@/lib/cache';
import { clearCache as clearArtifactCache } from '@/lib/manifestLoader';

export const runtime = 'nodejs';

/**
 * GET /api/cache/stats
 * 
 * Query params:
 * - layer: Filter stats by layer (hot|warm|cold)
 */
export async function GET(request: NextRequest) {
  try {
    const layer = request.nextUrl.searchParams.get('layer');
    const cache = getCache();
    const debug = cache.getDebugInfo();
    const stats = cache.getStats();

    // Filter by layer if requested
    let entries = debug.entries;
    if (layer) {
      entries = entries.filter((e) => e.layer === layer);
    }

    // Calculate aggregate stats
    const totalHits = Object.values(stats as Record<string, any>).reduce(
      (sum, s) => sum + (s.hits || 0),
      0
    );
    const totalMisses = Object.values(stats as Record<string, any>).reduce(
      (sum, s) => sum + (s.misses || 0),
      0
    );
    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    // Group by layer
    const byLayer: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    for (const entry of entries) {
      byLayer[entry.layer]++;
    }

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        cache: {
          totalEntries: debug.totalEntries,
          entriesByLayer: byLayer,
          entries: entries.slice(0, 100), // Return first 100 for brevity
          moreEntriesCount: Math.max(0, entries.length - 100),
        },
        performance: {
          totalHits,
          totalMisses,
          hitRate: Math.round(hitRate * 10000) / 100 + '%',
          avgHitsPerKey:
            Object.keys(stats).length > 0
              ? totalHits / Object.keys(stats).length
              : 0,
        },
        ttl: {
          hot: '5-10 minutes',
          warm: '30-60 minutes',
          cold: '24 hours',
        },
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('[Cache API] GET error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache/clear
 * 
 * Body params:
 * - action: 'clear-all' | 'clear-layer'
 * - layer: (if clear-layer) 'hot' | 'warm' | 'cold' | 'all'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, layer = 'all' } = body;
    const cache = getCache();

    if (action === 'clear-all') {
      cache.clear();
      clearArtifactCache();
      return NextResponse.json(
        {
          success: true,
          action: 'clear-all',
          clearedAt: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    if (action === 'clear-layer') {
      if (!['hot', 'warm', 'cold'].includes(layer)) {
        return NextResponse.json(
          {
            error: 'Invalid layer',
            validLayers: ['hot', 'warm', 'cold'],
          },
          { status: 400 }
        );
      }

      let totalCleared = 0;
      for (const l of layer === 'all' ? ['hot', 'warm', 'cold'] : [layer]) {
        totalCleared += cache.invalidateLayer(l as 'hot' | 'warm' | 'cold');
      }

      return NextResponse.json(
        {
          success: true,
          action: 'clear-layer',
          layer,
          totalItemsCleared: totalCleared,
          clearedAt: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unknown action',
        validActions: ['clear-all', 'clear-layer'],
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Cache API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
