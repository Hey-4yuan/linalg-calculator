// OCR 端到端冒烟测试（不需要真实 API Key）
//
// 做法：起一个假的 OpenAI 兼容接口，用 headless Chrome 真的点一遍界面：
//   点「图片识别」→ 塞测试图 → 图片编辑对话框 → 确认并识别
//   → 尺寸探测请求 → 带尺寸提示的主请求 → 回填矩阵
//
// 为什么要这个测试：OCR 这条链路出过两次「尺寸被悄悄改小」的事故，而它依赖外部模型，
// 单测只能覆盖解析层。这里用假模型把「界面 → 请求 → 解析 → 回填」整条串起来验证。
//
// 用法：
//   node tests/ocr-e2e.mjs
//   （需要先 npm run build:all 生成根目录的 线性代数计算器.html；需要本机有 Chrome）
//   CHROME_PATH=... 可指定浏览器路径
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGE = "file:///" + path.join(ROOT, "线性代数计算器.html").replace(/\\/g, "/");
const FIXTURE = path.join(ROOT, "tests/fixtures/det5x5.png");
const TMP = path.join(ROOT, "tests/.build");
const API_PORT = 8777;
const CDP_PORT = 9333;
const PROFILE = path.join(TMP, "chrome-profile");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error("找不到 Chrome，可用 CHROME_PATH 指定");
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, "线性代数计算器.html"))) {
  console.error("找不到 线性代数计算器.html，请先 npm run build:all");
  process.exit(1);
}


/** 从 dataURL 里读出 JPEG 的宽高（找 SOF0/1/2 段） */
function jpegSize(dataUrl) {
  try {
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const buf = Buffer.from(b64, "base64");
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  } catch { /* 忽略 */ }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 假视觉模型：按提示词判断是「尺寸探测」还是「正式识别」 ----------
const FIVE = [
  [3, 1, 0, 2, 1],
  [1, 4, 2, 0, 3],
  [0, 2, 5, 1, 2],
  [2, 0, 1, 3, 4],
  [1, 3, 2, 4, 5],
];
const calls = [];

const server = http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let prompt = "";
    let detail = null;
    let imgLen = 0;
    let imgSize = null;
    try {
      const parsed = JSON.parse(body);
      const parts = parsed.messages?.[0]?.content ?? [];
      prompt = parts.find((p) => p.type === "text")?.text ?? "";
      const imgUrl = parts.find((p) => p.type === "image_url")?.image_url?.url ?? "";
      detail = parts.find((p) => p.type === "image_url")?.image_url?.detail ?? null;
      imgLen = imgUrl.length;
      imgSize = jpegSize(imgUrl);
    } catch {
      /* 报文坏了就按空提示词处理 */
    }
    const isProbe = prompt.includes("位置") && prompt.includes("box");
    const wantsBox = prompt.includes('"box"');
    calls.push({ isProbe, detail, hasHint: prompt.includes("尺寸提示"), wantsBox, imgLen, imgSize });

    // 用「推理模型」的返回形态应答：content 为空、只有 reasoning_content。
    // 这正是 deepseek-flash 的真实行为，能同时验证思维链兜底。
    const reasoningProbe =
      '先看图：中间有一个大矩阵。数了一下是 5 行 5 列。位置大概在 x 280 y 300 宽 420 高 400。\n' +
      '结论：[{"rows":5,"cols":5,"box":{"x":280,"y":300,"w":420,"h":400}}]';
    const reasoningMain =
      '需要逐行读出数字。第一行 3 1 0 2 1。第二行 1 4 2 0 3。第三行 0 2 5 1 2。' +
      '第四行 2 0 1 3 4。第五行 1 3 2 4 5。所以是 5×5。\n' +
      '最终答案：' + JSON.stringify([
        { kind: "determinant", rows: 5, cols: 5, data: FIVE, format: "numeric" },
      ]);

    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choices: [{
        finish_reason: "length",
        message: {
          role: "assistant",
          content: "",
          reasoning_content: isProbe ? reasoningProbe : reasoningMain,
        },
      }],
    }));
  });
});

let chrome;
let ws;
const cleanup = () => {
  try {
    ws?.close();
  } catch {}
  try {
    chrome?.kill();
  } catch {}
  try {
    server.close();
  } catch {}
};

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

