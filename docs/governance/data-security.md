# Data Security

## Objective

Reduce data exposure risk across code, artifacts, and runtime behavior.

## Baseline Controls

- Do not commit secrets, tokens, or private keys.
- Keep `.env*.local` ignored and use environment variables for runtime config.
- Prefer role/group owner metadata over personal names in public artifacts.
- Treat sample data as public demonstration data unless contractually restricted.

## Recommended Additions

- Add secret scanning in CI (for example: `gitleaks` or GitHub Advanced Security).
- Add policy checks for prohibited patterns (private keys, PATs, cloud keys).
- Add signed release process for artifact publishing.

## Runtime Note

Persona toggles in this app are for cognitive load management only. They are not security boundaries.
Enforce access control in the data platform and identity layer, not in UI filtering alone.
