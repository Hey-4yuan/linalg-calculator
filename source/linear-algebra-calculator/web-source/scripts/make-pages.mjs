// 生成可直接部署到 GitHub Pages / 任意静态托管的目录：dist-pages
// 前置：npm run build（产出 dist/client）与 node scripts/make-standalone.mjs
// 用法：node scripts/make-pages.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'dist-standalone')
const out = path.join(root, 'dist-pages')

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name)
    const b = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(a, b)
    else if (!entry.name.endsWith('.map')) fs.copyFileSync(a, b)  // source map 不进部署包
  }
}

if (!fs.existsSync(src)) {
  console.error('未找到 dist-standalone，请先执行：npm run build && node scripts/make-standalone.mjs')
  process.exit(1)
}

// 注意：这里刻意不删除 dist-pages，只覆盖写入。
// 递归删除属于破坏性操作，交给人来执行；代价是历史 hash 文件会残留（不被 index.html 引用，不影响运行）。
// 需要彻底清理时，手动删除 dist-pages 后重新构建即可（CI 里每次都是干净环境）。
copyDir(src, out)

// 1) Service Worker 版本号：每次构建都不同，激活时自动清旧缓存
const swPath = path.join(out, 'sw.js')
const buildId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8')
  if (!sw.includes('__SW_VERSION__')) {
    console.warn('警告：sw.js 里没有 __SW_VERSION__ 占位符，缓存不会按版本清理')
  }
  fs.writeFileSync(swPath, sw.replace(/__SW_VERSION__/g, buildId))
} else {
  console.warn('警告：dist-standalone 中没有 sw.js，PWA 离线能力不会生效')
}

// 2) 必备文件自检
const required = [
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-180.png',
]
const missing = required.filter((f) => !fs.existsSync(path.join(out, f)))
if (missing.length) {
  console.error('缺少 PWA 资源：', missing.join(', '))
  process.exit(2)
}

// 3) GitHub Pages 关闭 Jekyll，避免下划线开头的文件被处理
fs.writeFileSync(path.join(out, '.nojekyll'), '')

// 4) 404 兜底：把未知路径带回应用根目录（保留 /repo/ 这类子路径前缀）
const notFound = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>正在返回…</title>
<style>html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;
font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#5b6470;background:#fbfbfa}</style>
</head>
<body>
<p>正在返回应用首页…</p>
<script>
  (function () {
    var p = location.pathname;
    var i = p.lastIndexOf("/");
    location.replace(i >= 0 ? p.slice(0, i + 1) : "/");
  })();
</script>
</body>
</html>
`
fs.writeFileSync(path.join(out, '404.html'), notFound)

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
    const p = path.join(dir, e.name)
    return acc + (e.isDirectory() ? size(p) : fs.statSync(p).size)
  }, 0)

console.log('已生成 dist-pages（构建号 ' + buildId + '）')
console.log('大小：' + (size(out) / 1024 / 1024).toFixed(2) + ' MB')
console.log('部署：把 dist-pages 目录内容推到 GitHub Pages（或任意静态托管的根目录）')
