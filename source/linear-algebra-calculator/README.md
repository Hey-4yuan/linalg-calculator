# 线性代数计算器 · 源码与打包工程

纯浏览器端线性代数工具：单/双矩阵运算、线性方程组（高斯消元）、向量运算、符号（字母）运算、
兼容 OpenAI 协议的视觉模型 OCR（Base URL / Key / 模型由用户自填，配置仅存本地），
图片识别前可裁剪、旋转、翻转；全部计算在本地完成，无后端、无统计上报。

## 目录结构

```
linear-algebra-calculator/
├── web-source/                 前端源码（React 19 + TypeScript + Vite 8 + Tailwind 4）
│   ├── src/
│   │   ├── lib/                核心算法：matrix-ops / symbolic / vector-ops / fraction / ocr-service
│   │   ├── components/         组件（含 ImageEditorDialog、OCRUploadButton、OCRSettingsDialog）
│   │   ├── pages/HomePage/sections/  五大功能板块
│   │   └── index.css           全局样式（含隐藏平台水印的 CSS）
│   ├── public/                 favicon、图标
│   ├── scripts/
│   │   ├── make-standalone.mjs 构建产物转纯离线站点（去平台模板/遥测）
│   │   └── make-single-file.mjs 离线站点内联为单文件 HTML
│   └── package.json
├── android/                    Capacitor 6 安卓工程
│   ├── www/                    内置网页资源（已随包提供，可直接打包）
│   ├── android/                Gradle 原生工程（Gradle Wrapper 已包含）
│   ├── capacitor.config.json   appId=com.doubao.linalg，webDir=www
│   └── build-apk.sh            一键构建脚本
├── single-file/
│   └── 线性代数计算器.html      单文件离线版（双击即用，无需部署）
└── README.md
```

## 一、前端源码：开发与构建

环境：Node.js ≥ 20（建议 22 LTS）、npm。

```bash
cd web-source
npm install

npm run dev                 # 本地开发（http://localhost:5173）
npm run build               # 仅构建，产物 dist/client（平台模板，不能直接用于离线打包）
npm run build:standalone    # 构建并生成纯离线站点 dist-standalone（无平台脚本/遥测）
npm run build:single        # （依赖 dist-standalone）生成根目录单文件「线性代数计算器.html」
npm run build:all           # 依次完成上面两步
```

说明：
- 源码使用了平台 vite 预设（`@lark-apaas/coding-preset-vite-react`），在公共 npm 源可直接安装，
  `vite.config.ts` 已配置 `base: './'`，产物使用相对路径。
- `dist/client` 含平台模板占位符（`{{appId}}` 等），属正常现象；打包/分发请使用
  `make-standalone.mjs` 产出的 `dist-standalone`，它已剥离平台脚本并注入 standalone 配置。
- 刷新 APK 内置网页：将 `dist-standalone/` 内容复制到 `android/www/`，再执行 `npx cap sync android`。

## 二、单文件 HTML

`single-file/线性代数计算器.html` 已随包提供。也可由源码重新生成：

```bash
cd web-source
npm install
npm run build:all            # 生成的「线性代数计算器.html」在 web-source 根目录
```

双击用浏览器打开即可，全部功能离线可用；OCR 需先在「配置 OCR」中填入自己的视觉模型端点与 Key。
单文件在 iOS 上的配置持久化不保证（建议用 APK 或 PWA）。

## 三、Android APK 打包

需要：

1. **JDK 17**（如 Eclipse Temurin 17）
2. **Android SDK**：通过 commandline-tools 安装，包含
   - `platform-tools`
   - `platforms;android-34`
   - `build-tools;34.0.0`

```bash
cd android
# 指定你本机的 JDK / SDK 路径
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/Android/Sdk
npm install                  # 首次需要，安装 Capacitor 依赖
./build-apk.sh
```

产物：`android/android/app/build/outputs/apk/debug/app-debug.apk`（debug 签名，可直接安装）。

配置：
- 应用名「线性代数计算器」、包名 `com.doubao.linalg`、minSdk 22、targetSdk 34，
  见 `android/capacitor.config.json` 与 `android/android/app/build.gradle`。
- 首次构建 Gradle Wrapper 会自动下载 Gradle 8.2.1，需联网。
- Release 签名（分发用）请在 Android Studio 中配置 keystore 或参照 Gradle signingConfigs 文档。

## 四、iOS 打包（macOS 必需）

IPA 无法在 Linux/Windows 上编译，必须在 macOS + Xcode 完成。在 Mac 上：

```bash
cd web-source && npm install && npm run build:standalone
cd ../android                # 或新建独立 capacitor 目录
npm install @capacitor/ios
npx cap add ios
npx cap sync ios             # webDir 指向 dist-standalone
npx cap open ios             # Xcode 打开，选择 Team 签名后 Build/Archive
```

- 免费 Apple ID 可自签安装到自己设备（签名 7 天有效，需重签）；
- 正式分发 / TestFlight / App Store 需 Apple Developer Program（99 美元/年）。
- 不想打包可直接用 Safari 打开在线链接 →「添加到主屏幕」作为 PWA 使用。

## 五、视觉模型配置的保存

OCR 配置（Base URL、API Key、模型名）保存在浏览器/WebView 的 `localStorage`，仅存本地、不经过任何服务器：

- APK 内为独立应用沙箱，卸载前一直有效；
- 在线网页 PWA 模式下接近原生持久；iOS Safari 普通标签连续 7 天不访问可能被系统清理；
- 浏览器无痕模式、iOS 本地 file:// 打开不保证持久。

## 版权信息

© 2026 南京信息工程大学 · 网络空间安全学院 · 「源」
