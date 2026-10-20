# 变更记录

本文件记录产物与文档的变更。产物本身是构建结果，"vX.Y" 指发布给使用者的版本，不代表源码工程的分支号。

---

## v1.12 — 2026-10-20

### 修复：智谱 GLM-4V / 4.6V 一律报 400，图片识别完全用不了

实测报文：

```
{"error":{"code":"1210","message":"max_tokens参数非法：限制数值范围[1,1024]"}}
```

**根因**：`callVision` 把 `max_tokens` 写死成 8192。这个值是给推理型模型（`deepseek-flash` 那种先烧几千 token 思考的）留的余量，但 GLM-4V 系列的输出上限只有 1024，超过直接 400 —— 请求根本到不了模型，探测阶段就失败，整条链路连一个格子都读不出来。

**修法：不写死，改成运行时自适应。**

| 步骤 | 行为 |
|---|---|
| 1 | 首次用默认 8192 发请求（保住推理模型的余量） |
| 2 | 若回 400，从报文里解析服务端给的上限（兼容 `[1,1024]`、`at most 4096`、`maximum value is 2048`、`must be <= 1024`、中文「上限 1024」等写法） |
| 3 | 按该上限降档重发，并把结果记进 `localStorage`（key 含 baseUrl + 模型名） |
| 4 | 之后的请求直接用记住的值，**不再白撞一次 400** |
| 5 | 报文提到 max_tokens 但读不出数字时，退到保守值 1024 再试一次 |

`detail` 字段的重试与它是**同一个循环**里的两条分支，不是 if-else —— 这两种不兼容可能先后出现。

错误提示也改了：现在会说清「模型 X 不接受当前的输出长度设置」并附服务端原文，而不是甩一句 `API 请求失败 (400)`。

### 新增：仓库根直接放可下载的成品

开源后同学要能直接拿走去用，所以把两个成品放进仓库根（此前它们只在 `说明文件/` 里）：

- `线性代数计算器.html` —— 双击即用（1.30 MB，JS/CSS 全内联）
- `线性代数计算器-v1.12.apk` —— 安卓安装包（4.25 MB，`versionCode 9`）

`.gitignore` 用否定规则单独放行 `线性代数计算器-v*.apk`，其余 `*.apk` 仍然不入库。

> APK 已核验：包内 `AndroidManifest` 的 `versionName = 1.12`，内置资源为 `assets/public/assets/index-D0rQiFZR.js`，与本版源码构建产物一致 —— 即 **GLM-4V 的修复确实在这个包里**。

### 文档：新增用户须知

README 增加「使用须知（请先读）」，明确写清：

- 矩阵运算走精确分数，结果可信；**图片识别由第三方视觉模型完成，可能漏读行列、读错数字、丢负号/小数点，必须逐格核对原图后再计算**
- App 的「墨迹与 0 不符」提示只是启发式兜底，挡不住"读成别的数字"，不能代替人工核对
- 同一张图模型往往稳定地错，重试无用，换模型/换图/手输更快
- API Key 只存本地；iOS Safari 标签页 7 天不用会被清，加主屏可避免
- 作者不对使用结果负责

### 质量

- 单测新增 **OCR-10** 组（9 条）：五种 400 报文的解析、非 max_tokens 报错返回 null、`token expired` 不误判、上限 0 视为无效
- `ocr-e2e.mjs` 的假服务端改成**复刻 GLM 的真实行为**（超过 1024 直接回 400 + 那句原文），断言：首次发 8192 → 被拒 → 1024 重试成功 → 上限被记住 → 主识别直接用 1024 不再撞墙。断言数 19 → 22
- 四套件合计 **112 + 22 + 9 + 42 = 185** 条断言全绿

### 产物

- `versionCode 8→9`、`versionName 1.11→1.12`，`www` / `assets/public` 同步到新 hash
- 安卓打包材料：`说明文件/线性代数计算器-安卓打包-v1.12.zip`

---

## 仓库重组 — 2026-10-20（产物无变更，仅目录与工具）

桌面上的 `线性代数计算器/` 拆成两个目录，解决「哪些该推到 GitHub」的困惑：

| 目录 | 内容 | 是否入库 |
|---|---|---|
| `GitHub提交包/` | 源码、测试、工具、工程文档、`.github`、`.git` | ✅ 就是这个仓库本身 |
| `说明文件/` | 单文件 HTML、APK、PDF 手册、安卓打包 zip、`_backup/`、`项目说明.md` | ❌ 不进版本库 |

