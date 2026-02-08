# Data Lineage & DAG Configuration

This directory contains scripts for generating and managing data lineage (DAG) visualizations in Supercharged dbt-docs.

## Overview

The DAG system generates per-node JSON files that represent upstream and downstream dependencies for each model and source in your dbt project. This approach:

- ✅ Avoids shipping the full manifest to the browser
- ✅ Allows independent metadata enrichment and filtering
- ✅ Supports persona-based views (Prod, BA, Full)
- ✅ Scales to large projects through configurable truncation limits

## Scripts

### `generate-dags.js`

Generates per-node DAG JSON files from `manifest.json` and `catalog.json`.

**Usage:**
```bash
# Generate with defaults (MAX_NODES=400, MAX_EDGES=800)
node scripts/generate-dags.js

# Generate with custom limits
MAX_NODES=1000 MAX_EDGES=2000 node scripts/generate-dags.js

# Or via npm script
npm run generate-dags
```

**Output:**
- JSON files written to `public/dag/<encoded-unique-id>.json`
- Each file contains:
  - `nodes`: array of model/source nodes with metadata
  - `edges`: lineage dependencies
  - `source`: always "manifest"
  - `truncated`: boolean flag if limits were hit
  - `generated_at`: ISO timestamp

**Configuration:**

Environment variables (or edit the script defaults at the top):

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_NODES` | 400 | Max nodes per DAG (truncates transitive closure) |
| `MAX_EDGES` | 800 | Max edges per DAG |
| `REACT_APP_MAX_NODES` | 400 | Alt env var name (used in build process) |
| `REACT_APP_MAX_EDGES` | 800 | Alt env var name (used in build process) |

### `validate-dags.js`

Validates generated DAG JSON files for correctness and consistency.

**Usage:**
```bash
# Validate all generated files
node scripts/validate-dags.js

