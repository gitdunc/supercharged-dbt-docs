# Data Classification

## Objective

Classify data at the attribute (column) level so handling rules (masking, sharing, retention, alerting) are explicit, testable, and auditable.

## Featherweight 4-Level Standard

- `public`: approved for open sharing.
- `internal`: default business-use data inside the organization.
- `sensitive`: data requiring controlled access due to privacy, confidentiality, or misuse risk.
- `regulated`: data subject to explicit regulatory/contractual controls.

## PI, PD, and PII

- `PI` (Protected Information): broad umbrella for data needing extra controls.
- `PD` (Personal Data): any data linked to an identifiable person, directly or indirectly.
- `PII` (Personally Identifiable Information): direct identifiers (for example email, phone, full name, national identifier).

`PI` is broader than `PII`. `PD` is also broader than direct `PII`.

## Metadata and Tags Used in This Repo

Column-level metadata fields:

- `meta.data_classification`
- `meta.protected_information`
- `meta.personal_data`
- `meta.personally_identifiable_information`
- `meta.regulated_data`
- `meta.hipaa_applicable`
- `meta.classification_standard`

Column tags:

- `classification:public|internal|sensitive|regulated`
- `pi`
- `pd`
- `pii`
- `regulated`
- `hipaa:none`

## HIPAA Note for AdventureWorks

AdventureWorks is a fictional sample dataset. Current sample tagging assumes no HIPAA-covered fields by default (`hipaa:none`, `meta.hipaa_applicable=false`) unless a downstream adopter explicitly maps regulated healthcare attributes.

## UI Opportunity

Expose classification badges and filters in:

- object details
- column details
- lineage side panel
- search/filter facets
