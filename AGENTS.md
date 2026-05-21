# microsoft/TRELLIS.2

Source: https://huggingface.co/spaces/microsoft/TRELLIS.2/agents.md

To use this application (microsoft/TRELLIS.2: Generate a 3D model from an uploaded image):

API schema: GET https://microsoft-trellis-2.hf.space/gradio_api/info

Config (find fn_index): GET https://microsoft-trellis-2.hf.space/config -> dependencies[i].id where api_name matches API schema endpoint

Join the queue: POST https://microsoft-trellis-2.hf.space/gradio_api/queue/join (pass {"data": [...], "fn_index": <from-config>, "session_hash": "<random-uuid>"})

Stream results: GET https://microsoft-trellis-2.hf.space/gradio_api/queue/data?session_hash=<same-uuid>

File inputs: POST https://microsoft-trellis-2.hf.space/gradio_api/upload -F "files=@file.ext", use as: {"path": "<returned-path>", "meta": {"_type": "gradio.FileData"}, "orig_name": "file.ext"}

Auth: Bearer $HF_TOKEN (https://huggingface.co/settings/tokens)

# Frontend Design Guidance

Source: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design

When changing the frontend, use the referenced plugin as a design brief rather than as a runtime dependency:

- Choose a clear visual direction before editing UI. For this project, prefer an operational planning-room feel: precise, dense, calm, with warm signal colors.
- Avoid generic AI-looking UI patterns such as default Inter-only typography, blue/purple gradient-heavy glass, and evenly spread accent colors.
- Use a distinctive but readable Cyrillic-friendly type pairing, restrained panels, tactile controls, and deliberate motion.
- Keep the first screen as the actual planning workspace. Do not turn this app into a marketing landing page.
- Preserve workflow density: project list, status metrics, map/Gantt surfaces, task panels, messenger, and profile tools should stay scannable and efficient.
- Verify frontend changes with a local build and, when a dev server is running, a browser check.
