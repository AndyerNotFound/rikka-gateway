// 代理服务层 — 一般不用动, 改规则去 rules.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const RULES_FILE = path.join(__dirname, 'rules.js');
let rules = loadRules();

function loadRules() {
  delete require.cache[require.resolve(RULES_FILE)];
  const r = require(RULES_FILE);
  console.log('[gw] rules loaded');
  return r;
}

// 热重载: rules.js 变更时重新加载
let reloadTimer = null;
fs.watch(RULES_FILE, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    try { rules = loadRules(); }
    catch (e) { console.error('[gw!!] rules reload failed (沿用上一版):', e.message); }
  }, 100);
});

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
  'content-encoding', 'content-length']);

function stripHop(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

let openaiSvgCache = null;
function patchHtml(t) {
  for (const [pat, rep] of rules.htmlRewrites) t = t.replace(pat, rep);
  if (openaiSvgCache === null) {
    try { openaiSvgCache = fs.readFileSync(path.join(__dirname, 'assets', 'openai.svg'), 'utf8'); }
    catch { openaiSvgCache = ''; }
  }
  const js = rules.js.replace('__OPENAI_SVG__', JSON.stringify(openaiSvgCache));
  t = t.replace('</head>', `<style>${rules.css}</style></head>`);
  t = t.replace('</body>', `<script>${js}</script></body>`);
  return t;
}

function patchJs(list, body) {
  let t = body.toString('utf8');
  for (const [oldS, newS] of list) t = t.split(oldS).join(newS);
  return Buffer.from(t, 'utf8');
}

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  const urlPath = new URL(req.url, 'http://x').pathname;

  const headers = stripHop(req.headers);
  delete headers['accept-encoding']; // 拿未压缩内容便于改写

  // 静态覆盖: rules.staticOverrides 里配置的路径直接回本地文件 (AI图标/品牌资源等)
  if (rules.staticOverrides && rules.staticOverrides[urlPath]) {
    const fp = path.join(__dirname, rules.staticOverrides[urlPath]);
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ct = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(fp)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache', 'Content-Length': data.length });
      res.end(data);
    });
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const upReq = http.request({
      host: rules.upstream.host, port: rules.upstream.port,
      path: req.url, method: req.method, headers,
    }, (upRes) => {
      const ctype = (upRes.headers['content-type'] || '').toLowerCase();
      const isStream = ctype.includes('text/event-stream');

      if (isStream) {
        // SSE: pipe 逐块透传, 无缓冲
        console.log(`[gw-sse] OPEN ${req.url} (${(Date.now() - t0) / 1000}s)`);
        res.writeHead(upRes.statusCode, {
          ...stripHop(upRes.headers),
          Connection: 'close',
          'Transfer-Encoding': 'chunked',
        });
        upRes.pipe(res); // node stream 原生逐块转发, 有数据即发
        upRes.on('end', () => {
          console.log(`[gw-sse] CLOSE ${req.url} (${(Date.now() - t0) / 1000}s)`);
          res.end();
        });
        upRes.on('error', () => res.end());
        return;
      }

      const buf = [];
      upRes.on('data', (c) => buf.push(c));
      upRes.on('end', () => {
        let data = Buffer.concat(buf);
        if (upRes.statusCode === 200 && ctype.includes('text/html')) {
          data = Buffer.from(patchHtml(data.toString('utf8')), 'utf8');
        } else if (upRes.statusCode === 200 && ctype.includes('javascript') && rules.jsRewrites[urlPath]) {
          data = patchJs(rules.jsRewrites[urlPath], data);
        } else if (upRes.statusCode === 200 && ctype.includes('application/json') && rules.apiRewrites[urlPath]) {
          try {
            const obj = JSON.parse(data.toString('utf8'));
            data = Buffer.from(JSON.stringify(rules.apiRewrites[urlPath](obj)), 'utf8');
          } catch (e) { console.error(`[gw] API rewrite failed ${urlPath}:`, e.message); }
        }
        console.log(`[gw] ${upRes.statusCode} ${req.method} ${req.url} ${(Date.now() - t0) / 1000}s ${data.length}B`);
        res.writeHead(upRes.statusCode, {
          ...stripHop(upRes.headers),
          'Content-Length': data.length,
        });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    });
    upReq.on('error', (e) => {
      console.error(`[gw!!] ${req.method} ${req.url} -> 502 ${e.message}`);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(String(e.message));
    });
    if (body.length) upReq.write(body);
    upReq.end();
  });
});

const { host, port } = rules.listen;
server.listen(port, host, () => {
  console.log(`[gw] listening ${host}:${port} -> ${rules.upstream.host}:${rules.upstream.port} (rules hot-reload on)`);
});
