import fs from 'fs';
import path from 'path';
import { Catalog, Manifest } from './manifestLoader';
import { classifyReferenceData } from './referenceData';

export type CheckStatus = 'pass' | 'fail' | 'unknown';

export interface SchemaCheck {
  status: CheckStatus;
  addedColumns: string[];
  removedColumns: string[];
  typeChanges: Array<{ column: string; previous: string; current: string }>;
}

export interface VolumeCheck {
  status: CheckStatus;
  currentRowCount?: number;
  previousRowCount?: number;
  deviationPct?: number;
  thresholdPct: number;
}

export interface FreshnessCheck {
  status: CheckStatus;
  lastUpdated?: string;
  lagMinutes?: number;
  thresholdMinutes: number;
  isReferenceLike: boolean;
  referenceReason?: string;
  source?: string;
}

export interface BroadChecks {
  schema: SchemaCheck;
  volume: VolumeCheck;
  freshness: FreshnessCheck;
  failCount: number;
  styleKey:
    | 'none'
    | 'schema'
    | 'volume'
    | 'freshness'
    | 'schema+volume'
    | 'schema+freshness'
    | 'volume+freshness'
    | 'schema+volume+freshness';
}

interface ArtifactCache<T> {
  mtimeMs: number;
  data: T | null;
}

type SourceFreshnessMap = Record<
  string,
  { max_loaded_at?: string; snapshotted_at?: string; status?: string }
>;

let sourceFreshnessCache: ArtifactCache<SourceFreshnessMap> | undefined;

export interface CompareArtifact {
  manifest: Manifest | null;
  catalog: Catalog | null;
  source: string;
}

export interface CompareArtifacts {
  current: CompareArtifact;
  previous: CompareArtifact;
}

function parseNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || '');
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function extractNumericStat(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return extractNumericStat((value as Record<string, unknown>).value);
  }
  return undefined;
}

export function extractTimestampStat(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return extractTimestampStat((value as Record<string, unknown>).value);
  }
  return undefined;
}

export function extractLegacyCreatedAt(value: unknown): string | undefined {
  const parsed = extractNumericStat(value);
  if (parsed === undefined) return undefined;
  if (parsed > 0 && parsed < 50 * 365 * 24 * 60 * 60) {
    return new Date(Date.now() - parsed * 1000).toISOString();
  }
  return undefined;
}

function getColumnTypeMap(manifestNode: any, catalogNode: any): Record<string, string> {
  const map: Record<string, string> = {};
  const manifestColumns = manifestNode?.columns || {};
  const catalogColumns = catalogNode?.columns || {};

  for (const [columnName, definition] of Object.entries(manifestColumns)) {
    const manifestType = (definition as any)?.data_type;
    const catalogType = (catalogColumns as any)?.[columnName]?.type;
    map[columnName] = String(catalogType || manifestType || '');
  }

  for (const [columnName, definition] of Object.entries(catalogColumns)) {
    if (!map[columnName]) {
      map[columnName] = String((definition as any)?.type || '');
    }
  }

  return map;
}

function buildStyleKey(schema: CheckStatus, volume: CheckStatus, freshness: CheckStatus): BroadChecks['styleKey'] {
  const failed: string[] = [];
  if (schema === 'fail') failed.push('schema');
  if (volume === 'fail') failed.push('volume');
  if (freshness === 'fail') failed.push('freshness');
  if (failed.length === 0) return 'none';
  return failed.join('+') as BroadChecks['styleKey'];
}

function tryReadJson<T = any>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function resolveSnapshotDir(label: string): string {
  return path.join(process.cwd(), 'samples', 'adventureworks-batches', label);
}

function loadSnapshotArtifacts(label: string): CompareArtifact {
  const dir = resolveSnapshotDir(label);
  const manifest = tryReadJson<Manifest>(path.join(dir, 'manifest.json'));
  const catalog = tryReadJson<Catalog>(path.join(dir, 'catalog.json'));
  return {
    manifest,
    catalog,
    source: `snapshot:${label}`,
  };
}

function latestHistoryArtifact(): CompareArtifact {
  const indexPath = path.join(process.cwd(), 'samples', 'adventureworks-batches', 'index.json');
  const index = tryReadJson<any>(indexPath);
  const snapshots = Array.isArray(index?.snapshots) ? index.snapshots : [];
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1]?.label : null;
  if (!latest) {
    return {
      manifest: tryReadJson<Manifest>(path.join(process.cwd(), 'manifest_backup.json')),
      catalog: tryReadJson<Catalog>(path.join(process.cwd(), 'catalog_backup.json')),
      source: 'backup',
    };
  }
  return loadSnapshotArtifacts(String(latest));
}

