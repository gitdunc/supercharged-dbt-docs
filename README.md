# Featherweight Governance Tool (Supercharged dbt Docs)

This is a rewrite of [dbt docs](https://github.com/dbt-labs/dbt-docs) using [Next.js](https://nextjs.org/) with React Server Components and Static Site Generation (SSG).

## About

This project was originally built primarily by Marco Salazar with contributions by Pete Hunt. It is built on top of the [dbt-docs](https://github.com/dbt-labs/dbt-docs) project.

**Branding**: This project defaults to **Featherweight Governance Tool** branding (customizable via environment variables). You can override the organization name, link, and logo URL without code changes.

**Positioning**: This repository is intended as a **Featherweight Governance Tool** to help teams improve practical data governance, observability, and lineage understanding.

## Persona Mapping (Configurable UI)

The home page includes a horizontal persona switcher used for readability and reduced cognitive load (it is **not** a security boundary).

- Configuration file: `config/personaLayout.ts`
- UI component: `src/components/PersonaOverview.tsx`
- Default personas:
  - `Prod Support`
  - `Data Engineering`
  - `Business Analyst`

### Resource Naming Conventions

To keep governance language consistent:

- `model` is shown as **Data In Motion**
- `seed` is shown as **Landed Data**

These labels are centralized in `src/util/resourceLabels.ts` and reused across search/reference and DAG metadata views.

## Credits

- Built on top of [dbt-docs](https://github.com/dbt-labs/dbt-docs)
- Inspired by strong lineage and orchestration UX patterns popularized by [Dagster](https://dagster.io/)
- Thanks to the open data community for patterns, feedback, and education resources

### Inspiration

This project is directly inspired by the open work from the dbt and Dagster communities, whose tooling and education have helped raise practical data governance maturity across teams.

## Getting Started

### Quick Setup

- Install Node.js and Yarn (https://nodejs.org/)
- Replace `catalog.json` and `manifest.json` with the equivalent files from your dbt project
- Run `yarn && yarn build`
- Your docs will be generated in the `dist/supercharged` folder
- To test locally, run `npm run dev` (similar to `dbt docs serve`)
- Open your browser at: `http://localhost:3000`

### Features

- **DAG Visualization**: Explore per-model DAGs showing upstream/downstream lineage
  - Navigate to any model and click the "Render DAG" button to visualize its dependency graph
  - Switch between different data personas (Full, Operational, Business Analyst) for contextual details
  - View source/test relationships and understand column-level dependencies

- **Static Site Generation**: Pre-built DAG data for lightning-fast page loads
  - DAGs are generated at build time, enabling instant client-side visualization
  - Configurable limits (MAX_NODES, MAX_EDGES) for performance tuning
  - Optimal for intraday manifest/catalog recreation workflows

- **Full dbt Documentation**: All standard dbt docs features plus enhanced visualization

## Data Observability Architecture

This implementation is designed as a **multi-layer, persona-driven caching system** for data observability. It recognizes that different personas require different update cadences and freshness levels:

### Persona-Driven Update Strategy

#### Hot Layer (Real-Time) - Production Support
**Use Case**: Production support responds immediately to incidents - anomalies, errors, unexpected changes

- **3 Broad Tests** (inspired by Monte Carlo's observability framework):
  1. **Freshness**: Is the table updating on schedule?
  2. **Volume**: Are record counts within expected ranges?
  3. **Quality**: Are there unexpected changes (nulls, schemas, invalid values)?

- **Update Cadence**: Continuous or on-demand when anomalies detected
- **Caching**: Short-lived, computed on-demand, cached only while support is investigating (5-10 minute TTL)
- **Implementation**: Error counts, test failures, anomaly flags tracked at column/table level in metadata

#### Warm Layer (Intraday) - Data Engineers
**Use Case**: DEs working on a single source all day need periodic feedback on dependencies and metadata

- **Content**: Lineage (upstream/downstream), column-level metadata, related tests
- **Update Cadence**: Every 30-60 minutes or on-demand when working on specific source
- **Caching**: Medium-lived cache (30-60 minutes), compute fresh when user selects source
- **Implementation**: DAG computation from manifest/catalog, persona-filtered metadata (full vs. operational view)

#### Cold Layer (Periodic) - BAs & Business
**Use Case**: Business metadata (glossary, documentation, ownership) changes slowly

- **Content**: Business glossary, column descriptions, ownership metadata
- **Update Cadence**: Daily or on-demand (typically during business hours)
- **Caching**: Long-lived (cache for up to 24 hours)
- **Implementation**: Catalog metadata and documentation strings

### SQL Implementation Reference

The `Azure_loves_dbtDocs_v12.sql` file implements the recursive lineage computation and broad test tracking:

- **Lineage Recursion**: Parent/child relationships computed via recursive CTEs (following dbt manifest parent_map/child_map patterns)
- **Column-Level Metadata**: Tracks column descriptions, types, nullability constraints
- **Test Metadata**: Generically structures `unique`, `not_null`, `relationships`, and `accepted_values` tests
- **Configuration-Based Patterns**: Demonstrates mapping between source layers (landing, dss_ds, etc.)

**Schema Note**: The SQL file currently references an earlier dbt manifest schema version. Future updates will align with [dbt Manifest Schema v9+](https://schemas.getdbt.com/dbt/manifest/v9.json) and [Catalog Schema v1](https://schemas.getdbt.com/dbt/catalog/v1.json).

### Recommended Caching Strategy

```javascript
// Pseudo-code for layered caching:

// Hot Layer (Real-time for Production Support)
GET /api/metadata/{id}?layer=errors
  → Fetch error counts, test failures, anomalies
  → Compute fresh if cache > 5 minutes old
  → Cache in memory for 5-10 minutes
  → Revalidate immediately if new incident detected

// Warm Layer (Intraday for Data Engineers)
GET /api/dag/{id}?persona=de
  → Compute lineage DAG fresh (100-500ms)
  → Cache in memory for 30-60 minutes
  → Revalidate on user request for specific source
  → Pre-compute only the source they're currently working on

// Cold Layer (Periodic for BA/Business)
GET /api/catalog/{id}?layer=glossary
  → Serve from static catalog.json
  → Cache for 24 hours
  → Update only on catalog refresh cycle
```

## Configuration

### Branding Customization

You can customize the branding to match your organization. Create a `.env.local` file in the project root or set the following environment variables:

```bash
# Organization name and branding
NEXT_PUBLIC_ORG_NAME=YourCompanyName
NEXT_PUBLIC_ORG_LINK=https://yourcompany.com
NEXT_PUBLIC_ORG_LOGO_URL=https://yourcompany.com/logo.svg

# Optional: customize logo dimensions (defaults: 46px height, 168px width)
NEXT_PUBLIC_ORG_LOGO_HEIGHT=46
NEXT_PUBLIC_ORG_LOGO_WIDTH=168
```

**Default Behavior**: If these variables are not set, the site defaults to "Featherweight Governance Tool" branding with a built-in feather/quill logo.

### DAG Generation Tuning

Configure DAG generation performance via environment variables in `.env.local`:

```bash
# Maximum nodes per DAG (default: unlimited)
MAX_NODES=500

# Maximum edges per DAG (default: unlimited)
MAX_EDGES=1000
```

These limits help control the size of DAG JSON files and rendering performance. Set these values if you have very large models with extensive dependencies.

## Production Deployment

### Build Process

The build process includes a post-build step that generates per-model DAG files:

```bash
npm run build
# Output: Results in dist/ folder ready to deploy
```

**Note on SSG with Large Projects**: With large dbt projects (1000+ models), the Next.js static site generation process can be resource-intensive. The build needs to generate HTML files for each model, source, metric, test, etc.

### Build Performance & Optimization

For large projects, consider these strategies:

1. **Increase timeout limits** in your build environment (recommended: 10-15 minutes for 1000+ model projects)
2. **Use ISR (Incremental Static Regeneration)** instead of full SSG:
   - Modify `next.config.js` to use `output: 'standalone'` instead of `'export'`
   - Set `revalidate` to a time-based value (e.g., `revalidate: 3600` for hourly updates)
   - This enables on-demand updating without full rebuilds
3. **Parallel builds** for CI/CD: distribute across multiple machines if needed

### Intraday Manifest Updates

For data observability use cases with frequent manifest/catalog updates:

**Persona-Aligned Update Strategy**:

1. **Hot Layer (Production Support, Real-time)**:
   - Anomalies detected → immediately compute error/test metadata
   - Error counts and failures available in <100ms (fresh computation)
   - Recommendation: **5-10 minute cache TTL**, revalidate on-demand
   - Implementation: Trigger full manifest reload when errors detected

2. **Warm Layer (Data Engineers, Intraday)**:
   - New dbt artifacts available → copy `manifest.json` and `catalog.json`
   - Restart server (no rebuild required)
   - Fresh lineage and column metadata available on next DE request
   - Recommendation: **30-60 minute cache TTL** for computed DAGs per source

3. **Cold Layer (BA/Business, Periodic)**:
   - Catalog refresh on business hour schedule (e.g., 8 AM, 2 PM)
   - Business glossary updates pushed separately
   - Recommendation: **Daily rebuild sufficient**, use ISR for individual page updates

**Implementation per layer**:
1. Generate new dbt artifacts: `dbt parse && dbt compile && dbt docs generate`
2. Copy new `manifest.json` and `catalog.json` to project root
3. **Option A - Development (All Layers)**:
   ```bash
   npm run dev  # Watch mode, instant refresh for all personas
   ```
4. **Option B - Production (Layered)**:
   ```bash
   # Hot layer: Auto-reload errors on manifest change (requires API endpoint)
   # Warm layer: Manual trigger for DE lineage refresh (30-60 min)
   # Cold layer: Scheduled rebuild for business metadata (daily)
   ```
5. **Option C - Hybrid (Recommended for observability systems)**:
   - Use API endpoints for hot layer (compute error metrics on-demand)
   - ISR for warm layer (30-60 min revalidation for DE DAGs)
   - Static export for cold layer (catalog/business metadata)

### Performance Baseline

For a typical dbt project:

| Project Size | DAG Generation | Compilation | Page Generation | Total Build Time |
|---|---|---|---|---|
| Small (100 models) | ~5-10s | ~10s | ~30s | ~60s |
| Medium (500 models) | ~20-30s | ~15s | ~2-3m | ~3-4m |
| Large (1000+ models) | ~45-60s | ~20s | ~5-10m+ | ~10-15m+ |

**Build Requirements for Large Projects**:
- At least 4GB RAM
- 20GB free disk space  
- 15+ minute timeout
- SSD storage strongly recommended

The DAG generation script (`scripts/generate-dags.js`) is optimized for:
- **Minimal memory footprint**: Processes manifest incrementally
- **Fast execution**: ~30-60 seconds for 1000+ model projects
- **Scalability**: Creates individual JSON files per model for quick client-side loads

### AdventureWorks AM/PM Demo (Sample Scenario)

To showcase pipeline behavior across personas, a baseline-first simulator is included:

```bash
npm run simulate:adventureworks
```

Default output is **6 batches** (3 days x AM/PM) under `samples/adventureworks-batches/`.
Expected changes for each batch are documented in:

- `samples/adventureworks-batches/README.md`
- `samples/adventureworks-batches/index.json`

Point-in-time comparison options:

- Default compare: current `manifest.json`/`catalog.json` vs `manifest_backup.json`/`catalog_backup.json`
- Backup fallback: latest snapshot in `samples/adventureworks-batches/index.json`
- Explicit compare (including months apart): provide snapshot labels or file paths

Examples:

```text
/dag/model.AdventureWorks2017.Employee?currentSnapshot=2026-02-05-am&previousSnapshot=2026-02-03-am
/api/errors/model.AdventureWorks2017.Employee?previousManifestPath=history/2025-10-01/manifest.json&previousCatalogPath=history/2025-10-01/catalog.json
```

DAG styling + filtering:

- Broad checks are node-level: schema drift, volume drift, freshness lag
- Combination failures use combination colors (color-blind-friendly palette)
- Reference data remains distinct by shape (`hexagon`)
- Narrow/specific checks are expected as tags; DAG supports tag filtering

Schema/config drift guidance:

- Comparison is best-effort when current vs previous artifact schemas differ
- For reliable long-range comparisons, port older artifacts to the current schema first

## Future Roadmap

### Schema Alignment
The current implementation references the dbt manifest and catalog artifacts. Future versions will align directly with:
- **dbt Manifest Schema**: [v9.0](https://schemas.getdbt.com/dbt/manifest/v9.json) and later
- **dbt Catalog Schema**: [v1.0](https://schemas.getdbt.com/dbt/catalog/v1.json) and later

This enables full compatibility with all dbt versions and ensures metadata consistency.

### Planned Optimization: API-Based DAG & Error Computation
### API-Based Runtime DAG & Error Computation ✅ [IMPLEMENTED]

**Previous**: Static DAG files generated at build time (4-5 minute penalty)  
**Current**: On-demand computation via `/api/dag/[id]` and `/api/errors/[id]` endpoints

#### Benefits Realized
- ✅ **Instant intraday updates** - No rebuild required, just manifest file swap + restart server
- ✅ **Production support priority** - Fresh error/test data available immediately (<100ms cold start)
- ✅ **Persona-specific computation** - Compute only what each user needs
- ✅ **Reduced build time** - From 5 minutes → 30-60 seconds (4+ minute savings)
- ✅ **Memory efficient** - Load manifest/catalog once at startup, cache computed results in 3-layer system
- ✅ **First DAG load** - 100-500ms (computed fresh), subsequent loads <10ms (cached in warm layer)

#### API Endpoints

##### Warm Layer: `GET /api/dag/[id]` - Data Engineer Lineage

Returns full upstream/downstream lineage DAG for a model.

**Use Case**: Data Engineers reviewing dependencies and understanding data flow

**Cache TTL**: 30-60 minutes (warm layer)

**Request**:
```bash
curl "http://localhost:3000/api/dag/model.project.employee_dim?maxDepth=50&fresh=false"
```

**Query Parameters**:
- `maxDepth`: Maximum lineage depth (default: 50, max: 100)
- `fresh`: Force recompute & bypass cache (default: false)

**Response** (200 OK):
```json
{
   "data": {
      "root": {
         "unique_id": "model.project.employee_dim",
         "name": "employee_dim",
         "resource_type": "model",
         "schema": "analytics",
         "columns": ["employee_id", "name", "department_id"]
      },
      "parents": [
         {
            "unique_id": "source.salesforce.employees",
            "name": "employees",
            "resource_type": "source",
            "dependsOn": ["model.project.base_employees"]
         }
      ],
      "children": [
         {
            "unique_id": "model.project.employee_summary",
            "name": "employee_summary",
            "resource_type": "model"
         }
      ],
      "parentMap": {
         "source.salesforce.employees": 2,
         "model.project.base_employees": 1
      },
      "childMap": {
         "model.project.employee_summary": 1
      },
      "depth": {
         "upstream": 2,
         "downstream": 1
      }
   },
   "cached": false,
   "computeTimeMs": 245,
   "metadata": {
      "manifestVersion": "1.0.4",
      "generatedAt": "2022-04-16T23:34:38.883435Z"
   }
}
```

##### Hot Layer: `GET /api/errors/[id]` - Production Support Test Monitoring

Returns test failures, freshness issues, and data quality metrics for a model.  
Implements the **3 broad tests pattern**: freshness, volume, quality.

**Use Case**: Production Support teams monitoring data quality incidents

**Cache TTL**: 5-10 minutes (hot layer)

**Request**:
```bash
curl "http://localhost:3000/api/errors/model.project.orders?testType=quality&statusFilter=fail"
```

**Query Parameters**:
- `testType`: Filter tests by type (`freshness`, `volume`, `quality`, or omit for all)
- `statusFilter`: Filter by status (`pass`, `fail`, `unknown`)

**Response** (200 OK):
```json
{
   "data": {
      "nodeId": "model.project.orders",
      "nodeName": "orders",
      "totalTests": 6,
      "failingTests": 1,
      "tests": [
         {
            "unique_id": "test.project.not_null_orders_order_id",
            "testName": "not_null",
            "testType": "quality",
            "nodeId": "model.project.orders",
            "columnName": "order_id",
            "status": "fail",
            "severity": "error",
            "description": "Test: not_null"
         },
         {
            "unique_id": "test.project.dbt_freshness_orders",
            "testName": "dbt_freshness",
            "testType": "freshness",
            "status": "pass",
            "severity": "warning"
         }
      ],
      "volumeMetrics": {
         "type": "volume",
         "actualRowCount": 150245
      },
      "appliedFilters": {
         "testType": "quality",
         "statusFilter": "fail"
      }
   },
   "cached": false,
   "computeTimeMs": 89
}
```

##### Admin: `GET /api/cache/stats` - Cache Monitoring

Monitor cache hit rates, TTL expiration, and memory usage.

**Request**:
```bash
curl "http://localhost:3000/api/cache/stats?layer=warm"
```

**Response**:
```json
{
   "timestamp": "2024-02-07T12:34:56.000Z",
   "cache": {
      "totalEntries": 42,
      "entriesByLayer": {
         "hot": 5,
         "warm": 32,
         "cold": 5
      }
   },
   "performance": {
      "totalHits": 1240,
      "totalMisses": 180,
      "hitRate": "87.32%",
      "avgHitsPerKey": 29.5
   },
   "ttl": {
      "hot": "5-10 minutes",
      "warm": "30-60 minutes",
      "cold": "24 hours"
   }
}
```

##### Admin: `POST /api/cache/clear` - Cache Invalidation

Clear specific cache layers (useful for testing or after manifest updates).

**Request**:
```bash
# Clear warm layer (for manifest updates)
curl -X POST "http://localhost:3000/api/cache/clear" \
   -H "Content-Type: application/json" \
   -d '{"action": "clear-layer", "layer": "warm"}'
```

**Responses**:
```json
{
   "success": true,
   "action": "clear-layer",
   "layer": "warm",
   "totalItemsCleared": 32,
   "clearedAt": "2024-02-07T12:34:56.000Z"
}
```

#### Client-Side Hook Usage

Use the `useDAG` and `useErrors` hooks in React components:

```tsx
// src/components/ModelViewer.tsx
import { useDAG, useErrors } from '@/hooks/useDAG';

export function ModelViewer({ nodeId }: { nodeId: string }) {
   // Fetch DAG (cached for 30-60 minutes server-side)
   const { data: dag, isLoading, error, refetch } = useDAG(nodeId, {
      maxDepth: 50,
      fresh: false,
   });

   // Fetch error/test metadata (cached for 5-10 minutes server-side)
   const { data: errors, isLoading: errorsLoading } = useErrors(nodeId, {
      testType: 'quality',
   });

   if (isLoading) return <div>Computing DAG...</div>;
   if (error) return <div>Error: {error.message}</div>;

   return (
      <>
         <div>Upstream ancestors: {dag.parents.length}</div>
         <div>Downstream descendants: {dag.children.length}</div>
         <div>Failing tests: {errors?.failingTests || 0}</div>
      </>
   );
}
```

#### Intraday Manifest Updates

**Scenario**: New dbt artifacts available without full rebuild

**Steps**:

1. Generate new artifacts:
    ```bash
    dbt parse && dbt compile && dbt docs generate
    ```

2. Copy new files to project:
    ```bash
    cp dbt_project/manifest.json ./manifest.json
    cp dbt_project/catalog.json ./catalog.json
    ```

3. Restart server (no rebuild needed):
    ```bash
    # Kill existing process
    npm run dev
    ```

4. Fresh data available immediately:
    - **Hot Layer**: Error/test metadata refreshed on next request (<100ms)
    - **Warm Layer**: Invalidate by hitting `/api/cache/clear` with `{"action": "clear-layer", "layer": "warm"}`
    - **Cold Layer**: Catalog served fresh on page reload

Result: **30-60 minute build time reduced to <1 minute restart + manifest copy**

## Demos

- **Supercharged version**: http://dbt-docs-supercharged-demo.s3-website-us-west-1.amazonaws.com/supercharged/
- **Original dbt version**: http://dbt-docs-supercharged-demo.s3-website-us-west-1.amazonaws.com/original-dbt-docs-sources/#!/overview

## Architecture

- **Frontend**: Next.js 14 with React 18 and TypeScript
- **Graph Visualization**: react-graph-vis (using vis-network)
- **Build Pipeline**: Includes custom DAG generation scripts for SSG compatibility
- **Styling**: CSS modules and Tailwind CSS

## Development

```bash
# Install dependencies
yarn install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

- This project is provided for **education, demonstration, and community uplift** purposes.
- It is a free tool intended to support people on their data governance journey.
- **No warranty is provided**, express or implied, including fitness for a particular purpose, merchantability, reliability, or non-infringement.
- You are responsible for validating all outputs, controls, and governance decisions before production use.
- The maintainers are not liable for any loss or damage arising from use of this software.
- References to third-party projects are for attribution and interoperability context only.
- Dagster and dbt names/logos are owned by their respective trademark holders. This project is independent and not endorsed by, sponsored by, or affiliated with those organizations.

## License

See [LICENSE](./LICENSE) for details.

