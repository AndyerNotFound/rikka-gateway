// 网关改写规则 — 改完保存即自动生效(无需重启)
module.exports = {
  // 基础配置
  upstream: { host: '127.0.0.1', port: 8080 },
  listen: { host: '0.0.0.0', port: 9000 },

  // 注入 CSS
  css: `
div:has(>textarea[class*="min-h-"]){display:grid!important;grid-template-columns:auto 1fr auto auto;align-items:end;gap:4px 8px}
div:has(>textarea[class*="min-h-"])>textarea{grid-area:1/2/2/3;min-height:2.25rem!important;max-height:9rem!important;field-sizing:content;padding-top:.4rem!important;padding-bottom:.4rem!important}
div:has(>textarea[class*="min-h-"])>div[class*="justify-between"]{display:contents}
div:has(>textarea[class*="min-h-"])>div[class*="justify-between"]>div[class*="flex-wrap"]{grid-area:1/1/2/2;display:flex!important;flex-wrap:nowrap!important}
div:has(>textarea[class*="min-h-"])>div[class*="justify-between"]>div[class*="shrink-0"]{display:contents}
div:has(>textarea[class*="min-h-"])>div[class*="justify-between"]>div[class*="shrink-0"]>button:not([class*="max-w-"]):not([class*="size-9"]){grid-area:1/3/2/4;justify-self:end}
div:has(>textarea[class*="min-h-"])>div[class*="justify-between"]>div[class*="shrink-0"]>button[class*="size-9"]{grid-area:1/4/2/5;justify-self:end}
div:has(>textarea[class*="min-h-"])>*:not(textarea):not([class*="justify-between"]){grid-column:1/-1}
div:has(>textarea[class*="min-h-"]) div[class*="flex-wrap"]{position:relative}
div:has(>textarea[class*="min-h-"]) div[class*="flex-wrap"]>*:nth-child(4),
div:has(>textarea[class*="min-h-"]) div[class*="flex-wrap"]>*:nth-child(5),
div:has(>textarea[class*="min-h-"]) div[class*="flex-wrap"]>*:nth-child(6){position:absolute!important;opacity:0!important;pointer-events:none!important}
@media(min-width:768px){
[data-slot="sidebar-container"]{display:flex!important;left:0!important;transform:none!important}
[data-slot="sidebar-gap"]{width:var(--sidebar-width,16rem)!important}
}`,

  // 注入 JS:
  // 1) 被隐藏的3个按钮以"图标+文字"菜单项进+号下拉菜单, 点击转发原按钮
  // 2) 模型选择按钮搬进窗口顶部标题栏右侧 (CSS fixed 会被 transform 祖先劫持, 必须搬 DOM)
  js: `
var OPENAI_SVG=__OPENAI_SVG__;
(function(){
  function q(sel){return document.querySelector(sel)}
  function enhanceMenu(menu){
    if(menu.__gw)return;menu.__gw=1;
    if(!/min-w-36/.test(menu.className||''))return;
    var wrap=q('div[class*="flex-wrap"]');
    if(!wrap)return;
    var btns=[wrap.children[3],wrap.children[4],wrap.children[5]].filter(Boolean);
    if(btns.length<3)return;
    btns.forEach(function(b){
      var label=b.title||b.getAttribute('aria-label')||'';
      var it=document.createElement('div');
      it.setAttribute('role','menuitem');
      it.style.cssText='display:flex;align-items:center;gap:.6rem;padding:.45rem .65rem;margin:0 .3rem;border-radius:.4rem;cursor:pointer;font-size:.875rem;color:hsl(var(--foreground));user-select:none';
      it.onmouseenter=function(){it.style.background='hsl(var(--muted))'};
      it.onmouseleave=function(){it.style.background=''};
      it.innerHTML=b.innerHTML;
      var span=document.createElement('span');
      span.textContent=label;
      it.appendChild(span);
      it.addEventListener('pointerdown',function(ev){ev.preventDefault();ev.stopPropagation()});
      it.addEventListener('click',function(ev){ev.stopPropagation();b.click()});
      menu.insertBefore(it,menu.firstChild);
    });
  }
  function moveModelPill(){
    var pill=q('button[class*="max-w-56"]');
    if(!pill)return;
    var header=q('div.flex.items-center.gap-2.border-b');
    if(!header)return;
    if(pill.parentElement===header)return;
    pill.style.marginLeft='auto';
    header.appendChild(pill);
  }
  var gwPending=false;
  new MutationObserver(function(){
    if(gwPending)return;gwPending=true;
    requestAnimationFrame(function(){
      gwPending=false;
      document.querySelectorAll('[role="menu"]').forEach(enhanceMenu);
      moveModelPill();
    });
  }).observe(document.body,{childList:true,subtree:true});
  moveModelPill();
  // Codex 化: 品牌字换 Codex + 首页吉祥物换 OpenAI logo (继承 text-primary 颜色)
  function codexify(){
    var logo=[].find.call(document.querySelectorAll('span'),function(s){return s.textContent.trim()==='RikkaHub'});
    if(logo)logo.textContent='Codex';
    var mascot=q('svg[class*="size-16"]');
    if(mascot&&!mascot.__cx){
      mascot.__cx=1;
      var span=document.createElement('span');
      span.innerHTML=OPENAI_SVG.replace('width="1em"','width="4rem"').replace('height="1em"','height="4rem"');
      var svg=span.firstChild;
      svg.style.color=mascot.style.color||'';
      svg.setAttribute('class',mascot.getAttribute('class')||'');
      mascot.replaceWith(svg);
    }
  }
  var cxPending=false;
  new MutationObserver(function(){
    if(cxPending)return;cxPending=true;
    requestAnimationFrame(function(){cxPending=false;codexify()});
  }).observe(document.body,{childList:true,subtree:true});
  codexify();
})();`,

  // 静态资源覆盖: 路径 -> 本地文件 (相对 gateway 目录)
  staticOverrides: {
    '/favicon.ico': 'assets/codex.svg',
    '/__gw-assets/codex.svg': 'assets/codex.svg',
  },

  // HTML 正则改写 (css/js 字段由 server 自动注入到 </head>/<body> 前)
  htmlRewrites: [
    [/lang="en"/g, 'lang="zh-CN"'],
    [/bg-primary animate-bounce/g, 'bg-red-500 animate-pulse'],
    [/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/svg+xml" href="/__gw-assets/codex.svg">'],
  ],

  // JS 资产字符串替换: { 资产路径: [[旧串, 新串], ...] }
    // 注意: 资产名里的 hash 随上游构建变化, 属于具体部署细节, 此处用占位符。
  jsRewrites: {
    // '/assets/input-<HASH>.js': [
    //   ['meta:{title:"MyApp"}', 'meta:{title:"My App"}'],
    // ],
    // '/assets/mermaid-<HASH>.js': [
    //   ['label:r("presets.off.label")', 'label:"None"'],
    // ],
  },

  // API JSON 改写: { API路径: (json) => json }
  apiRewrites: {
    '/api/conversations': (data) =>
      data.map((c) => ({ ...c, title: (c.title || '(untitled)') + ' [gw]' })),
    '/api/folders': (data) => data.map((f) => ({ ...f, name: f.name + ' [gw]' })),
  },
};
