#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const CATALOG_PATH = path.join(ROOT, 'catalog.json');
const OUT_DIR = path.join(ROOT, 'public', 'dag');

const MAX_NODES = parseInt(process.env.MAX_NODES || process.env.REACT_APP_MAX_NODES || '400', 10);
const MAX_EDGES = parseInt(process.env.MAX_EDGES || process.env.REACT_APP_MAX_EDGES || '800', 10);

function safeFilename(id) {
  return encodeURIComponent(id) + '.json';
}

function shortId(rawId) {
  const pieces = rawId.split('.');
  if (pieces.length >= 2) {
    return `${pieces[pieces.length - 2]}.${pieces[pieces.length - 1]}`;
  }
  return rawId;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function buildAdjacencies(manifest) {
  const nodes = manifest.nodes || {};
  const out = {}; // parent -> children
  const inAdj = {}; // child -> parents

  Object.keys(nodes).forEach((id) => {
    const deps = (nodes[id].depends_on && nodes[id].depends_on.nodes) || [];
    deps.forEach((parent) => {
      out[parent] = out[parent] || new Set();
      out[parent].add(id);
      inAdj[id] = inAdj[id] || new Set();
      inAdj[id].add(parent);
    });
  });

  // convert sets to arrays
  const outA = {};
  const inA = {};
  Object.keys(out).forEach((k) => (outA[k] = Array.from(out[k])));
  Object.keys(inAdj).forEach((k) => (inA[k] = Array.from(inAdj[k])));
  return { out: outA, in: inA };
}

function transitiveClosure(id, adjOut, adjIn) {
  // gather ancestors (upstream)
  const visited = new Set();

  // upward (parents)
  const upQueue = [id];
  visited.add(id);
  while (upQueue.length) {
    const cur = upQueue.shift();
    const parents = adjIn[cur] || [];
    parents.forEach((p) => {
      if (!visited.has(p)) {
        visited.add(p);
        upQueue.push(p);
      }
    });
  }

  // downward (children)
  const downQueue = [id];
  while (downQueue.length) {
    const cur = downQueue.shift();
    const children = adjOut[cur] || [];
    children.forEach((c) => {
      if (!visited.has(c)) {
        visited.add(c);
        downQueue.push(c);
      }
    });
  }

  return Array.from(visited);
}

function buildGraphForNode(id, manifest, catalog, adj) {
  const nodesObj = manifest.nodes || {};
  const catalogNodes = (catalog && catalog.nodes) || {};

  const closure = transitiveClosure(id, adj.out, adj.in);

  const nodes = [];
  const nodeIdSet = new Set();
  closure.slice(0, MAX_NODES).forEach((nid) => {
    const m = nodesObj[nid] || {};
    const c = catalogNodes[nid] || {};
    const label = m.alias || m.name || shortId(nid);
    nodes.push({
      id: nid,
      label,
      title: m.description || (c && c.metadata && c.metadata.description) || label,
      resource_type: m.resource_type || null,
      package_name: m.package_name || null,
      metadata: Object.assign({}, m, c),
    });
    nodeIdSet.add(nid);
  });

  const edges = [];
  // build edges from manifest: parent -> child
  Object.keys(nodesObj).forEach((nid) => {
    const deps = (nodesObj[nid].depends_on && nodesObj[nid].depends_on.nodes) || [];
    deps.forEach((parent) => {
      if (nodeIdSet.has(parent) && nodeIdSet.has(nid)) {
        if (edges.length < MAX_EDGES) {
          edges.push({ from: parent, to: nid, arrows: 'to' });
        }
      }
    });
  });

  const truncated = closure.length > nodes.length || edges.length > MAX_EDGES;

  return { nodes, edges, source: 'manifest', truncated };
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  if (!manifest) {
    console.error('manifest.json not found or invalid at', MANIFEST_PATH);
    process.exit(1);
  }
  const catalog = readJson(CATALOG_PATH) || {};
  ensureOutDir();
  const adj = buildAdjacencies(manifest);

  const nodeIds = Object.keys(manifest.nodes || {});

  console.log(`Generating per-node DAG JSON for ${nodeIds.length} nodes (limits: ${MAX_NODES} nodes, ${MAX_EDGES} edges)`);

  nodeIds.forEach((id) => {
    try {
      const graph = buildGraphForNode(id, manifest, catalog, adj);
      const outPath = path.join(OUT_DIR, safeFilename(id));
      fs.writeFileSync(outPath, JSON.stringify(Object.assign({ generated_at: new Date().toISOString() }, graph), null, 2));
    } catch (e) {
      console.error('failed to build graph for', id, e && e.message);
    }
  });

  console.log('Done. DAG files written to', OUT_DIR);
}

if (require.main === module) main();
