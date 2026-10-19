# 部署到 GitHub Pages（让 iPhone 用户直接用）

**结论：可以，而且已经改好并本地验证过了。**
但有两处需要纠正/注意：

1. **API Key 不要放 cookie**，应该继续放 `localStorage`（代码本来就这么做的）。理由见第 1 节。
2. **不能直接把现有的 HTML 丢到 `/<repo>/` 下**——原来的构建在子路径会渲染成「页面不存在」。这个已在源码里修好（第 3 节），本文的产物已经带上修复。

---

## 1. 关于"把 API Key 存在本地"：cookie 是错的工具

你的意图是对的——Key 只存在用户自己的设备上，不上传。但实现手段不该是 cookie：

| 维度 | Cookie | localStorage（当前实现） |
|---|---|---|
| 会被发送到服务器 | **每一次同源请求都会带上** | 不会 |
| 托管在 GitHub Pages 时 | 你的 Key 会被塞进发往 `*.github.io` 的每个请求头，进入 CDN 日志 | 完全不发出去 |
| 能否 HttpOnly / 防脚本读 | 前端写不了 HttpOnly；能被 JS 读，防不住 XSS | 同样能被 JS 读，但至少不外发 |
| 容量 | 4 KB | 5 MB 级 |
| iOS Safari 生命周期 | ITP 对 JS 写入的 cookie 有 7 天上限 | 普通标签页同样有 7 天规则；**添加到主屏幕后不受限** |
| 适用语义 | 会话/鉴权状态（服务端需要读） | 纯客户端配置 |

所以现在这套存储方案就是对的：`scopedStorage`（底层 `localStorage`），键名带应用前缀，密钥只在本机、不外发。

**iOS 上的关键事实**（WebKit 官方文档）：

- Safari 标签页里的脚本存储，7 个"使用日"无交互就被清空 → 用户一周不用就要重填 Key；
- **添加到主屏幕的 Web App 使用独立存储桶，且豁免这个 7 天清理**；
- 主屏 Web App 的存储与 Safari 相互隔离（不共享）。

> 结论：**引导用户"添加到主屏幕"不只是为了图标好看，它直接决定配置会不会丢。**

如果以后要更强的保护，正确方向不是换 cookie，而是：可选口令加密（PBKDF2 + AES-GCM）→ 系统钥匙串（原生壳）→ 服务端代理（Key 不下发）。详见《可行性-视觉模型配置存储》。

## 2. 部署前必须知道的三件事

### 2.1 子路径问题（已修）

GitHub Pages 的项目站点地址是 `https://<user>.github.io/<repo>/`。原构建里 `BrowserRouter` 的 basename 固定为 `/`，react-router 收到 `/repo/` 匹配不到 `/`，直接落到 `*` 路由 → 显示「页面不存在」。

已做：

- 新增 `src/lib/base-path.ts`：`resolveBasename(pathname, injected)` 按 URL 目录推断 basename（`/repo/`、`/repo/index.html`、`/repo`、`file:///.../app.html` 都能正确落到 `/` 或 `/repo`）；
- `src/index.tsx` 用它替代写死的 `process.env.CLIENT_BASE_PATH || "/"`；
- 平台注入的 `window.__BASENAME__` 仍然优先，不影响原有部署；
- 单测覆盖 7 个 URL 形态（`tests/build-and-test.mjs` 的 BASE-01）。

### 2.2 CORS：浏览器直连模型接口必须被允许

页面是纯前端，OCR 时浏览器会直接 POST 到 `{baseUrl}/chat/completions`。**跨域必须由服务端放行**，否则请求发不出去（控制台报 CORS）。

本机实测（2026-10-19，`Origin: https://example.github.io`）：

| 接口 | 预检结果 | 说明 |
|---|---|---|
| `https://api.deepseek.com/chat/completions` | `200`，`access-control-allow-origin` 回显来源，允许 `authorization,content-type` | **可用** |
| `https://api.openai.com/v1/chat/completions` | 本机网络不可达（连接超时，`000`） | 国内直连基本不可用 |

所以给国内用户的建议是：默认引导填 DeepSeek 兼容中转，而不是 OpenAI。若某个中转不带 CORS 头，可以让它加，或用你自己的 Cloudflare Worker 转发（顺带把 Key 藏到服务端）。

另外：**接口必须是 HTTPS**。HTTPS 页面调用 `http://` 接口会被浏览器按混合内容拦掉。

### 2.3 可达性

本机实测：`pages.github.com` 200（0.29s）、`octocat.github.io` 200（0.86s）。GitHub Pages 在国内不是稳定可达的服务，不同地区/运营商差异大，**发给别人前请先在目标网络实测**。

如果目标用户主要在国内且访问不稳，备选：

| 方案 | 优点 | 代价 |
|---|---|---|
| Cloudflare Pages | 国内可达性通常好于 GitHub Pages | 需要 Cloudflare 账号 |
| 腾讯云 COS / 静态网站托管 | 国内快 | 域名需备案 |
| 自己的服务器 / 对象存储 | 完全可控 | 有成本 |

