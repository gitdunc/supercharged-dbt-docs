/**
 * Manifest and Catalog Loader
 * Loads dbt manifest.json and catalog.json at server startup
 * Provides singleton access to these artifacts for runtime DAG computation
 */

import fs from 'fs';
import path from 'path';

interface ManifestNode {
  unique_id: string;
  name: string;
  resource_type: 'model' | 'seed' | 'test' | 'source' | 'macro' | string;
  depends_on: {
    nodes: string[];
    macros: string[];
  };
  database: string;
  schema: string;
  fqn: string[];
  description: string;
  columns: Record<string, { description: string; data_type?: string }>;
  meta?: Record<string, unknown>;
  tags?: string[];
  config?: {
    materialized?: string;
    [key: string]: unknown;
  };
  refs?: string[][];
  test_metadata?: {
    name: string;
    kwargs: Record<string, unknown>;
    namespace: string | null;
  };
  [key: string]: unknown;
}

interface ManifestMetadata {
  dbt_schema_version: string;
  dbt_version: string;
  generated_at: string;
  [key: string]: unknown;
}

interface Manifest {
  metadata: ManifestMetadata;
  nodes: Record<string, ManifestNode>;
  sources?: Record<string, ManifestNode>;
  macros?: Record<string, ManifestNode>;
  _allNodes?: Record<string, ManifestNode>; // Cached merged node index
  _childIndex?: Record<string, string[]>; // Inverse dependency index: nodeId -> [child nodeIds]
  [key: string]: unknown;
}

interface CatalogNode {
  metadata: {
    type: string;
    schema: string;
    name: string;
    database: string;
    [key: string]: unknown;
  };
  columns: Record<
    string,
    {
      type: string;
      index: string;
      name: string;
      comment?: string;
      [key: string]: unknown;
    }
  >;
  stats?: Record<string, unknown>;
  unique_id: string;
}

interface CatalogMetadata {
  dbt_schema_version: string;
  dbt_version: string;
  generated_at: string;
  [key: string]: unknown;
}

interface Catalog {
  metadata: CatalogMetadata;
  nodes: Record<string, CatalogNode>;
  sources?: Record<string, CatalogNode>;
  [key: string]: unknown;
}

let cachedManifest: Manifest | null = null;
let cachedCatalog: Catalog | null = null;
let loadError: Error | null = null;

/**
 * Build child index (inverse dependency mapping)
 * For each node, track which nodes depend on it (its children)
 * This enables O(1) downstream traversal instead of O(n) iteration
 */
function buildChildIndex(manifest: Manifest): void {
  const allNodes =
    manifest._allNodes ||
    {
      ...(manifest.nodes || {}),
      ...(manifest.sources || {}),
      ...(manifest.macros || {}),
    };
  manifest._allNodes = allNodes;
  
  if (!allNodes || Object.keys(allNodes).length === 0) return;
  
  // Initialize child index
  const childIndex: Record<string, string[]> = {};
  
  // For each node, add it to its parents' child lists
  for (const [nodeId, node] of Object.entries(allNodes)) {
    const dependencies = [
      ...(node.depends_on?.nodes || []),
      ...(node.depends_on?.macros || []),
    ];
    for (const parentId of dependencies) {
      if (!childIndex[parentId]) {
        childIndex[parentId] = [];
      }
      childIndex[parentId].push(nodeId);
    }
  }
  
  manifest._childIndex = childIndex;
  console.log(`[ManifestLoader] Built child index with ${Object.keys(childIndex).length} parent nodes`);
}

/**
 * Load manifest.json from disk
 * Cached in memory after first load
 */
export function loadManifest(): Manifest {
  if (cachedManifest) return cachedManifest;

  try {
    const manifestPath = path.join(process.cwd(), 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    cachedManifest = JSON.parse(manifestContent);
    
    // Build child index for O(1) downstream traversal
    buildChildIndex(cachedManifest!);
    
    loadError = null;
    console.log(
      `[ManifestLoader] Loaded manifest with ${Object.keys(cachedManifest!.nodes || {}).length} nodes, ` +
      `${Object.keys(cachedManifest!.sources || {}).length} sources, ` +
      `${Object.keys(cachedManifest!.macros || {}).length} macros`
    );
    return cachedManifest!;
  } catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error));
    console.error('[ManifestLoader] Failed to load manifest.json:', loadError.message);
    throw loadError;
  }
}

/**
 * Load catalog.json from disk
 * Cached in memory after first load
 */
export function loadCatalog(): Catalog {
  if (cachedCatalog) return cachedCatalog;

  try {
    const catalogPath = path.join(process.cwd(), 'catalog.json');
    const catalogContent = fs.readFileSync(catalogPath, 'utf-8');
    cachedCatalog = JSON.parse(catalogContent);
    loadError = null;
    console.log(
      `[ManifestLoader] Loaded catalog with ${Object.keys(cachedCatalog!.nodes || {}).length} nodes`
    );
    return cachedCatalog!;
  } catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error));
    console.error('[ManifestLoader] Failed to load catalog.json:', loadError.message);
    throw loadError;
  }
}

/**
 * Get both manifest and catalog
 * Lazy loads on first access
 */
export function getArtifacts() {
  return {
    manifest: loadManifest(),
    catalog: loadCatalog(),
  };
}

/**
 * Clear cached artifacts (useful for testing or manual refresh)
 */
export function clearCache() {
  cachedManifest = null;
  cachedCatalog = null;
  loadError = null;
  console.log('[ManifestLoader] Cache cleared');
}

/**
 * Check if artifacts are loaded
 */
export function isLoaded(): boolean {
  return Boolean(cachedManifest && cachedCatalog);
}

/**
 * Get last load error
 */
export function getLoadError(): Error | null {
  return loadError;
}

export type { Manifest, Catalog, ManifestNode, CatalogNode };
