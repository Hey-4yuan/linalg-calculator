// OCR 服务 - 通过用户配置的视觉模型（兼容 OpenAI 协议）识别矩阵图片
// API Key 等配置仅保存在浏览器本地，不上传到第三方

import { scopedStorage } from "@lark-apaas/client-toolkit-lite";
import { logger } from "@lark-apaas/client-toolkit-lite";

// 配置存储键
const OCR_CONFIG_KEY = "__app_linalg_ocr_config";

// 请求超时：视觉模型偶尔会长时间不返回，超时后给出明确提示而不是一直转圈
const OCR_TIMEOUT_MS = 45_000;

export interface OCRConfig {
  baseUrl: string;       // API 基础 URL，如 https://api.openai.com/v1
  apiKey: string;        // API Key
  model: string;         // 视觉模型名，如 gpt-4o-mini
}

// 识别结果
export interface OCRMatrixResult {
  rows: number;
  cols: number;
  data: string[][];      // 每个元素的字符串形式（数字、分数、符号等）
  isAugmented?: boolean; // 是否识别为增广矩阵（方程组）
  augmentedCol?: number; // 增广列索引
}

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

// 调用视觉模型识别矩阵
export async function recognizeMatrixFromImage(
  file: File,
  mode: "matrix" | "system" | "symbolic" = "matrix"
): Promise<OCRMatrixResult> {
  const config = getOCRConfig();
  if (!config) {
    throw new Error("请先配置 OCR 视觉模型 API");
  }
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error("OCR 配置不完整，请检查 Base URL、API Key 和模型名");
  }

  const dataUrl = await fileToDataUrl(file);

  let prompt: string;
  if (mode === "system") {
    prompt = `你是一个数学 OCR 助手。请识别这张图片中的线性方程组增广矩阵。
要求：
1. 识别矩阵的行数和列数（包括常数列）
2. 每个元素都以字符串形式给出，支持整数、小数、分数（如 3/4）、负数
3. 如果是方程组（增广矩阵形式），请标记 isAugmented 为 true，并指出哪一列是常数列（augmentedCol，从 0 开始）
4. 只返回严格的 JSON 格式，不要任何其他文字或代码块标记
JSON 格式示例：
{"rows":3,"cols":4,"data":[["1","2","3","4"],["5","6","7","8"],["9","10","11","12"]],"isAugmented":true,"augmentedCol":3}`;
  } else if (mode === "symbolic") {
    prompt = `你是一个数学 OCR 助手。请识别这张图片中的符号矩阵。
要求：
1. 识别矩阵的行数和列数
2. 每个元素都以字符串形式给出，支持：
   - 整数、小数、分数（如 3/4、-2/5）
   - 字母变量（如 a、b、c、x、y、z、x1、x₂ 等）
   - 常数 π（写作 pi 或 π）
   - 运算符 +、-、*、/、^（如 2*a+3、x^2、a/b + c）
   - 括号 ( 和 )
3. 请将每个元素转换为可被代数解析的字符串形式：
   - π 用 "pi" 表示
   - 下标变量 x₁ 用 "x1" 表示
   - 乘号用 "*" 表示（如 2a 写成 "2*a"）
   - 除号用 "/" 表示（如分数 a/b 写成 "a/b"）
   - 幂用 "^" 表示（如 x² 写成 "x^2"）
4. 只返回严格的 JSON 格式，不要任何其他文字或代码块标记
JSON 格式示例：
{"rows":3,"cols":3,"data":[["a","b","c"],["2*x","pi","3/4"],["x^2","a+b","-5"]]}`;
  } else {
    prompt = `你是一个数学 OCR 助手。请识别这张图片中的矩阵。
要求：
1. 识别矩阵的行数和列数
2. 每个元素都以字符串形式给出，支持整数、小数、分数（如 3/4）、负数
3. 只返回严格的 JSON 格式，不要任何其他文字或代码块标记
JSON 格式示例：
{"rows":3,"cols":3,"data":[["1","2","3"],["4","5","6"],["7","8","9"]]}`;
  }

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

    // 清理可能的 markdown 代码块标记
    let jsonStr = content.trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    jsonStr = jsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");

    const parsed = JSON.parse(jsonStr) as Partial<OCRMatrixResult>;
    if (!parsed.rows || !parsed.cols || !parsed.data || !Array.isArray(parsed.data)) {
      throw new Error("识别结果格式不正确");
    }

    // 校验行列数匹配
    if (parsed.data.length !== parsed.rows) {
      throw new Error(`识别结果行数不匹配: 期望 ${parsed.rows} 行，实际 ${parsed.data.length} 行`);
    }
    for (let i = 0; i < parsed.data.length; i++) {
      if (parsed.data[i].length !== parsed.cols) {
        throw new Error(`第 ${i + 1} 行列数不匹配: 期望 ${parsed.cols} 列，实际 ${parsed.data[i].length} 列`);
      }
    }

    return parsed as OCRMatrixResult;
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