产物是纯静态的，换托管方只需要重新上传 `dist-pages` 内容，不必改代码。

## 3. 部署方式 A：GitHub Actions 自动部署（推荐）

仓库里已放好 `.github/workflows/deploy-pages.yml`：push 到 `main` 就构建、跑测试、发布。

### 步骤

1. 在 GitHub 新建**空仓库**：`github.com/new`，名字建议 `linear-algebra-calculator`，**不要勾** README / .gitignore / license（勾了会和本地首次提交冲突，得先 `git pull --rebase`）。

2. 本地仓库已就绪（`main` 分支、首次提交已完成），只需加远端并推：

   ```bash
   cd "C:/Users/hp/OneDrive/Desktop/线性代数计算器"
   git remote add origin https://github.com/<你的账号>/<仓库名>.git
   git push -u origin main
   ```

   ⚠️ 历史坑：`C:\Users\hp` 下有一个零提交的 `.git`，Git 会向上查找仓库。本项目已在根目录 `git init` 过，就近原则生效；换机器/重装后**必须先 `git init` 并确认 `git rev-parse --show-toplevel`**，否则 `git add .` 会把整个用户目录（`Cookies/`、`.ssh/`）纳入。

3. **推送时的认证**（这步最容易卡住）：

   | 项目 | 填什么 |
   |---|---|
   | 用户名 | GitHub 用户名（不是邮箱） |
   | 密码 | **PAT**，不是账号密码 —— GitHub 早已关闭密码推送 |

   PAT 申请路径：`Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token`，勾选：
   - `repo`（推送代码）
   - **`workflow`**（必需！本次提交包含 `.github/workflows/deploy-pages.yml`，缺这个 scope 会被拒绝：
     `refusing to allow a Personal Access Token to create or update workflow`）

   用 Fine-grained token 的话，需要 `Contents: Read and write` + `Workflows: Read and write`。

4. 仓库 **Settings → Pages → Build and deployment → Source 选择 "GitHub Actions"**（不选的话部署步骤会报 `Pages not enabled`）。

5. 等 Actions 跑完（首次约 3–6 分钟，主要耗在 `npm ci`），地址是 `https://<账号>.github.io/<仓库名>/`。

6. 手机打开该地址 → 分享 → 添加到主屏幕。

> 提交身份已设成本仓库局部配置 `Hey-4yuan@users.noreply.github.com`，公开仓库不会暴露你的 QQ 邮箱。若 GitHub 用户名不是 `Hey-4yuan`，跑一句
> `git config user.email "你的用户名@users.noreply.github.com"` 再 `git commit --amend --reset-author --no-edit`。

> 入库范围：`node_modules/`、`dist*/`、`*.apk`、源码目录下的单文件副本都不入库（`.gitignore` 已覆盖）；根目录 `线性代数计算器.html` 保留，方便别人直接下载离线版。

### 工作流做了什么

```
checkout → setup-node 22 → npm ci → npm run typecheck
→ node tests/build-and-test.mjs（48 项断言）
→ npm run build:pages（vite build → standalone → dist-pages）
→ 上传 dist-pages → deploy-pages
```

只要测试挂了就不会发布，避免把算错的版本推上线。

## 4. 部署方式 B：手动推 gh-pages 分支

不想用 Actions（或仓库是私有仓库、没有 Pages 权限）时：

```bash
cd source/linear-algebra-calculator/web-source
npm ci
# Windows 先补原生依赖，见第 6 节
npm run build:pages

cd ../../..
git subtree push --prefix source/linear-algebra-calculator/web-source/dist-pages origin gh-pages
```

然后在 Settings → Pages 选择 `gh-pages` 分支根目录。

> 注意：GitHub Pages 对**私有仓库**通常需要付费计划；免费账号用公开仓库最省事。产物里没有密钥，公开仓库不会泄露你的 Key（Key 只在用户浏览器里）。

## 5. iOS 用户怎么用

1. Safari 打开 `https://<账号>.github.io/<仓库名>/`（**必须 Safari**，微信/QQ 内置浏览器不能添加主屏）；
2. 页面底部会自动弹出「添加到主屏，OCR 配置不会丢」的引导条（v1.5 起，只在 iOS Safari 标签页里出现，点「知道了」后不再提示）；
3. 点底部「分享」→「添加到主屏幕」→ 右上角「添加」；
4. 从主屏图标启动（全屏、无地址栏）；
5. 首次用 OCR：点任意矩阵卡片标题右侧的「配置 OCR」→ 填 Base URL / API Key / 模型名 → 保存；
6. 之后每次进来都是已登录状态——**主屏 Web App 的存储不会被 7 天规则清掉**。

> 如果发现配置"自己丢了"，八成是还在 Safari 标签页里用。重新加一次主屏即可。
> 桌面 Chrome / Edge 会走 `navigator.storage.persist()` 申请持久化存储，不受 7 天规则影响（也不弹这个条）。

