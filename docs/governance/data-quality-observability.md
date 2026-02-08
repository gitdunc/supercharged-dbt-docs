# Data Quality and Observability

## Objective

Detect high-impact data issues early and route them to the right owners.

## Broad Checks (Primary Operational Focus)

- schema drift
- volume/completeness drift
- freshness lag

These broad checks are the first line of defense and should be visible in lineage and object metadata.
In this operating model, they represent roughly 70% of downtime-driving incidents.

## Narrow Checks

Narrow domain checks can be represented via tags and filtered for specific teams.
Typical examples are nullability, referential integrity, and data typing checks (~20% of incidents).

## User-Defined Checks

Business-owned rules (typically reviewed in stewardship working groups) account for the remaining ~10%.
These are usually delegated to domain analysts and must be agreed with business stakeholders.

## Operating Cadence

- Hot observability lane: about every 30 minutes, plus immediate refresh on warning/failure events.
- Warm lane: intraday lineage/metadata refresh for engineering use.
- Cold lane: slower business metadata refresh.

## Practical Lifecycle

- compare current and previous artifacts
- compute drift/freshness deltas
- update status in API/UI
- assign incident ownership by domain

For public/demo environments, use synthetic thresholds and sample-safe metadata.
