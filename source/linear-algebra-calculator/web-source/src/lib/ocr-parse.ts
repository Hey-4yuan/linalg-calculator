/**
 * OCR 响应解析（纯函数，不依赖浏览器与 Toolkit，可直接单测）。
 *
 * 背景：v1.5 之前的提示词只要求「一个矩阵」，示例是 2×2/3×3，模型遇到四阶行列式时会
 * 按示例尺寸裁成左上角 2×2；而解析器只认 `{rows, cols, data}` 单对象，模型若改返回数组
 * 反而报「识别结果格式不正确」。现在统一成：
 *
 *   模型 → JSON 数组，每项 {kind, label, rows, cols, data, format, warnings, augmented, augmented_col}
 *
 * 本文件负责把「模型可能返回的各种乱七八糟形状」收敛成 OcrItem[]：
 *   - 裸数组 / {"matrices":[...]} / 单对象（旧格式）都接受
 *   - 前后夹带的解释文字、```json 包裹、中文标点造成的截断都尽量救回来
 *   - rows/cols 与 data 不一致时以 data 为准并记 warning（尺寸错比整体失败好）
 *   - 行列式不是方阵时降级成 matrix 并记 warning
 */

export type OcrKind = "matrix" | "determinant";
export type OcrFormat = "numeric" | "expression" | "mixed";

export interface OcrItem {
  kind: OcrKind;
  label: string;
  rows: number;
  cols: number;
  /** 一律字符串：下游 Fraction.safeParse 只吃 string */
  data: string[][];
  format: OcrFormat;
  warnings: string[];
  isAugmented: boolean;
  /** 0 起算的增广列索引（模型给的是 1 起算的 augmented_col） */
  augmentedCol?: number;
}

export interface OcrParseResult {
  items: OcrItem[];
  /** 解析过程中的提示（尺寸不符、单元素无法识别等） */
  notes: string[];
}

/** 单次识别允许的最大元素数：20×20，避免模型返回病态大数组把页面卡死 */
const MAX_CELLS = 400;

const NUMERIC_CELL = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

/** 去掉 ```json ... ``` 包裹 */
export function stripCodeFence(text: string): string {
  let s = text.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
  return s.trim();
}

/**
 * 从可能夹带解释文字的输出里抠出第一段完整 JSON。
 * 返回 null 表示找不到可解析的片段。
 */
export function extractJson(text: string): unknown | null {
  const direct = tryParse(text);
  if (direct !== NOT_JSON) return direct;

  const start = firstJsonStart(text);
  if (start < 0) return null;

  const sliced = sliceBalanced(text, start);
  if (!sliced) return null;
  const parsed = tryParse(sliced);
  return parsed === NOT_JSON ? null : parsed;
}

/**
 * 从推理模型的思维链里找「最像答案」的那段 JSON。
 *
 * 思维链和正文不一样：里面会有大量中间猜测（"可能是 4x4？""也许 3 列"），
 * 还会复述提示词里的示例。取第一个 JSON 基本必错，所以这里从**尾部**往前找，
 * 并且优先挑「带 data 或 box 字段」的数组 —— 那才是模型最终的结论。
 */
export function extractJsonFromReasoning(text: string): unknown | null {
  // 先试整体解析（有的模型直接吐纯 JSON）
  const direct = tryParse(text.trim());
  if (direct !== NOT_JSON) return direct;

  // 收集所有能解析的 [ ... ] / { ... } 片段
  const candidates: { at: number; value: unknown }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "[" && ch !== "{") continue;
    const sliced = sliceBalanced(text, i);
    if (!sliced) continue;
    const parsed = tryParse(sliced);
    if (parsed === NOT_JSON) continue;
    candidates.push({ at: i, value: parsed });
    i += sliced.length - 1; // 跳过已解析的整段
  }
  if (candidates.length === 0) return null;

  // 越靠后越可能是结论；同等情况下优先带 data / box 的
  const scored = candidates.map((c) => {
    const s = JSON.stringify(c.value);
    let score = c.at / text.length; // 位置权重 0..1
    if (s.includes('"data"')) score += 1.2;
    if (s.includes('"box"')) score += 0.6;
    if (s.includes('"rows"')) score += 0.2;
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].value;
}