try {
  fs.mkdirSync(TMP, { recursive: true });
  await new Promise((r) => server.listen(API_PORT, "127.0.0.1", r));

  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${CDP_PORT}`,
      "--window-size=1200,950",
      `--user-data-dir=${PROFILE}`,
      PAGE,
    ],
    { stdio: "ignore" }
  );

  const waitJson = async (url, tries = 60) => {
    for (let i = 0; i < tries; i += 1) {
      try {
        const r = await fetch(url);
        if (r.ok) return await r.json();
      } catch {
        /* 还没起来 */
      }
      await sleep(250);
    }
    throw new Error("CDP 未就绪：" + url);
  };

  const list = await waitJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const target = list.find((t) => t.type === "page");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      msgId += 1;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await sleep(2500);

  console.log("E2E-01 配置与入口");
  // 借「分数模式」开关探出 scopedStorage 的真实前缀，再写 OCR 配置
  const prefix = await evaluate(`(() => {
    localStorage.clear();
    const sw = document.querySelector('button[role="switch"]');
    if (sw) sw.click();
    const key = Object.keys(localStorage).find(k => k.includes('__app_linalg_fraction_mode'));
    return key ? key.slice(0, key.indexOf('__app_linalg_fraction_mode')) : null;
  })()`);
  check("能定位本地存储前缀", !!prefix, String(prefix));

  await evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(prefix)} + '__app_linalg_ocr_config', JSON.stringify({
      baseUrl: 'http://127.0.0.1:${API_PORT}/v1', apiKey: 'test-key', model: 'mock-vision'
    }));
    return true;
  })()`);
  await send("Page.reload");
  await sleep(2600);

  const clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('图片识别'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("点「图片识别」打开文件选择", clicked === true);

  const doc = await send("DOM.getDocument", { depth: -1 });
  const q = await send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  await send("DOM.setFileInputFiles", { nodeId: q.nodeId, files: [FIXTURE] });
  await sleep(2200);

  console.log("E2E-02 图片编辑器");
  const editor = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const text = dialog ? dialog.textContent : '';
    const frame = document.querySelector('[role="dialog"] .border-2');
    return {
      open: !!dialog,
      fullFrame: frame ? frame.style.width === '100%' && frame.style.height === '100%' : false,
      hint: text.includes('默认使用'),
    };
  })()`);
  check("编辑器打开", editor.open === true);
  check("裁剪框默认整张图（不再偷偷切掉 5%）", editor.fullFrame === true, JSON.stringify(editor));
  check("有「默认使用整张图」提示", editor.hint === true);

  console.log("E2E-03 识别链路");
  const confirmed = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('确认并识别'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("点「确认并识别」", confirmed === true);
  await sleep(3500);

  const closeState = await evaluate(
    `(() => { const d = document.querySelector('[role="dialog"]'); return d ? d.textContent.slice(0, 60) : null; })()`
  );
  check("识别后编辑器关闭", closeState === null, closeState);

  const probe = calls.find((c) => c.isProbe);
  const main = calls.find((c) => !c.isProbe);
  check("先发尺寸探测请求", !!probe);
  check("探测与主识别都使用 detail=high", probe?.detail === "high" && main?.detail === "high",
    JSON.stringify(calls.map((c) => c.detail)));
  check("主识别提示词带上了尺寸提示", main?.hasHint === true);
  check("定位提示词要求 box", probe?.wantsBox === true);
  // 原图是 900×700；裁剪后尺寸必然不同。用 JPEG 头里的宽高判断，比看字节数可靠
  const mainSize = main?.imgSize;
  check(
    "主请求送的是裁剪后的图（不是整页原图）",
    !!mainSize && !(mainSize.w === 900 && mainSize.h === 700),
    `main=${JSON.stringify(mainSize)}`
  );

  // 单元格不编辑时是 div（点进去才变 input），所以读 textContent
  const grid = await evaluate(`(() => {
    const cells = [...document.querySelectorAll('div')].filter(d =>
      typeof d.className === 'string' && d.className.includes('w-16') && d.className.includes('font-mono'));
    const values = cells.map(c => (c.textContent ?? '').trim());
    return { values, total: values.length, sample: values.slice(0, 5) };
  })()`);
  const expected = FIVE.flat().map(String);
  const gv = grid?.values ?? [];
  check(
    "矩阵网格回填为 5×5 且数值正确",
    expected.every((v) => gv.includes(v)) && gv.length >= 25,
    `total=${grid?.total} filled=${gv.length} sample=${JSON.stringify(grid?.sample)}`
  );

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  cleanup();
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("E2E 运行失败：", e);
  cleanup();
  process.exit(1);
}
