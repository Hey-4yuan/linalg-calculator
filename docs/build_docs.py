#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 docs 下的 Markdown 手册打包成一个离线可读的单文件 HTML。

用法：
    pip install markdown
    python docs/build_docs.py

输入：README.md、docs/用户手册.md、docs/技术手册.md、docs/开发者指南.md、docs/测试手册.md
输出：docs/手册.html（无外部依赖，可离线打开、可打印成 PDF）

约定：Markdown 是唯一事实来源，不要手改生成的 HTML。
"""

from __future__ import annotations

import html
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import markdown
except ImportError:
    sys.exit("缺少依赖：pip install markdown")

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "手册.html"

# (文件, 侧边栏标题, 文档短名)
SOURCES = [
    (ROOT / "README.md", "项目总览", "overview"),
    (DOCS / "用户手册.md", "用户手册", "user"),
    (DOCS / "技术手册.md", "技术手册", "tech"),
    (DOCS / "开发者指南.md", "开发者指南", "dev"),
    (DOCS / "测试手册.md", "测试手册", "test"),
    (DOCS / "源码解析.md", "源码解析", "src"),
    (DOCS / "部署-GitHub-Pages.md", "部署：GitHub Pages", "pages"),
    (DOCS / "可行性-iOS端.md", "可行性：iOS 端", "ios"),
    (DOCS / "可行性-视觉模型配置存储.md", "可行性：配置存储", "cfg"),
]

MD_EXT = ["tables", "fenced_code", "toc", "attr_list", "sane_lists", "md_in_html"]

CSS = r"""
:root{
  --bg:#fbfbfa; --panel:#ffffff; --ink:#1f2328; --muted:#5b6470;
  --line:#e3e5e8; --accent:#3b5bdb; --accent-weak:#eef2ff;
  --code-bg:#f4f5f7; --warn-bg:#fff8e6; --warn-line:#e0b34d;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",-apple-system,"Segoe UI",sans-serif;
  font-size:15.5px; line-height:1.75; -webkit-font-smoothing:antialiased;
}
.wrap{display:flex; align-items:flex-start; max-width:1400px; margin:0 auto}
/* ---------- 侧边栏 ---------- */
aside{
  position:sticky; top:0; flex:0 0 268px; width:268px; height:100vh; overflow-y:auto;
  padding:26px 18px 60px; border-right:1px solid var(--line); background:var(--panel);
}
aside .brand{font-weight:700; font-size:16px; letter-spacing:.2px; margin:0 0 4px}
aside .sub{color:var(--muted); font-size:12px; margin-bottom:20px}
aside .doc{margin-bottom:18px}
aside .doc > a{display:block; font-weight:600; font-size:13.5px; color:var(--ink); text-decoration:none; padding:5px 8px; border-radius:6px}
aside .doc > a:hover{background:var(--accent-weak); color:var(--accent)}
aside ul{list-style:none; margin:2px 0 0; padding:0 0 0 8px}
aside li a{display:block; color:var(--muted); text-decoration:none; font-size:12.8px; line-height:1.5;
  padding:3px 8px; border-left:2px solid transparent; border-radius:0 5px 5px 0}
aside li a:hover{color:var(--accent); background:var(--accent-weak); border-left-color:var(--accent)}
aside li.lv3 a{padding-left:20px; font-size:12.2px; opacity:.85}
/* ---------- 正文 ---------- */
main{flex:1 1 auto; min-width:0; padding:34px 44px 120px; max-width:940px}
.doc-sec{padding-bottom:16px}
.doc-sec + .doc-sec{margin-top:28px; border-top:1px solid var(--line); padding-top:34px}
h1{font-size:26px; line-height:1.35; margin:0 0 18px; letter-spacing:.2px}
h2{font-size:19.5px; margin:38px 0 12px; padding-bottom:6px; border-bottom:1px solid var(--line)}
h3{font-size:16px; margin:26px 0 8px}
h4{font-size:14.5px; margin:20px 0 6px; color:var(--muted)}
p{margin:10px 0}
a{color:var(--accent); text-decoration:none; border-bottom:1px solid rgba(59,91,219,.25)}
a:hover{border-bottom-color:var(--accent)}
ul,ol{padding-left:22px; margin:10px 0}
li{margin:4px 0}
li > ul, li > ol{margin:4px 0}
strong{font-weight:600}
hr{border:0; border-top:1px solid var(--line); margin:34px 0}
/* 代码 */
code{font-family:"JetBrains Mono","Cascadia Code",Consolas,"Courier New",monospace;
  font-size:.88em; background:var(--code-bg); padding:.15em .38em; border-radius:4px; border:1px solid var(--line)}
pre{background:var(--code-bg); border:1px solid var(--line); border-radius:8px; padding:14px 16px;
  overflow-x:auto; line-height:1.6; margin:14px 0}