const NOT_JSON = Symbol("not-json");

function tryParse(text: string): unknown | typeof NOT_JSON {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

function firstJsonStart(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "[" || ch === "{") return i;
  }
  return -1;
}

/** 从 start 处的 [ 或 { 开始，按括号配对截取（跳过字符串内的括号） */
function sliceBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 把各种包装剥成「对象数组」 */
function toItemArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) return [];

  // 兼容 {"matrices": [...]} / {"items": [...]} / {"results": [...]}
  for (const key of ["matrices", "items", "results", "result", "data"]) {
    const v = payload[key];
    if (Array.isArray(v) && v.length > 0 && v.some(isRecord)) {
      const rows = v.filter(isRecord);
      // {"data": [[1,2],[3,4]]} 是单矩阵的 data 字段，不是数组套对象，排除掉
      if (rows.length === v.length && rows.some((r) => "data" in r)) return rows;
    }
  }

  // 旧格式：单个 {rows, cols, data}
  if ("data" in payload) return [payload];
  return [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeCell(raw: unknown): { text: string; failed: boolean } {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { text: String(raw), failed: false };
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return { text: "", failed: true };
    return { text: t, failed: false };
  }
  if (raw === null || raw === undefined) return { text: "", failed: true };
  // 数组/对象：多半是嵌套矩阵，退化成字符串，交给 warning 提示
  return { text: JSON.stringify(raw), failed: true };
}

function inferFormat(data: string[][]): OcrFormat {
  const cells = data.flat().filter((c) => c !== "");
  if (cells.length === 0) return "numeric";
  const numeric = cells.filter((c) => NUMERIC_CELL.test(c)).length;
  if (numeric === cells.length) return "numeric";
  if (numeric === 0) return "expression";
  return "mixed";
}

/** 单个对象 → OcrItem；形状不可用返回 null */
export function normalizeOcrItem(obj: Record<string, unknown>): OcrItem | null {
  const rawData = obj.data;
  if (!Array.isArray(rawData) || rawData.length === 0) return null;

  const warnings: string[] = [];
  const data: string[][] = [];
  const declaredRows = typeof obj.rows === "number" ? obj.rows : undefined;
  const declaredCols = typeof obj.cols === "number" ? obj.cols : undefined;

  for (let r = 0; r < rawData.length; r += 1) {
    const row = rawData[r];
    if (!Array.isArray(row)) {
      warnings.push(`第 ${r + 1} 行不是数组，已跳过`);
      continue;
    }
    const cells = row.map((cell, c) => {
      const { text, failed } = normalizeCell(cell);
      if (failed) warnings.push(`第 ${r + 1} 行第 ${c + 1} 列无法识别，已留空`);
      return text;
    });
    data.push(cells);
  }

  if (data.length === 0) return null;

  // 行内列数不齐时按最长行补齐（缺的记 warning），比整条丢弃友好
  const cols = Math.max(...data.map((r) => r.length));
  for (let r = 0; r < data.length; r += 1) {
    if (data[r].length !== cols) {
      warnings.push(`第 ${r + 1} 行只有 ${data[r].length} 列，已按 ${cols} 列补空`);
      while (data[r].length < cols) data[r].push("");
    }
  }

  const rows = data.length;

  if (declaredRows !== undefined && declaredRows !== rows) {
    warnings.push(`模型声明 ${declaredRows} 行，实际 ${rows} 行，已按实际处理`);
  }
  if (declaredCols !== undefined && declaredCols !== cols) {
    warnings.push(`模型声明 ${declaredCols} 列，实际 ${cols} 列，已按实际处理`);
  }
  if (rows * cols > MAX_CELLS) {
    warnings.push(`矩阵 ${rows}×${cols} 超过 ${MAX_CELLS} 个元素，可能不是有效识别结果`);
    return null;
  }

  const label = typeof obj.label === "string" ? obj.label.trim() : "";
  let kind: OcrKind =
    (typeof obj.kind === "string" && obj.kind.toLowerCase() === "determinant") ||
    /^det\b|^\|/.test(label)
      ? "determinant"
      : "matrix";

  if (kind === "determinant" && rows !== cols) {
    warnings.push(`识别为行列式但不是方阵（${rows}×${cols}），已按普通矩阵处理`);
    kind = "matrix";
  }

  const isAugmented = obj.augmented === true || obj.isAugmented === true;
  const rawAug =
    typeof obj.augmented_col === "number"
      ? obj.augmented_col
      : typeof obj.augmentedCol === "number"
        ? obj.augmentedCol + 1
        : undefined;
  let augmentedCol: number | undefined;
  if (isAugmented && rawAug !== undefined) {
    if (rawAug >= 1 && rawAug < cols) {
      augmentedCol = rawAug - 1;
    } else {
      warnings.push(`增广列索引 ${rawAug} 超出 1~${cols - 1} 范围，已忽略`);
    }
  }

  const format =
    obj.format === "numeric" || obj.format === "expression" || obj.format === "mixed"
      ? (obj.format as OcrFormat)
      : inferFormat(data);

  if (Array.isArray(obj.warnings)) {
    for (const w of obj.warnings) {
      if (typeof w === "string" && w.trim()) warnings.push(w.trim());
    }
  }

  return {
    kind,
    label,
    rows,
    cols,
    data,
    format,
    warnings,
    isAugmented,
    augmentedCol,
  };
}