`.git` 随仓库一起下移，**提交历史与所有相对路径都保留**；仓库内只记录 3 个文件的移出。

### 代码侧（移动必然打断硬编码路径，一并修掉）

- 新增 `tests/lib/env.mjs`：统一解析「被测 HTML」与「浏览器可执行文件」
  - HTML 探测顺序：`LINALG_HTML` → 仓库根 → `../说明文件/` → `web-source/` 构建副本 → `dist-standalone/index.html`
  - 浏览器探测顺序：`CHROME_PATH` → Chrome(64/32) → Edge(64/32) → chromium → macOS Chrome
- 三个 e2e 脚本删掉写死的 `C:/Users/hp/OneDrive/Desktop/...` 与 Chrome 绝对路径（此前只有 `ocr-e2e` 会自己算路径）
- 新增 `tests/glm-live.mjs`：真实视觉模型在线测试。复用 App 同一份提示词与解析器（esbuild 打包 `ocr-prompt.ts` / `ocr-parse.ts`），跑「尺寸探测 → 带提示识别」两阶段，逐模型输出「是否解析成功 / 完全正确格数 / 两阶段耗时 / finish_reason」，密钥只从环境变量或 `--key-file` 读取，不落库

### 文档

README 目录结构按新布局重写并新增「成品与归档在哪」；`说明文件/目录说明.md` 作为该目录的索引；测试手册、交接文档、部署说明、新会话提示词、项目说明中的路径与入库范围同步。

回归：新布局下 103 + 19 + 9 + 42 = **173 项断言全绿**。

---

## v1.11 — 2026-10-19

### 修复：安卓端 OCR 配置弹窗超出屏幕、按钮点不到

`DialogContent` 是垂直居中的固定定位，且没有高度上限、不能滚动。内容一高就同时向上、向下溢出屏幕，底部「保存配置」直接被推到视口外——**看得见界面、点不到按钮**。

- `ui/dialog.tsx`：所有弹窗加 `max-h-[90vh]` + `overflow-y-auto`，并用内联 `maxHeight: 90dvh` 兜住移动端 `vh` 不更新的问题
- `OCRSettingsDialog`：改三段式布局——标题固定、正文滚动、底部按钮**永远固定在屏幕上**，footer 额外留 `env(safe-area-inset-bottom)` 避开安卓手势区
- 预设按钮与说明文案压缩，412×915 这类大屏可一屏放下

### 修复：全站提示（toast）一直没显示

`sonner` 的 `<Toaster />` 组件早就写好了，但**从来没被挂载过**，而全站 9 个文件在调 `toast.success/error/info`。所有提示都是哑的：复制成功、参数校验失败、配置已保存，一条都不出现。在安卓小屏上表现为「点保存配置什么都没发生」，像卡死。

- `app.tsx` 根部挂载 `<Toaster />`，全部提示恢复

### 质量

- 新增 `tests/ocr-settings-dialog-e2e.mjs`：headless Chrome 切 **360×640 / 320×480 / 412×915** 三种视口，每种 14 项断言。除了几何检查，还用 `elementFromPoint` 断言按钮中心命中的确实是按钮本身（能抓「可见但点不到」），并断言滚到底 footer 位置不动、点保存必须有 toast 反馈
- 四套件合计 **173 条断言**全绿：`build-and-test` 103、`ocr-e2e` 19、`steps-accordion-e2e` 9、`ocr-settings-dialog-e2e` 42
- 新增 `tools/make-android-package.py`：一键出安卓材料包，内置「两处网页资源必须字节一致 / `index.html` 引用的资源必须存在 / `build-apk.bat` 必须纯 ASCII 且 CRLF / zip 非 ASCII 名必须带 UTF-8 标志位 / 包内版本号必须与参数一致」五项前置校验，任一项不符直接失败，不出残包
- `build-apk.bat` 纳入版本控制（此前只存在于 zip 里，仓库中没有）
- 安卓 `versionCode 7→8`、`versionName 1.10→1.11`，`www` / `assets/public` 同步并清理旧 hash
- 安卓打包材料：`桌面/线性代数计算器-安卓打包-v1.11.zip`（245 条目 / 1.21 MB）

---

## v1.10 — 2026-10-19

### 新增：OCR 服务商预设

Base URL 是整个配置里最容易填错的一项（少 `/v1`、多写 `/chat/completions`、把智谱的 `/api/paas/v4` 记成 `/v1`），错了只会得到一个 404。设置对话框加了一排预设按钮，点一下自动填好 Base URL 与模型名，**Key 不动**。

