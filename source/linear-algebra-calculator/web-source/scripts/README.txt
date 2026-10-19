scripts/ 目录构建脚本说明：
以下为妙搭 vite-react 模板的标准构建脚本，功能描述如下，获取后放入 scripts/ 即可：
- dev.mjs: 开发服务器启动脚本 (node scripts/dev.mjs)
- build.sh: 生产构建脚本 (bash scripts/build.sh)
- setup-git-hooks.mjs: git hooks 安装脚本

如使用标准 vite 构建，也可直接把 package.json 中的 scripts.dev 改为 "vite"，scripts.build 改为 "vite build" 即可。