离线能力：Service Worker 会缓存页面外壳，断网也能打开并做本地计算；OCR 仍需联网。

## 6. Windows 上本地构建的两个坑

```bash
# 1) 原生可选依赖（每次 npm install 之后都要重跑，必须一条命令）
npm install --no-save \
  @rolldown/binding-win32-x64-msvc@1.2.7 \
  lightningcss-win32-x64-msvc@1.32.0 \
  @tailwindcss/oxide-win32-x64-msvc@4.3.3

# 2) 构建前检查（已接入 prebuild，缺依赖会直接给修复命令）
npm run build:pages
```

CI 用 Ubuntu，不存在这两个问题。

## 7. 安全须知

| 事项 | 说明 |
|---|---|
| Key 在谁的浏览器里 | 每个用户填自己的 Key，仓库里没有密钥 |
| 不要把 Key 写进代码/仓库 | 公开仓库等于公开密钥 |
| 不要共用 Key | 一个人泄露，所有人一起被刷额度；服务商条款通常也不允许转借 |
| 建议设置额度上限 | 在服务商后台限制日消费，出问题损失可控 |
| 清缓存 / 换浏览器 | 配置会丢，需要重填（这也是建议做「导出/导入」的原因） |
| 共享设备 | Key 明文存 `localStorage`，同机他人按 F12 就能看到；公用电脑请用完清除配置 |

## 8. 本次为部署做的代码改动

| 文件 | 改动 |
|---|---|
| `src/lib/base-path.ts` | 新增：basename 推断（兼容子路径/本地文件） |
| `src/index.tsx` | 用 `resolveBasename`；HTTPS 下注册 Service Worker（失败静默） |
| `index.html` | 加 manifest、apple-touch-icon、theme-color、iOS 主屏 meta |
| `public/manifest.webmanifest` | 新增：PWA 清单（standalone、图标、主题色） |
| `public/sw.js` | 新增：导航 network-first、静态资源 cache-first、跨域不接管 |
| `public/icons/*.png` | 新增：192 / 512 / maskable 512 / apple-touch 180（`tools/make-icons.py` 生成） |
| `scripts/make-pages.mjs` | 新增：产出 `dist-pages`（注入 SW 版本、`.nojekyll`、404 兜底、资源自检） |
| `scripts/make-standalone.mjs` | 模板补 PWA 标签；排除 source map；`cpSync` → 手写递归复制 |
| `scripts/make-single-file.mjs` | 入口 hash 唯一性校验，防止取到历史构建文件 |
| `scripts/check-native-deps.mjs` | 新增：构建前检查原生依赖，缺了给出可复制的修复命令 |
| `package.json` | 新增 `build:pages`、`prebuild*`；`vite build --emptyOutDir` |
| `.github/workflows/deploy-pages.yml` | 新增：自动构建 + 测试 + 发布 |

## 9. 验收清单

- [ ] 地址根路径（`/`）与子路径（`/<repo>/`）都能打开并显示「矩阵运算 / 线性方程组 / 向量运算」三个 Tab
- [ ] 刷新页面不出现「页面不存在」
- [ ] iOS Safari 添加到主屏后，图标是紫色矩阵（不是网页截图）
- [ ] 主屏启动为全屏、无地址栏
- [ ] 配置 OCR 后刷新仍在；隔天再打开仍在
- [ ] 断网后仍能打开页面并做矩阵计算
- [ ] OCR 填 DeepSeek 兼容接口能识别成功；填错 Key 有 401 提示；接口挂起约 45 秒后报超时
- [ ] 任意未知路径（如 `/foo/bar`）会被 404 兜底带回首页

## 10. 常见问题

**Q：打开是白屏？**
先看地址是不是漏了结尾的 `/`（`/repo` 与 `/repo/` 都能用，但 `/repo/index.html` 之外拼错路径会 404）；再按 F12 看 Console 有没有 404 的资源，确认 `assets/` 是否一起上传了。

**Q：iOS 上没有「添加到主屏幕」？**
必须在 Safari 里；微信/QQ/钉钉内置浏览器都没有这个入口。另外 iOS 16.4 起第三方浏览器（Chrome/Edge）也可以通过分享菜单添加。

**Q：配置好了，换台设备还要再配？**
是的，`localStorage` 不跨设备、不随浏览器账号同步。可行的做法是把 Base URL 与模型名记住，Key 重新申请/粘贴一次（不建议把 Key 发给别人）。

**Q：能不能让朋友不用配 Key 就能用？**
只能上服务端代理：Key 放在你的云函数里，前端只带一个短期票据，并在服务端做限额。纯静态托管做不到。

**Q：GitHub Pages 有流量限制吗？**
有软限制（站点约 1 GB、每月约 100 GB 带宽、每小时约 10 次构建）。个人/小范围使用够用；量大时换 Cloudflare Pages 或对象存储。

---

*文档版本 v1.0 · 2026-10-19 · 与 `source/` 源码同步*
