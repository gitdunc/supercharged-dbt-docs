# Release Checklist

## Build Quality
- Run `npx tsc --noEmit`
- Run `npm run lint`
- Run `npm run build`

## Runtime Smoke Test
- Run `npm run dev`
- Open:
  - `/`
  - `/model/<id>`
  - `/source/<id>`
  - `/seed/<id>`
  - `/snapshot/<id>`
  - `/dag/<id>`
- Confirm:
  - Persona checkboxes hide/show sections
  - DAG zoom buttons work and no runtime errors
  - Node single-click updates Data Definition panel
  - Node double-click recenters/redraws around selected node

## Data Artifact Validation
- Verify `manifest.json` and `catalog.json` are present
- Confirm `metadata.dbt_schema_version` exists in both files
- Confirm DAG API responds:
  - `GET /api/dag/<id>?maxDepth=5`
  - `GET /api/errors/<id>`

## Performance Guardrails
- For large manifests, keep `maxDepth` bounded for default views
- Use cache clear only when needed: `POST /api/cache` with `{ "action": "clear-all" }`
- Validate node count controls before release (`MAX_NODES`/config)

## Branding / UX
- Confirm logo renders correctly in sidebar/header
- Confirm page title and app name are set to Featherweight branding
- Confirm no default Next.js placeholder assets remain in `public/`

## Final Checks
- Review `git diff --stat`
- Record known limitations in README before tagging release