# Validate first 10 files only
node scripts/validate-dags.js 10
```

**Output:**
- Progress dots (`.` = valid, `X` = invalid)
- Summary of valid files, total nodes, total edges
- List of common errors if any

## Integration: Build Process

The `postbuild` hook in `package.json` automatically runs the generator after building:

```bash
npm run build
# → runs `next build` then `postbuild: node scripts/generate-dags.js`
```

## Tuning Performance

### For Large Projects (10k+ nodes, 50k+ edges)

1. **Reduce MAX_NODES and MAX_EDGES:**
   ```bash
   MAX_NODES=200 MAX_EDGES=400 npm run generate-dags
   ```

2. **Monitor build time and file size:**
   - Build time scales ~O(N) where N = number of nodes
   - File size per DAG: typically 10-50 KB (varies with metadata)
   - Total disk footprint: `num_nodes * avg_file_size`

3. **Profile in browser:**
   - Open DevTools → Perf → Record DAG render
   - Look for long tasks in `react-graph-vis`
   - If > 3s, reduce node count further

### For Small/Medium Projects (< 1000 nodes)

- Increase limits for better visibility:
  ```bash
  MAX_NODES=600 MAX_EDGES=1200 npm run generate-dags
  ```

## Data Governance & Observability

The DAG viewer supports three personas, each showing different metadata:

### **Prod (Operational)**
- Resource type, materialization, freshness
- Test count, package, owner
- Target: SRE/support engineers monitoring data quality

### **BA (Business)**
- Display name, description, business tags
- Owner, type
- Target: Business analysts, data consumers

### **Full**
- All available metadata from manifest + catalog
- Unique ID, columns, config, tests, etc.
- Target: Data engineers, documentation review

Users switch personas via dropdown in the DAG viewer.

## Extending Node Metadata

To add custom metadata to DAG nodes:

1. **Edit `scripts/generate-dags.js`**, function `buildGraphForNode()`:
   ```javascript
   nodes.push({
     id: nid,
     label,
     title,
     resource_type,
     package_name,
     metadata: Object.assign({}, m, c, {
       // Add custom fields here
       custom_field: extractCustom(m),
     }),
   });
   ```

2. **Update persona views in `src/components/DagViewer.tsx`**, function `getNodeMetadata()`:
   ```typescript
   if (persona === 'prod') {
     return {
       title: 'Operational Metadata',
       fields: [
         // ... existing ...
         { label: 'Custom Field', value: node.metadata.custom_field },
       ]
     };
   }
   ```

3. **Rebuild and validate:**
   ```bash
   npm run generate-dags
   node scripts/validate-dags.js
   npm run dev
   ```

## Troubleshooting

### DAG files not generated
- Ensure `manifest.json` and `catalog.json` exist in project root
- Check that `public/` directory is writable
- Run: `node scripts/generate-dags.js` and check console output

### Graphs render slowly
- Reduce MAX_NODES / MAX_EDGES
- Check browser DevTools for long tasks
- Consider generating fewer files (e.g., only for common sources)

### Missing metadata in persona views
- Check that manifest fields are populated in your dbt project
- Verify catalog.json includes the node (optional)
- Inspect generated JSON: `cat public/dag/<id>.json | jq .nodes[0].metadata`

## Best Practices

1. **Regenerate DAGs after dbt docs generate:**
   ```bash
   dbt docs generate && npm run generate-dags && npm run build
   ```

2. **Version and commit the generated files** (optional):
   - Include `public/dag/` in git for reproducible docs
   - Or exclude and regenerate as part of your build pipeline

3. **Monitor file count and size:**
   ```bash
   ls -lh public/dag/ | wc -l  # count
   du -sh public/dag/           # total size
   ```

4. **Test with a subset before production:**
   ```bash
   node scripts/validate-dags.js 100  # check first 100 files
   ```

## AdventureWorks Batch Simulation

Use these scripts to simulate AM/PM runs over consecutive days and demonstrate how
pipeline behavior differs between slow-changing reference data and high-change
transactional tables.

1. **Generate snapshot series** (default 3 days, AM + PM = 6 batches):
   ```bash
   npm run simulate:adventureworks
   ```

2. **Customize simulation window**:
   ```bash
   node scripts/simulate-adventureworks-batches.js --days 6 --start-date 2026-02-03
   ```

3. **Apply one snapshot into app root artifacts**:
   This copies current root artifacts to backups, then replaces root `manifest.json`
   and `catalog.json` with the selected snapshot.
   ```bash
   npm run use:snapshot -- 2026-02-05-pm
   ```

4. **Snapshot output location**:
   - `samples/adventureworks-batches/<YYYY-MM-DD-am|pm>/manifest.json`
   - `samples/adventureworks-batches/<YYYY-MM-DD-am|pm>/catalog.json`
   - `samples/adventureworks-batches/<YYYY-MM-DD-am|pm>/summary.json`
   - `samples/adventureworks-batches/index.json`
   - `samples/adventureworks-batches/README.md`

Simulation specifics:
- Reference tables are marked using schema-compatible metadata (`meta.reference_table`)
  plus hardcoded heuristics.
- Only a small targeted subset of tables changes each batch (baseline-first simulation).
- Reference targets update slowly (AM only, every other day).
- Transactional targets update on both AM and PM cycles.
- Deterministic drift showcase:
  - Day 2 PM: adds `pm_batch_flag` to one transactional table.
  - Day 3 AM: changes one transactional column type to `VARCHAR`.

## Dependency Audit

Use the local dependency audit script to catch likely JavaScript dependency bloat:

```bash
npm run audit:deps
```

Strict mode exits non-zero when likely unused runtime dependencies or undeclared
imports are found:

```bash
npm run audit:deps:strict
```

## Ownership Assignment (AdventureWorks)

To apply governance owner metadata across all AdventureWorks artifacts (root plus simulated snapshots):

```bash
npm run apply:owners
```

What it updates:

- `manifest*.json`: `meta.owner`, `meta.owner_domain`, and `config.owner` (when config exists)
- `catalog*.json`: `metadata.owner`, `metadata.owner_domain`

The assignment uses domain heuristics (Sales, HR, Procurement, Manufacturing, Master Data, Data Quality, Platform) and avoids personal-name ownership in public sample artifacts.

## References

- [dbt Docs: Getting Started with Data Lineage](https://www.getdbt.com/blog/getting-started-with-data-lineage)
- [dbt Manifest Schema](https://schemas.getdbt.com/dbt/manifest/)
- [dbt Catalog Schema](https://schemas.getdbt.com/dbt/catalog/)
