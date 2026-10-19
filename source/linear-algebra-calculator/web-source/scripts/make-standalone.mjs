// 把 vite 构建产物 dist/client 转成纯净的离线站点 dist-standalone（可直接作为 Capacitor 的 webDir）
// 用法：npm run build 后执行 node scripts/make-standalone.mjs
import fs from 'node:fs'
import path from 'node:path'

// 递归复制目录。
// 注意：不要用 fs.cpSync —— 在部分 Windows + Node 22 组合下它会静默崩溃（进程退出码 127，无任何报错），
// 这里用 readdir + copyFileSync 手动实现，行为等价且稳定。
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else if (!entry.name.endsWith('.map')) fs.copyFileSync(from, to)  // source map 不进离线包
  }
}

const root = process.cwd()
const dist = path.join(root, 'dist/client')
const out = path.join(root, 'dist-standalone')
if (!fs.existsSync(dist)) {
  console.error('未找到 dist/client，请先执行 npm run build')
  process.exit(1)
}

// 复制全部文件（assets、favicon、routes.json 等）
fs.rmSync(out, { recursive: true, force: true })
copyDir(dist, out)

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const css = [...html.matchAll(/href="(\.\/assets\/[^"]+\.css)"/g)].map(m => m[1])
// 仅保留四个业务 chunk，排除 polyfills 与平台/遥测脚本
const want = ['rolldown-runtime', 'radix', 'toolkit', 'index-']
const js = [...html.matchAll(/src="(\.\/assets\/[^"]+\.js)"/g)]
  .map(m => m[1])
  .filter(u => want.some(w => u.includes(w)))
  .filter((v, i, a) => a.indexOf(v) === i)

const tpl = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>线性代数计算器</title>
<meta name="description" content="线性代数计算器：矩阵运算、行列式、逆矩阵、线性方程组、向量运算、符号运算、OCR 图片识别（含裁剪旋转）" />
<link rel="icon" href="./favicon.svg" />
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="apple-touch-icon" href="./icons/apple-touch-icon-180.png" />
<meta name="theme-color" content="#863bff" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="线代计算器" />
${css.map(u => `<link rel="stylesheet" href="${u}" />`).join('\n')}
<script>
window.appId="linear-algebra-calculator";
window.userId="guest";
window.tenantId="";
window.userName="Guest";
window.csrfToken="";
window.ENVIRONMENT="standalone";
window.__BASENAME__="";   // 运行时按 URL 目录推断，兼容子路径部署
window._appInfo={name:"线性代数计算器",avatar:"./favicon.svg",description:"在线线性代数计算器工具"};
</script>
</head>
<body>
<div id="root"></div>
${js.map(u => `<script type="module" src="${u}"></script>`).join('\n')}
</body>
</html>
`
fs.writeFileSync(path.join(out, 'index.html'), tpl)
console.log('standalone 已生成：dist-standalone')
console.log('CSS:', css.length, 'JS:', js.length, js.join(', '))