| 预设 | Base URL | 建议模型 | 定位 |
|---|---|---|---|
| 智谱 GLM-4V-Flash | `https://open.bigmodel.cn/api/paas/v4` | `glm-4v-flash` | 免费额度，先用起来 |
| 通义 Qwen3-VL-Flash | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3-vl-flash` | 单价最低，中文 OCR 准 |
| 通义 Qwen-VL-Max | 同上 | `qwen-vl-max` | 精度优先，四阶以上推荐 |
| 硅基流动 Qwen3-VL | `https://api.siliconflow.cn/v1` | `Qwen/Qwen3-VL-32B-Instruct` | 聚合平台，新用户送额度 |
| 豆包 Vision | `https://ark.cn-beijing.volces.com/api/v3` | `ep-…` | **模型名要填推理接入点 ID** |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 推理型，大矩阵会漏读 |

每个预设带一句说明（申请入口、限速、坑），点中后显示在下方。新增 `src/lib/ocr-presets.ts`（纯数据 + `matchPreset`），`OCRSettingsDialog` 消费。

同时把 Base URL 的提示改成「填到 `/v1` 或 `/v4` 为止，**不要带** `/chat/completions`」，模型名提示改成「推荐非推理模型」。

### 测试

- 源码级回归 96 → **103**（PRESET-01 七项：地址合法、无 `/chat/completions`、说明齐全、id 唯一、同家地址复用、`matchPreset` 容错）
- OCR 端到端 13 → **19**（E2E-00 六项：区块存在、四家按钮齐全、点击后 Base/模型自动填入、说明切换）

### 产物

- 单文件 `线性代数计算器.html` 重建（1,276,833 B）
- 安卓 `versionCode 6→7`、`versionName 1.9→1.10`，`www` / `assets/public` 同步并清理旧 hash
- 安卓打包材料：`桌面/线性代数计算器-安卓打包-v1.10.zip`

---

## v1.9 — 2026-10-19

### 修 bug：「全部展开」点了没反应

`StepsAccordion` 把初始值塞进 `StepItem` 的 `useState(defaultExpanded)`，React 只在首次挂载读一次 prop。父组件的 `expandedAll` 翻转后，子组件的 state 不跟着变 —— 点了等于没点。

改为**展开状态由父组件持有**（`Set<number>`），子组件只接收 `expanded` + `onToggle`，并加 `aria-expanded` 便于无障碍与自动化测试。折叠、单步展开、全部展开/折叠互不干扰。

### OCR：定位到根因 —— 模型是推理型，`content` 恒为空

用真实接口（`deepseek-flash`）实测，拿到一手数据：

| 场景 | 结果 |
|---|---|
| 整页照片 1440×1920（含 D、D1、D2 等多道题） | **4 分 33 秒**，返回 14 个"行列式"，含 `...` 幻觉，完全不可用 |
| 裁到 6×6 区域 | 6×6 尺寸正确，但数值有误（同一张图跑 4 次结果字节级一致，放大 2×/3× 也一致 → **稳定地读错**） |
| 直接看 HTTP 响应 | `finish_reason: "length"`、`completion_tokens: 2000/8192`（打满）、`content` **空字符串**、`reasoning_content` 上万字 |

**根因**：`deepseek-flash` 是推理模型，把 token 全烧在思维链上，`content` 永远为空。而代码只读 `choices[0].message.content` —— 于是拿到空串，报"格式异常"或解析出 0 项。这条链路从来没真正走通过。

**修复**（`src/lib/ocr-service.ts`、`src/lib/ocr-parse.ts`）：

| 改动 | 说明 |
|---|---|
| 读 `reasoning_content` | `content` 为空但思维链有内容时，从思维链里提结果，并提示"结果来自思维链，请务必核对" |
| `extractJsonFromReasoning` | 思维链里充满中间猜测（"可能是 4×4？"）和复述的示例，取第一个 JSON 必错。改为**从尾部往前**找，并优先挑带 `data` / `box` 的片段 |
| `max_tokens: 8192` | 推理模型的思考预算，给少了连结果都出不来 |
| 在 `parseOcrResponse` 里比较两种取法 | 思维链里先出现的 `["1","2"]` 会被 `extractJson` 抓到并产生 0 项；现在会比较 direct / reasoning 两种结果，取产出更多的那个 |

**同时新增「先定位、再裁剪」**（`ocr-service.ts` / `ocr-prompt.ts` / `ocr-parse.ts`）：

