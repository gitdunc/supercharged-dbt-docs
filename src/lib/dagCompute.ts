/**
 * DAG Computation Engine
 * 
 * Computes directed acyclic graphs (parent-child relationships) at runtime
 * by traversing the dbt manifest dependency graph.
 * 
 * Replaces static pre-computed DAGs with dynamic, on-demand computation.
 * Supports both forward lineage (downstream dependencies) and reverse lineage (upstream dependencies).
 */

import { Catalog, CatalogNode, Manifest, ManifestNode } from './manifestLoader';
import { classifyReferenceData } from './referenceData';
import { BroadChecks } from './observability';

export interface DAGNode {
  unique_id: string;
  name: string;
  resource_type: string;
  description: string;
  schema: string;
  database: string;
  tags: string[];
  columns: string[];
  columnTypes: Record<string, string>;
  rowCount: number | null;
  lastUpdated: string | null;
  isReferenceData: boolean;
  referenceReason: string | null;
  observability?: BroadChecks;
  dependsOn: string[]; // Direct parents
  dependedOnBy: string[]; // Direct children
}

export interface DAG {
  root: DAGNode;
  parents: DAGNode[]; // All upstream dependencies (transitive closure)
  children: DAGNode[]; // All downstream dependencies (transitive closure)
  parentMap: Record<string, number>; // unique_id -> depth in lineage
  childMap: Record<string, number>; // unique_id -> depth in lineage
  depth: {
    upstream: number;
    downstream: number;
  };
}

interface TraversalContext {
  visited: Set<string>;
  nodes: Map<string, ManifestNode>;
  depth: number;
}

interface CatalogWithIndex extends Catalog {
  _allCatalogNodes?: Record<string, CatalogNode>;
}

function getAllNodes(manifest: Manifest): Record<string, ManifestNode> {
  if (manifest._allNodes) return manifest._allNodes;
  manifest._allNodes = {
    ...(manifest.nodes || {}),
    ...(manifest.sources || {}),
    ...(manifest.macros || {}),
  };
  return manifest._allNodes;
}

function getAllCatalogNodes(catalog?: Catalog): Record<string, CatalogNode> {
  if (!catalog) return {};
  const catalogWithIndex = catalog as CatalogWithIndex;
  if (catalogWithIndex._allCatalogNodes) return catalogWithIndex._allCatalogNodes;
  catalogWithIndex._allCatalogNodes = {
    ...(catalog.nodes || {}),
    ...(catalog.sources || {}),
  } as Record<string, CatalogNode>;
  return catalogWithIndex._allCatalogNodes;
}

/**
 * Build a DAG for a specific node by traversing the manifest
 */
export function computeDAG(
  manifest: Manifest,
  nodeId: string,
  maxDepth: number = 50,
  catalog?: Catalog
): DAG {
  const allNodes = getAllNodes(manifest);
  const allCatalog = getAllCatalogNodes(catalog);

  if (!allNodes[nodeId]) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const rootNode = allNodes[nodeId];
  const parentMap: Record<string, number> = {};
  const childMap: Record<string, number> = {};
  const childIndex = manifest._childIndex || {};

  // Traverse upstream (dependencies)
  const upstreamVisited = new Set<string>();
  traverseUpstream(nodeId, allNodes, parentMap, upstreamVisited, 0, maxDepth);

  // Traverse downstream (dependents) with child index for performance
  const downstreamVisited = new Set<string>();
  traverseDownstream(nodeId, allNodes, childMap, downstreamVisited, 0, maxDepth, childIndex);

  // Convert maps to node arrays
  const parentsArray = Object.keys(parentMap)
    .map((id) => convertNodeToDAGNode(allNodes[id], allCatalog[id], childIndex))
    .filter(Boolean) as DAGNode[];

  const childrenArray = Object.keys(childMap)
    .map((id) => convertNodeToDAGNode(allNodes[id], allCatalog[id], childIndex))
    .filter(Boolean) as DAGNode[];

  const upstreamDepth = Math.max(...Object.values(parentMap), 0);
  const downstreamDepth = Math.max(...Object.values(childMap), 0);

  return {
    root: convertNodeToDAGNode(rootNode, allCatalog[nodeId], childIndex)!,
    parents: parentsArray,
    children: childrenArray,
    parentMap,
    childMap,
    depth: {
      upstream: upstreamDepth,
      downstream: downstreamDepth,
    },
  };
}

