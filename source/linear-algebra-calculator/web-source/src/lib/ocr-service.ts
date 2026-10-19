// OCR 服务 - 通过用户配置的视觉模型（兼容 OpenAI 协议）识别矩阵/行列式
// API Key 等配置仅保存在浏览器本地，不上传到第三方
//
// v1.6 起模型返回数组（一张图里可能有多个矩阵/行列式）：解析交给 ocr-parse.ts，
// 提示词交给 ocr-prompt.ts；本文件只负责「配置 + 发请求 + 错误翻译」。

import { scopedStorage } from "@lark-apaas/client-toolkit-lite";
import { logger } from "@lark-apaas/client-toolkit-lite";
import { buildOcrPrompt, buildDimensionProbePrompt, type OcrPromptMode } from "./ocr-prompt";
import { parseOcrResponse, parseDimensionProbe, auditCellInk, type OcrItem, type ProbeHint } from "./ocr-parse";

// 配置存储键
const OCR_CONFIG_KEY = "__app_linalg_ocr_config";

// 请求超时：视觉模型偶尔会长时间不返回，超时后给出明确提示而不是一直转圈
const OCR_TIMEOUT_MS = 45_000;

export interface OCRConfig {
  baseUrl: string;       // API 基础 URL，如 https://api.openai.com/v1
  apiKey: string;        // API Key
  model: string;         // 视觉模型名，如 gpt-4o-mini
}

// 单个识别结果（兼容旧调用方的扁平结构）
export interface OCRMatrixResult {
  rows: number;
  cols: number;
  data: string[][];      // 每个元素的字符串形式（数字、分数、符号等）
  isAugmented?: boolean; // 是否识别为增广矩阵（方程组）
  augmentedCol?: number; // 增广列索引
  kind?: "matrix" | "determinant";
  label?: string;
}

export interface OCROutcome {
  items: OcrItem[];
  notes: string[];
}

export type OCRMode = OcrPromptMode;

// 读取配置
export function getOCRConfig(): OCRConfig | null {
  try {
    const saved = scopedStorage.getItem(OCR_CONFIG_KEY);
    if (saved) {
      return JSON.parse(saved) as OCRConfig;
    }
  } catch (e) {
    logger.error("读取 OCR 配置失败:", String(e));
  }
  return null;
}

// 保存配置
export function saveOCRConfig(config: OCRConfig): void {
  try {
    scopedStorage.setItem(OCR_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    logger.error("保存 OCR 配置失败:", String(e));
  }
}

// 清除配置
export function clearOCRConfig(): void {
  try {
    scopedStorage.removeItem(OCR_CONFIG_KEY);
  } catch (e) {
    logger.error("清除 OCR 配置失败:", String(e));
  }
}

// 检查配置是否有效
export function hasValidOCRConfig(): boolean {
  const cfg = getOCRConfig();
  return !!cfg && !!cfg.baseUrl && !!cfg.apiKey && !!cfg.model;
}

// 将图片文件转为 base64 data URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 长边上限：视觉模型切块识别的收益在 1568~2048 就到顶，再大只是白传 */
const MAX_IMAGE_EDGE = 2048;
/** 定位探测只看布局，用很小的图就够，快且省 token */
const PROBE_IMAGE_EDGE = 768;
/** 尺寸探测比主识别便宜得多，超时给短一点，失败也不拖住整体 */
const PROBE_TIMEOUT_MS = 20_000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/** 把 dataURL 按长边限制缩放后重编码；解码失败返回原串 */
async function scaleDataUrl(dataUrl: string, maxEdge: number): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  try {
    const img = await loadImageElement(dataUrl);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, maxEdge / longEdge);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return dataUrl;
  }
}

/**
 * 送模型前的预处理：长边超过 2048 就先自己高质量缩一次。
 * 手机原图动辄 4000px，直接发会被服务端粗暴降采样，5 阶行列式的细线正好糊掉；
 * 自己缩反而更清楚，也省上传时间。解码失败就退回原图，不让预处理把功能弄挂。
 */
function toVisionDataUrl(file: File): Promise<string> {
  return fileToDataUrl(file).then((raw) => scaleDataUrl(raw, MAX_IMAGE_EDGE));
}

/**
 * 算出裁剪图上每个格子的墨迹占比（0~1），形状 [rows][cols]。
 * 用于事后校验模型报的 0 是真空还是漏读 —— 空白纸面约 0–1%，有数字约 8–10%。
 * 只统计中间 80% 的区域，避开行列式两侧的竖线和边框。
 */
