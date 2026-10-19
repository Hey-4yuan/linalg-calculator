/**
 * 视觉模型服务商预设（国内可用优先）。
 *
 * 为什么要有这个：OCR 设置里 Base URL 是最容易填错的一项 ——
 * 少写 `/v1`、多写 `/chat/completions`、把智谱的 `/api/paas/v4` 记成 `/v1`，
 * 都会得到 404 且报错信息对普通用户没有指向性。点一下就填好，能省掉大半支持成本。
 *
 * 模型名可能随服务商调整，所以这里只做「建议值」，输入框仍可手改；
 * 每个预设置 note 说明申请入口与该服务商的坑。
 */
export interface OcrPreset {
  id: string;
  /** 显示名 */
  name: string;
  /** 角标：免费 / 最便宜 / 最准 … */
  badge?: string;
  badgeTone?: "free" | "cheap" | "accurate" | "warn";
  baseUrl: string;
  model: string;
  /** 填完后展示的说明 */
  note: string;
}

export const OCR_PRESETS: OcrPreset[] = [
  {
    id: "zhipu-flash",
    name: "智谱 GLM-4V-Flash",
    badge: "免费",
    badgeTone: "free",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4v-flash",
    note: "有每日免费额度，适合先用起来。开通入口 open.bigmodel.cn（手机号注册即可）。免费额度有限速，连续识别会偶发 429。",
  },
  {
    id: "dashscope-flash",
    name: "通义 Qwen3-VL-Flash",
    badge: "最便宜",
    badgeTone: "cheap",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-vl-flash",
    note: "阿里云百炼，单价极低且中文 OCR 准，是长期用的首选。新用户有免费 token 额度。开通入口 dashscope.console.aliyun.com。",
  },
  {
    id: "dashscope-max",
    name: "通义 Qwen-VL-Max",
    badge: "最准",
    badgeTone: "accurate",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-max",
    note: "精度优先。四阶以上行列式、手写体、拍照有阴影时建议用这个，比 Flash 版明显稳。",
  },
  {
    id: "siliconflow",
    name: "硅基流动 Qwen3-VL",
    badge: "有礼包",
    badgeTone: "cheap",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-VL-32B-Instruct",
    note: "聚合平台，新用户送额度，一个 Key 能用多个开源模型。模型名以控制台列表为准，点这里只是填个常见值。",
  },
  {
    id: "volc-doubao",
    name: "豆包 Vision",
    badge: "需接入点",
    badgeTone: "warn",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "ep-",
    note: "火山的模型名要填「推理接入点 ID」（ep- 开头的一串），不是 doubao-vision-pro 这种名字。先在方舟控制台建接入点再复制过来。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "推理型",
    badgeTone: "warn",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    note: "deepseek-flash 是推理模型，token 全花在思考上，四阶以上会稳定漏读个别数字。日常 2×2～3×3 够用；大矩阵建议换通义或智谱。",
  },
];

/** 根据当前 baseUrl 猜出用户用的是哪家（用于高亮） */
export function matchPreset(baseUrl: string): OcrPreset | undefined {
  const norm = (s: string) => s.trim().replace(/\/+$/, "").toLowerCase();
  const target = norm(baseUrl);
  if (!target) return undefined;
  return OCR_PRESETS.find((p) => norm(p.baseUrl) === target);
}
