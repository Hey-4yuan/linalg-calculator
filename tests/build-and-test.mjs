// 方程组求解器回归测试：直接测源码 src/lib/*.ts，不依赖压缩产物。
// 用法：node tests/build-and-test.mjs
import { execFileSync } from "node:child_process";
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
`,
  "utf-8"
);

const esbuild = path.join(SRC, "node_modules/esbuild/bin/esbuild");
execFileSync(
  process.execPath,
  [esbuild, ENTRY, "--bundle", "--format=cjs", "--platform=node", `--outfile=${OUT}`, "--log-level=warning"],
  { stdio: "inherit" }
);

const require = createRequire(import.meta.url);
const { solveLinearSystem, toFMatrix, resolveBasename, resolveRouterMode } = require(OUT);
const {
  isIosDevice,
  isIosSafari,
  isStandaloneDisplay,
  shouldShowInstallHint,
} = require(OUT);
const { joinRows, matrixToText } = require(OUT);

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

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