1. 用缩到 768px 的小图问模型："有几个、各几行几列、在图里什么位置"（`box` 用 0–1000 归一化坐标）
2. 客户端按 `box` 从**原图**裁出目标区域（向外留 6% 余量，太小的框丢弃，越界夹回）
3. 只把这一小块送去正式识别，并带上尺寸约束

实测这条路径把整页照片从 **4 分 33 秒 + 垃圾结果** 变成 **约 0.4 秒 + 正确 6×6**。

### 新增：像素自检（挡住「静默漏读」）

用实测图做了客观核对：把矩阵区域按 6×6 切片，**每格墨迹占比 8–10%，而纸面空白处只有 0–1%**。也就是说模型报的那 24 个 `0` 全是漏读 —— 图里根本没有空格子。

这种错误最危险：结果稳定（重跑四次一模一样）、不报错、用户完全看不出来。所以加了一道**客户端像素自检**：

| 环节 | 做法 |
|---|---|
| `measureCellInk`（ocr-service） | 拿裁剪后的画布，按 rows×cols 逐格统计暗像素占比（内缩 15%，避开格线与竖线框） |
| `auditCellInk`（ocr-parse，纯函数） | 把「模型报 0 / 空」与「该格墨迹 ≥ 4%」交叉比对，列出具体坐标 |
| 提示 | 写进该结果的 `warnings`，UI 以 toast 展示：「这 N 个位置图上有内容但被读成 0（第1行第4列…），请重点核对」 |

空白纸面误判为"有内容"的风险已被阈值挡住（4% vs 实测 1% / 9%），单测专门覆盖了「空白格报 0 不误报」。

### 测试

- 源码级回归 86 → **96**（OCR-08 五项：思维链提取、来自思维链的提示、只有猜测时不静默返回、思维链里的定位；OCR-09 五项：像素自检检出漏读、点名位置、空白不误报、混排、读数非 0 不报）
- 端到端 11 → **13**（`tests/ocr-e2e.mjs` 的假模型改成**推理模型形态**：`content` 为空 + `reasoning_content`，并断言主请求送的是裁剪后的小图）
- 新增 `tests/steps-accordion-e2e.mjs`（9 项）：真的点「全部展开」，数展开的步骤数、按钮文案、矩阵行数、再收回去、单步独立切换

### 产物

- 单文件 `线性代数计算器.html` 重建（1,271,098 B）；`dist-pages` 重建（构建号 20261019142719）
- 安卓 `versionCode 4→6`、`versionName 1.7→1.9`；`www` / `assets/public` 同步（已校验 index.html 引用完整、无旧 hash 残留）
- 安卓打包材料重出：`桌面/线性代数计算器-安卓打包-v1.9.zip`（更早的压缩包已删除，避免拿错）

### 结论：这个模型适不适合

能识别，但**不建议继续用 `deepseek-flash` 做 OCR**：它每次都要烧几千 token 思考，6×6 的数字会稳定读错某些位（不是随机）。日常 2×2、3×3 够用；四阶以上建议换非推理的视觉模型（`gpt-4o-mini` / `qwen-vl-max` 等），或者在设置里换 `deepseek-chat`。

---

## v1.7 — 2026-10-19

### 继续修：5 阶行列式仍只识别出低阶

v1.6 把「提示词 + 解析器」改成数组契约后，4 阶好了，5 阶还是不行。这次逐层往下查，问题不在提示词本身了，而在**图片送进模型之前**：

| 文件 | 修复 |
|---|---|
| `src/components/ImageEditorDialog.tsx` | **默认裁剪框从 5%/90% 改成 0/0/100/100（整张图）**——旧默认会悄悄切掉四周 5%，行列式占满画面时最外一行/一列正好没了 |
| 同上 | **裁剪框坐标系修正**：原来框画在 4:3 容器上、切图按图片比例算，看到的和导出的不是同一块。现在预览框按原图比例计算，拖拽也按图片框的 rect 换算 |
| `src/lib/ocr-service.ts` | `image_url` 加 `detail: "high"`（不传时部分服务端按 512px 低清处理，细线全糊）；遇到不认该字段的 400 会自动去掉重试 |
| 同上 | 送图前长边压到 ≤2048（原图 4000px 会被服务端粗暴降采样），用高质量缩放 |
| 同上 | **一次识别 = 两次请求**：先 `buildDimensionProbePrompt` 问「有几个、各几行几列」（20s 超时、失败忽略），再把尺寸作为硬约束塞进主提示词 |
| `src/lib/ocr-prompt.ts` | 新增 `buildDimensionProbePrompt`；`buildOcrPrompt(mode, hints)` 支持尺寸提示；示例补 5 阶行列式 |
| `src/lib/ocr-parse.ts` | 新增 `parseDimensionProbe`（宽松解析探测结果，越界尺寸过滤） |

