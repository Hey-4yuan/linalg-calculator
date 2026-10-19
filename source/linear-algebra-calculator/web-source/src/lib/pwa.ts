/**
 * iOS / PWA 环境判定。
 *
 * 为什么需要这一层：Safari 标签页的脚本可写存储（localStorage / IndexedDB）
 * 在 7 个"使用日"无交互后会被系统清理；「添加到主屏」后的 Web App 使用独立
 * 存储桶，不受这条清理策略影响。而 OCR 的 Base URL / API Key / 模型名就存在
 * localStorage 里，所以"能不能加主屏"直接等于"配置会不会丢"。
 *
 * 判断逻辑全部写成纯函数、接收一个环境对象，方便在 Node 里断言
 * （tests/build-and-test.mjs 直接引用本文件，不需要 jsdom）。
 */

export interface PwaEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** iOS Safari 私有属性：从主屏启动时为 true */
  standalone?: boolean;
  /** matchMedia('(display-mode: standalone)').matches */
  displayModeStandalone?: boolean;
  /** window.isSecureContext —— 非 HTTPS 不能加主屏 */
  secureContext?: boolean;
  /** navigator.storage.persist 能力是否可用 */
  hasPersistStorage?: boolean;
}

/** iOS 上不支持"添加到主屏"的第三方浏览器内核（都是 WKWebView 套壳） */
const NON_SAFARI_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|mercury|DuckDuckGo/i;

/**
 * 是否 iOS / iPadOS。
 * iPadOS 13+ 默认桌面版 UA（"Macintosh"），只能靠触摸点数与桌面 Mac 区分。
 */
export function isIosDevice(env: PwaEnv): boolean {
  if (/iPad|iPhone|iPod/i.test(env.userAgent)) return true;
  return /Macintosh/i.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1;
}

/** 是否 iOS 上的 Safari（只有它能「添加到主屏」） */
export function isIosSafari(env: PwaEnv): boolean {
  return isIosDevice(env) && !NON_SAFARI_IOS.test(env.userAgent);
}

/** 是否已经从主屏以独立窗口启动 */
export function isStandaloneDisplay(env: PwaEnv): boolean {
  return env.standalone === true || env.displayModeStandalone === true;
}

/**
 * 是否该弹「添加到主屏」引导。
 * 四个条件缺一不可：iOS Safari、当前是标签页、HTTPS、用户没关过。
 */
export function shouldShowInstallHint(env: PwaEnv, dismissed: boolean): boolean {
  if (dismissed) return false;
  if (!isIosSafari(env)) return false;
  if (isStandaloneDisplay(env)) return false;
  if (env.secureContext === false) return false;
  return true;
}

/** 从真实浏览器环境读出 PwaEnv（Node 下不可调用） */
export function readPwaEnv(): PwaEnv {
  const nav = navigator as Navigator & {
    standalone?: boolean;
    storage?: StorageManager;
  };
  let displayModeStandalone = false;
  try {
    displayModeStandalone =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    /* 老版本 WebView 可能没有 matchMedia */
  }
  return {
    userAgent: nav.userAgent || "",
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints || 0,
    standalone: nav.standalone === true,
    displayModeStandalone,
    secureContext: window.isSecureContext,
    hasPersistStorage: typeof nav.storage?.persist === "function",
  };
}

/**
 * 尽力申请持久化存储。
 * Chromium 系会真正生效（写入后的数据不会被自动清退）；iOS Safari 没有该方法，
 * 静默跳过——那边只能靠"加主屏"这条路。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage as StorageManager | undefined;
    if (typeof storage?.persist !== "function") return false;
    if (typeof storage.persisted === "function" && (await storage.persisted())) {
      return true;
    }
    return await storage.persist();
  } catch {
    return false;
  }
}
