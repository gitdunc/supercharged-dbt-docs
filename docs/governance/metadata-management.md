# Metadata Management

## Objective

Keep technical and business metadata current, complete, and machine-readable.

## Key Metadata Areas

- ownership (`owner`, `owner_domain`)
- classification
- glossary linkage
- test coverage and status
- freshness and volume indicators
- lineage relationships

## Data In Motion vs Landed Data

This project uses governance-oriented labels:

- Data In Motion (Activity): models
- Data In Motion (Snapshot): snapshots
- Landed Data: seeds
- Source Data: sources
- Routines: macros/operations

## Operational Practice

- regenerate dbt artifacts
- apply ownership metadata
- run lint/build checks
- publish docs and lineage updates

This flow keeps metadata aligned with code and operational reality.