### 新增：不需要 Key 的端到端测试

`tests/ocr-e2e.mjs`（11 项）：起一个假 OpenAI 兼容接口 + headless Chrome，真的点「图片识别 → 选图 → 编辑器 → 确认 → 回填」，断言裁剪框默认整图、两次请求都带 `detail=high`、主提示词含尺寸提示、5×5 一格不差地回填。配套 `tests/fixtures/det5x5.png` 与 `npm run test:e2e`。

### 测试

- 源码级回归 70 → **78**（新增 OCR-06 八项：探测解析 + 尺寸提示注入）
- 端到端 11 项全过（`tests/ocr-e2e.mjs`）

### 产物

- 单文件 `线性代数计算器.html` 重建（1,266,254 B）；`dist-pages` 重建（构建号 20261019094601）
- 安卓 `versionCode 3→4`、`versionName 1.6→1.7`，`www` / `assets/public` 同步
- 安卓打包材料重出：`桌面/线性代数计算器-安卓打包-v1.7.zip`（v1.6、v1.5 作废）

---

## v1.6 — 2026-10-19

### 修复：四阶行列式只识别出 2×2

| 文件 | 内容 |
|---|---|
| `src/lib/ocr-prompt.ts` | **新增**：提示词独立成模（`buildOcrPrompt(mode)`）。改成**数组契约**、含四阶行列式示例、显式写「示例不是尺寸模板」、要求区分竖线/括号、行列式必须方阵 |
| `src/lib/ocr-parse.ts` | **新增**：纯函数解析层。兼容裸数组 / `{matrices:[…]}` / 旧版单对象；剥代码围栏；从前后的解释文字里抠出配对完整的 JSON；尺寸不符以 `data` 为准；短行补空、`null`→`""`、非方阵行列式降级 |
| `src/lib/ocr-service.ts` | 新增 `recognizeAllFromImage()` 返回 `OcrItem[]`；`recognizeMatrixFromImage()` 退化为「取第一个」的兼容入口；`toLegacyResult()` 转回各 section 用的扁平结构 |
| `src/components/OCRResultPicker.tsx` | **新增**：一张图识别出多个矩阵/行列式时的选择框（序号 / 名称 / 类型 / 尺寸 / 首行预览 / 警告） |
| `src/components/OCRUploadButton.tsx` | 0 个报「没识别到」、1 个直接回填、多个弹选择框；成功提示带上 kind 与 label；模型 warning 以 toast 呈现 |

**根因（两个）**：① 旧提示词通篇只要求「一个矩阵」，示例是 2×2/3×3，模型把示例尺寸当成了输出规范；② 旧解析器只认 `{rows, cols, data}` 单对象，模型真要按数组返回反而报「格式不正确」——提示词与解析器互相锁死在「一个矩阵」。

**验证**：无真实 Key，用构造的模型响应跑源码级断言（四阶行列式 4×4 不被截断、脏输出可救回、尺寸不符以 data 为准等）。

### 测试

- `tests/build-and-test.mjs`：新增 OCR-01～OCR-05（22 项），断言总数 48 → **70**

### 产物

- 单文件 `线性代数计算器.html` 重建（1,261,087 B）；`dist-pages` 重建（构建号 20261019092205）
- 安卓工程 `versionCode 2→3`、`versionName 1.5→1.6`；`www` 与 `assets/public` 同步新资源
- 安卓打包材料重出：`桌面/线性代数计算器-安卓打包-v1.6.zip`（v1.5 那份作废）

---

## v1.5.1 — 2026-10-19

### 修复：双击单文件 html 显示 404

| 文件 | 内容 |
|---|---|
| `src/lib/base-path.ts` | `resolveBasename` 现在识别 Windows 磁盘路径（`/C:/...`），直接返回 `/`；新增 `resolveRouterMode(protocol)` |
| `src/index.tsx` | `file:` / `capacitor:` 等非 http(s) 协议改用 `HashRouter`，http(s) 仍是 `BrowserRouter` |

**根因**：`file:///C:/.../线性代数计算器.html` 的 `pathname` 是磁盘路径。旧逻辑把它当站点目录，basename 变成 `/C:/Users/.../线性代数计算器`，剩下的 `/线性代数计算器.html` 匹配不到任何路由，直接落到 404 兜底页。`BrowserRouter` 依赖站点目录，本地单文件根本没有，所以改走 HashRouter（地址变成 `x.html#/`）。

