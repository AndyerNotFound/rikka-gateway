"""代理服务层 — 一般不用动, 改规则去 rules.py"""
import http.client, importlib, json, os, re, time
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import rules

HOP = {"connection","keep-alive","proxy-authenticate","proxy-authorization",
       "te","trailers","transfer-encoding","upgrade","content-encoding","content-length"}
STREAM_TYPES = ("text/event-stream",)

RULES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.py")
_mtime = 0.0

def get_rules():
    """rules.py 变更时自动热重载"""
    global _mtime, rules
    try:
        m = os.stat(RULES_FILE).st_mtime
        if m != _mtime:
            if _mtime:  # 跳过首次加载的日志
                print(f"[gw] rules.py changed, reloading...", flush=True)
            err = None
            try:
                importlib.reload(rules)
                err = rules.validate()
            except Exception as e:
                err = f"reload failed: {e}"
            if err:
                print(f"[gw!!] {err} (使用上一版规则)", flush=True)
                importlib.reload(rules) if err.startswith("reload") else None
            _mtime = m
    except OSError:
        pass
    return rules

def patch_js(js_rules, path, body: bytes) -> bytes:
    for old, new in js_rules:
        body = body.replace(old.encode(), new.encode())
    return body

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        pass

    def proxy(self):
        t0 = time.time()
        R = get_rules()
        url = self.path
        p = urlsplit(url).path
        # 静态覆盖: STATIC_OVERRIDES 里配置的路径直接回本地文件 (图标/品牌资源等)
        fp = R.STATIC_OVERRIDES.get(p)
        if fp:
            try:
                with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), fp), "rb") as f:
                    sdata = f.read()
                ct = {".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}.get(
                    os.path.splitext(fp)[1], "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", ct)
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(sdata)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(sdata)
            except OSError:
                self.send_error(404)
            print(f"[gw] static {self.command} {p} -> {fp}", flush=True)
            return
        body = None
        if self.command not in ("GET", "HEAD", "OPTIONS"):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else None
        hdrs = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        hdrs.pop("Accept-Encoding", None)
        try:
            up = http.client.HTTPConnection(*R.UPSTREAM, timeout=60)
            up.request(self.command, url, body=body, headers=hdrs)
            r = up.getresponse()
        except Exception as e:
            print(f"[gw!!] {self.command} {self.path} -> 502 {e}", flush=True)
            self.send_error(502, str(e)); return

        ctype = (r.getheader("Content-Type") or "").lower()
        is_stream = any(s in ctype for s in STREAM_TYPES)

        if is_stream:  # SSE: 不缓冲, 边收边发
            print(f"[gw-sse] OPEN {self.path} ({time.time()-t0:.2f}s)", flush=True)
            self.send_response(r.status)
            for k, v in r.getheaders():
                if k.lower() not in HOP:
                    self.send_header(k, v)
            self.send_header("Connection", "close")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            try:
                while True:
                    chunk = r.read1(8192)  # read1: 有数据就返回, 不凑满(否则小事件被扣到8KB才flush)
                    if not chunk: break
                    for line in chunk.split(b"\n"):
                        if line.startswith(b"event:"):
                            print(f"[gw-sse]   +{time.time()-t0:6.2f}s {self.path} :: {line.decode(errors='replace')}", flush=True)
                    self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
            except Exception:
                pass
            print(f"[gw-sse] CLOSE {self.path} ({time.time()-t0:.1f}s)", flush=True)
            up.close(); self.close_connection = True
            return

        data = r.read()
        up.close()
        if r.status == 200 and "text/html" in ctype:
            t = data.decode("utf-8", "replace")
            for pat, rep in R.HTML_REWRITES:
                t = re.sub(pat, rep, t)
            data = t.encode("utf-8")
        elif r.status == 200 and "javascript" in ctype and p in R.JS_REWRITES:
            data = patch_js(R.JS_REWRITES[p], p, data)
        elif r.status == 200 and "application/json" in ctype and p in R.API_REWRITES:
            try:
                obj = json.loads(data)
                data = json.dumps(R.API_REWRITES[p](obj), ensure_ascii=False).encode("utf-8")
            except Exception as e:
                print(f"[gw] API rewrite failed {p}: {e}", flush=True)
        print(f"[gw] {r.status} {self.command} {self.path} {time.time()-t0:.3f}s {len(data)}B", flush=True)

        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() not in HOP:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = proxy

def main():
    err = rules.validate()
    if err:
        raise SystemExit(f"规则自检失败: {err}")
    print(f"[gw] listening {rules.LISTEN[0]}:{rules.LISTEN[1]} -> {rules.UPSTREAM[0]}:{rules.UPSTREAM[1]} (rules hot-reload on)", flush=True)
    ThreadingHTTPServer(tuple(rules.LISTEN), Handler).serve_forever()
