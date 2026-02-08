import fs from 'fs';
import path from 'path';
import { Catalog, Manifest } from './manifestLoader';

export interface ComparisonVersionDrift {
  manifestSchemaChanged: boolean;
  catalogSchemaChanged: boolean;
  manifestVersionChanged: boolean;
  catalogVersionChanged: boolean;
}

export interface ComparisonSelection {
  mode: 'default-backup' | 'history-auto' | 'explicit-paths' | 'explicit-labels';
  notes: string[];
  historyDirPath?: string;
  currentManifestPath: string;
  currentCatalogPath: string;
  previousManifestPath?: string;
  previousCatalogPath?: string;
  currentSourcesPath?: string;
  versionDrift: ComparisonVersionDrift;
}

export interface ComparisonArtifacts {
  currentManifest: Manifest;
  currentCatalog: Catalog;
  previousManifest: Manifest | null;
  previousCatalog: Catalog | null;
  selection: ComparisonSelection;
}

type SourceFreshnessRecord = {
  max_loaded_at?: string;
  snapshotted_at?: string;
  status?: string;
};

type SourceFreshnessMap = Record<string, SourceFreshnessRecord>;

const sourceFreshnessCache = new Map<
  string,
  {
    mtimeMs: number;
    data: SourceFreshnessMap;
  }
>();

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveRepoPath(rawPath: string | null | undefined, mustBeJson: boolean = true): string | null {
  if (!rawPath) return null;
  const repoRoot = path.resolve(process.cwd());
  const normalized = path.isAbsolute(rawPath)
    ? path.normalize(rawPath)
    : path.resolve(repoRoot, rawPath);
  const normalizedLower = normalized.toLowerCase();
  const repoLower = repoRoot.toLowerCase();
  if (!normalizedLower.startsWith(repoLower)) {
    return null;
  }
  if (mustBeJson && path.extname(normalized).toLowerCase() !== '.json') {
    return null;
  }
  return normalized;
}

function readJsonFile<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

function maybeSourcesPathFromManifestPath(manifestPath: string): string | undefined {
  const candidate = path.join(path.dirname(manifestPath), 'sources.json');
  return fileExists(candidate) ? candidate : undefined;
}

function getSnapshotArtifactPaths(historyDirPath: string, label: string) {
  const dirPath = path.join(historyDirPath, label);
  const manifestPath = path.join(dirPath, 'manifest.json');
  const catalogPath = path.join(dirPath, 'catalog.json');
  const sourcesPath = path.join(dirPath, 'sources.json');
  if (!fileExists(manifestPath) || !fileExists(catalogPath)) {
    return null;
  }
  return {
    manifestPath,
    catalogPath,
    sourcesPath: fileExists(sourcesPath) ? sourcesPath : undefined,
  };
}

