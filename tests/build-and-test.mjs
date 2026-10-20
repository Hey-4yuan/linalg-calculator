// 方程组求解器回归测试：直接测源码 src/lib/*.ts，不依赖压缩产物。
// 用法：node tests/build-and-test.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "source/linear-algebra-calculator/web-source");
const BUILD = path.join(ROOT, "tests/.build");
const ENTRY = path.join(BUILD, "entry.ts");
const OUT = path.join(BUILD, "linalg.cjs");

fs.mkdirSync(BUILD, { recursive: true });
// 单入口打包，保证 matrix-ops 与 fraction 用同一份 Fraction 实现（class 身份一致）
fs.writeFileSync(
  ENTRY,
  `export { solveLinearSystem } from ${JSON.stringify(
    path.join(SRC, "src/lib/matrix-ops.ts").replace(/\\/g, "/")
  )};
export { toFMatrix, Fraction } from ${JSON.stringify(
    path.join(SRC, "src/lib/fraction.ts").replace(/\\/g, "/")
  )};
export { resolveBasename, resolveRouterMode } from ${JSON.stringify(
    path.join(SRC, "src/lib/base-path.ts").replace(/\\/g, "/")
  )};
export { isIosDevice, isIosSafari, isStandaloneDisplay, shouldShowInstallHint } from ${JSON.stringify(
    path.join(SRC, "src/lib/pwa.ts").replace(/\\/g, "/")
  )};
export { joinRows, matrixToText } from ${JSON.stringify(
    path.join(SRC, "src/lib/copy-text.ts").replace(/\\/g, "/")
  )};
export { parseOcrResponse, parseDimensionProbe, extractJsonFromReasoning, auditCellInk, parseMaxTokensLimit } from ${JSON.stringify(
    path.join(SRC, "src/lib/ocr-parse.ts").replace(/\\/g, "/")
  )};
export { OCR_PRESETS, matchPreset } from ${JSON.stringify(
    path.join(SRC, "src/lib/ocr-presets.ts").replace(/\\/g, "/")
  )};
export { buildOcrPrompt, buildDimensionProbePrompt } from ${JSON.stringify(
    path.join(SRC, "src/lib/ocr-prompt.ts").replace(/\\/g, "/")
  )};
`,
  "utf-8"
);

// 用 esbuild 的 JS API，**不要**写成 `node node_modules/esbuild/bin/esbuild`。
//
// 这个坑踩过：`esbuild/bin/esbuild` 在 Windows 上是带 shebang 的 JS 垫片，
// 但在 Linux / macOS 上，postinstall 会把它换成**原生可执行文件**。
// 用 node 去解释一个 ELF，得到的是
//   SyntaxError: Invalid or unexpected token   （第 1 行是 \x7fELF）
// 也就是说本地 Windows 永远正常、CI 上 0 秒必挂。JS API 两个平台都对。
const requireFromSrc = createRequire(path.join(SRC, "package.json"));
try {
  requireFromSrc("esbuild").buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile: OUT,
    logLevel: "warning",
  });
} catch (e) {
  console.error("\n[esbuild 打不出包] 先看是不是原生二进制没装好，不是代码问题。");
  console.error(`  node      : ${process.version} (${process.platform}/${process.arch})`);
  try {
    const dirs = fs.readdirSync(path.join(SRC, "node_modules/@esbuild"));
    console.error(`  @esbuild/*: ${dirs.join(", ")}`);
  } catch {
    console.error("  @esbuild/*: 目录不存在");
  }
  console.error("  修法：删掉 node_modules 与 package-lock.json 后重新 npm install，");
  console.error("        或 npm install --no-save @esbuild/<你的平台>-<架构>");
  throw e;
}



const require = createRequire(import.meta.url);
const { solveLinearSystem, toFMatrix, resolveBasename, resolveRouterMode } = require(OUT);
const {
  isIosDevice,
  isIosSafari,
  isStandaloneDisplay,
  shouldShowInstallHint,
} = require(OUT);
const { joinRows, matrixToText } = require(OUT);
const {
  parseOcrResponse,
  parseDimensionProbe,
  extractJsonFromReasoning,
  auditCellInk,
  parseMaxTokensLimit,
  buildOcrPrompt,
  buildDimensionProbePrompt,
} = require(OUT);

