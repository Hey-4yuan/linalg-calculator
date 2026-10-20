// 真实视觉模型在线测试（智谱 GLM / 任意 OpenAI 兼容接口）
//
// 与 ocr-e2e.mjs 的区别：那个用假模型验证「界面 → 请求 → 解析 → 回填」的管线，
// 这个用**真模型**验证「提示词 + 解析器」在真实服务商上到底能不能读出数。
// 二者互补：管线问题看 ocr-e2e，模型适配问题看这里。
//
// 密钥不进仓库、不进命令行参数列表（避免留在 shell history）：
//   GLM_API_KEY=xxx node tests/glm-live.mjs
//   node tests/glm-live.mjs --key-file=C:/path/to/key.txt
//
// 可选参数：
//   --base=https://open.bigmodel.cn/api/paas/v4
//   --models=glm-4.5v,glm-4v-flash        只测这几个
//   --image=tests/fixtures/det5x5.png     换一张图
//   --rounds=2                            每个模型重复几次（看稳定性）
//
// 输出：控制台表格 + tests/.build/glm-live-report.json
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "source/linear-algebra-calculator/web-source");
const BUILD = path.join(ROOT, "tests/.build");

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const BASE = arg("base", "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");
const IMAGE = path.resolve(ROOT, arg("image", "tests/fixtures/det5x5.png"));
const ROUNDS = Number(arg("rounds", "1"));
const ONLY = arg("models", "").split(",").map((s) => s.trim()).filter(Boolean);

// 智谱视觉模型候选。glm-4-flash 是纯文本控制组，用来证明 Key 本身没问题。
const CANDIDATES = ONLY.length
  ? ONLY
  : ["glm-4.5v", "glm-4v-plus", "glm-4v-flash", "glm-4.1v-thinking-flash", "glm-4-flash"];

// ---------- 密钥 ----------
/**
 * 从任意文本里挑出密钥本体。
 *
 * 现实里 key.txt 往往不是干净的一行：可能有 BOM、有「Key: 」前缀、有中文备注、
 * 一次粘了两行。直接塞进 HTTP 头会抛
 *   Cannot convert argument to a ByteString because the character at index N has a code point > 255
 * 这个报错完全看不出是 key 的问题，所以这里先挑行、再诊断。
 */
function normalizeKey(raw, source) {
  const text = raw.replace(/^\uFEFF/, "").trim();
  const isKeyish = (s) => /^[A-Za-z0-9._-]{20,}$/.test(s);

  // 1) 整行就是密钥（最常见）
  const whole = text.split(/\r?\n/).map((s) => s.trim()).find(isKeyish);
  if (whole) return whole;

  // 2) 密钥前后混了说明文字 / 全角符号：按非密钥字符切开，取最长的一段
  const segments = text.split(/[^A-Za-z0-9._-]+/).filter(isKeyish);
  if (segments.length > 0) {
    const best = segments.sort((a, b) => b.length - a.length)[0];
    console.warn(
      `  ⚠ ${source} 里除了密钥还混了别的字符（去空白后 ${text.length} 字），` +
        `已取其中最长的合法片段（${best.length} 字）。如果鉴权失败，请把文件改成只有一行密钥。`,
    );
    return best;
  }

  // 3) 彻底认不出来——不打印内容，只报形态
  const idx = [...text].findIndex((c) => c.codePointAt(0) > 127);
  const detail = [
    `来源：${source}`,
    `去空白后长度：${text.length}`,
    `行数：${text.split(/\r?\n/).length}`,
    idx >= 0 ? `第 ${idx} 个字符是非 ASCII（可能是中文说明或全角符号）` : "全是 ASCII，但长度或字符集不像密钥",
    `首字符类别：${/^[A-Za-z0-9]/.test(text) ? "字母/数字" : JSON.stringify(text.slice(0, 1))}`,
  ].join("\n  ");
  console.error(`文件里没有找到可用的密钥（形如 xxx.yyy，20 位以上）。\n  ${detail}`);
  process.exit(2);
}

function readKey() {
  if (process.env.GLM_API_KEY) return normalizeKey(process.env.GLM_API_KEY, "环境变量 GLM_API_KEY");
  const file = arg("key-file", "");
  if (file) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) {
      console.error(`密钥文件不存在：${p}`);
      process.exit(2);
    }
    return normalizeKey(fs.readFileSync(p, "utf-8"), path.basename(p));
  }
  console.error(
    "缺少密钥。两种给法：\n" +
      "  GLM_API_KEY=你的key node tests/glm-live.mjs\n" +
      "  node tests/glm-live.mjs --key-file=C:/path/key.txt\n" +
      "（不要把密钥写进任何会被提交的文件）",
  );
  process.exit(2);
}

