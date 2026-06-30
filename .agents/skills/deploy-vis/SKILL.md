---
name: deploy-vis
description: Automates the deployment of local HTML/CSS/JS visualizations into the Supabase project_visualizations dashboard. Triggers automatically when the user says "задеплой в визуализацию".
---

# Deploy Visualizations Skill

Use this skill when the user asks you to deploy or upload a visualization to their dashboard sandbox.

## Prerequisites
1. Ensure the user has filled out `.env.local` in the project root with `SUPABASE_EMAIL`, `SUPABASE_PASSWORD`, and `SUPABASE_PROJECT_ID`.
2. Ensure you have the HTML, CSS, and JS files for the visualization.

## Execution Steps
1. **Combine the code**: Combine the HTML, CSS, and JS into a single HTML file (e.g., `combined.html`). Place `<style>` and `<script>` blocks within the HTML correctly.
2. **Run Deploy Script**: Run the Node.js deployment script located at `.agents/skills/deploy-vis/scripts/deploy.mjs`.
   ```bash
   node .agents/skills/deploy-vis/scripts/deploy.mjs "<Visualization Name>" path/to/combined.html
   ```
3. **Report**: If the script is successful, tell the user that the visualization has been deployed and is available in their dashboard.

## Notes
- The script uses the credentials from `.env.local` to authenticate with Supabase API.
- Do NOT output the user's password in the terminal or logs.