function measureCellInk(canvas: HTMLCanvasElement, rows: number, cols: number): number[][] | null {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { width, height } = canvas;
    const cellW = width / cols;
    const cellH = height / rows;
    const ink: number[][] = [];

    for (let r = 0; r < rows; r += 1) {
      const row: number[] = [];
      for (let c = 0; c < cols; c += 1) {
        // 内缩 15%：既避开格线，也避开竖线框
        const x0 = Math.round(c * cellW + cellW * 0.15);
        const y0 = Math.round(r * cellH + cellH * 0.15);
        const w = Math.max(1, Math.round(cellW * 0.7));
        const h = Math.max(1, Math.round(cellH * 0.7));
        const data = ctx.getImageData(x0, y0, w, h).data;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < 115) dark += 1;
        }
        row.push(dark / (w * h));
      }
      ink.push(row);
    }
    return ink;
  } catch {
    return null; // 跨域图片会抛 SecurityError，忽略自检即可
  }
}

/**
 * 按归一化框（0-1000）从原图裁出一块，同时返回画布（用于像素自检）。
 *
 * 用途：整页作业照片里只有一小块是目标行列式，整页送模型既慢（实测 4 分半）
 * 又会被草稿和中间步骤带偏。裁出来送，payload 小一个数量级、识别也稳。
 */
async function cropDataUrl(
  dataUrl: string,
  box: { x: number; y: number; w: number; h: number }
): Promise<{ dataUrl: string; canvas: HTMLCanvasElement } | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = await loadImageElement(dataUrl);
    const sx = Math.round((box.x / 1000) * img.naturalWidth);
    const sy = Math.round((box.y / 1000) * img.naturalHeight);
    const sw = Math.round((box.w / 1000) * img.naturalWidth);
    const sh = Math.round((box.h / 1000) * img.naturalHeight);
    if (sw < 32 || sh < 32) return null;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    // 裁完通常很小，放大一点让笔画更清楚（上限仍受 MAX_IMAGE_EDGE 约束）
    const longEdge = Math.max(sw, sh);
    if (longEdge < 900) {
      const k = Math.min(MAX_IMAGE_EDGE / longEdge, 2.5);
      const big = document.createElement("canvas");
      big.width = Math.round(sw * k);
      big.height = Math.round(sh * k);
      const bctx = big.getContext("2d");
      if (bctx) {
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = "high";
        bctx.drawImage(canvas, 0, 0, big.width, big.height);
        // 自检用放大后的画布，格线更清楚
        return { dataUrl: big.toDataURL("image/jpeg", 0.92), canvas: big };
      }
    }
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), canvas };
  } catch {
    return null;
  }
}

interface ChatOptions {
  timeoutMs?: number;
  /** 默认 true：用 image_url.detail = "high"，不传的话部分服务端按 512px 低清处理 */
  highDetail?: boolean;
}