/**
 * 解析模型输出。形状完全不可用时抛错（错误信息带原文片段，方便反馈给模型/服务商）。
 */
export function parseOcrResponse(raw: string): OcrParseResult {
  const text = stripCodeFence(raw || "");
  if (!text) throw new Error("模型返回内容为空");

  // 正常输出走 extractJson；推理模型的思维链走 extractJsonFromReasoning。
  // 思维链里常先出现「可能是 ["1","2"]」这类片段，extractJson 会抓到它 ——
  // 所以要比较两种取法的产出，宁可多花一点 CPU，也不能静默返回 0 项。
  const direct = extractJson(text);
  const fromReasoning = extractJsonFromReasoning(text);

  const directObjs = direct === null ? [] : toItemArray(direct);
  const reasoningObjs = fromReasoning === null ? [] : toItemArray(fromReasoning);

  let objs = directObjs;
  let usedReasoning = false;
  if (directObjs.length === 0 && reasoningObjs.length > 0) {
    objs = reasoningObjs;
    usedReasoning = true;
  }

  if (objs.length === 0) {
    if (direct === null && fromReasoning === null) {
      const head = text.slice(0, 120).replace(/\s+/g, " ");
      throw new Error(`模型返回的不是合法 JSON：${head}${text.length > 120 ? "…" : ""}`);
    }
    return { items: [], notes: ["模型返回的 JSON 里没有可用的矩阵结构"] };
  }

  const items: OcrItem[] = [];
  const notes: string[] = [];

  if (usedReasoning) {
    notes.push("模型只输出了思维链，结果是从思维链里提取的，请务必核对");
  }
  for (const obj of objs) {
    const item = normalizeOcrItem(obj);
    if (item) items.push(item);
    else notes.push("有一个对象缺少有效的 data 字段，已跳过");
  }

  return { items, notes };
}

/** 模型给出的归一化位置（0-1000，相对图片宽高） */
export interface OcrBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 尺寸探测结果：行列数 + 可选位置 */
export interface ProbeHint {
  rows: number;
  cols: number;
  box?: OcrBox;
}

