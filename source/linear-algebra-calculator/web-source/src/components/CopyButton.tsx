import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@lark-apaas/client-toolkit-lite";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** 惰性取文本：只有点下去才做 DOM 遍历，避免每次渲染都算一遍 */
  getText: () => string;
  className?: string;
}

/**
 * 兜底复制：非 HTTPS（file:// 打开单文件版）或老 WebView 没有 navigator.clipboard，
 * 用隐藏 textarea + execCommand 走一遍。失败返回 false，由调用方提示。
 */
function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** 结果卡上的「复制」按钮：成功后有 1.6s 的对勾反馈 */
export default function CopyButton({ getText, className }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const text = getText();
    if (!text.trim()) {
      toast.error("当前没有可复制的结果");
      return;
    }

    let ok = false;
    try {
      ok = await copyToClipboard(text);
    } catch {
      ok = false;
    }
    if (!ok) ok = legacyCopy(text);

    if (!ok) {
      toast.error("复制失败，请长按选择文本手动复制");
      return;
    }

    setDone(true);
    toast.success("已复制到剪贴板");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1600);
  }, [getText]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      title="复制结果"
      aria-label="复制结果"
      className={cn(
        "h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {done ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="hidden sm:inline">{done ? "已复制" : "复制"}</span>
    </Button>
  );
}
