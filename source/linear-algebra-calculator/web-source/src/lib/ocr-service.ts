// OCR 服务 - 通过用户配置的视觉模型（兼容 OpenAI 协议）识别矩阵/行列式
// API Key 等配置仅保存在浏览器本地，不上传到第三方
//
// v1.6 起模型返回数组（一张图里可能有多个矩阵/行列式）：解析交给 ocr-parse.ts，
// 提示词交给 ocr-prompt.ts；本文件只负责「配置 + 发请求 + 错误翻译」。

import { scopedStorage } from "@lark-apaas/client-toolkit-lite";
import { logger } from "@lark-apaas/client-toolkit-lite";
import { buildOcrPrompt, buildDimensionProbePrompt, type OcrPromptMode } from "./ocr-prompt";
import { parseOcrResponse, parseDimensionProbe, type OcrItem } from "./ocr-parse";

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

/**
 * 送模型前的预处理：长边超过 2048 就先自己高质量缩一次。
 * 手机原图动辄 4000px，直接发会被服务端粗暴降采样，5 阶行列式的细线正好糊掉；
 * 自己缩反而更清楚，也省上传时间。解码失败就退回原图，不让预处理把功能弄挂。
 */
async function toVisionDataUrl(file: File): Promise<string> {
  const raw = await fileToDataUrl(file);
  if (typeof document === "undefined") return raw;
  try {
    const img = await loadImageElement(raw);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (longEdge <= MAX_IMAGE_EDGE) return raw;

    const scale = MAX_IMAGE_EDGE / longEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return raw;
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
  const content = result.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("API 返回格式异常，无法解析内容");
  }
  return content;
}

/**
 * 先单独问一次「有几个、各是几行几列」。
 * 模型直接写 data 时经常少读一行/一列（生成 token 时没法回头数），
 * 先给出尺寸再让它填内容，5 阶以上命中率明显提高。探测失败就返回 null，不影响主流程。
 */
async function probeDimensions(
  dataUrl: string,
  mode: OCRMode
): Promise<{ rows: number; cols: number }[] | null> {
  try {
    const raw = await callVision(dataUrl, buildDimensionProbePrompt(mode), {
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return parseDimensionProbe(raw);
  } catch (e) {
    logger.error("尺寸探测失败，改为无提示直接识别:", String(e));
    return null;
  }
}

/**
 * 识别图片里的**所有**矩阵/行列式。
 * 返回数组：一张图里有多道题、多个矩阵时不会只给你第一个。
 *
 * 两次请求：先探尺寸（短超时、失败可忽略），再带尺寸提示做正式识别。
 */
export async function recognizeAllFromImage(
  file: File,
  mode: OCRMode = "matrix"
): Promise<OCROutcome> {
  const dataUrl = await toVisionDataUrl(file);
  const hints = await probeDimensions(dataUrl, mode);
  const raw = await callVision(dataUrl, buildOcrPrompt(mode, hints ?? undefined));

  try {
    return parseOcrResponse(raw);
  } catch (e) {
    logger.error("OCR 结果解析失败:", String(e));
    throw e instanceof Error ? e : new Error("识别结果解析失败");
  }
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