**验证**：无头 Chrome 打开 `file:///C:/Users/hp/OneDrive/Desktop/线性代数计算器/线性代数计算器.html` → DOM 渲染出「矩阵运算 / 计算结果显示」区域，截图确认首屏正常（修复前是「页面不存在」）。

### 安卓打包材料

- 新增 `桌面/线性代数计算器-安卓打包-v1.5.zip`（1.19 MB）：内含 Gradle 工程（网页资源已同步到 `assets/public`）、`node_modules/@capacitor/android`（Gradle 需要，免除 npm 安装）、`build-apk.bat`（Windows 一键）/ `build-apk.sh`、`打包说明.md`
- `android/android/app/build.gradle`：`versionCode 1 → 2`、`versionName 1.0 → 1.5`
- 同步最新网页资源到 `android/www` 与 `android/app/src/main/assets/public`，并清掉 3 个未被引用的旧 hash 资源

### 文档

- 新增 `项目说明.md`（面向作者本人的一页纸：产物地图、日常五件事、当前卡点、术语小抄）
- 断言数 42 → **48**（新增 BASE-02 六项：磁盘路径识别、四种协议的 Router 选择）

---

## v1.5 — 2026-10-19

### iOS 交付（这轮重点）

| 文件 | 内容 |
|---|---|
| `src/lib/pwa.ts` | **新增**：iOS/iPadOS 判定（含 iPadOS 13+ 桌面版 UA 靠触摸点数识别）、独立窗口判定、`shouldShowInstallHint` 触发条件、`navigator.storage.persist()` 申请 |
| `src/components/AddToHomeScreenBanner.tsx` | **新增**：底部引导条。只在「iOS Safari + 标签页 + HTTPS + 用户没关过」时出现，三步图文 + `env(safe-area-inset-bottom)`，关闭状态记在 `scopedStorage` |
| `src/components/OCRSettingsDialog.tsx` | API Key 下方加 iOS 存储风险提示：标签页里 7 天不访问会被清；从主屏启动则显示「不会被定期清理」 |
| `src/index.tsx` | 启动时调用 `requestPersistentStorage()`（Chromium 生效，iOS 无此 API 静默跳过） |
| `src/app.tsx` | 引导条挂在 Routes 外，404 兜底页也能提示 |

> 之所以把它做成应用内引导而不是只放文档：Safari 标签页的存储 7 个使用日无交互即清空，主屏 Web App 走独立存储桶且豁免。OCR 的 Key 存在 localStorage，用户不引导就会以为"配置自己丢了"。图标只是顺带。

### 结果可复制

| 文件 | 内容 |
|---|---|
| `src/lib/copy-text.ts` | **新增**：`joinRows` / `matrixToText`（行内制表符、行间换行）+ `extractCopyText`（按 `data-copy-*` 标记从 DOM 还原） |
| `src/components/CopyButton.tsx` | **新增**：调 `copyToClipboard`，失败回落 `execCommand`，成功 1.6s 对勾反馈 |
| `MatrixDisplay` / `SymbolicMatrixDisplay` / 5 个 section | 展示节点打 `data-copy-row` / `data-copy-cell` / `data-copy-value`；结果卡标题行右侧接「复制」 |

### 测试

- `tests/build-and-test.mjs`：新增 PWA-01（13 项）、COPY-01（4 项），断言总数 25 → **48**

### 产物

- `线性代数计算器.html` 重建（1,304,779 字节）；`dist-pages` 重建（构建号 20261019081254）
- 本地以 `/repo/` 子路径起服务复验：index / JS / CSS / manifest / sw / icon / 404 全部 200 且类型正确

### 已知未变

- APK 仍是 v1.0 旧包；iOS 未上真机；Actions 未首跑（本地无 `gh`，仓库未建）

---

## v1.4 — 2026-10-19

### 新增文档（仅文档，产物未变）

| 文件 | 内容 |
|---|---|
| `docs/交接文档.md` | 给接手人：三十秒现状、仓库地图、版本演进、构建与验证（含"哪些验过、哪些没验过"）、8 条设计决策与被否方案、风险清单（含 git 仓库位置错误）、接手第一小时步骤 |
| `docs/新会话提示词.md` | 开新对话时粘贴的上下文模板：极简版 / 标准版 / 4 个专项片段（iOS、APK、算法、视觉），附写法理由与维护清单 |

