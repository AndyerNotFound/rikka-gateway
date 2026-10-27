# rikka-gateway

一个极简的「改写代理」：挂在任意 Web 前端前面，按路径改写 HTML / JS / CSS / JSON 响应，
用来做界面微调、品牌替换、注入补丁样式等，无需改动上游一行代码。

```
浏览器 ──► 网关 :9000 ──► 上游 Web :8080
             │
             ├─ HTML  → 正则改写 + 注入 CSS/JS
             ├─ JS 资产 → 字符串替换（改文案/默认值）
             ├─ JSON API → 结构化改写
             └─ 静态路径 → 本地文件覆盖（图标/资源）
```

## 文件

| 文件 | 说明 |
|---|---|
| `gateway.py` / `gateway.js` | 入口（Python / Node 二选一） |
| `server.py` / `server.js` | 代理层，一般不用动（SSE 透传、热重载） |
| `rules.py` / `rules.js` | **规则文件，改完保存即生效**（热重载，无需重启） |
| `rgw` | CLI 管理工具（start/stop/status/log/check/smoke） |
| `assets/` | 静态覆盖用的本地资源 |

## 用法

```bash
./rgw start      # 后台启动，日志在 ~/.rgw/gateway.log
./rgw status     # 进程 / 端口 / 上游 / 最近请求
./rgw check      # 规则自检：正则、静态覆盖、JS 锚点是否仍命中上游、API 改写可达性
./rgw smoke      # 端到端冒烟：经网关请求首页，校验注入与改写是否生效
./rgw log -f     # 跟随日志
./rgw edit       # 编辑 rules.py（保存即生效）
```

运行时产物（日志 / pid / `__pycache__` / 调试页）统一放 `~/.rgw`，可用 `RGW_HOME` 覆盖，
源码目录保持干净。

## 规则怎么改

`rules.py` 里四类改写，按需增删：

1. **HTML_REWRITES** — 正则 `(pattern, replacement)`，可注入 `<style>` / `<script>`
2. **JS_REWRITES** — `{资产路径: [(旧串, 新串), ...]}`，改前端打包产物里的文案/默认值
3. **API_REWRITES** — `{API路径: fn(json) -> json}`，改接口返回
4. **STATIC_OVERRIDES** — `{路径: 本地文件}`，直接覆盖图标等资源

### 关于资产路径里的 hash

打包产物的文件名带构建 hash（如 `input-a1b2c3d4.js`），上游升级就会变。
先跑 `rgw check`，它会把失配的路径和锚点列出来；或直接看浏览器 Network 面板。