const F = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toFractionString()]));

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`);
  }
};

const solve = (rows) => solveLinearSystem(toFMatrix(rows));

function run() {
  console.log("EQ-01 唯一解（3 元）");
  {
    const r = solve([[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]]);
    check("type=unique", r.type === "unique", r.type);
    check(
      "x=(2,3,-1)",
      JSON.stringify(F(r.solution)) === '{"x1":"2","x2":"3","x3":"-1"}',
      JSON.stringify(F(r.solution))
    );
    check("rankA=rankAb=3", r.rankA === 3 && r.rankAb === 3, `${r.rankA}/${r.rankAb}`);
  }

  console.log("EQ-02 唯一解（2 元）");
  {
    const r = solve([[2, 3, 7], [1, -1, 1]]);
    check(
      "x=(2,1)",
      JSON.stringify(F(r.solution)) === '{"x1":"2","x2":"1"}',
      JSON.stringify(F(r.solution))
    );
  }

  console.log("EQ-03 无穷多解");
  {
    const r = solve([[1, 2, 3, 1], [2, 4, 6, 2], [3, 6, 9, 3]]);
    check("type=infinite", r.type === "infinite", r.type);
    check("自由变量 x2,x3", r.freeVariables.join(",") === "x2,x3", r.freeVariables.join(","));
    check(
      "特解 (1,0,0)",
      JSON.stringify(F(r.particularSolution)) === '{"x1":"1","x2":"0","x3":"0"}',
      JSON.stringify(F(r.particularSolution))
    );
    check(
      "基础解系 (-2,1,0),(-3,0,1)",
      r.basisVectors.map((b) => JSON.stringify(F(b))).join(";") ===
        '{"x1":"-2","x2":"1","x3":"0"};{"x1":"-3","x2":"0","x3":"1"}',
      r.basisVectors.map((b) => JSON.stringify(F(b))).join(";")
    );
  }

  console.log("EQ-04 无解（L13 关键用例）");
  {
    const r = solve([[1, 1, 1], [2, 2, 3]]);
    check("type=no-solution", r.type === "no-solution", r.type);
    check("rankA=1", r.rankA === 1, String(r.rankA));
    check("rankAb=2（修复前恒等于 rankA）", r.rankAb === 2, String(r.rankAb));
  }

  console.log("EQ-05 齐次无穷多解");
  {
    const r = solve([[1, 1, 0], [2, 2, 0]]);
    check("type=infinite", r.type === "infinite", r.type);
    check(
      "基础解系 (-1,1)",
      JSON.stringify(F(r.basisVectors[0])) === '{"x1":"-1","x2":"1"}',
      JSON.stringify(F(r.basisVectors[0]))
    );
  }

  console.log("EQ-06 分数系数");
  {
    const r = solve([["1/2", "1/3", 1], ["1/3", "1/4", "1/2"]]);
    check("type=unique", r.type === "unique", r.type);
    check(
      "x=(6,-6)",
      r.solution.x1.toFractionString() === "6" && r.solution.x2.toFractionString() === "-6",
      `${r.solution.x1.toFractionString()},${r.solution.x2.toFractionString()}`
    );
  }

  console.log("EQ-07 4 元欠定（2 个自由变量）");
  {
    const r = solve([[1, 0, 1, 0, 2], [0, 1, 0, 1, 3]]);
    check("type=infinite", r.type === "infinite", r.type);
    check("自由变量 x3,x4", r.freeVariables.join(",") === "x3,x4", r.freeVariables.join(","));
    check(
      "特解 (2,3,0,0)",
      JSON.stringify(F(r.particularSolution)) === '{"x1":"2","x2":"3","x3":"0","x4":"0"}',
      JSON.stringify(F(r.particularSolution))
    );
  }

  console.log("BASE-01 子路径部署的 basename 推断");
  {
    const cases = [
      ["/", "/"],
      ["/index.html", "/"],
      ["/repo/", "/repo"],
      ["/repo/index.html", "/repo"],
      ["/repo", "/repo"],
      ["/a/b/index.html", "/a/b"],
    ];
    for (const [input, expected] of cases) {
      check(`resolveBasename(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`,
        resolveBasename(input) === expected, resolveBasename(input));
    }
    check("平台注入优先", resolveBasename("/repo/", "/custom/") === "/custom",
      resolveBasename("/repo/", "/custom/"));
  }

  console.log("BASE-02 本地双击（file://）不能落到 404");
  {
    // v1.5 线上版回归：file:// 的 pathname 是磁盘路径，当作 basename 会剩下文件名 → 404
    check(
      "Windows 磁盘路径不当作 basename",
      resolveBasename("/C:/Users/hp/OneDrive/Desktop/线性代数计算器/线性代数计算器.html") === "/",
      resolveBasename("/C:/Users/hp/OneDrive/Desktop/线性代数计算器/线性代数计算器.html"),
    );
    check(
      "反斜杠形态同样识别",
      resolveBasename("/C:\\Users\\hp\\app.html") === "/",
      resolveBasename("/C:\\Users\\hp\\app.html"),
    );
    check("file: 用 HashRouter", resolveRouterMode("file:") === "hash", resolveRouterMode("file:"));
    check("https: 用 BrowserRouter", resolveRouterMode("https:") === "browser", resolveRouterMode("https:"));
    check("http: 用 BrowserRouter", resolveRouterMode("http:") === "browser", resolveRouterMode("http:"));
    check("capacitor: 用 HashRouter", resolveRouterMode("capacitor:") === "hash", resolveRouterMode("capacitor:"));
  }

  console.log("PWA-01 iOS 判定与「添加到主屏」引导触发条件");
  {
    const IPHONE =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const IPAD_DESKTOP_UA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    const ANDROID_CHROME =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    const IOS_CHROME = IPHONE.replace("Version/17.5 Mobile/15E148 Safari/604.1", "CriOS/126.0 Mobile/15E148 Safari/604.1");

    const iosTab = { userAgent: IPHONE, secureContext: true };
    check("iPhone Safari 识别为 iOS", isIosDevice(iosTab) === true);
    check("iPhone Safari 是 Safari", isIosSafari(iosTab) === true);
    check(
      "iPadOS 桌面版 UA 靠触摸点数识别",
      isIosDevice({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 }) === true,
    );
    check(
      "桌面 Mac（无触摸）不算 iOS",
      isIosDevice({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 }) === false,
    );
    check("Android Chrome 不算 iOS", isIosSafari({ userAgent: ANDROID_CHROME }) === false);
    check("iOS 上的 Chrome 不能加主屏 → 不提示", isIosSafari({ userAgent: IOS_CHROME }) === false);
    check(
      "navigator.standalone 判定为主屏启动",
      isStandaloneDisplay({ userAgent: IPHONE, standalone: true }) === true,
    );
    check(
      "display-mode: standalone 判定为主屏启动",
      isStandaloneDisplay({ userAgent: IPHONE, displayModeStandalone: true }) === true,
    );
    check("iOS 标签页 + 未关闭 → 显示引导", shouldShowInstallHint(iosTab, false) === true);
    check("用户已关闭 → 不显示", shouldShowInstallHint(iosTab, true) === false);
    check(
      "已从主屏启动 → 不显示",
      shouldShowInstallHint({ ...iosTab, standalone: true }, false) === false,
    );
    check(
      "非 HTTPS → 不显示（加了也没意义）",
      shouldShowInstallHint({ ...iosTab, secureContext: false }, false) === false,
    );
    check("Android Chrome → 不显示", shouldShowInstallHint({ userAgent: ANDROID_CHROME, secureContext: true }, false) === false);
  }

  console.log("COPY-01 结果复制文本格式");
  {
    check(
      "行内制表符、行间换行",
      joinRows([["1", "2"], ["3", "4"]]) === "1\t2\n3\t4",
      JSON.stringify(joinRows([["1", "2"], ["3", "4"]])),
    );
    const m = toFMatrix([
      ["1/3", "-2"],
      ["0", "5"],
    ]);
    check(
      "分数模式输出 a/b",
      matrixToText(m, true) === "1/3\t-2\n0\t5",
      JSON.stringify(matrixToText(m, true)),
    );
    check(
      "小数模式按精度截断",
      matrixToText(m, false, 4) === "0.3333\t-2\n0\t5",
      JSON.stringify(matrixToText(m, false, 4)),
    );
    check("单行矩阵不产生多余换行", matrixToText(toFMatrix([[7, 8, 9]]), true) === "7\t8\t9");
  }

  console.log("OCR-01 四阶行列式与多结果解析（v1.6 核心回归）");
  {
    const fourByFour =
      '[{"kind":"determinant","rows":4,"cols":4,"data":[[2,1,0,3],[1,3,2,1],[0,2,1,4],[3,1,2,1]],"format":"numeric"}]';
    const r = parseOcrResponse(fourByFour);
    check(
      "四阶行列式不被截成 2×2",
      r.items.length === 1 && r.items[0].rows === 4 && r.items[0].cols === 4,
      r.items[0] ? `${r.items[0].rows}×${r.items[0].cols}` : "空",
    );
    check("kind 保留为 determinant", r.items[0].kind === "determinant");
    check("数字单元格转成字符串", r.items[0].data[0][0] === "2");
  }

  console.log("OCR-02 各种脏输出都能救回来");
  {
    const messy =
      '识别结果如下：\n```json\n[{"kind":"matrix","rows":2,"cols":2,"data":[[1,2],[3,4]]}]\n```\n以上。';
    check("代码块 + 前后文字可救回", parseOcrResponse(messy).items.length === 1);
    check(
      "旧版单对象格式兼容",
      parseOcrResponse('{"rows":3,"cols":3,"data":[[1,2,3],[4,5,6],[7,8,9]]}').items[0].rows === 3,
    );
    const wrapped = '{"matrices":[{"data":[[1,2],[3,4]]},{"data":[[5],[6]]}]}';
    check("兼容 {matrices:[...]} 包装", parseOcrResponse(wrapped).items.length === 2);
    check("空数组 [] 不报错", parseOcrResponse("[]").items.length === 0);

    let err = null;
    try {
      parseOcrResponse("抱歉，我无法识别这张图片");
    } catch (e) {
      err = e;
    }
    check(
      "非 JSON 抛错且带原文片段",
      !!err && String(err.message).includes("不是合法 JSON"),
      err ? err.message.slice(0, 40) : "没抛错",
    );
  }

  console.log("OCR-03 尺寸与单元格异常的处理");
  {
    const declaredWrong = parseOcrResponse('[{"rows":4,"cols":4,"data":[[1,2],[3,4]]}]').items[0];
    check(
      "声明尺寸与 data 不符时以 data 为准",
      declaredWrong.rows === 2 && declaredWrong.cols === 2,
      `${declaredWrong.rows}×${declaredWrong.cols}`,
    );
    check(
      "尺寸不符会记 warning",
      declaredWrong.warnings.some((w) => w.includes("4 行")),
      declaredWrong.warnings.join(" | "),
    );

    const ragged = parseOcrResponse('[{"data":[[1,2,3],[4]]}]').items[0];
    check("短行补空列", ragged.cols === 3 && ragged.data[1].length === 3);

    const withNull = parseOcrResponse('[{"data":[[1,null],["1/2","√2"]]}]').items[0];
    check("null 转空串并提示", withNull.data[0][1] === "" && withNull.warnings.some((w) => w.includes("无法识别")));
    check("混合内容 format 推断为 mixed", withNull.format === "mixed", withNull.format);

    const notSquare = parseOcrResponse('[{"kind":"determinant","data":[[1,2,3],[4,5,6]]}]').items[0];
    check(
      "非方阵行列式降级为矩阵",
      notSquare.kind === "matrix" && notSquare.warnings.some((w) => w.includes("方阵")),
    );
  }

  console.log("OCR-04 增广矩阵列索引");
  {
    const aug = parseOcrResponse(
      '[{"kind":"matrix","data":[[1,2,3],[4,5,6]],"augmented":true,"augmented_col":2}]',
    ).items[0];
    check("augmented_col 1 起 → 内部 0 起", aug.augmentedCol === 1, String(aug.augmentedCol));
    const outOfRange = parseOcrResponse(
      '[{"data":[[1,2]],"augmented":true,"augmented_col":9}]',
    ).items[0];
    check("越界增广列被忽略", outOfRange.augmentedCol === undefined);
  }

  console.log("OCR-05 提示词约束（防再次退化成「只认 2 阶」）");
  {
    const p = buildOcrPrompt("matrix");
    check("要求始终返回数组", p.includes("始终只返回 JSON 数组"));
    check("含四阶行列式示例", p.includes('"rows":4,"cols":4'));
    check("明确「示例不是尺寸模板」", p.includes("不是尺寸模板"));
    check("要求区分竖线/括号", p.includes("竖线"));
    check("system 模式提到 augmented_col", buildOcrPrompt("system").includes("augmented_col"));
    check("symbolic 模式给出写法约定", buildOcrPrompt("symbolic").includes('"*"'));
  }

  console.log("OCR-06 尺寸探测与尺寸提示（5 阶以上的关键）");
  {
    const probe = parseDimensionProbe('[{"rows":5,"cols":5}]');
    check(
      "探测结果解析为 5×5",
      !!probe && probe.length === 1 && probe[0].rows === 5 && probe[0].cols === 5,
      JSON.stringify(probe),
    );
    check(
      "单对象形式也接受",
      !!parseDimensionProbe('{"rows":4,"cols":4}') &&
        parseDimensionProbe('{"rows":4,"cols":4}')[0].cols === 4,
    );
    check(
      "带 items 包装也接受",
      !!parseDimensionProbe('{"items":[{"rows":2,"cols":3}]}'),
    );
    check("看不懂就返回 null（不影响主流程）", parseDimensionProbe("抱歉，看不清") === null);
    check(
      "越界尺寸被过滤（0 行 / 99 列）",
      parseDimensionProbe('[{"rows":0,"cols":5},{"rows":99,"cols":99}]') === null,
    );

    const withHint = buildOcrPrompt("matrix", [{ rows: 5, cols: 5 }]);
    check("提示词带上尺寸约束", withHint.includes("5 行 × 5 列"), withHint.slice(-160));
    check("提示词要求真的写成 5 行 5 列", withHint.includes("必须真的写成 5 行 × 5 列"));
    check("探测提示词只问尺寸", buildDimensionProbePrompt("matrix").includes("只返回 JSON 数组"));
  }

  console.log("OCR-07 定位框（整页照片只裁目标区域）");
  {
    const withBox =
      '[{"rows":6,"cols":6,"box":{"x":300,"y":250,"w":420,"h":380}}]';
    const h = parseDimensionProbe(withBox);
    check("解析出 6×6 + box", !!h && h[0].rows === 6 && !!h[0].box, JSON.stringify(h));
    check(
      "box 留了余量（向外扩）",
      !!h && h[0].box.x < 300 && h[0].box.w > 420,
      JSON.stringify(h?.[0]?.box),
    );
    check(
      "box 不越界",
      !!h && h[0].box.x >= 0 && h[0].box.x + h[0].box.w <= 1000,
      JSON.stringify(h?.[0]?.box),
    );

    const noBox = parseDimensionProbe('[{"rows":3,"cols":3}]');
    check("没有 box 也能用（只做尺寸约束）", !!noBox && noBox[0].box === undefined);

    const badBox = parseDimensionProbe('[{"rows":3,"cols":3,"box":{"x":0,"y":0,"w":0,"h":0}}]');
    check("宽高为 0 的框被丢弃", !!badBox && badBox[0].box === undefined, JSON.stringify(badBox));

    const tiny = parseDimensionProbe('[{"rows":3,"cols":3,"box":{"x":10,"y":10,"w":20,"h":20}}]');
    check("过小的框被丢弃（多半是误报）", !!tiny && tiny[0].box === undefined);

    const outOfRange =
      '[{"rows":3,"cols":3,"box":{"x":900,"y":900,"w":150,"h":150}}]';
    const o = parseDimensionProbe(outOfRange);
    check(
      "越界框被夹回图内",
      !!o && !!o[0].box && o[0].box.x + o[0].box.w <= 1000 && o[0].box.y + o[0].box.h <= 1000,
      JSON.stringify(o?.[0]?.box),
    );

    check(
      "定位提示词要求给 box",
      buildDimensionProbePrompt("matrix").includes('"box"'),
      "缺少 box 字段说明",
    );
  }

  console.log("OCR-08 推理模型（deepseek-flash 等）：content 为空，只有思维链");
  {
    // 复刻真实返回：思维链里有大量中间猜测，最后才给出结论
    const reasoning = [
      "我们需要回答用户问题：图中有几个矩阵或行列式。",
      "先看左上角，似乎有一个 2x2 的东西，可能是 [\"1\",\"2\"]？不确定。",
      "示例里写的是 [{\"rows\":5,\"cols\":5}]，但那是示例。",
      "再仔细数：顶部 D 的部分，第一行 1 4 2 0 0 0，第二行 5 8 4 0 0 0……",
      "所以最终结论是 6 行 6 列。",
      '因此答案：[{"kind":"determinant","label":"D","rows":6,"cols":6,"data":[[1,4,2,0,0,0],[5,8,4,0,0,0],[0,0,10,0,0,0],[8,9,1,5,0,1],[1,2,11,1,2,2],[22,3,6,2,2,5]]}]',
    ].join("\n");

    const picked = extractJsonFromReasoning(reasoning);
    check(
      "从思维链里挑出带 data 的最终结论",
      !!picked && JSON.stringify(picked).includes('"data"'),
      JSON.stringify(picked)?.slice(0, 80),
    );

    const r = parseOcrResponse(reasoning);
    check("思维链可直接解析成 6×6", r.items.length === 1 && r.items[0].rows === 6, `${r.items.length} 项`);
    check(
      "会提示「结果来自思维链，请核对」",
      r.notes.some((n) => n.includes("思维链")),
      JSON.stringify(r.notes),
    );

    // 只有中间猜测、没有结论时不应瞎猜出矩阵
    const onlyGuess = "可能是 2x2，也可能是 3x3。示例：[{\"rows\":5,\"cols\":5}] 但这只是示例。";
    let threw = false;
    try {
      const g = parseOcrResponse(onlyGuess);
      // 允许解析出示例（它会进 warnings），但必须有提示
      threw = g.items.length === 0 || g.notes.length > 0;
    } catch {
      threw = true;
    }
    check("只有猜测时不静默返回结果", threw);

    const probeOnly = '分析后确定：[{"rows":6,"cols":6,"box":{"x":291,"y":473,"w":347,"h":314}}]';
    const ph = parseDimensionProbe(probeOnly);
    check(
      "思维链里的定位也能解析",
      !!ph && ph[0].rows === 6 && !!ph[0].box,
      JSON.stringify(ph),
    );
  }

  console.log("OCR-09 像素自检：检出「图上有墨却报 0」的漏读");
  {
    // 真实数据：6×6 每格都有 8–10% 墨迹，模型却报了 24 个 0
    const inkFull = Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => 0.09),
    );
    const modelOut = [
      ["1", "4", "2", "0", "0", "0"],
      ["5", "8", "4", "0", "0", "0"],
      ["0", "0", "10", "0", "0", "0"],
      ["8", "9", "1", "5", "0", "1"],
      ["1", "2", "11", "1", "1", "2"],
      ["22", "3", "6", "2", "2", "5"],
    ];
    const a = auditCellInk(inkFull, modelOut);
    check("检出漏读的 0", a.suspicious.length > 0, String(a.suspicious.length));
    check(
      "提示里点名具体位置",
      !!a.warning && a.warning.includes("第1行第4列"),
      a.warning,
    );

    // 空白格报 0 属正常，不该误报
    const inkWithBlank = inkFull.map((row) => row.map(() => 0.005));
    const b = auditCellInk(inkWithBlank, modelOut);
    check("空白格报 0 不误报", b.suspicious.length === 0, String(b.suspicious.length));

    // 真 0 且图上无墨
    const c = auditCellInk(
      [[0.09, 0.005], [0.005, 0.09]],
      [["3", "0"], ["0", "5"]],
    );
    check("有无混排时只报漏读的那格", c.suspicious.length === 0, JSON.stringify(c.suspicious));

    // 数字读对了但有墨 —— 不该报
    const d = auditCellInk(inkFull, inkFull.map(() => ["1", "2", "3", "4", "5", "6"]));
    check("读数非 0 时不报", d.suspicious.length === 0);
  }

  console.log("PRESET-01 服务商预设（Base URL 不能写错 /chat/completions）");
  {
    const presets = require(OUT).OCR_PRESETS;
    check("预设非空", Array.isArray(presets) && presets.length >= 5, String(presets?.length));

    const bad = presets.filter(
      (p) => /\/chat\/completions\/?$/.test(p.baseUrl) || !/^https:///////.test(p.baseUrl),
    );
    check("所有 baseUrl 合法且不含 /chat/completions", bad.length === 0, JSON.stringify(bad.map((p) => p.baseUrl)));

    const missing = presets.filter((p) => !p.model || !p.note);
    check("每个预设都有模型名与说明", missing.length === 0, JSON.stringify(missing.map((p) => p.id)));

    const ids = presets.map((p) => p.id);
    check("id 不重复", new Set(ids).size === ids.length);

    const urls = presets.map((p) => p.baseUrl.replace(/\/+$/, ""));
    check("同一家的 baseUrl 复用一致（通义两条同址）", urls.filter((u) => u.includes("dashscope")).length === 2);

    check(
      "matchPreset 能认出来（忽略尾部斜杠）",
      require(OUT).matchPreset("https://open.bigmodel.cn/api/paas/v4/")?.id === "zhipu-flash",
    );
    check("未知地址返回 undefined", require(OUT).matchPreset("https://example.com/v1") === undefined);
  }

  // ── OCR-10 max_tokens 上限解析（智谱 GLM-4V 只有 1024） ──
  // 真实报错：{"error":{"code":"1210","message":"max_tokens参数非法：限制数值范围[1,1024]"}}
  // 各家写法不一样，这里把见过的几种都钉住，避免以后只认一种。
  console.log("OCR-10 从 400 报文里读 max_tokens 上限");
  {
    const cases = [
      ['{"error":{"code":"1210","message":"max_tokens参数非法：限制数值范围[1,1024]"}}', 1024, "智谱中文报文"],
      ['{"error":{"message":"max_tokens is too large: 8192. This model supports at most 4096"}}', 4096, "OpenAI 风格 at most"],
      ["max_tokens: maximum value is 2048", 2048, "maximum value is"],
      ["max_tokens must be <= 1024", 1024, "must be <="],
      ['{"message":"maxTokens参数超出范围，上限 4096"}', 4096, "中文上限"],
    ];
    for (const [text, want, label] of cases) {
      const got = parseMaxTokensLimit(text);
      check(`解析「${label}」→ ${want}`, got === want, `got=${got}`);
    }

    check("非 max_tokens 的报错返回 null", parseMaxTokensLimit('{"error":{"message":"invalid api key"}}') === null);
    check("提到 token 但不是上限问题（如 token 过期）返回 null", parseMaxTokensLimit("token expired, please login") === null);
    check("空字符串返回 null", parseMaxTokensLimit("") === null);
    check("上限 0 视为无效", parseMaxTokensLimit("max_tokens 范围[1,0]") === null);
  }

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