// ---------- 打包提示词与解析器（与 App 同一份源码） ----------
fs.mkdirSync(BUILD, { recursive: true });
const ENTRY = path.join(BUILD, "glm-entry.ts");
const OUT = path.join(BUILD, "glm.cjs");
fs.writeFileSync(
  ENTRY,
  `export { buildOcrPrompt, buildDimensionProbePrompt } from ${JSON.stringify(
    path.join(SRC, "src/lib/ocr-prompt.ts").replace(/\\/g, "/"),
  )};
export { parseOcrResponse, parseDimensionProbe, parseBox } from ${JSON.stringify(
    path.join(SRC, "src/lib/ocr-parse.ts").replace(/\\/g, "/"),
  )};
`,
  "utf-8",
);
execFileSync(
  process.execPath,
  [
    path.join(SRC, "node_modules/esbuild/bin/esbuild"),
    ENTRY,
    "--bundle",
    "--format=cjs",
    "--platform=node",
    `--outfile=${OUT}`,
    "--log-level=warning",
  ],
  { stdio: "inherit" },
);
const require = createRequire(import.meta.url);
const { buildOcrPrompt, buildDimensionProbePrompt, parseOcrResponse, parseDimensionProbe } =
  require(OUT);

// ---------- 期望值（测试图是合成的，数值已知） ----------
const EXPECT = [
  [3, 1, 0, 2, 1],
  [1, 4, 2, 0, 3],
  [0, 2, 5, 1, 2],
  [2, 0, 1, 3, 4],
  [1, 3, 2, 4, 5],
];
const EXPECT_FLAT = EXPECT.flat().map(String).join(",");

const dataUrl = "data:image/png;base64," + fs.readFileSync(IMAGE).toString("base64");
const IMAGE_BYTES = fs.statSync(IMAGE).size;

// ---------- HTTP ----------
let apiKey = "";

async function chat(model, prompt, { maxTokens = 8192, timeoutMs = 90_000, detail = true } = {}) {
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: detail ? { url: dataUrl, detail: "high" } : { url: dataUrl } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: maxTokens,
  };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err?.name === "AbortError" ? `超时 ${timeoutMs}ms` : String(err?.message || err);
    return { ok: false, error: msg, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const ms = Date.now() - started;

  if (!response.ok) {
    return { ok: false, status: response.status, error: text.slice(0, 300), ms };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: "响应不是 JSON：" + text.slice(0, 200), ms };
  }

  const choice = payload.choices?.[0];
  const content = (choice?.message?.content ?? "").toString();
  const reasoning = (choice?.message?.reasoning_content ?? "").toString();
  return {
    ok: true,
    ms,
    content,
    reasoning,
    finish: choice?.finish_reason,
    usage: payload.usage,
  };
}

/** 与 ocr-service 一致：content 为空时回落读思维链 */
const pickText = (r) => (r.content && r.content.trim() ? r.content : r.reasoning || "");

// ---------- 单模型一轮 ----------
async function runModel(model, round) {
  const rec = { model, round, probe: null, main: null, correct: 0, total: EXPECT.flat().length };

  // 阶段 1：尺寸探测
  const probePrompt = buildDimensionProbePrompt("numeric");
  const probe = await chat(model, probePrompt, { maxTokens: 1024 });
  rec.probe = {
    ok: probe.ok,
    status: probe.status,
    ms: probe.ms,
    finish: probe.finish ?? null,
    emptyContent: probe.ok ? !(probe.content || "").trim() : null,
    error: probe.error,
  };
  if (!probe.ok) return rec;

  const hints = parseDimensionProbe(pickText(probe));
  rec.probe.hints = hints;
  if (!hints || hints.length === 0) {
    rec.probe.parseOk = false;
    return rec;
  }
  rec.probe.parseOk = true;

  // 阶段 2：带着尺寸提示做正式识别
  const mainPrompt = buildOcrPrompt("numeric", hints.slice(0, 1));
  const main = await chat(model, mainPrompt, { maxTokens: 8192 });
  rec.main = {
    ok: main.ok,
    status: main.status,
    ms: main.ms,
    finish: main.finish ?? null,
    emptyContent: main.ok ? !(main.content || "").trim() : null,
    usedReasoningFallback: main.ok ? !(main.content || "").trim() && !!(main.reasoning || "").trim() : null,
    promptTokens: main.usage?.prompt_tokens ?? null,
    completionTokens: main.usage?.completion_tokens ?? null,
    error: main.error,
  };
  if (!main.ok) return rec;

  const items = parseOcrResponse(pickText(main));
  rec.main.items = items?.map((i) => ({ kind: i.kind, rows: i.rows, cols: i.cols, format: i.format }));
  if (!items || items.length === 0) {
    rec.main.parseOk = false;
    rec.main.rawHead = pickText(main).slice(0, 200);
    return rec;
  }
  rec.main.parseOk = true;

  const first = items[0];
  const flat = (first.data || []).flat().map(String);
  rec.main.layout = `${first.rows}×${first.cols}`;
  rec.main.got = (first.data || []).map((r) => r.join(" ")).join(" | ");
  rec.main.expected = EXPECT.map((r) => r.join(" ")).join(" | ");
  rec.correct = flat.filter((v, i) => v === EXPECT.flat().map(String)[i]).length;
  rec.main.exact = first.rows === 5 && first.cols === 5 && flat.join(",") === EXPECT_FLAT;
  return rec;
}

