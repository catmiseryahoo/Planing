---
name: react-app-preview
description: Preview an existing Vite/React application inside Open Design.
triggers:
  - "preview the app"
  - "visualize the application"
  - "check the design in Open Design"
od:
  mode: prototype
  platform: desktop
  scenario: design
  preview:
    type: html
    entry: frontend/index.html
---

# Existing Vite/React application preview

This project is an existing Vite/React application. Do not replace it with the
single-file `web-prototype` seed and do not open `frontend/index.html` via
`file://`; select it in OD so the powered Vite bridge can serve the build.

## Required workflow

1. Work from the project root on Beelink: `/home/catmiser/projects/Planing`.
2. Use OD's native powered Vite preview first. From `frontend/`, run:

   `/home/catmiser/.hermes/node/bin/node scripts/build-od-native-preview.mjs`

3. Run the native verifier:

   `/home/catmiser/.hermes/node/bin/node scripts/verify-od-native-preview.mjs`

4. In OD select/refresh `frontend/index.html`. OD's `/powered/` route recognizes
   the standard Vite `/src/...` entry, substitutes sibling `dist/index.html`,
   and rewrites `/assets/*` to `dist/assets/*`.

5. The native builder compiles `VITE_OD_PREVIEW=true`; the real React app then
   uses `src/odPreviewData.js` and does not call Supabase in preview mode.

6. Only if the native powered route is unsuitable, use the fallback builder:

   `/home/catmiser/.hermes/node/bin/node scripts/build-od-preview.mjs`

   followed by:

   `/home/catmiser/.hermes/node/bin/node scripts/verify-od-preview.mjs`

   The fallback artifact is `frontend/od-preview-built.html`. It must be
   self-contained: one inline `<style>`, one inline bundle `<script>`, no
   stylesheet/script asset tags in the document head, and no script closing-tag
   text inside the module body.
7. Refresh the selected file in Open Design and inspect the visual preview. A
   successful build or a text response is not visual verification.

Never claim completion when OD still shows source text, a blank frame, stale
assets, or an old screenshot. Do not open `frontend/index.html` with `file://`,
start a dev server as a substitute for OD, or replace the Vite/React app with
the single-file web-prototype seed. Do not use the external browser for this
workflow.

## Terminal rules

- Use the Hermes Node runtime above; `npm` may not be on PATH.
- Keep checks compact; do not print the minified bundle into the chat.
- Do not use fragile shell regexes containing `</script>`; use the verifier.
- Supabase remains runtime data only; preview data comes from the project's
  existing preview-data module and must not require production credentials.
