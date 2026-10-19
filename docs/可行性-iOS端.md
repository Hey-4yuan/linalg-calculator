# 可行性分析：在 Windows 本机开发并交付 iOS 端

> **更新（2026-10-19）**：路线 A（PWA）已经落地——工程里补了 manifest、Service Worker、iOS 主屏图标，并加了 GitHub Pages 自动部署。具体步骤见《部署-GitHub-Pages》；本文保留为四条路线的对比与决策依据。

结论先行：**能，但要绕开"编译必须 macOS"这一道墙。**
按投入从低到高有四条可行路线，推荐顺序是 **PWA（今天就能用）→ 云 CI 出未签名 IPA + Sideloadly 自签（免费，周维护）→ 付费开发者账号（年费，免维护）→ 买/租 Mac（完整能力）**。

本文所有判断基于 2026 年 10 月的公开资料与项目现状（React 静态站 + Capacitor 安卓壳），不含推测性定价，标"参考"的数字请以官方页面为准。

---

## 1. 硬约束：到底卡在哪一步

iOS 的"开发"其实是四件事，只有第三件被 macOS 锁死：

| 环节 | 能否在 Windows 完成 | 说明 |
|---|---|---|
| 写代码 / 改网页 / 构建 Web 产物 | ✅ | 这个项目本来就是 Vite 式静态产物，Windows 完全够用 |
| 生成 `ios/` 原生工程 | ⚠️ 部分 | `npx cap add ios` 需要 CocoaPods（macOS 工具链），Windows 上跑不通；但可以在 CI 的 macOS runner 里生成 |
| 编译出 `.app/.ipa` | ❌ | iOS SDK、`xcodebuild`、`codesign` 只随 Xcode 发布，且授权绑定 Apple 硬件；Linux/Windows 上的交叉编译产物无法通过 App Store Connect 校验 |
| 签名 | ⚠️ 分情况 | 证书本身可以用 OpenSSL 在 Windows 上生成 CSR 换取；把签名"贴"到 IPA 上，Windows 有 `zsign`、Sideloadly 等实现；但正式分发签名仍需 Apple 账号 |
| 上传 App Store / TestFlight | ⚠️ | Transporter 只有 macOS 版；替代是 App Store Connect API（任意系统可调）或第三方上传工具 |

补充两条 2026 年的现实约束：

- **Xcode 版本门槛**：截至 2026 年 4 月，App Store 要求使用 **Xcode 26 及以上**构建。自己维护 Mac 意味着每年跟着升 macOS + Xcode；用云构建则把这件事外包给服务商。
- **免费 Apple ID 的限制**：证书 **7 天过期**、同时最多 **3 个**自签应用、每周有 App ID 数量上限、**不能推送**、不能内购。iOS 16+ 安装自签应用还必须先在「设置 → 隐私与安全性 → 开发者模式」里打开开发者模式。

## 2. 四条路线对比

| 路线 | 需要什么 | 成本 | 首次上手 | 维护 | 能力 | 推荐度 |
|---|---|---|---|---|---|---|
| A. PWA（添加到主屏幕） | 一个 HTTPS 静态托管（GitHub Pages / 对象存储 / Vercel 均可）+ 一个 manifest + 图标 | 0 元 | 30 分钟 | 无 | 全屏运行、离线可用、可加到桌面；无原生 API、无推送（除非装到主屏后另配） | ★★★★★ |
| B. 云 CI 出未签名 IPA + Windows 自签 | GitHub 账号 + 本机 iTunes/iCloud + Sideloadly + 免费 Apple ID | 0 元（公开仓库）；私有仓库按 macOS 分钟计费 | 半天 | **每 7 天重签一次** | 真正的原生壳，可离线、可拍照 | ★★★★ |
| C. 付费开发者账号 | Apple Developer Program（约 $99/年）+ 路线 B 的构建链 | 年费 | 半天 | 一年一签 | 去掉 3 应用限制、可 TestFlight 内测、可上架 | ★★★☆ |
| D. 买 / 租 Mac | Mac mini 或云 Mac（参考：云 Mac 约 $20/天、$100/月量级） | 硬件或租金 | 1 天 | 跟 Xcode 版本跑 | 完整（模拟器、调试器、证书 UI、Xcode Cloud） | ★★（本项目体量不需要） |

### 2.1 为什么 A 排第一

这个应用是**纯前端、零后端、单页**，正好是 PWA 的最佳场景：

- 计算全部本地完成，离线只是"缓存一份 HTML/JS"，没有同步难题；
- 没有账号体系，不需要原生能力（相机通过 `<input capture>` 调系统相机，PWA 同样可用）；
- iOS 26 起，添加到主屏幕的站点**默认以 Web App 形式打开**（可关闭），体验接近原生；
- 关键利好：**主屏幕 Web App 的一级域名豁免 ITP 的 7 天清理**，数据（包括你的 OCR 配置）不会被 Safari 定期抹掉——而"直接放书签里用"就会被抹。这一条直接决定了本项目在 iOS 上应该走 PWA 而不是"用 Safari 打开一个 HTML"。

