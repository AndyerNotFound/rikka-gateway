<div align="center">

# rikka-gateway

**RikkaHub Web 界面的改写网关 —— 换品牌、改样式、打前端补丁，全程在响应链路上完成，不碰应用本身。**

[![Python](https://img.shields.io/badge/python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

[English](./README.md) · [中文](./README.zh-CN.md)

</div>

---

> **注意：** 本网关**专用于 RikkaHub 的 Web 通道**。自带规则匹配的是 RikkaHub 的 DOM 结构、
> 资产路径和 API 路由 —— 换一个应用不会有任何效果。机制本身是通用的
> （见[编写规则](#编写规则)），替换规则即可适配其它应用。

## 它做什么

开箱自带的规则会给 RikkaHub Web 界面做一套 "Codex" 风格改造：

| 领域 | 改动 |
|---|---|
| 品牌 | 应用标题 / 头部文字 → "Codex"，首页吉祥物换成 OpenAI 风格 logo，自定义 favicon |
| 输入栏 | 紧凑的自增高 textarea，工具行合并到一行 |
| 工具栏 | 3 个溢出按钮折进 "+" 下拉菜单，以图标+文字呈现 |
| 模型选择 | 药丸按钮搬进窗口标题栏（DOM 搬移 —— CSS `fixed` 会被 transform 祖先劫持） |
| 侧栏 | 桌面宽度下保持展开 |
| 文案 | 推理力度预置项显示为普通标签（None/Auto/Low/…）而非 i18n key |
| 其他 | 会话列表标题加 `[gw]` 后缀，一眼识别出经网关代理的页面 |

```
浏览器 ──► 网关 :9000 ──► RikkaHub Web :8080
              │
              ├─ HTML       正则改写 + 注入 CSS/JS
              ├─ JS 资产    打包产物内字符串替换
              ├─ JSON API   结构化变换
              └─ 静态资源   本地文件覆盖（favicon、logo）
```

所有规则集中在**一个小文件**里（`rules.py` 或 `rules.js`）。保存后网关在
**下一次请求**时自动生效 —— 不重启、不重建。

## 快速开始

```bash
git clone <repo> rikka-gateway
cd rikka-gateway

# 1. 确认 RikkaHub Web 可达（默认 127.0.0.1:8080），端口不同就改一下
$EDITOR rules.py          # UPSTREAM = ("127.0.0.1", 8080)

# 2. 启动（Python 版）—— 或 node gateway.js 跑 Node 版
./rgw start

# 3. 打开 http://localhost:9000 —— 同一个应用，出口处打好补丁
```

## 编写规则

四层改写都在 `rules.py`（或 `rules.js`）里：

### 1. HTML 正则 —— 注入 CSS/JS、替换字符串

```python
HTML_REWRITES = [
    (r"</head>", "<style>/* your css */</style>"),
    (r"bg-primary animate-bounce", "bg-red-500 animate-pulse"),
]
```

### 2. JS 资产 —— 改打包产物里的文案/默认值

RikkaHub 每次发版构建 hash 都会变，所以这里用占位路径。升级后跑 `rgw check`，
它会精确列出哪个文件的哪个锚点失配了：

```python
JS_REWRITES = {
    # "/assets/input-<HASH>.js": [
    #     ('meta:{title:"RikkaHub Web"', 'meta:{title:"My Web"'),
    # ],
}
```

### 3. JSON API —— 结构化变换

```python
API_REWRITES = {
    "/api/conversations": lambda data: [
        {**c, "title": (c["title"] or "(untitled)") + " [gw]"} for c in data
    ],
}
```

### 4. 静态覆盖 —— 已知路径直接回本地文件

```python
STATIC_OVERRIDES = {
    "/favicon.ico": "assets/codex.svg",
}
```

大部分 UI 改动其实不走正则 —— 而是注入的 **JS**（`rules.py` 里的 `JS` 字段）：
基于 MutationObserver 的 DOM 调整，能扛住 React 重渲染。改它就能决定补什么、怎么补。

## `rgw` CLI

```text
rgw start        后台启动（nohup，日志 gateway.log）
rgw stop         停止
rgw restart      重启
rgw status       进程 / 端口 / 上游 / 日志概览
rgw log [N|-f]   查看或跟随日志
rgw check        规则校验 + JS 锚点匹配 + API 可达性  ← RikkaHub 升级后先跑这个
rgw smoke        经网关的端到端冒烟测试
rgw url          打印局域网访问地址
rgw edit         编辑 rules.py（热重载，无需重启）
```

RikkaHub 每次更新后跑一遍 `rgw check` —— 产物 hash 会变，它会验证每条 JS 锚点
是否仍命中，并告诉你哪些规则要改。

## 文件说明

| 文件 | 职责 |
|---|---|
| `gateway.py` / `gateway.js` | 入口（按运行时二选一） |
| `server.py` / `server.js` | 代理层 —— SSE 透传、热重载；一般不用动 |
| `rules.py` / `rules.js` | **RikkaHub 补丁集** —— 改完保存即生效 |
| `rgw` | 管理 CLI |
| `assets/` | 本地覆盖资源（favicon、logo） |

## 配置

| 配置项 | 默认值 | 位置 |
|---|---|---|
| RikkaHub Web 地址 | `127.0.0.1:8080` | `rules.py` -> `UPSTREAM` |
| 监听地址 | `0.0.0.0:9000` | `rules.py` -> `LISTEN` |
| 运行时目录 | `~/.rgw` | 环境变量 `RGW_HOME` |
| 编辑器 | `vi` | 环境变量 `EDITOR` |

## 工作原理

```
请求 → 剥离逐跳头 + Accept-Encoding
     → 是静态覆盖路径？        → 回本地文件
     → 是 SSE？                → chunked 透传，逐块 flush
     → HTML (200)              → 正则改写 + 在 </head>/</body> 前注入 css/js
     → JS  (200, 已知路径)     → 字符串替换
     → JSON (200, 已知路径)    → 应用变换函数
     → 恢复 Content-Length，回给客户端
```

`rules.py` 在 mtime 变化时自动重新加载，改动在下一次请求即生效 —— 全程零重启。

## 局限

- 针对 RikkaHub Web 界面调校；类名 / 资产锚点在官方改版后会失配（这正是 `rgw check` 存在的意义）
- 单进程 —— 个人使用足够，未做高并发压测
- HTML/JS/JSON 改写需要未压缩响应，因此网关会剥离 `Accept-Encoding`
- 示例 CSS 用到 `field-sizing: content`，需要较新的 Chromium 内核浏览器

## 许可证

MIT
