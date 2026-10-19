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
export function parseOcrResponse(raw: string): OcrParseResult {  const text = stripCodeFence(raw || "");
  if (!text) throw new Error("模型返回内容为空");

  const payload = extractJson(text);
  if (payload === null) {
    const head = text.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`模型返回的不是合法 JSON：${head}${text.length > 120 ? "…" : ""}`);
  }

  const objs = toItemArray(payload);
  const items: OcrItem[] = [];
  const notes: string[] = [];

  for (const obj of objs) {
    const item = normalizeOcrItem(obj);
    if (item) items.push(item);
    else notes.push("有一个对象缺少有效的 data 字段，已跳过");
  }

  return { items, notes };
}

/**
 * 解析「尺寸探测」的返回：[{"rows":5,"cols":5}, …]
 *
 * 为什么要单独探一次：模型在直接输出 data 时经常「少读一行/一列」——
 * 生成 JSON 时按 token 走，写错了也没机会回头数。先让它只回答尺寸、
 * 用这个结果去约束主识别，5 阶以上明显更稳。
 * 解析失败返回 null（调用方退化为不带提示的直接识别）。
 */
export function parseDimensionProbe(raw: string): { rows: number; cols: number }[] | null {
  const text = stripCodeFence(raw || "");
  if (!text) return null;
  const payload = extractJson(text);
  if (payload === null) return null;

  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : isRecord(payload) && typeof payload.rows === "number"
        ? [payload]
        : [];

  const hints: { rows: number; cols: number }[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const rows = Number(entry.rows);
    const cols = Number(entry.cols);
    if (!Number.isFinite(rows) || !Number.isFinite(cols)) continue;
    const r = Math.round(rows);
    const c = Math.round(cols);
    if (r >= 1 && r <= 20 && c >= 1 && c <= 20) hints.push({ rows: r, cols: c });
  }
  return hints.length > 0 ? hints : null;
}