### 这轮发现的环境问题（未修复，已写进交接文档风险 1）

- `C:\Users\hp` 下存在一个零提交的 `.git`，在项目目录执行任何 git 命令都会作用到**整个用户目录**，`git add .` 会把 `Cookies/`、`.ssh/` 等一并纳入。必须在项目根 `git init` 并确认 `git rev-parse --show-toplevel` 后再建远端。

### 说明

- 两份文档均为内部文档，**不编入 `docs/手册.html`**（该合集面向使用者与维护者阅读，不承载"未完成事项"这类过程信息）。

---

## v1.3 — 2026-10-19

### 新增：可托管为 PWA（GitHub Pages / 任意静态托管）

| 文件 | 内容 |
|---|---|
| `src/lib/base-path.ts` | **修 bug**：`BrowserRouter` 的 basename 原写死 `/`，部署到 `/<repo>/` 会渲染「页面不存在」。现按 URL 目录推断（含 `file://`） |
| `src/index.tsx` | 使用 `resolveBasename`；HTTPS 下注册 Service Worker（失败静默） |
| `index.html` / `make-standalone.mjs` 模板 | manifest、apple-touch-icon、theme-color、iOS 主屏 meta |
| `public/manifest.webmanifest`、`public/sw.js` | PWA 清单与离线缓存（导航 network-first、静态资源 cache-first、跨域不接管） |
| `public/icons/*.png` | 192/512/maskable/apple-touch（`tools/make-icons.py` 生成） |
| `scripts/make-pages.mjs` | 产出 `dist-pages`：注入 SW 版本、`.nojekyll`、404 兜底、资源自检 |
| `.github/workflows/deploy-pages.yml` | push 到 main → 构建 → 跑测试 → 发布 Pages |

### 构建加固

- `make-single-file.mjs`：入口 `index-*.js` / `.css` 必须唯一，防止取到历史构建文件（此前确实取错过，产物内部 JS/CSS 不一致）
- `make-standalone.mjs` / `make-pages.mjs`：排除 `.map`；`cpSync` 改为手写递归复制
- `scripts/check-native-deps.mjs` + `prebuild*`：缺 Windows 原生依赖时直接给出修复命令
- `package.json`：`vite build --emptyOutDir`，避免 `dist` 残留旧 hash
- 根 `.gitignore`：忽略 `node_modules`、`dist*`、`tests/.build`、`_backup`
- `make-pages.mjs` 不做递归删除（尊重"删除需人确认"），改为增量覆盖

### 文档

- 新增《部署-GitHub-Pages》：cookie vs localStorage 的选择、CORS 实测（DeepSeek 通过 / OpenAI 本机不可达）、可达性实测、Actions 与手动两种部署、iOS 添加主屏流程、安全须知、验收清单
- 《可行性-iOS端》标注 PWA 路线已落地
- `tests/build-and-test.mjs` 增加 BASE-01（7 个 URL 形态），断言总数 18 → 25

### 产物

- `线性代数计算器.html` 重建（1,294,197 字节）；安卓 `www/` 与 `assets/public/` 同步

---

## v1.2 — 2026-10-19

拿到源码后，从"给产物打补丁"切换为"改源码再构建"。

### 源码到位

- 归档到 `source/linear-algebra-calculator/`：`web-source`（Vite + React 19 + TS）、`android`（Capacitor 6）、`single-file`
- 新增《源码解析》：模块职责、数据流、构建链、**与逆向结论的差异对照**

### 修复（源码级，取代 v1.1 的字节补丁）

| 编号 | 位置 | 改动 |
|---|---|---|
| L13 | `src/lib/matrix-ops.ts` | `rankAb` 改为统计行最简形的非零行数（原实现复用了只在系数列选主元的 rank，恒等于 `rankA`） |
| L4 | `src/lib/ocr-service.ts` | `AbortController` + 45s 超时；超时提示「识别超时（45 秒无响应）」，`finally` 清理定时器 |
| 构建 | `scripts/make-standalone.mjs` | `fs.cpSync` 在本机会静默崩溃（退出码 127），改为手写递归复制 |

### 文档修正（读源码后推翻了此前的判断）

| 原来写的 | 实际 |
|---|---|
| RREF 取"第一个非零行"作主元 | RREF 与 det 共用"整数友好"评分，优先整数、其次小分母 |
| 方程组未知数上限 1–9 | 1–10（列数 2–11） |
| 特征值可用到 10 阶 | UI 限制 **5 阶**，超出报「特征值计算最多支持 5 阶矩阵」 |
| L7：非法输入静默保留旧值 | 不成立：`MatrixCell` 解析失败时红框 + 保持编辑态 |
| L8：`copyToClipboard` 是业务死代码 | 来自平台库 `@lark-apaas/client-toolkit-lite`，业务未接 |
| "改功能必须回妙搭" | 源码可直接改、本地构建 |

