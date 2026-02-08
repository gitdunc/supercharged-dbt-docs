/**
 * Hot Layer API: Test/Error Metadata Endpoint
 *
 * GET /api/errors/[id]
 *
 * Returns test failures, freshness issues, and data quality metrics.
 * Implements the "3 broad tests" pattern: schema, volume, freshness.
 * Cached for 5-10 minutes (hot layer TTL).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadManifest, loadCatalog } from '@/lib/manifestLoader';
import { getCache } from '@/lib/cache';
import { computeBroadChecks, extractNumericStat, resolveCompareArtifacts } from '@/lib/observability';

export const runtime = 'nodejs';

interface ErrorsRequest {
  params: {
    id: string;
  };
}

interface TestResult {
  unique_id: string;
  testName: string;
  testType: 'freshness' | 'volume' | 'quality' | 'other';
  nodeId: string;
  columnName?: string;
  status: 'pass' | 'fail' | 'unknown';
  severity: 'warning' | 'error';
  description: string;
  lastChecked?: string;
}

interface ErrorMetadata {
  nodeId: string;
  nodeName: string;
  totalTests: number;
  failingTests: number;
  tests: TestResult[];
  volumeMetrics?: {
    type: 'volume';
    expectedRowCount?: number;
    actualRowCount?: number;
    volumeDeviation?: number;
  };
  observability?: ReturnType<typeof computeBroadChecks>;
  comparison?: {
    currentSource: string;
    previousSource: string;
    currentManifestSchema: string;
    previousManifestSchema: string;
    schemaVersionChanged: boolean;
  };
}

/**
 * Classify test into broad categories.
 */
function classifyTest(
  testNode: any,
  testName: string
): 'freshness' | 'volume' | 'quality' | 'other' {
  const testMeta = testNode.test_metadata || {};
  if (testMeta.namespace === 'dbt' && testMeta.name) {
    const metaName = String(testMeta.name).toLowerCase();
    if (metaName === 'dbt_freshness' || metaName === 'freshness') return 'freshness';
    if (['unique', 'not_null', 'relationships', 'accepted_values'].includes(metaName)) return 'quality';
    if (metaName) return 'other';
  }

  const lower = testName.toLowerCase();
  if (lower.includes('freshness') || lower.includes('dbt_freshness')) return 'freshness';
  if (lower.includes('row_count') || lower.includes('volume') || lower.includes('not_empty')) return 'volume';
  if (
    lower.includes('not_null') ||
    lower.includes('unique') ||
    lower.includes('accepted_values') ||
    lower.includes('relationships') ||
    lower.includes('type_check')
  ) {
    return 'quality';
  }
  return 'other';
}

/**
 * GET /api/errors/[id]
 *
 * Query params:
 * - testType: freshness|volume|quality
 * - statusFilter: pass|fail|unknown
 * - currentSnapshot: snapshot label for current artifacts
 * - previousSnapshot: snapshot label for previous artifacts
 * - previousManifestPath: explicit manifest path (repo-relative or absolute)
 * - previousCatalogPath: explicit catalog path (repo-relative or absolute)
 */
