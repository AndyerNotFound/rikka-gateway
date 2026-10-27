<div align="center">

# rikka-gateway

**A rewriting gateway for the RikkaHub web UI — rebrand, restyle, and patch the frontend in flight, without touching the app itself.**

[![Python](https://img.shields.io/badge/python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

[English](./README.md) · [中文](./README.zh-CN.md)

</div>

---

> **Note:** this gateway targets **RikkaHub's web channel specifically**. The bundled
> rules match RikkaHub's DOM structure, asset names, and API paths — they will not
> do anything useful against a different app. The mechanism itself is generic
> (see [Writing rules](#writing-rules)), so you can adapt it to other apps by
> replacing the rules.

## What it does

Out of the box, the bundled rules give RikkaHub's web UI a "Codex" treatment:

| Area | Change |
|---|---|
| Branding | app title / header text → "Codex", OpenAI-style logo as home mascot, custom favicon |
| Input bar | compact auto-growing textarea, tools row moved onto one line |
| Toolbar | 3 overflow buttons folded into the "+" dropdown as icon+label items |
| Model picker | pill relocated into the window title bar (DOM move — CSS `fixed` is hijacked by transform ancestors) |
| Sidebar | always-expanded at desktop widths |
| Copy | reasoning effort presets rendered as plain labels (None/Auto/Low/…) instead of i18n keys |
| Misc | listing titles get a `[gw]` suffix so proxied pages are recognizable at a glance |

```
browser ──► gateway :9000 ──► RikkaHub web :8080
                │
                ├─ HTML       regex rewrites + injected CSS/JS
                ├─ JS assets  string replacement in bundles
                ├─ JSON APIs  structured transforms
                └─ static     local file overrides (favicon, logos)
```

Rules live in **one small file** (`rules.py` or `rules.js`). Save it, and the
gateway picks up changes on the **next request** — no restart, no rebuild.

## Quick start

```bash
git clone <repo> rikka-gateway
cd rikka-gateway

# 1. make sure RikkaHub web is reachable (default: 127.0.0.1:8080)
#    and adjust the port if yours differs
$EDITOR rules.py          # UPSTREAM = ("127.0.0.1", 8080)

# 2. start (Python) — or `node gateway.js` for the Node version
./rgw start

# 3. open http://localhost:9000 — same app, patched on the way out
```

## Writing rules

All four rewrite layers are in `rules.py` (or `rules.js`):

### 1. HTML regex — inject CSS/JS, swap strings

```python
HTML_REWRITES = [
    (r"</head>", "<style>/* your css */</style>"),
    (r"bg-primary animate-bounce", "bg-red-500 animate-pulse"),
]
```

### 2. JS assets — change bundled copy/defaults

Build hashes rotate on every RikkaHub release, so paths are placeholders.
After an update, run `rgw check` — it lists exactly which anchors missed
and on which files:

```python
JS_REWRITES = {
    # "/assets/input-<HASH>.js": [
    #     ('meta:{title:"RikkaHub Web"', 'meta:{title:"My Web"'),
    # ],
}
```

### 3. JSON APIs — structured transforms

```python
API_REWRITES = {
    "/api/conversations": lambda data: [
        {**c, "title": (c["title"] or "(untitled)") + " [gw]"} for c in data
    ],
}
```

### 4. Static overrides — serve local files for known paths

```python
STATIC_OVERRIDES = {
    "/favicon.ico": "assets/codex.svg",
}
```

Most of the UI changes are not regex at all — they're the **injected JS**
(`rules.py` → `JS`): MutationObserver-based DOM tweaks that survive
re-renders. Edit that to change what gets patched and how.

## The `rgw` CLI

```text
rgw start        start in background (nohup, log to gateway.log)
rgw stop         stop
rgw restart      restart
rgw status       process / port / upstream / log overview
rgw log [N|-f]   show or follow logs
rgw check        rule validation + JS anchor matching + API reachability  ← run after RikkaHub updates
rgw smoke        end-to-end smoke test through the gateway
rgw url          print LAN access URL
rgw edit         edit rules.py (hot reload, no restart)
```

After every RikkaHub update, run `rgw check` once — bundle hashes change, so
it verifies each JS anchor still matches and tells you which rules to update.

## Files

| File | Role |
|---|---|
| `gateway.py` / `gateway.js` | entry point (pick one runtime) |
| `server.py` / `server.js` | proxy layer — SSE passthrough, hot reload; rarely needs edits |
| `rules.py` / `rules.js` | **the RikkaHub patch set** — edit and save, no restart |
| `rgw` | management CLI |
| `assets/` | local overrides (favicon, logos) |

## Configuration

| Setting | Default | Where |
|---|---|---|
| RikkaHub web address | `127.0.0.1:8080` | `rules.py` -> `UPSTREAM` |
| Listen address | `0.0.0.0:9000` | `rules.py` -> `LISTEN` |
| Runtime dir | `~/.rgw` | env `RGW_HOME` |
| Editor | `vi` | env `EDITOR` |

## How it works

```
request -> strip hop-by-hop + Accept-Encoding
        -> static override path?    -> serve local file
        -> SSE?                     -> chunked passthrough, flush per chunk
        -> HTML (200)               -> regex rewrites + inject css/js before </head>/</body>
        -> JS  (200, known path)    -> string replacement
        -> JSON (200, known path)   -> apply transform fn
        -> restore Content-Length, respond
```

`rules.py` is re-imported whenever its mtime changes, so edits take effect on
the next request — zero restarts.

## Limits

- Tuned for RikkaHub's web UI; class names / asset anchors break on redesigns (that's what `rgw check` is for)
- Single-process — fine for personal use, not load-tested
- HTML/JS/JSON rewrites need uncompressed responses, so the gateway strips `Accept-Encoding`
- The sample CSS uses `field-sizing: content` — needs a modern Chromium-based browser

## License

MIT
