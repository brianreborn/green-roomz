import json, urllib.request, urllib.error, uuid, sys
BASE = "http://127.0.0.1:8080"
MODEL = "general-text-speculator"

def post(path, prompt, extra=None, session=None):
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 16,
        "stream": False,
        "enable_thinking": False,
    }
    if extra:
        body.update(extra)
    headers = {"Content-Type": "application/json"}
    if session:
        headers["x-session-id"] = session
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            raw = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        hdrs = {k.lower(): v for k, v in e.headers.items()}
        raw = e.read()
        status = e.code
    alias = hdrs.get("x-green-roomz-effective-alias", "")
    reason = hdrs.get("x-green-roomz-route-reason", "")
    snippet = ""
    try:
        snippet = json.loads(raw)["choices"][0]["message"]["content"][:80]
    except Exception:
        snippet = raw[:80].decode("utf-8", "replace")
    return status, alias, reason, snippet

cases = [
    ("cpp-hello", "Write a tiny C++ function that prints hello.", None, None),
    ("limerick", "Write a one-line limerick about rain. No code.", None, None),
    ("red-apple-text", "a red apple", None, None),
    ("slash-code", "/code hello world function", None, None),
    ("slash-text", "/text write a limerick", None, None),
    ("slash-image", "/image a red apple", None, None),
    ("slash-auto", "/auto write a limerick about rain", None, None),
    ("lock-no-slash", "Write a tiny C++ function that prints hello.", {"lock_alias": True}, None),
    ("slash-overrides-lock", "/code hello world", {"lock_alias": True}, None),
]
print("session-pin-model", MODEL)
for name, prompt, extra, sess in cases:
    status, alias, reason, snippet = post("/v1/chat/completions/route", prompt, extra, sess)
    print(f"{name} http={status} alias={alias} reason={reason}")
