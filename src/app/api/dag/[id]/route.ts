/**
 * Warm Layer API: DAG Computation Endpoint
 * 
 * GET /api/dag/[id]
 * 
 * Computes lineage DAG for a model on-demand.
 * Cached for 30-60 minutes (warm layer TTL).
 * Targets: Data Engineers reviewing lineage and dependencies.
 * 
 * Response: Full DAG with upstream/downstream lineage
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCatalog, loadManifest } from '@/lib/manifestLoader';
import { computeDAG, validateManifest } from '@/lib/dagCompute';
import { getCache } from '@/lib/cache';
import { computeBroadChecks, resolveCompareArtifacts } from '@/lib/observability';

export const runtime = 'nodejs';

// Track validation signature so manifest changes with same dbt version still revalidate.
let lastValidatedSignature: string | null = null;

interface DAGRequest {
  params: {
    id: string;
  };
}

/**
 * GET /api/dag/[id]
 * 
 * Query params:
 * - maxDepth: Maximum lineage depth (default: 50)
 * - fresh: Force recompute (bypass cache)
 */
export async function GET(request: NextRequest, { params }: DAGRequest) {
  const startTime = Date.now();

  try {
    const nodeId = decodeURIComponent(params.id);
    const maxDepth = Math.min(
      parseInt(request.nextUrl.searchParams.get('maxDepth') || '50', 10),
      100
    );
    const fresh = request.nextUrl.searchParams.get('fresh') === 'true';
    const currentSnapshot = request.nextUrl.searchParams.get('currentSnapshot');
    const previousSnapshot = request.nextUrl.searchParams.get('previousSnapshot');
    const previousManifestPath = request.nextUrl.searchParams.get('previousManifestPath');
    const previousCatalogPath = request.nextUrl.searchParams.get('previousCatalogPath');

    // Check cache first (unless fresh is requested)
    const cacheKey = `dag:${nodeId}:${maxDepth}:${currentSnapshot || 'current'}:${previousSnapshot || 'auto'}:${previousManifestPath || 'auto'}:${previousCatalogPath || 'auto'}`;
    const cache = getCache();

    if (!fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return NextResponse.json(
          {
            data: cached,
            cached: true,
            computeTimeMs: 0,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=1800', // 30 min HTTP cache
              'X-Cache': 'HIT',
            },
          }
        );
      }
    }

    // Load manifest and catalog (catalog is optional enrichment for DAG metadata)
    let manifest;
    let catalog;
    try {
      manifest = loadManifest();
      try {
        catalog = loadCatalog();
      } catch (catalogError) {
        catalog = undefined;
        console.warn('[DAG API] Catalog unavailable, returning manifest-only DAG metadata:', catalogError);
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Failed to load manifest/catalog',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 503 }
      );
    }

    const compareArtifacts = resolveCompareArtifacts(manifest, catalog, {
      currentSnapshot,
      previousSnapshot,
      previousManifestPath,
      previousCatalogPath,
    });
    const currentManifest = compareArtifacts.current.manifest;
    const currentCatalog = compareArtifacts.current.catalog;
    if (!currentManifest) {
      return NextResponse.json(
        {
          error: 'Current manifest is unavailable for requested snapshot/path',
        },
        { status: 404 }
      );
    }

    // Revalidate on signature change (dbt version + generated_at + node counts).
    const currentSignature = [
      currentManifest.metadata?.dbt_version || 'unknown',
      currentManifest.metadata?.generated_at || 'unknown',
      Object.keys(currentManifest.nodes || {}).length,
      Object.keys(currentManifest.sources || {}).length,
      Object.keys(currentManifest.macros || {}).length,
    ].join(':');
    if (currentSignature !== lastValidatedSignature) {
      const validation = validateManifest(currentManifest);
      if (!validation.valid) {
        console.warn('[DAG API] Manifest validation warnings:', validation.errors);
      }
      lastValidatedSignature = currentSignature;
    }

    // Check if node exists (check both nodes and sources)
    const allNodes = {
      ...(currentManifest.nodes || {}),
      ...(currentManifest.sources || {}),
      ...(currentManifest.macros || {}),
    };

    if (!allNodes[nodeId]) {
      return NextResponse.json(
        {
          error: 'Node not found',
          nodeId,
          availableCount: Object.keys(allNodes).length,
        },
        { status: 404 }
      );
    }

    // Compute DAG
    const dag = computeDAG(currentManifest, nodeId, maxDepth, currentCatalog || undefined);

    const annotateNode = (node: any) => {
      node.observability = computeBroadChecks(node.unique_id, compareArtifacts);
    };
    annotateNode(dag.root);
    dag.parents.forEach(annotateNode);
    dag.children.forEach(annotateNode);

    // Cache result (warm layer: 45 min default)
    cache.set(cacheKey, dag, 'warm');

    const computeTimeMs = Date.now() - startTime;

    return NextResponse.json(
      {
        data: dag,
        cached: false,
        computeTimeMs,
        nodeId,
        metadata: {
          manifestVersion: currentManifest.metadata?.dbt_version || 'unknown',
          manifestSchema: currentManifest.metadata?.dbt_schema_version || 'unknown',
          generatedAt: currentManifest.metadata?.generated_at || 'unknown',
          catalogVersion: currentCatalog?.metadata?.dbt_version || 'unavailable',
          catalogSchema: currentCatalog?.metadata?.dbt_schema_version || 'unavailable',
          catalogGeneratedAt: currentCatalog?.metadata?.generated_at || 'unavailable',
          comparison: {
            currentSource: compareArtifacts.current.source,
            previousSource: compareArtifacts.previous.source,
            previousManifestSchema:
              compareArtifacts.previous.manifest?.metadata?.dbt_schema_version || 'unknown',
            schemaVersionChanged:
              (compareArtifacts.current.manifest?.metadata?.dbt_schema_version || '') !==
              (compareArtifacts.previous.manifest?.metadata?.dbt_schema_version || ''),
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=1800', // 30 min HTTP cache for cold cache misses
          'X-Cache': 'MISS',
          'X-Compute-Time-Ms': computeTimeMs.toString(),
        },
      }
    );
  } catch (error) {
    const computeTimeMs = Date.now() - startTime;
    console.error('[DAG API] Error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        computeTimeMs,
      },
      {
        status: 500,
        headers: {
          'X-Compute-Time-Ms': computeTimeMs.toString(),
        },
      }
    );
  }
}

/**
 * POST /api/dag/[id]/invalidate
 * 
 * Invalidate cache for a specific DAG (admin only)
 * Used when manifest is updated without full redeploy
 */
export async function POST(request: NextRequest, { params }: DAGRequest) {
  try {
    const nodeId = decodeURIComponent(params.id);
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'invalidate') {
      const cache = getCache();
      
      // Delete all cache entries for this node (all depths)
      let count = 0;
      const debug = cache.getDebugInfo();
      for (const entry of debug.entries) {
        if (entry.key.startsWith(`dag:${nodeId}:`)) {
          if (cache.delete(entry.key)) count++;
        }
      }

      return NextResponse.json(
        {
          success: true,
          nodeId,
          invalidatedCount: count,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unknown action',
        action,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[DAG API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