### 产物

- `线性代数计算器.html` 由源码重建：1,237,144 字节，`node --check` 通过
- 安卓工程的 `www/` 与 `assets/public/` 已同步为新构建（去掉了 `.map`）
- 旧产物归档：`_backup/线性代数计算器_v1.1_bytepatch.html`、`_backup/线性代数计算器_v1.0_backup.html`

### 测试

`tests/build-and-test.mjs`：直接从源码打 CJS 包跑断言，18 项全部通过（含 EQ-04 的 `rankAb=2`）。
旧的"从产物抽函数"方案已删除——源码在手，不需要那种迂回。

---

## v1.1 — 2026-10-19

### 修复

| 编号 | 问题 | 改动 | 影响面 |
|---|---|---|---|
| L13 | 方程组判「无解」时，界面附注的两个秩恒相等（如 `1 与 1`），与「秩不相等故无解」自相矛盾 | 无解分支返回 `rankA + 1` 作为增广矩阵秩（数学上必然成立） | 仅显示值；结论本来就正确 |
| L4 | OCR 请求没有超时，接口挂起时界面一直 loading | `fetch` 加 `AbortSignal.timeout(45s)`，不支持的浏览器自动退化 | OCR 异常场景 |

两处均为**压缩产物上的字节级替换**，共 +62 字节，其余字节不变。原始产物备份：`_backup/线性代数计算器_v1.0_backup.html`；补丁脚本已归档到 `_backup/legacy/`（v1.2 起不再使用，由源码修复取代）。

> ⚠️ 重新从源码构建会覆盖补丁，需按《技术手册》第 14 节重打。

### 新增文档

- `README.md`：项目总览、能力表、文档索引
- `docs/用户手册.md`：六个模块的操作、结果解读、报错对照、FAQ
- `docs/技术手册.md`：数值模型、算法实现、OCR 管线、存储与网络行为、15 条已知限制、补丁记录
- `docs/开发者指南.md`：bundle 定位技巧、三条改造路线、Capacitor 重打包、发版清单、故障排查
- `docs/测试手册.md`：60+ 条可判定用例（期望值独立核算）
- `docs/可行性-iOS端.md`：Windows 上开发/交付 iOS 的四条路线与取舍
- `docs/可行性-视觉模型配置存储.md`：浏览器保存 API Key 的可行性、威胁模型、分级加固方案
- `docs/build_docs.py` + `docs/手册.html`：Markdown 一键生成离线单页手册

### 新增自动回归

`tests/` 下是一套**从产物中抽取真实实现**的回归脚本（无源码条件下的折中）：

```bash
python tests/extract_solver.py     # 抽取 I$ / B0 / 分数类（v1.2 已废弃）
node tests/run_solver_tests.cjs    # 16 项断言（v1.2 已废弃）
```

> v1.2 拿到源码后，这套脚本已被 `tests/build-and-test.mjs`（直接测源码，18 项）取代并删除。

覆盖唯一解（3 元 / 2 元）、无穷多解（自由变量 + 基础解系）、无解（rankA=1、rankAb=2）、齐次、分数系数。v1.1 实测：16/16 通过。

### 文档修正（相对初稿）

- OCR 入口位置：由「顶栏」更正为**各矩阵卡片标题右侧**；顶栏只有「小数模式 / 分数模式」开关
- 移除"界面有复制按钮"的说法（`copyToClipboard` 虽已实现但无调用点）
- 方程组无解时秩显示由"已知缺陷"改为"已修复"

### 未处理

APK 未打补丁：`assets/public/assets/index-*.js` 是另一份构建，重打包需原签名密钥，会在下次源码构建时一并带上。

---

## v1.0 — 2026-10-18

- Web 单文件产物：`线性代数计算器.html`（1.23 MB）
- Android 产物：`线性代数计算器.apk`（4.2 MB，`com.doubao.linalg`，Capacitor）
- 图像识别配置手册：`线性代数计算器图像识别功能使用手册.pdf`（5 页）

功能：单矩阵 8 项、双矩阵 3 项、符号运算 6 项、线性方程组（唯一/无穷/无解 + 高斯消元步骤）、向量 6 项、OCR 三种识别模式。
