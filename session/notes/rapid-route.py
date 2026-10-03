import json, urllib.request, uuid
BASE = "http://127.0.0.1:8080"
MODEL = "general-text-speculator"
SESSION = "rapid-" + uuid.uuid4().hex[:8]
turns = [
    ("code", "Write a tiny C++ function that prints hello."),
    ("text", "Write a one-line limerick about rain. No code."),
    ("image", "Generate an image: a red apple on a white background."),
]
def post(path, messages):
    body = {"model": MODEL, "messages": messages, "max_tokens": 16, "stream": False, "enable_thinking": False}
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-session-id": SESSION},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()

print("session", SESSION)
hist = []
for kind, prompt in turns:
    hist.append({"role": "user", "content": prompt})
    status, hdrs, raw = post("/v1/chat/completions/route", hist)
    print(f"{kind} http={status} alias={hdrs.get('x-green-roomz-effective-alias')} reason={hdrs.get('x-green-roomz-route-reason')}")
    try:
        hist.append({"role": "assistant", "content": json.loads(raw)["choices"][0]["message"]["content"][:120]})
    except Exception:
        hist.append({"role": "assistant", "content": ""})