// ---------- 主流程 ----------
apiKey = readKey();
console.log(`接口      : ${BASE}`);
console.log(`测试图    : ${path.relative(ROOT, IMAGE)}（${IMAGE_BYTES} B，期望 5×5 行列式）`);
console.log(`候选模型  : ${CANDIDATES.join(", ")}`);
console.log(`轮次      : ${ROUNDS}\n`);

const results = [];
let keyOk = false;

for (const model of CANDIDATES) {
  for (let round = 1; round <= ROUNDS; round += 1) {
    process.stdout.write(`  ${model} 第 ${round} 轮 ... `);
    const rec = await runModel(model, round);
    results.push(rec);

    // 判定这一轮的结果
    let verdict;
    if (!rec.probe.ok) {
      verdict = `探测失败 ${rec.probe.status ?? ""} ${(rec.probe.error || "").slice(0, 60)}`;
      if (rec.probe.status === 429) verdict = "限流 429";
      if (rec.probe.status === 401 || rec.probe.status === 403) verdict = "密钥无效/无权限";
      if (!rec.probe.status && /超时/.test(rec.probe.error || "")) verdict = "探测超时";
    } else {
      keyOk = keyOk || rec.probe.status !== 401;
      if (!rec.probe.parseOk) verdict = `探测输出解析不出尺寸（finish=${rec.probe.finish}）`;
      else if (!rec.main?.ok) verdict = `识别失败 ${rec.main?.status ?? ""} ${(rec.main?.error || "").slice(0, 60)}`;
      else if (!rec.main.parseOk) verdict = `识别输出解析不出矩阵（finish=${rec.main.finish}）`;
      else if (rec.main.exact) verdict = `✅ 完全正确 ${rec.main.ms}ms`;
      else verdict = `⚠️ 错 ${rec.total - rec.correct}/${rec.total} 格（${rec.main.layout}）${rec.main.ms}ms`;
    }
    console.log(verdict);
  }
}

// ---------- 汇总 ----------
const byModel = new Map();
for (const r of results) {
  const e = byModel.get(r.model) || { model: r.model, runs: 0, exact: 0, cells: 0, ms: [], note: "" };
  e.runs += 1;
  if (r.main?.exact) e.exact += 1;
  e.cells += r.correct;
  if (r.probe?.ok) e.ms.push(r.probe.ms + (r.main?.ms || 0));
  if (!e.note) {
    if (!r.probe.ok) e.note = r.probe.error?.slice(0, 80) || `HTTP ${r.probe.status}`;
    else if (!r.probe.parseOk) e.note = "探测解析失败";
    else if (!r.main?.ok) e.note = r.main?.error?.slice(0, 80) || "";
    else if (!r.main.parseOk) e.note = "识别解析失败";
  }
  byModel.set(r.model, e);
}

console.log("\n模型                轮次  完全正确  平均正确格数  平均耗时   备注");
console.log("─".repeat(88));
for (const e of byModel.values()) {
  const avgCells = (e.cells / e.runs).toFixed(1);
  const avgMs = e.ms.length ? Math.round(e.ms.reduce((a, b) => a + b, 0) / e.ms.length) + "ms" : "—";
  console.log(
    `${e.model.padEnd(20)}${String(e.runs).padStart(4)}${String(e.exact).padStart(9)}${avgCells.padStart(13)}${avgMs.padStart(11)}   ${e.note}`,
  );
}

const reportPath = path.join(BUILD, "glm-live-report.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify({ base: BASE, image: path.relative(ROOT, IMAGE), expect: EXPECT, keyOk, results }, null, 2),
  "utf-8",
);
console.log(`\n明细已写入 ${path.relative(ROOT, reportPath)}（不含密钥）`);

const anyExact = [...byModel.values()].some((e) => e.exact > 0);
process.exit(anyExact ? 0 : 1);