function parseBox(raw: unknown): OcrBox | undefined {
  if (!isRecord(raw)) return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.w);
  const h = num(raw.h);
  if ([x, y, w, h].some(Number.isNaN)) return undefined;
  if (w <= 0 || h <= 0) return undefined;
  // 夹到图片范围内，并留一点余量：模型给的位置普遍偏紧，宁可多带一圈
  const mx = w * 0.06;
  const my = h * 0.06;
  const nx = Math.max(0, x - mx);
  const ny = Math.max(0, y - my);
  const nw = Math.min(1000 - nx, w + mx * 2);
  const nh = Math.min(1000 - ny, h + my * 2);
  if (nw < 40 || nh < 40) return undefined; // 太小的框基本都是误报
  return {
    x: Math.round(nx),
    y: Math.round(ny),
    w: Math.round(nw),
    h: Math.round(nh),
  };
}

/**
 * 解析「定位 + 尺寸探测」的返回：[{"rows":6,"cols":6,"box":{...}}, …]
 *
 * 为什么要单独探一次：模型在直接输出 data 时经常「少读一行/一列」——
 * 生成 JSON 时按 token 走，写错了也没机会回头数。先让它只回答尺寸和位置，
 * 用尺寸约束主识别、用位置让客户端裁出目标区域，5 阶以上明显更稳。
 * 解析失败返回 null（调用方退化为不带提示的直接识别）。
 */
export function parseDimensionProbe(raw: string): ProbeHint[] | null {
  const text = stripCodeFence(raw || "");
  if (!text) return null;
  const payload = extractJson(text) ?? extractJsonFromReasoning(text);
  if (payload === null) return null;

  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : isRecord(payload) && typeof payload.rows === "number"
        ? [payload]
        : [];

  const hints: ProbeHint[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const rows = Number(entry.rows);
    const cols = Number(entry.cols);
    if (!Number.isFinite(rows) || !Number.isFinite(cols)) continue;
    const r = Math.round(rows);
    const c = Math.round(cols);
    if (r >= 1 && r <= 20 && c >= 1 && c <= 20) {
      const box = parseBox(entry.box);
      hints.push(box ? { rows: r, cols: c, box } : { rows: r, cols: c });
    }
  }
  return hints.length > 0 ? hints : null;
}

/** 单元格墨迹占比超过这个值，就认为"那里有东西"（实测：空白纸面 0–1%，有数字 8–10%） */
export const INK_THRESHOLD = 0.04;

/**
 * 像素自检：把「模型说的 0」和「图上有没有墨」对一遍。
 *
 * 为什么需要：模型会把没看清的格子直接填 0，而且结果稳定（重跑多次一模一样），
 * 用户完全看不出哪里错了。这里用裁剪图的灰度分布做一次交叉校验 ——
 * 格子里明显有笔画却报 0 的，逐个列出来让用户核对。
 *
 * @param ink 每格的墨迹占比（0~1），形状 [rows][cols]
 * @param data 模型解析出的二维数组
 * @returns 疑似漏读的坐标（0 起）与提示文案
 */
export function auditCellInk(
  ink: number[][],
  data: string[][]
): { suspicious: [number, number][]; warning?: string } {
  const rows = Math.min(ink.length, data.length);
  const suspicious: [number, number][] = [];

  for (let r = 0; r < rows; r += 1) {
    const cols = Math.min(ink[r].length, data[r].length);
    for (let c = 0; c < cols; c += 1) {
      const value = (data[r][c] ?? "").trim();
      const isZero = value === "0" || value === "";
      if (isZero && ink[r][c] >= INK_THRESHOLD) suspicious.push([r, c]);
    }
  }

  if (suspicious.length === 0) return { suspicious };
  const first = suspicious
    .slice(0, 5)
    .map(([r, c]) => `第${r + 1}行第${c + 1}列`)
    .join("、");
  const more = suspicious.length > 5 ? ` 等 ${suspicious.length} 处` : "";
  return {
    suspicious,
    warning: `这 ${suspicious.length} 个位置图上有内容但被读成 0（${first}${more}），请重点核对`,
  };
}