function loadSourceFreshness(): SourceFreshnessMap | null {
  const artifactPath = path.join(process.cwd(), 'sources.json');
  try {
    if (!fs.existsSync(artifactPath)) {
      sourceFreshnessCache = { mtimeMs: -1, data: null };
      return null;
    }

    const mtimeMs = fs.statSync(artifactPath).mtimeMs;
    if (sourceFreshnessCache && sourceFreshnessCache.mtimeMs === mtimeMs) {
      return sourceFreshnessCache.data;
    }

    const sourcesArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    const results = Array.isArray(sourcesArtifact?.results) ? sourcesArtifact.results : [];
    const map: SourceFreshnessMap = {};

    for (const result of results) {
      const uniqueId = result?.unique_id;
      if (!uniqueId || typeof uniqueId !== 'string') continue;
      map[uniqueId] = {
        max_loaded_at: typeof result?.max_loaded_at === 'string' ? result.max_loaded_at : undefined,
        snapshotted_at: typeof result?.snapshotted_at === 'string' ? result.snapshotted_at : undefined,
        status: typeof result?.status === 'string' ? result.status : undefined,
      };
    }

    sourceFreshnessCache = { mtimeMs, data: map };
    return map;
  } catch {
    sourceFreshnessCache = undefined;
    return null;
  }
}

export function resolveCompareArtifacts(
  currentManifest: Manifest,
  currentCatalog: Catalog | null | undefined,
  options: {
    currentSnapshot?: string | null;
    previousSnapshot?: string | null;
    previousManifestPath?: string | null;
    previousCatalogPath?: string | null;
  } = {}
): CompareArtifacts {
  const currentSnapshot = options.currentSnapshot?.trim();
  const previousSnapshot = options.previousSnapshot?.trim();
  const previousManifestPath = options.previousManifestPath?.trim();
  const previousCatalogPath = options.previousCatalogPath?.trim();

  const current = currentSnapshot
    ? loadSnapshotArtifacts(currentSnapshot)
    : { manifest: currentManifest, catalog: currentCatalog || null, source: 'current' };

  if (previousSnapshot) {
    return {
      current,
      previous: loadSnapshotArtifacts(previousSnapshot),
    };
  }

  if (previousManifestPath || previousCatalogPath) {
    return {
      current,
      previous: {
        manifest: previousManifestPath ? tryReadJson<Manifest>(path.resolve(process.cwd(), previousManifestPath)) : null,
        catalog: previousCatalogPath ? tryReadJson<Catalog>(path.resolve(process.cwd(), previousCatalogPath)) : null,
        source: 'explicit-path',
      },
    };
  }

  const backupManifest = tryReadJson<Manifest>(path.join(process.cwd(), 'manifest_backup.json'));
  const backupCatalog = tryReadJson<Catalog>(path.join(process.cwd(), 'catalog_backup.json'));
  if (backupManifest || backupCatalog) {
    return {
      current,
      previous: {
        manifest: backupManifest,
        catalog: backupCatalog,
        source: 'backup',
      },
    };
  }

  return {
    current,
    previous: latestHistoryArtifact(),
  };
}

