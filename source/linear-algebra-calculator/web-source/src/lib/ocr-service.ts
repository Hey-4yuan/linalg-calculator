// OCR 服务 - 通过用户配置的视觉模型（兼容 OpenAI 协议）识别矩阵/行列式
// API Key 等配置仅保存在浏览器本地，不上传到第三方
//
// v1.6 起模型返回数组（一张图里可能有多个矩阵/行列式）：解析交给 ocr-parse.ts，
// 提示词交给 ocr-prompt.ts；本文件只负责「配置 + 发请求 + 错误翻译」。

import { scopedStorage } from "@lark-apaas/client-toolkit-lite";
import { logger } from "@lark-apaas/client-toolkit-lite";
import { buildOcrPrompt, type OcrPromptMode } from "./ocr-prompt";
import { parseOcrResponse, type OcrItem } from "./ocr-parse";

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

/** 发一次请求，拿回模型原始文本 */
async function requestOcrRaw(file: File, mode: OCRMode): Promise<string> {
  const config = getOCRConfig();
  if (!config) {
    throw new Error("请先配置 OCR 视觉模型 API");
  }
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error("OCR 配置不完整，请检查 Base URL、API Key 和模型名");
  }

  const dataUrl = await fileToDataUrl(file);
  const prompt = buildOcrPrompt(mode);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const url = config.baseUrl.replace(/\/$/, "") + "/chat/completions";

    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
      }),
    });

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
  } catch (e) {
    logger.error("OCR 识别失败:", String(e));
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        `识别超时（${OCR_TIMEOUT_MS / 1000} 秒无响应），请检查网络或更换模型接口`
      );
    }
    if (e instanceof Error) throw e;
    throw new Error("识别失败：网络错误或 API 调用异常");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 识别图片里的**所有**矩阵/行列式。
 * 返回数组：一张图里有多道题、多个矩阵时不会只给你第一个。
 */
export async function recognizeAllFromImage(
  file: File,
  mode: OCRMode = "matrix"
): Promise<OCROutcome> {
  const raw = await requestOcrRaw(file, mode);
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