export async function GET(request: NextRequest, { params }: ErrorsRequest) {
  const startTime = Date.now();

  try {
    const nodeId = decodeURIComponent(params.id);
    const testTypeFilter = request.nextUrl.searchParams.get('testType');
    const statusFilter = request.nextUrl.searchParams.get('statusFilter');
    const currentSnapshot = request.nextUrl.searchParams.get('currentSnapshot');
    const previousSnapshot = request.nextUrl.searchParams.get('previousSnapshot');
    const previousManifestPath = request.nextUrl.searchParams.get('previousManifestPath');
    const previousCatalogPath = request.nextUrl.searchParams.get('previousCatalogPath');

    const cacheKey = `errors:${nodeId}:${testTypeFilter || 'all'}:${statusFilter || 'all'}:${currentSnapshot || 'current'}:${previousSnapshot || 'auto'}:${previousManifestPath || 'auto'}:${previousCatalogPath || 'auto'}`;
    const cache = getCache();
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
            'Cache-Control': 'public, max-age=300',
            'X-Cache': 'HIT',
          },
        }
      );
    }

    let manifest, catalog;
    try {
      manifest = loadManifest();
      catalog = loadCatalog();
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
    const previousManifest = compareArtifacts.previous.manifest;

    const allNodes = {
      ...(currentManifest?.nodes || {}),
      ...(currentManifest?.sources || {}),
    };

    if (!allNodes[nodeId]) {
      return NextResponse.json(
        {
          error: 'Node not found',
          nodeId,
        },
        { status: 404 }
      );
    }

    const node = allNodes[nodeId];
    const nodeName = node.name;
    const testResults: TestResult[] = [];

    for (const [testId, testNodeRaw] of Object.entries(currentManifest?.nodes || {})) {
      const testNode = testNodeRaw as any;
      if (testNode.resource_type !== 'test') continue;

      const appliesHere =
        testNode.depends_on?.nodes?.includes(nodeId) ||
        (testNode as any).file_key_name === nodeId;
      if (!appliesHere) continue;

      const testMetadata = (testNode as any).test_metadata || {};
      const testName = testMetadata.name || testNode.name;
      const columnName = testMetadata.kwargs?.column_name;

      testResults.push({
        unique_id: testId,
        testName,
        testType: classifyTest(testNode, testName),
        nodeId,
        columnName,
        status: 'unknown',
        severity: (testNode.config as any)?.severity || 'warning',
        description: testNode.description || `Test: ${testName}`,
      });
    }

    const checks = computeBroadChecks(nodeId, compareArtifacts);

    testResults.push(
      {
        unique_id: `observability.schema_drift.${nodeId}`,
        testName: 'schema_drift',
        testType: 'quality',
        nodeId,
        status: checks.schema.status,
        severity: checks.schema.status === 'fail' ? 'error' : 'warning',
        description:
          checks.schema.status === 'unknown'
            ? 'Schema drift baseline unavailable (no previous artifact found)'
            : `Schema drift: +${checks.schema.addedColumns.length} / -${checks.schema.removedColumns.length} / ${checks.schema.typeChanges.length} type changes`,
      },
      {
        unique_id: `observability.volume.${nodeId}`,
        testName: 'volume_change',
        testType: 'volume',
        nodeId,
        status: checks.volume.status,
        severity: checks.volume.status === 'fail' ? 'error' : 'warning',
        description:
          checks.volume.deviationPct === undefined
            ? 'Volume baseline unavailable (requires current and previous row counts)'
            : `Row count changed by ${checks.volume.deviationPct.toFixed(2)}% (threshold ${checks.volume.thresholdPct}%)`,
      },
      {
        unique_id: `observability.freshness.${nodeId}`,
        testName: 'freshness_lag',
        testType: 'freshness',
        nodeId,
        status: checks.freshness.status,
        severity: checks.freshness.status === 'fail' ? 'error' : 'warning',
        description:
          checks.freshness.lagMinutes === undefined
            ? 'Freshness timestamp unavailable'
            : `Last update ${checks.freshness.lagMinutes} minutes ago (threshold ${checks.freshness.thresholdMinutes} minutes, source ${checks.freshness.source})`,
      }
    );

    const errorMetadata: ErrorMetadata = {
      nodeId,
      nodeName,
      totalTests: testResults.length,
      failingTests: testResults.filter((t) => t.status === 'fail').length,
      tests: testResults,
      observability: checks,
      comparison: {
        currentSource: compareArtifacts.current.source,
        previousSource: compareArtifacts.previous.source,
        currentManifestSchema: currentManifest?.metadata?.dbt_schema_version || 'unknown',
        previousManifestSchema: previousManifest?.metadata?.dbt_schema_version || 'unknown',
        schemaVersionChanged:
          (currentManifest?.metadata?.dbt_schema_version || '') !==
          (previousManifest?.metadata?.dbt_schema_version || ''),
      },
    };

    const currentCatalogNode =
      currentCatalog?.nodes?.[nodeId] || currentCatalog?.sources?.[nodeId] || null;
    const actualRowCount =
      extractNumericStat((currentCatalogNode as any)?.stats?.num_rows) ??
      extractNumericStat((currentCatalogNode as any)?.stats?.row_count);
    if (typeof actualRowCount === 'number') {
      errorMetadata.volumeMetrics = {
        type: 'volume',
        actualRowCount,
      };
    }

    let filtered = errorMetadata.tests;
    if (testTypeFilter) {
      filtered = filtered.filter((t) => t.testType === testTypeFilter);
    }
    if (statusFilter) {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    const response = {
      ...errorMetadata,
      tests: filtered,
      appliedFilters: {
        testType: testTypeFilter || null,
        statusFilter: statusFilter || null,
      },
    };

    cache.set(cacheKey, response, 'hot');
    const computeTimeMs = Date.now() - startTime;

    return NextResponse.json(
      {
        data: response,
        cached: false,
        computeTimeMs,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'X-Cache': 'MISS',
          'X-Compute-Time-Ms': computeTimeMs.toString(),
        },
      }
    );
  } catch (error) {
    const computeTimeMs = Date.now() - startTime;
    console.error('[Errors API] Error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
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
 * POST /api/errors/[id]/acknowledge
 */
export async function POST(request: NextRequest, { params }: ErrorsRequest) {
  try {
    const nodeId = decodeURIComponent(params.id);
    const body = await request.json().catch(() => ({}));
    const { testId, acknowledgedBy, reason } = body;

    console.log(`[Errors API] Test acknowledged: ${testId} for node ${nodeId}`, {
      acknowledgedBy,
      reason,
      timestamp: new Date().toISOString(),
    });

    const cache = getCache();
    const debug = cache.getDebugInfo();
    for (const entry of debug.entries) {
      if (entry.key.startsWith(`errors:${nodeId}:`)) {
        cache.delete(entry.key);
      }
    }

    return NextResponse.json(
      {
        success: true,
        nodeId,
        testId,
        acknowledgedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Errors API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

