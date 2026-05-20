# microsoft/TRELLIS.2

Source: https://huggingface.co/spaces/microsoft/TRELLIS.2/agents.md

To use this application (microsoft/TRELLIS.2: Generate a 3D model from an uploaded image):

API schema: GET https://microsoft-trellis-2.hf.space/gradio_api/info

Config (find fn_index): GET https://microsoft-trellis-2.hf.space/config -> dependencies[i].id where api_name matches API schema endpoint

Join the queue: POST https://microsoft-trellis-2.hf.space/gradio_api/queue/join (pass {"data": [...], "fn_index": <from-config>, "session_hash": "<random-uuid>"})

Stream results: GET https://microsoft-trellis-2.hf.space/gradio_api/queue/data?session_hash=<same-uuid>

File inputs: POST https://microsoft-trellis-2.hf.space/gradio_api/upload -F "files=@file.ext", use as: {"path": "<returned-path>", "meta": {"_type": "gradio.FileData"}, "orig_name": "file.ext"}

Auth: Bearer $HF_TOKEN (https://huggingface.co/settings/tokens)
