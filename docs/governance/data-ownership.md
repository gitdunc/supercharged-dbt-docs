# Data Ownership

## Objective

Assign accountable ownership to every data object and make ownership visible in metadata and documentation.

## Ownership Model

- **Object owner**: accountable owner for a table/view/snapshot/routine.
- **Field steward**: accountable owner for critical fields that may cross domain boundaries.
- **Custodian**: platform team responsible for storage, movement, and technical controls.

## AdventureWorks Baseline in This Repo

Owner values are automatically populated in all AdventureWorks artifacts using domain heuristics:

- Human Resources
- Sales
- Procurement
- Manufacturing
- Master Data
- Data Quality
- Platform
- Data Engineering (fallback)

Run:

```bash
npm run apply:owners
```

This updates all `manifest*.json` and `catalog*.json` files (root + simulated batch snapshots).

## Cross-Domain Best Practice

When objects integrate multiple domains, keep:

- object owner based on the dominant business process (for example, Sales fact tables)
- field-level stewardship for critical shared identifiers (for example, `employee_id` stewarded by HR)

Recommended extension: add a column stewardship map (JSON/YAML) and surface it in the Data Definition panel.
