// 构建前置检查：确认 Windows 原生二进制在位。
// 背景：package-lock.json 由其他平台生成，npm 不会自动补 win32 可选依赖；
// 而任何一次 npm install / npm uninstall 都可能把用 --no-save 装进来的二进制当作"多余包"删掉。
// 这里在构建前直接给出可复制的修复命令，避免撞上 "Cannot find module …win32-x64-msvc"。
import fs from 'node:fs'
import path from 'node:path'

const readVersion = (pkg) => {
  try {
    return JSON.parse(fs.readFileSync(path.join('node_modules', pkg, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

const rolldown = readVersion('rolldown')
const lightningcss = readVersion('lightningcss')
const oxide = readVersion('@tailwindcss/oxide')

const required = [
  ['@rolldown/binding-win32-x64-msvc', rolldown],
  ['lightningcss-win32-x64-msvc', lightningcss],
  ['@tailwindcss/oxide-win32-x64-msvc', oxide],
]

const has = (pkg) => fs.existsSync(path.join('node_modules', pkg))

const missing = required.filter(([pkg]) => !has(pkg))

if (!missing.length) {
  process.exit(0)
}

const isWin = process.platform === 'win32'

// 非 Windows 平台直接放行。
// 原因：这三个包只存在于 win32；Linux/macOS（含 GitHub Actions 的 ubuntu-latest）走的是
// npm 的 optionalDependencies 里各自的平台变体（lock 里已有 linux-x64-gnu / musl 条目），
// 这里如果继续报错退出，CI 会在 prebuild 阶段必失败。
if (!isWin) {
  console.log('[构建检查] 非 Windows 平台，跳过 win32 原生依赖校验')
  process.exit(0)
}

console.error('\n[构建检查] 缺少原生依赖：' + missing.map(([p]) => p).join(', '))
console.error('在 Windows 上请先执行（必须一条命令装齐，否则会互相清理）：\n')
console.error(
  '  npm install --no-save ' +
    required.filter(([p]) => !has(p)).map(([p, v]) => `${p}@${v || 'latest'}`).join(' ')
)
console.error('\n提示：任何一次 npm install 之后都要重跑上面这条命令。\n')
process.exit(1)