export function computeBroadChecks(nodeId: string, artifacts: CompareArtifacts): BroadChecks {
  const currentManifest = artifacts.current.manifest;
  const currentCatalog = artifacts.current.catalog;
  const previousManifest = artifacts.previous.manifest;
  const previousCatalog = artifacts.previous.catalog;

  const currentNode = currentManifest?.nodes?.[nodeId] || currentManifest?.sources?.[nodeId] || null;
  const previousNode = previousManifest?.nodes?.[nodeId] || previousManifest?.sources?.[nodeId] || null;
  const currentCatalogNode = currentCatalog?.nodes?.[nodeId] || currentCatalog?.sources?.[nodeId] || null;
  const previousCatalogNode = previousCatalog?.nodes?.[nodeId] || previousCatalog?.sources?.[nodeId] || null;

  const currentColumnTypes = getColumnTypeMap(currentNode, currentCatalogNode);
  const previousColumnTypes = getColumnTypeMap(previousNode, previousCatalogNode);
  const currentColumns = Object.keys(currentColumnTypes);
  const previousColumns = Object.keys(previousColumnTypes);
  const addedColumns = currentColumns.filter((c) => !previousColumns.includes(c));
  const removedColumns = previousColumns.filter((c) => !currentColumns.includes(c));
  const typeChanges = currentColumns
    .filter((c) => previousColumnTypes[c] && previousColumnTypes[c] !== currentColumnTypes[c])
    .map((c) => ({
      column: c,
      previous: previousColumnTypes[c],
      current: currentColumnTypes[c],
    }));
  const schemaStatus: CheckStatus =
    previousColumns.length === 0
      ? 'unknown'
      : addedColumns.length > 0 || removedColumns.length > 0 || typeChanges.length > 0
        ? 'fail'
        : 'pass';

  const currentRowCount =
    extractNumericStat((currentCatalogNode as any)?.stats?.num_rows) ??
    extractNumericStat((currentCatalogNode as any)?.stats?.row_count);
  const previousRowCount =
    extractNumericStat((previousCatalogNode as any)?.stats?.num_rows) ??
    extractNumericStat((previousCatalogNode as any)?.stats?.row_count);
  const volumeThresholdPct = parseNumberEnv('OBS_VOLUME_THRESHOLD_PCT', 25);
  const deviationPct =
    typeof currentRowCount === 'number' &&
    typeof previousRowCount === 'number' &&
    previousRowCount > 0
      ? ((currentRowCount - previousRowCount) / previousRowCount) * 100
      : undefined;
  const volumeStatus: CheckStatus =
    deviationPct === undefined
      ? 'unknown'
      : Math.abs(deviationPct) > volumeThresholdPct
        ? 'fail'
        : 'pass';

  const sourceFreshness = loadSourceFreshness()?.[nodeId];
  const meta = currentNode?.meta || {};
  let freshnessSource = 'unknown';
  const referenceClassification = classifyReferenceData(currentNode || {});
  const lastUpdated =
    (() => {
      const fromSourcesArtifact =
        extractTimestampStat(sourceFreshness?.max_loaded_at) ??
        extractTimestampStat(sourceFreshness?.snapshotted_at);
      if (fromSourcesArtifact) {
        freshnessSource = 'sources.json';
        return fromSourcesArtifact;
      }

      const fromCatalog =
        extractTimestampStat((currentCatalogNode as any)?.stats?.max_loaded_at) ??
        extractTimestampStat((currentCatalogNode as any)?.stats?.last_modified) ??
        extractTimestampStat((currentCatalogNode as any)?.stats?.updated_at) ??
        extractTimestampStat((currentCatalogNode as any)?.metadata?.updated_at);
      if (fromCatalog) {
        freshnessSource = 'catalog.stats';
        return fromCatalog;
      }

      const fromMeta =
        extractTimestampStat(meta.last_updated_at) ??
        extractTimestampStat(meta.max_loaded_at) ??
        extractTimestampStat(meta.modified_at) ??
        extractTimestampStat(meta.updated_at);
      if (fromMeta) {
        freshnessSource = 'manifest.meta';
        return fromMeta;
      }

      const fromLegacyCreatedAt = extractLegacyCreatedAt(currentNode?.created_at);
      if (fromLegacyCreatedAt) {
        freshnessSource = 'manifest.created_at_legacy';
        return fromLegacyCreatedAt;
      }

      return undefined;
    })();
  const isReferenceLike = referenceClassification.isReferenceData;
  const freshnessThresholdMinutes = isReferenceLike
    ? parseNumberEnv('OBS_REFERENCE_FRESHNESS_THRESHOLD_MINUTES', 7 * 24 * 60)
    : parseNumberEnv('OBS_FRESHNESS_THRESHOLD_MINUTES', 180);
  const parsedLastUpdated = lastUpdated ? Date.parse(lastUpdated) : NaN;
  const lagMinutes = Number.isFinite(parsedLastUpdated)
    ? Math.max(0, Math.round((Date.now() - parsedLastUpdated) / 60000))
    : undefined;
  const freshnessStatus: CheckStatus =
    lagMinutes === undefined
      ? 'unknown'
      : lagMinutes > freshnessThresholdMinutes
        ? 'fail'
        : 'pass';

  const styleKey = buildStyleKey(schemaStatus, volumeStatus, freshnessStatus);
  const failCount = [schemaStatus, volumeStatus, freshnessStatus].filter((s) => s === 'fail').length;

  return {
    schema: {
      status: schemaStatus,
      addedColumns,
      removedColumns,
      typeChanges,
    },
    volume: {
      status: volumeStatus,
      currentRowCount: currentRowCount ?? undefined,
      previousRowCount: previousRowCount ?? undefined,
      deviationPct,
      thresholdPct: volumeThresholdPct,
    },
    freshness: {
      status: freshnessStatus,
      lastUpdated,
      lagMinutes,
      thresholdMinutes: freshnessThresholdMinutes,
      isReferenceLike,
      referenceReason: referenceClassification.reason,
      source: freshnessSource,
    },
    failCount,
    styleKey,
  };
}
