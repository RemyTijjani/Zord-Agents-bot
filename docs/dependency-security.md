# Dependency security baseline

The Stage 1 branch upgrades Vite to 6.4.6 and React Router to 7.18.0 to move beyond the affected release ranges reported by the package audit.

- Vite 6.4.6 addresses the critical dev-server code-execution advisory affecting Vite through 6.4.5. Keep the Vite development server bound to localhost; do not expose it with `--host` to untrusted networks.
- React Router 7.18.0 is the first patched release for the current open-redirect and SSR hydration advisories affecting the 6.x line.
- CI runs `npm audit --audit-level=moderate` after the lockfile refresh to ensure the audited dependency tree is clean.

Advisories:
- https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7
- https://github.com/advisories/GHSA-wrjc-x8rr-h8h6
- https://github.com/advisories/GHSA-337j-9hxr-rhxg