/** 发一次 chat/completions，拿回模型原始文本 */
async function callVision(
  dataUrl: string,
  prompt: string,
  opts: ChatOptions = {}
): Promise<string> {
  const config = getOCRConfig();
  if (!config) {
    throw new Error("请先配置 OCR 视觉模型 API");
  }
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error("OCR 配置不完整，请检查 Base URL、API Key 和模型名");
  }

  const timeout = opts.timeoutMs ?? OCR_TIMEOUT_MS;
  const url = config.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`,
  };

  const buildBody = (withDetail: boolean) =>
    JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: withDetail ? { url: dataUrl, detail: "high" } : { url: dataUrl },
            },
          ],
        },
      ],
      temperature: 0,
      // 推理型模型（deepseek-flash 等）会先花几千 token 思考，预算给小了连结果都出不来。
      // 这里给足余量；不支持的接口会忽略该字段，不会报错。
      max_tokens: 8192,
    });

  const send = async (withDetail: boolean): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: buildBody(withDetail),
      });
    } catch (e) {
      logger.error("OCR 请求失败:", String(e));
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error(
          `识别超时（${Math.round(timeout / 1000)} 秒无响应），请检查网络或更换模型接口`
        );
      }
      if (e instanceof Error) throw e;
      throw new Error("识别失败：网络错误或 API 调用异常");
    } finally {
      clearTimeout(timer);
    }
  };

  let response = await send(opts.highDetail !== false);

  // 少数兼容层不认 image_url.detail，400 且报文提到 detail 时退回不带 detail 再试一次
  if (!response.ok && response.status === 400 && opts.highDetail !== false) {
    const firstErr = await response.text().catch(() => "");
    if (!/detail/i.test(firstErr)) {
      throw new Error(`API 请求失败 (400): ${firstErr}`);
    }
    response = await send(false);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`API 请求失败 (${response.status}): ${errText || response.statusText}`);
  }

  const result = await response.json();
  const choice = result.choices?.[0];
  const message = choice?.message ?? {};
  const content = message.content;
  const reasoning = typeof message.reasoning_content === "string" ? message.reasoning_content : "";
  const finish = choice?.finish_reason;

  if (content && typeof content === "string" && content.trim()) {
    return content;
  }

  // 推理型模型（deepseek-flash、o 系列等）把 token 全烧在思维链上：
  // finish_reason = "length"、reasoning_content 几千字、content 是空串。
  // 这种情况下把思维链尾部交给解析层，让它自己去找 JSON —— 比直接报「格式异常」有用得多。
  if (reasoning.trim()) {
    logger.warn(
      `模型只返回了思维链（finish=${finish}，reasoning ${reasoning.length} 字），改从思维链里提取结果`
    );
    return reasoning;
  }

  if (finish === "length") {
    throw new Error(
      "模型输出被长度上限截断，没有留下可用的结果。这是推理型模型的常见问题：思考占满了 token 预算。" +
        "建议换用非推理的视觉模型（如 gpt-4o-mini、qwen-vl-max），或把图片裁小一点再试"
    );
  }

  throw new Error("API 返回格式异常，无法解析内容");
}

/**
 * 先单独问一次「有几个、各是几行几列、在哪」。
 *
 * 两个用途：
 *  1. 尺寸约束——模型直接写 data 时经常少读一行/一列（生成 token 时没法回头数），
 *     先给出尺寸再让它填内容，5 阶以上命中率明显提高；
 *  2. 位置——整页照片只裁目标那一块再识别，避免整页送模型（实测 4 分半 + 一堆垃圾结果）。
 *
 * 探测本身用缩到 768px 的小图，只看布局，快且省 token。失败返回 null，不影响主流程。
 */
async function probeLayout(original: string, mode: OCRMode): Promise<ProbeHint[] | null> {
  try {
    const small = await scaleDataUrl(original, PROBE_IMAGE_EDGE);
    const raw = await callVision(small, buildDimensionProbePrompt(mode), {
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return parseDimensionProbe(raw);
  } catch (e) {
    logger.error("定位/尺寸探测失败，改为整图直接识别:", String(e));
    return null;
  }
}

/**
 * 识别图片里的**所有**矩阵/行列式。
 * 返回数组：一张图里有多道题、多个矩阵时不会只给你第一个。
 *
 * 流程：缩图 → 探测行列数与位置 → 按位置从原图裁一块 → 带尺寸约束正式识别。
 * 探测失败或位置不可用时退化为「整图 + 不带尺寸提示」，保证功能不会因为探测失效而挂掉。
 */
export async function recognizeAllFromImage(
  file: File,
  mode: OCRMode = "matrix"
): Promise<OCROutcome> {
  const original = await toVisionDataUrl(file);
  const hints = await probeLayout(original, mode);

  // 只取第一个框来裁：一次识别只处理一个区域，多结果仍由解析层返回
  const box = hints?.[0]?.box;
  let target = original;
  let croppedCanvas: HTMLCanvasElement | null = null;
  if (box) {
    const cropped = await cropDataUrl(original, box);
    if (cropped) {
      target = cropped.dataUrl;
      croppedCanvas = cropped.canvas;
    }
  }

  const raw = await callVision(target, buildOcrPrompt(mode, hints ?? undefined));

  let outcome: OCROutcome;
  try {
    outcome = parseOcrResponse(raw);
  } catch (e) {
    logger.error("OCR 结果解析失败:", String(e));
    throw e instanceof Error ? e : new Error("识别结果解析失败");
  }

  // 像素自检：模型把没看清的格子填 0 是最隐蔽的错误（重跑还完全一致），
  // 这里拿裁剪图逐格比对墨迹，把「图上有东西但报了 0」的位置点出来。
  if (croppedCanvas && outcome.items.length > 0) {
    const item = outcome.items[0];
    const ink = measureCellInk(croppedCanvas, item.rows, item.cols);
    if (ink) {
      const audit = auditCellInk(ink, item.data);
      if (audit.warning) item.warnings.push(audit.warning);
    }
  }

  return outcome;
}

/** 新的 OcrItem → 旧的扁平结构（各 section 仍走这个） */
export function toLegacyResult(item: OcrItem): OCRMatrixResult {
  return {
    rows: item.rows,
    cols: item.cols,
    data: item.data,
    isAugmented: item.isAugmented,
    augmentedCol: item.augmentedCol,
    kind: item.kind,
    label: item.label || undefined,
  };
}

/**
 * 兼容入口：只取第一个识别结果。
 * 新代码请用 recognizeAllFromImage，避免图里多个矩阵时丢掉后面的。
 */
export async function recognizeMatrixFromImage(
  file: File,
  mode: OCRMode = "matrix"
): Promise<OCRMatrixResult> {
  const { items } = await recognizeAllFromImage(file, mode);
  if (items.length === 0) {
    throw new Error("没有识别到矩阵或行列式，请调整裁剪范围或换一张更清晰的照片");
  }
  return toLegacyResult(items[0]);
}
