# AdventureWorks Batch Simulation (DataOps / Observability)

Generated at: 2026-02-07T21:06:40.310Z

This folder models a micro-batch observability workflow for Production Support. It simulates frequent intraday artifact refreshes and lets you compare two points in time without rebuilding the full app.

## Operational Intent

- Treat this as the "hot" observability layer.
- Typical feed cadence: every ~30 minutes.
- Additional refreshes occur on warning/failure events.
- Primary audience: Production Support persona, with visibility for business impact via lineage.

## Test Mix (Operational Guidance)

- Broad tests (~70% of incidents):
  - schema drift
  - completeness / volume drift
  - recency / freshness lag
- Narrow tests (~20%):
  - nullability
  - referential integrity
  - data typing
- User-defined tests (~10%):
  - business-defined rules reviewed in stewardship working groups
  - commonly delegated to data analysts within domains (Sales, HR, Procurement, etc.)

## Default Scenario

- Start date: 2026-02-03
- Days: 3
- Batches: 6 (AM/PM)
- Artifacts per batch: `manifest.json` + `catalog.json` + `summary.json`

Expected behavior:

- Only a targeted subset of objects changes each batch.
- Transactional targets update every AM/PM batch (PM generally has larger deltas).
- Reference targets update slowly (AM only, every other day).
- Deterministic schema drift demo:
  - Day 2 PM: one transactional table adds `pm_batch_flag`.
  - Day 3 AM: one transactional column type changes to `VARCHAR`.

## Batch Index

- 2026-02-03-am: tx-updated=12, ref-updated=4, schema-events=0
- 2026-02-03-pm: tx-updated=12, ref-updated=0, schema-events=0
- 2026-02-04-am: tx-updated=12, ref-updated=0, schema-events=0
- 2026-02-04-pm: tx-updated=12, ref-updated=0, schema-events=1
- 2026-02-05-am: tx-updated=12, ref-updated=4, schema-events=1
- 2026-02-05-pm: tx-updated=12, ref-updated=0, schema-events=0

## Use a Snapshot

```bash
npm run use:snapshot -- <batch-label>
```

## Point-in-Time Comparison

- Default compare:
  - current artifacts vs `manifest_backup.json` + `catalog_backup.json`
- Fallback:
  - latest snapshot in `index.json` if backups are missing
- Explicit compare via query params:
  - `currentSnapshot=<label>`
  - `previousSnapshot=<label>`

This supports both "current vs previous" and arbitrary historical comparisons (for example, months apart) as long as both artifact sets are available.