/**
 * Traverse upstream (dependencies) using depth-first search
 */
function traverseUpstream(
  nodeId: string,
  nodes: Record<string, ManifestNode>,
  parentMap: Record<string, number>,
  visited: Set<string>,
  currentDepth: number,
  maxDepth: number
): void {
  if (visited.has(nodeId) || currentDepth > maxDepth) {
    return;
  }

  visited.add(nodeId);

  const node = nodes[nodeId];
  if (!node) return;

  // Get direct dependencies
  const dependencies = [
    ...(node.depends_on?.nodes || []),
    ...(node.depends_on?.macros || []),
  ];

  for (const depId of dependencies) {
    if (!visited.has(depId)) {
      const depDepth = currentDepth + 1;
      
      // Only update if we found a shallower path or this is the first time
      if (!parentMap[depId] || parentMap[depId] > depDepth) {
        parentMap[depId] = depDepth;
      }

      traverseUpstream(depId, nodes, parentMap, visited, depDepth, maxDepth);
    }
  }
}

/**
 * Traverse downstream (dependents) using depth-first search
 * Uses child index for O(1) lookup instead of O(n) iteration
 */
function traverseDownstream(
  nodeId: string,
  nodes: Record<string, ManifestNode>,
  childMap: Record<string, number>,
  visited: Set<string>,
  currentDepth: number,
  maxDepth: number,
  childIndex?: Record<string, string[]>
): void {
  if (visited.has(nodeId) || currentDepth > maxDepth) {
    return;
  }

  visited.add(nodeId);

  // Find all nodes that depend on this one using child index (O(1) instead of O(n))
  const dependents = childIndex?.[nodeId] || [];

  for (const depId of dependents) {
    if (!visited.has(depId)) {
      const depDepth = currentDepth + 1;
      
      // Only update if we found a shallower path or this is the first time
      if (!childMap[depId] || childMap[depId] > depDepth) {
        childMap[depId] = depDepth;
      }

      traverseDownstream(depId, nodes, childMap, visited, depDepth, maxDepth, childIndex);
    }
  }
}

/**
 * Convert a ManifestNode to DAGNode
 */
function convertNodeToDAGNode(
  node: ManifestNode | undefined,
  catalogNode?: CatalogNode,
  childIndex?: Record<string, string[]>
): DAGNode | null {
  if (!node) return null;

  const directDependencies = [
    ...(node.depends_on?.nodes || []),
    ...(node.depends_on?.macros || []),
  ];
  const manifestColumns = node.columns || {};
  const catalogColumns = catalogNode?.columns || {};
  const columnTypes = Object.entries({ ...manifestColumns, ...catalogColumns }).reduce(
    (acc, [columnName]) => {
      const catalogType = (catalogColumns as any)?.[columnName]?.type;
      const manifestType = (manifestColumns as any)?.[columnName]?.data_type;
      acc[columnName] = String(catalogType || manifestType || '');
      return acc;
    },
    {} as Record<string, string>
  );
  const columnNames = Array.from(
    new Set([...Object.keys(manifestColumns), ...Object.keys(catalogColumns)])
  );
  const rowCount =
    extractNumericStat((catalogNode?.stats as any)?.num_rows) ??
    extractNumericStat((catalogNode?.stats as any)?.row_count) ??
    null;
  const meta = (node as any)?.meta || {};
  const lastUpdated =
    extractTimestampStat((catalogNode?.stats as any)?.max_loaded_at) ??
    extractTimestampStat((catalogNode?.stats as any)?.last_modified) ??
    extractTimestampStat((catalogNode?.stats as any)?.updated_at) ??
    extractTimestampStat(meta.last_updated_at) ??
    extractTimestampStat(meta.max_loaded_at) ??
    extractTimestampStat(meta.modified_at) ??
    extractTimestampStat(meta.updated_at) ??
    extractLegacyCreatedAt((node as any)?.created_at) ??
    null;
  const referenceClassification = classifyReferenceData({
    unique_id: node.unique_id,
    name: node.name,
    resource_type: node.resource_type,
    tags: node.tags || [],
    meta,
    config: node.config,
    columns: columnNames,
  });
  const directDependents = childIndex?.[node.unique_id] || [];
  
  return {
    unique_id: node.unique_id,
    name: node.name,
    resource_type: node.resource_type,
    description: node.description || '',
    schema: node.schema || '',
    database: node.database || '',
    tags: node.tags || [],
    columns: columnNames,
    columnTypes,
    rowCount,
    lastUpdated,
    isReferenceData: referenceClassification.isReferenceData,
    referenceReason: referenceClassification.reason || null,
    dependsOn: directDependencies,
    dependedOnBy: directDependents,
  };
}