PWA 的代价：必须有 HTTPS 托管（Service Worker 只在 HTTPS 或 localhost 下注册），也就是**不能靠"发个 HTML 文件给对方"**在 iPhone 上用。这与安卓 APK 的分发习惯不同。

### 2.2 路线 B 的具体做法（零成本、真原生）

关键认知：**Sideloadly 这类 Windows 工具能"签名"，但不能"编译"。** 所以要把编译放到云上、把签名留在本机。

```
GitHub Actions (macos-14/15 runner)
  ├─ npm ci / 构建 web 产物
  ├─ npx cap add ios        # 在 macOS 上生成 ios/ 工程
  ├─ npx cap sync ios
  ├─ xcodebuild archive ... CODE_SIGNING_ALLOWED=NO
  └─ 打包成 Payload/App.app → 未签名 .ipa 作为 artifact

Windows 本机
  ├─ 下载未签名 .ipa
  ├─ Sideloadly 用免费 Apple ID 签名并安装（USB）
  ├─ iPhone：设置 → 通用 → VPN 与设备管理 → 信任
  └─ 每 7 天重签一次（或让 AltServer 在同 Wi-Fi 下自动续签）
```

要点与坑：

1. **必须在 CI 里生成 `ios/`**：Windows 上 `cap add ios` 因缺 CocoaPods 失败。要么把 `ios/` 提交进仓库（CI 直接 `cap sync`），要么每次构建都重新 `cap add ios`（慢但不用维护原生工程）。
2. **不要提交签名材料**：`.p12`、`.mobileprovision` 放 GitHub Secrets，或干脆不签（走 Sideloadly 本机签）。本项目没有复杂原生依赖，未签名构建足够。
3. **`Info.plist` 补相机用途说明**：`NSCameraUsageDescription`。用 `<input type="file" capture>` 调系统相机通常不弹权限框，但一旦后续改用 `getUserMedia` 就会崩，提前写好更稳。
4. **免费证书 7 天到期**是硬限制，不是配置问题。要么接受每周插一次线，要么上付费账号。
5. 私有仓库的 macOS runner 按分钟计费（参考 $0.062/分钟，一次 iOS 构建约 8–15 分钟）；公开仓库免费，但**代码会公开**。

### 2.3 路线 C / D 什么时候才值得

- 要给**别人**用（TestFlight 内测、上架）：必须付费账号，且需要走 App Store Connect；内部测试可免 Beta 审核，但仍要账号与构建上传。
- 要做**原生能力**（钥匙串、后台任务、推送、性能调优）或需要**调试器**看崩溃：租 Mac 按天最划算，不必买。

## 3. 针对本项目的具体建议

| 目标 | 建议路线 | 理由 |
|---|---|---|
| 自己手机上用，越省事越好 | **A（PWA）** | 零成本、零维护、配置不会被 7 天清理；缺点是需要托管 |
| 不想托管、要能拍照识别、接受每周重签 | **B** | 与现有 APK 体验一致，原生壳更接近"应用" |
| 想给同学/老师用 | A 分享链接（最省事）或 C 的 TestFlight | B 的免费证书没法分发 |
| 想长期维护、持续加功能 | C + 云 CI | 一年一签，不用管证书 |

**如果只做一件事**：给单文件产物补一个 `manifest.webmanifest` + 图标 + Service Worker，部署到任意 HTTPS 静态站，然后 iPhone 用 Safari 打开 → 分享 → 添加到主屏幕。这条路的收益率远高于折腾 IPA。

## 4. 与现有产物的差距清单（走 PWA 路线时）

| 项目 | 现状 | 需要补 |
|---|---|---|
| Web App Manifest | 无 | `name`、`short_name`、`start_url`、`display: standalone`、`theme_color`、192/512 图标 |
| 图标 | 内联 SVG favicon | 追加 `apple-touch-icon`（180×180 PNG），iOS 优先用它 |
| Service Worker | 无（离线靠内联） | 注册一个缓存外壳的 SW；注意每次发版改版本号 |
| 启动画面 / 状态栏 | 无 | 可选 `apple-mobile-web-app-status-bar-style` |
| 视口 | 已含 `viewport-fit=cover` | 已够用，可补 `user-scalable=no` 视需求 |
| 安装引导 | 无 | iOS 无自动安装弹窗，需要在页面上教用户「分享 → 添加到主屏幕」 |

## 5. 风险与未决项

| 风险 | 影响 | 应对 |
|---|---|---|
| 托管在境外 CDN，国内访问不稳定 | PWA 打不开 | 用国内对象存储 + 备案域名，或走 GitHub Pages 的镜像 |
| 免费证书 7 天到期忘记续签 | 应用打不开 | AltServer 常驻同一 Wi-Fi 自动续签；或改用付费账号 |
| Xcode 门槛逐年提高 | 旧 CI 镜像构建失败 | 用 `macos-latest`，或选托管构建服务替你升级 |
| 未签名 IPA 来源不明 | 植入恶意代码 | 只用自己的 CI 产物；签名前核对 artifact 的提交哈希 |
| iOS 版本差异（26 之后的主屏策略变化） | 行为不一致 | 上线前在目标机型实测安装与离线启动 |

---

*文档版本 v1.0 · 2026-10-19 · 本文为可行性判断，不含承诺性的上架/审核结论*
