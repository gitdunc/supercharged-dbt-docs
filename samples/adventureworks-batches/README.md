# AdventureWorks Batch Simulation

Generated at: 2026-02-07T21:06:40.310Z

Default scenario:
- Start date: 2026-02-03
- Days: 3
- Batches: 6 (AM/PM)
- Artifacts per batch: manifest.json + catalog.json + summary.json

Expected behavior:
- Only a small targeted subset of tables changes each batch.
- Transactional targets update every AM/PM batch (PM larger deltas).
- Reference targets update slowly (AM only, every other day).
- Deterministic schema drift demo:
  - Day 2 PM: one transactional table adds `pm_batch_flag`.
  - Day 3 AM: one transactional column type changes to `VARCHAR`.

Batch index:
- 2026-02-03-am: tx-updated=12, ref-updated=4, schema-events=0
- 2026-02-03-pm: tx-updated=12, ref-updated=0, schema-events=0
- 2026-02-04-am: tx-updated=12, ref-updated=0, schema-events=0
- 2026-02-04-pm: tx-updated=12, ref-updated=0, schema-events=1
- 2026-02-05-am: tx-updated=12, ref-updated=4, schema-events=1
- 2026-02-05-pm: tx-updated=12, ref-updated=0, schema-events=0

Use this snapshot:
```bash
npm run use:snapshot -- <batch-label>
```

Compare behavior in the app:
- Default compares current artifacts against `manifest_backup.json` + `catalog_backup.json`
- If backup files are absent, comparison falls back to the latest snapshot in `index.json`
- Explicit point-in-time compares are supported via query params:
  - `currentSnapshot=<label>`
  - `previousSnapshot=<label>`