function listSnapshotLabels(historyDirPath: string): string[] {
  if (!fileExists(historyDirPath)) return [];
  return fs
    .readdirSync(historyDirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function selectPreviousFromHistory(
  historyDirPath: string,
  currentManifest: Manifest,
  currentCatalog: Catalog
): { manifestPath: string; catalogPath: string; sourcesPath?: string } | null {
  const labels = listSnapshotLabels(historyDirPath);
  if (!labels.length) return null;

  const currentManifestGeneratedAt = String(currentManifest?.metadata?.generated_at || '');
  const currentCatalogGeneratedAt = String(currentCatalog?.metadata?.generated_at || '');

  for (let i = labels.length - 1; i >= 0; i--) {
    const paths = getSnapshotArtifactPaths(historyDirPath, labels[i]);
    if (!paths) continue;
    try {
      const manifest = readJsonFile<Manifest>(paths.manifestPath);
      const catalog = readJsonFile<Catalog>(paths.catalogPath);
      const manifestGeneratedAt = String(manifest?.metadata?.generated_at || '');
      const catalogGeneratedAt = String(catalog?.metadata?.generated_at || '');
      const differsFromCurrent =
        manifestGeneratedAt !== currentManifestGeneratedAt ||
        catalogGeneratedAt !== currentCatalogGeneratedAt;
      if (differsFromCurrent) {
        return paths;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function getVersionDrift(
  currentManifest: Manifest,
  currentCatalog: Catalog,
  previousManifest: Manifest | null,
  previousCatalog: Catalog | null
): ComparisonVersionDrift {
  return {
    manifestSchemaChanged:
      String(currentManifest?.metadata?.dbt_schema_version || '') !==
      String(previousManifest?.metadata?.dbt_schema_version || ''),
    catalogSchemaChanged:
      String(currentCatalog?.metadata?.dbt_schema_version || '') !==
      String(previousCatalog?.metadata?.dbt_schema_version || ''),
    manifestVersionChanged:
      String(currentManifest?.metadata?.dbt_version || '') !==
      String(previousManifest?.metadata?.dbt_version || ''),
    catalogVersionChanged:
      String(currentCatalog?.metadata?.dbt_version || '') !==
      String(previousCatalog?.metadata?.dbt_version || ''),
  };
}

export function hasExplicitCurrentArtifacts(searchParams: URLSearchParams): boolean {
  return Boolean(
    searchParams.get('currentManifestPath') ||
      searchParams.get('currentCatalogPath') ||
      searchParams.get('currentLabel')
  );
}

export function loadComparisonArtifacts(
  searchParams: URLSearchParams,
  defaults?: { currentManifest?: Manifest; currentCatalog?: Catalog }
): ComparisonArtifacts {
  const repoRoot = path.resolve(process.cwd());
  const notes: string[] = [];
  const explicitCurrentManifestPath = resolveRepoPath(searchParams.get('currentManifestPath'));
  const explicitCurrentCatalogPath = resolveRepoPath(searchParams.get('currentCatalogPath'));
  const explicitPreviousManifestPath = resolveRepoPath(searchParams.get('previousManifestPath'));
  const explicitPreviousCatalogPath = resolveRepoPath(searchParams.get('previousCatalogPath'));
  const currentLabel = searchParams.get('currentLabel');
  const previousLabel = searchParams.get('previousLabel');
  const explicitCurrentSourcesPath = resolveRepoPath(searchParams.get('currentSourcesPath'));
  const explicitHistoryDir = resolveRepoPath(searchParams.get('historyDir'), false);
  const historyDirPath =
    explicitHistoryDir || path.join(repoRoot, 'samples', 'adventureworks-batches');

  let mode: ComparisonSelection['mode'] = 'default-backup';
  let currentManifest: Manifest;
  let currentCatalog: Catalog;
  let previousManifest: Manifest | null = null;
  let previousCatalog: Catalog | null = null;
  let currentManifestPath = path.join(repoRoot, 'manifest.json');
  let currentCatalogPath = path.join(repoRoot, 'catalog.json');
  let previousManifestPath: string | undefined;
  let previousCatalogPath: string | undefined;
  let currentSourcesPath: string | undefined;

  // Resolve current artifacts.
  if (currentLabel) {
    const snapshotPaths = getSnapshotArtifactPaths(historyDirPath, currentLabel);
    if (!snapshotPaths) {
      throw new Error(`Current snapshot label not found or incomplete: ${currentLabel}`);
    }
    currentManifestPath = snapshotPaths.manifestPath;
    currentCatalogPath = snapshotPaths.catalogPath;
    currentSourcesPath = snapshotPaths.sourcesPath;
    currentManifest = readJsonFile<Manifest>(snapshotPaths.manifestPath);
    currentCatalog = readJsonFile<Catalog>(snapshotPaths.catalogPath);
    mode = 'explicit-labels';
  } else if (explicitCurrentManifestPath || explicitCurrentCatalogPath) {
    if (!explicitCurrentManifestPath || !explicitCurrentCatalogPath) {
      throw new Error(
        'When specifying current artifacts, both currentManifestPath and currentCatalogPath are required'
      );
    }
    if (!fileExists(explicitCurrentManifestPath) || !fileExists(explicitCurrentCatalogPath)) {
      throw new Error('Current artifact path(s) do not exist');
    }
    currentManifestPath = explicitCurrentManifestPath;
    currentCatalogPath = explicitCurrentCatalogPath;
    currentSourcesPath = maybeSourcesPathFromManifestPath(currentManifestPath);
    currentManifest = readJsonFile<Manifest>(explicitCurrentManifestPath);
    currentCatalog = readJsonFile<Catalog>(explicitCurrentCatalogPath);
    mode = 'explicit-paths';
  } else {
    if (defaults?.currentManifest && defaults?.currentCatalog) {
      currentManifest = defaults.currentManifest;
      currentCatalog = defaults.currentCatalog;
    } else {
      if (!fileExists(currentManifestPath) || !fileExists(currentCatalogPath)) {
        throw new Error('Default current artifacts (manifest.json/catalog.json) not found');
      }
      currentManifest = readJsonFile<Manifest>(currentManifestPath);
      currentCatalog = readJsonFile<Catalog>(currentCatalogPath);
    }
    currentSourcesPath = maybeSourcesPathFromManifestPath(currentManifestPath);
  }

  if (explicitCurrentSourcesPath) {
    if (!fileExists(explicitCurrentSourcesPath)) {
      throw new Error(`currentSourcesPath does not exist: ${explicitCurrentSourcesPath}`);
    }
    currentSourcesPath = explicitCurrentSourcesPath;
  }

  // Resolve previous artifacts.
  if (previousLabel) {
    const snapshotPaths = getSnapshotArtifactPaths(historyDirPath, previousLabel);
    if (!snapshotPaths) {
      throw new Error(`Previous snapshot label not found or incomplete: ${previousLabel}`);
    }
    previousManifestPath = snapshotPaths.manifestPath;
    previousCatalogPath = snapshotPaths.catalogPath;
    previousManifest = readJsonFile<Manifest>(snapshotPaths.manifestPath);
    previousCatalog = readJsonFile<Catalog>(snapshotPaths.catalogPath);
    mode = currentLabel ? 'explicit-labels' : mode;
  } else if (explicitPreviousManifestPath || explicitPreviousCatalogPath) {
    if (!explicitPreviousManifestPath || !explicitPreviousCatalogPath) {
      throw new Error(
        'When specifying previous artifacts, both previousManifestPath and previousCatalogPath are required'
      );
    }
    if (!fileExists(explicitPreviousManifestPath) || !fileExists(explicitPreviousCatalogPath)) {
      throw new Error('Previous artifact path(s) do not exist');
    }
    previousManifestPath = explicitPreviousManifestPath;
    previousCatalogPath = explicitPreviousCatalogPath;
    previousManifest = readJsonFile<Manifest>(explicitPreviousManifestPath);
    previousCatalog = readJsonFile<Catalog>(explicitPreviousCatalogPath);
    mode = mode === 'default-backup' ? 'explicit-paths' : mode;
  } else {
    const historySelection = selectPreviousFromHistory(historyDirPath, currentManifest, currentCatalog);
    if (historySelection) {
      previousManifestPath = historySelection.manifestPath;
      previousCatalogPath = historySelection.catalogPath;
      previousManifest = readJsonFile<Manifest>(historySelection.manifestPath);
      previousCatalog = readJsonFile<Catalog>(historySelection.catalogPath);
      mode = 'history-auto';
      notes.push('Auto-selected previous artifacts from history directory');
    } else {
      const backupManifestPath = path.join(repoRoot, 'manifest_backup.json');
      const backupCatalogPath = path.join(repoRoot, 'catalog_backup.json');
      if (fileExists(backupManifestPath) && fileExists(backupCatalogPath)) {
        previousManifestPath = backupManifestPath;
        previousCatalogPath = backupCatalogPath;
        previousManifest = readJsonFile<Manifest>(backupManifestPath);
        previousCatalog = readJsonFile<Catalog>(backupCatalogPath);
        mode = 'default-backup';
        notes.push('Using manifest_backup.json/catalog_backup.json for previous comparison');
      } else {
        notes.push('No previous artifacts found; broad checks may return unknown');
      }
    }
  }

  const versionDrift = getVersionDrift(
    currentManifest,
    currentCatalog,
    previousManifest,
    previousCatalog
  );
  if (versionDrift.manifestSchemaChanged || versionDrift.catalogSchemaChanged) {
    notes.push('Artifact schema versions differ; some fields may be mapped with compatibility fallbacks');
  }

  return {
    currentManifest,
    currentCatalog,
    previousManifest,
    previousCatalog,
    selection: {
      mode,
      notes,
      historyDirPath,
      currentManifestPath,
      currentCatalogPath,
      previousManifestPath,
      previousCatalogPath,
      currentSourcesPath,
      versionDrift,
    },
  };
}

export function loadSourceFreshnessMap(sourcesPath?: string): SourceFreshnessMap | null {
  if (!sourcesPath || !fileExists(sourcesPath)) return null;
  const normalized = path.normalize(sourcesPath);
  try {
    const mtimeMs = fs.statSync(normalized).mtimeMs;
    const cached = sourceFreshnessCache.get(normalized);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.data;
    }
    const raw = readJsonFile<any>(normalized);
    const results = Array.isArray(raw?.results) ? raw.results : [];
    const map: SourceFreshnessMap = {};
    for (const result of results) {
      const uniqueId = result?.unique_id;
      if (!uniqueId || typeof uniqueId !== 'string') continue;
      map[uniqueId] = {
        max_loaded_at: typeof result?.max_loaded_at === 'string' ? result.max_loaded_at : undefined,
        snapshotted_at:
          typeof result?.snapshotted_at === 'string' ? result.snapshotted_at : undefined,
        status: typeof result?.status === 'string' ? result.status : undefined,
      };
    }
    sourceFreshnessCache.set(normalized, { mtimeMs, data: map });
    return map;
  } catch {
    return null;
  }
}
