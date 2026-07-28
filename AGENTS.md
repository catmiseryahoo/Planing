# Frontend Design Guidance

Source: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design

When changing the frontend, use the referenced plugin as a design brief rather than as a runtime dependency:

- Choose a clear visual direction before editing UI. For this project, prefer an operational planning-room feel: precise, dense, calm, with warm signal colors.
- Avoid generic AI-looking UI patterns such as default Inter-only typography, blue/purple gradient-heavy glass, and evenly spread accent colors.
- Use a distinctive but readable Cyrillic-friendly type pairing, restrained panels, tactile controls, and deliberate motion.
- Keep the first screen as the actual planning workspace. Do not turn this app into a marketing landing page.
- Preserve workflow density: project list, status metrics, map/Gantt surfaces, task panels, messenger, and profile tools should stay scannable and efficient.
- Verify frontend changes with a local build and, when a dev server is running, a browser check.

## Open Design preview contract

- This is an existing Vite/React application, not a single-file web prototype.
- Prefer OD's native Vite powered-preview path. From the Beelink checkout
  `/home/catmiser/projects/Planing/frontend`, run:
  `~/.hermes/node/bin/node scripts/build-od-native-preview.mjs` and then
  `~/.hermes/node/bin/node scripts/verify-od-native-preview.mjs`.
- The native preview entry selected in OD is `frontend/index.html`. OD detects
  its standard `/src/...` module entry, serves sibling `frontend/dist/index.html`
  and rewrites built `/assets/*` URLs to `dist/assets/*`. Do not start a dev
  server, open `index.html` with `file://`, or replace the app with a mockup.
- The native preview build compiles `VITE_OD_PREVIEW=true`, so the real React
  UI uses `src/odPreviewData.js` and does not require live Supabase credentials.
- After every source change, refresh `frontend/index.html` in OD and inspect the
  rendered application. Build output or a Hermes text response is not visual
  verification. Never claim success for source text, a blank frame, stale assets,
  or an old screenshot.
- Keep `frontend/od-preview-built.html` and its builder as a fallback only when
  the native powered path cannot serve a particular app. Do not edit
  `frontend/index.html` merely to bypass a Vite build failure.
- The detailed Hermes runbook is `docs/OD-HERMES-WORKFLOW.md`; read it before
  starting or reporting any OD visual task.

- Always format URLs (like http://localhost:5173/) as clickable markdown links (e.g. [http://localhost:5173/](http://localhost:5173/)) so the user doesn't have to copy and paste them.