function extractNumericStat(value: unknown): number | undefined {
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

function extractTimestampStat(value: unknown): string | undefined {
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

/**
 * Legacy SQL generator compatibility:
 * some manifests populate `created_at` with "seconds ago" instead of ISO timestamp.
 */
function extractLegacyCreatedAt(value: unknown): string | undefined {
  const parsed = extractNumericStat(value);
  if (parsed === undefined) return undefined;

  // Guardrail: if value is very large it's likely epoch-like and not "seconds ago".
  if (parsed > 0 && parsed < 50 * 365 * 24 * 60 * 60) {
    return new Date(Date.now() - parsed * 1000).toISOString();
  }

  return undefined;
}

/**
 * Get flat list of all ancestors (upstream transitive closure)
 */
export function getAncestors(
  manifest: Manifest,
  nodeId: string,
  maxDepth: number = 50
): ManifestNode[] {
  const allNodes = getAllNodes(manifest);
  const ancestors = new Set<string>();
  const visited = new Set<string>();

  function collect(id: string, depth: number) {
    if (visited.has(id) || depth > maxDepth) return;
    visited.add(id);

    const node = allNodes[id];
    if (!node) return;

    const deps = [...(node.depends_on?.nodes || []), ...(node.depends_on?.macros || [])];
    for (const depId of deps) {
      ancestors.add(depId);
      collect(depId, depth + 1);
    }
  }

  collect(nodeId, 0);

  return Array.from(ancestors)
    .map((id) => allNodes[id])
    .filter(Boolean);
}

/**
 * Get flat list of all descendants (downstream transitive closure)
 */
export function getDescendants(
  manifest: Manifest,
  nodeId: string,
  maxDepth: number = 50
): ManifestNode[] {
  const allNodes = getAllNodes(manifest);
  const descendants = new Set<string>();
  const visited = new Set<string>();
  const childIndex = manifest._childIndex || {};

  function collect(id: string, depth: number) {
    if (visited.has(id) || depth > maxDepth) return;
    visited.add(id);

    // Use child index for O(1) lookup instead of O(n) iteration
    const children = childIndex[id] || [];
    for (const childId of children) {
      descendants.add(childId);
      collect(childId, depth + 1);
    }
  }

  collect(nodeId, 0);

  return Array.from(descendants)
    .map((id) => allNodes[id])
    .filter(Boolean);
}

/**
 * Get impact of a data change
 * Shows all downstream models that would be affected
 */
export function getImpactAnalysis(manifest: Manifest, nodeId: string) {
  const descendants = getDescendants(manifest, nodeId, 50);
  
  const byType: Record<string, string[]> = {
    model: [],
    seed: [],
    test: [],
    snapshot: [],
    source: [],
    macro: [],
    other: [],
  };

  for (const node of descendants) {
    const type = ['model', 'seed', 'test', 'snapshot', 'source', 'macro'].includes(node.resource_type)
      ? node.resource_type
      : 'other';
    byType[type].push(node.unique_id);
  }

  return {
    nodeId,
    totalDownstream: descendants.length,
    byType,
    descendants: descendants.map((n) => ({
      unique_id: n.unique_id,
      name: n.name,
      resource_type: n.resource_type,
    })),
  };
}

/**
 * Validate manifest structure for DAG computation
 */
export function validateManifest(manifest: Manifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const allNodes = getAllNodes(manifest);

  if (!manifest.metadata) {
    errors.push('Missing metadata section');
  }

  if (!allNodes || Object.keys(allNodes).length === 0) {
    errors.push('No nodes or sources found in manifest');
  }

  // Check for circular dependencies (simple check)
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    recursionStack.add(nodeId);
    const node = allNodes[nodeId];
    
    const dependencies = [
      ...(node?.depends_on?.nodes || []),
      ...(node?.depends_on?.macros || []),
    ];
    if (dependencies.length > 0) {
      for (const depId of dependencies) {
        if (hasCycle(depId)) return true;
      }
    }

    recursionStack.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(allNodes)) {
    if (hasCycle(nodeId)) {
      errors.push(`Circular dependency detected at node: ${nodeId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
