// 端到端测试共用的路径与环境解析。
//
// 为什么单独抽出来：三个 e2e 脚本以前各自把「项目根」和「Chrome 路径」写死，
// 目录一重组（项目从 Desktop/线性代数计算器 挪到 Desktop/线性代数计算器/GitHub提交包，
// 单文件版挪到同级的 说明文件/）就全挂了。
// 现在统一按「相对脚本自身位置」解析，并支持环境变量覆盖，换目录不用改代码。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 仓库根（tests/ 的上一级） */
export const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** 单文件版可能出现的位置，按优先级排列 */
const PAGE_CANDIDATES = [
  // 1) 显式指定，最高优先级（CI 或临时验证用）
  process.env.LINALG_HTML,
  // 2) 仓库根（旧布局 / CI 里构建后复制过来的那份）
  path.join(ROOT, "线性代数计算器.html"),
  // 3) 与仓库同级的 说明文件/（2026-10-20 重组后的布局）
  path.join(ROOT, "..", "说明文件", "线性代数计算器.html"),
  // 4) 源码目录里的构建副本（npm run build:all 的产物）
  path.join(ROOT, "source", "linear-algebra-calculator", "web-source", "线性代数计算器.html"),
  // 5) 退而求其次：离线站入口（不是单文件，但同样能跑界面）
  path.join(ROOT, "source", "linear-algebra-calculator", "web-source", "dist-standalone", "index.html"),
].filter(Boolean);

export const PAGE_FILE = PAGE_CANDIDATES.find((p) => fs.existsSync(p));

if (!PAGE_FILE) {
  console.error(
    "找不到被测的 HTML。已尝试：\n" +
      PAGE_CANDIDATES.map((p) => "  - " + p).join("\n") +
      "\n先构建：cd source/linear-algebra-calculator/web-source && npm run build:all\n" +
      "或用 LINALG_HTML=<路径> 指定。",
  );
  process.exit(1);
}

export const PAGE = pathToFileURL(PAGE_FILE).href;

/** 浏览器可执行文件 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error("找不到 Chrome/Edge，可用 CHROME_PATH 指定");
  process.exit(1);
}
