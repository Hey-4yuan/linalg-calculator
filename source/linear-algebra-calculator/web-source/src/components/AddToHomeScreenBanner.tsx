import { useEffect, useState } from "react";
import { scopedStorage } from "@lark-apaas/client-toolkit-lite";
import { Share, X, Smartphone, ShieldCheck } from "lucide-react";
import { readPwaEnv, shouldShowInstallHint } from "@/lib/pwa";

/** 关闭过就不再打扰；key 带版本号，引导文案大改时可以直接换一版重新提示 */
const DISMISS_KEY = "__app_linalg_a2hs_dismissed_v1";

/**
 * iOS Safari 的「添加到主屏」引导条。
 *
 * 存在的理由不是"图标好看"，而是存储：Safari 标签页的脚本存储 7 个使用日
 * 无交互就被清掉，主屏 Web App 走独立存储桶且豁免。OCR 的 API Key 存在
 * localStorage 里，用户不加主屏就会以为"配置自己丢了"。
 */
export default function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = scopedStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* 读不到存储就当没关过：宁可多提示一次 */
    }
    setVisible(shouldShowInstallHint(readPwaEnv(), dismissed));
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      scopedStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* 存储不可用时不记忆，下次再提示 */
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-xl border border-border/60 bg-card/95 shadow-lg backdrop-blur-md"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      role="dialog"
      aria-label="添加到主屏幕提示"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="size-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Smartphone className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">
                添加到主屏，OCR 配置不会丢
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                iPhone / iPad · Safari
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="关闭提示"
            className="-mr-1 -mt-1 size-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted flex items-center justify-center"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          在 Safari 标签页里超过 7 天不打开，系统会清空本站本地数据（含
          API Key 与分数模式偏好）。加到主屏后使用独立存储，不受这条规则影响，
          还能离线打开。
        </p>

        <ol className="mt-3 space-y-1.5 text-xs text-foreground/90">
          <li className="flex items-center gap-2">
            <span className="size-4 shrink-0 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center">
              1
            </span>
            <span className="flex items-center gap-1">
              点 Safari 底部的
              <Share className="size-3.5 text-primary" />
              分享按钮
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="size-4 shrink-0 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center">
              2
            </span>
            <span>下滑找到「添加到主屏幕」</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="size-4 shrink-0 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center">
              3
            </span>
            <span>右上角点「添加」，之后从桌面图标进入</span>
          </li>
        </ol>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            配置只存在本机，不上传
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-primary px-2 py-1 rounded-md hover:bg-primary/10"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