pre code{background:none; border:0; padding:0; font-size:13px; white-space:pre}
/* 表格 */
table{border-collapse:collapse; width:100%; margin:14px 0; font-size:13.8px; display:block; overflow-x:auto}
table thead th{background:#f2f4f7; text-align:left; font-weight:600; white-space:nowrap}
th,td{border:1px solid var(--line); padding:7px 10px; vertical-align:top}
tbody tr:nth-child(even){background:#fcfcfd}
/* 引用 / 提示 */
blockquote{margin:14px 0; padding:10px 14px; background:var(--warn-bg);
  border-left:3px solid var(--warn-line); border-radius:0 6px 6px 0; color:#4a3f22}
blockquote p{margin:4px 0}
/* 页头信息条 */
.meta{display:flex; gap:10px; flex-wrap:wrap; margin:0 0 26px}
.pill{font-size:12px; color:var(--muted); background:var(--panel); border:1px solid var(--line);
  padding:3px 10px; border-radius:999px}
/* 回到顶部 */
.top{position:fixed; right:22px; bottom:22px; width:38px; height:38px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; background:var(--panel);
  border:1px solid var(--line); color:var(--muted); text-decoration:none; font-size:16px;
  box-shadow:0 2px 10px rgba(0,0,0,.06)}
.top:hover{color:var(--accent); border-color:var(--accent)}
footer{color:var(--muted); font-size:12px; margin-top:50px; padding-top:16px; border-top:1px solid var(--line)}
/* 窄屏 */
@media (max-width:900px){
  .wrap{display:block}
  aside{position:static; width:auto; height:auto; border-right:0; border-bottom:1px solid var(--line); padding:18px 16px}
  aside ul{display:none}
  main{padding:22px 16px 90px; max-width:none}
  h1{font-size:22px}
  table{font-size:13px}
}
/* 打印 */
@media print{
  aside,.top{display:none}
  body{background:#fff; font-size:11.5pt}
  main{padding:0; max-width:none}
  .doc-sec + .doc-sec{page-break-before:always}
  h2,h3{page-break-after:avoid}
  pre,table,blockquote{page-break-inside:avoid}
  a{color:inherit; border:0}
}
"""


def norm_key(text: str) -> str:
    """把标题/锚点归一化成可比较的键：只保留字母、数字、汉字。"""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", text).lower()


def convert(md_path: Path, prefix: str) -> tuple[str, list[tuple[int, str, str]]]:
    """转换单个 Markdown，返回 (html, [(level, id, title)])。"""
    text = md_path.read_text(encoding="utf-8")

    # 跨文档链接：docs/xxx.md / xxx.md → 对应 section 锚点
    for path, _, short in SOURCES:
        for form in (f"docs/{path.name}", path.name):
            text = text.replace(f"]({form})", f"](#doc-{short})")

    md = markdown.Markdown(extensions=MD_EXT)
    body = md.convert(text)

    nav: list[tuple[int, str, str]] = []
    keys: dict[str, str] = {}
    heading_re = re.compile(r'<h([23])(?:\s+id="[^"]*")?\s*>(.*?)</h\1>', re.S)
    counter = {"n": 0}

    def repl(m: re.Match) -> str:
        level = int(m.group(1))
        inner = m.group(2)
        plain = re.sub(r"<[^>]+>", "", inner)
        counter["n"] += 1
        hid = f"{prefix}-h{counter['n']}"
        nav.append((level, hid, html.unescape(plain)))
        keys.setdefault(norm_key(plain), hid)
        return f'<h{level} id="{hid}">{inner}</h{level}>'

    body = heading_re.sub(repl, body)

    # 文内目录锚点：#1-安装与启动 → 归一化后匹配实际标题 id
    def fix_anchor(m: re.Match) -> str:
        target = m.group(1)
        if target.startswith("doc-"):
            return m.group(0)
        hit = keys.get(norm_key(target))
        return f'<a href="#{hit}">' if hit else m.group(0)

    body = re.sub(r'<a href="#([^"]+)">', fix_anchor, body)
    return body, nav


def build() -> None:
    sections: list[tuple[str, str, str, str]] = []  # (short, title, html, nav)
    for path, title, short in SOURCES:
        if not path.exists():
            print(f"跳过（不存在）：{path}")
            continue
        body, nav = convert(path, short)
        sections.append((short, title, body, nav))

    nav_html = []
    for short, title, _, nav in sections:
        items = "\n".join(
            f'<li class="lv{level}"><a href="#{hid}">{html.escape(text)}</a></li>'
            for level, hid, text in nav
        )
        nav_html.append(
            f'<div class="doc"><a href="#doc-{short}">{html.escape(title)}</a>'
            f"<ul>{items}</ul></div>"
        )

    body_html = []
    for short, title, body, _ in sections:
        body_html.append(f'<section class="doc-sec" id="doc-{short}">{body}</section>')

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    sources = "、".join(p.name for p, _, _ in SOURCES if p.exists())

    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>线性代数计算器 · 技术文档合集</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<aside>
  <div class="brand">线性代数计算器</div>
  <div class="sub">技术文档合集 · 离线版</div>
  {"".join(nav_html)}
</aside>
<main>
  <div class="meta">
    <span class="pill">文档版本 v1.0</span>
    <span class="pill">产物构建 2026-10-18</span>
    <span class="pill">生成于 {stamp}</span>
    <span class="pill">Ctrl/⌘ + P 可打印为 PDF</span>
  </div>
  {"".join(body_html)}
  <footer>本文档由 docs/build_docs.py 从 {html.escape(sources)} 生成；请修改 Markdown 后重新构建，不要直接编辑本文件。</footer>
</main>
</div>
<a class="top" href="#" title="回到顶部">↑</a>
</body>
</html>
"""
    OUT.write_text(page, encoding="utf-8")
    size = OUT.stat().st_size / 1024
    print(f"已生成：{OUT}  ({size:.0f} KB, {len(sections)} 份文档)")


if __name__ == "__main__":
    build()
