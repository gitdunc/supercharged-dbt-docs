# Lineage and Impact Analysis

## Objective

Understand blast radius before change and accelerate incident triage after change.

## Core Views

- upstream dependencies (`depends_on`)
- downstream consumers (`referenced_by` / child lineage)
- direction + depth filters for targeted analysis

## Recommended UX Behavior

- single click: show node metadata
- double click: redraw lineage around selected node
- keep user zoom level stable while recentering selected node

## Governance Usage

- change planning: identify impacted assets and owners before deployment
- incident response: isolate likely upstream root causes quickly
- communication: generate owner-aware impact lists for release notes
