// 把 dist-standalone 内联成单个 HTML 文件（纯离线、双击可用）
// 前置：先执行 npm run build 和 node scripts/make-standalone.mjs
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const sd = path.join(root, 'dist-standalone')
if (!fs.existsSync(sd)) {
  console.error('未找到 dist-standalone，请先执行 node scripts/make-standalone.mjs')
  process.exit(1)
}
const assets = fs.readdirSync(path.join(sd, 'assets'))
const jsEntries = assets.filter(f => /^index-.*\.js$/.test(f))
const cssEntries = assets.filter(f => f.endsWith('.css'))
if (jsEntries.length !== 1 || cssEntries.length !== 1) {
  console.error('dist-standalone/assets 里应恰好有 1 个 index-*.js 与 1 个 .css，实际：', { jsEntries, cssEntries })
  console.error('通常是历史构建残留，请先执行 npm run build --emptyOutDir 或删除 dist 后重试')
  process.exit(2)
}
const entry = jsEntries[0]
const cssFile = cssEntries[0]
const bundled = await build({
  entryPoints: [path.join(sd, 'assets', entry)],
  bundle: true, format: 'esm', minify: true, write: false, logLevel: 'warning',
})
const js = bundled.outputFiles[0].text
const css = fs.readFileSync(path.join(sd, 'assets', cssFile), 'utf8')
const fav = fs.readFileSync(path.join(sd, 'favicon.svg'))
const favUri = 'data:image/svg+xml;base64,' + fav.toString('base64')
if (css.includes('</style>')) throw new Error('CSS 中包含 </style>')
if (js.includes('</script>')) throw new Error('JS 中包含 </script>')
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>线性代数计算器</title>
<meta name="description" content="线性代数计算器（单文件离线版）" />
<link rel="icon" href="${favUri}" />
<style>
${css}
</style>
<script>
window.appId="linear-algebra-calculator";
window.userId="guest";
window.tenantId="";
window.userName="Guest";
window.csrfToken="";
window.ENVIRONMENT="standalone";
// basename 交给 src/lib/base-path.ts 按运行时 URL 推断（支持 /repo/ 这类子路径）
window.__BASENAME__="";
window._appInfo={name:"线性代数计算器",avatar:"${favUri}",description:"在线线性代数计算器工具"};
</script>
</head>
<body>
<div id="root"></div>
<script type="module">
${js}
</script>
</body>
</html>
`
fs.writeFileSync(path.join(root, '线性代数计算器.html'), html)
console.log('单文件已生成：线性代数计算器.html（', Buffer.byteLength(html), '字节）')
