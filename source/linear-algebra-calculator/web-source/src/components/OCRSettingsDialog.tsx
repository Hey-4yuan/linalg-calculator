import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getOCRConfig,
  saveOCRConfig,
  clearOCRConfig,
  type OCRConfig,
} from "@/lib/ocr-service";
import { readPwaEnv, isIosDevice, isStandaloneDisplay } from "@/lib/pwa";
import { OCR_PRESETS, matchPreset, type OcrPreset } from "@/lib/ocr-presets";
import { Settings, Key, Globe, Cpu, Trash2, Info, Zap } from "lucide-react";
import { toast } from "sonner";

interface OCRSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TONE_CLASS: Record<NonNullable<OcrPreset["badgeTone"]>, string> = {
  free: "bg-emerald-100 text-emerald-700",
  cheap: "bg-sky-100 text-sky-700",
  accurate: "bg-violet-100 text-violet-700",
  warn: "bg-amber-100 text-amber-800",
};

export default function OCRSettingsDialog({
  open,
  onOpenChange,
}: OCRSettingsDialogProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  /** 当前 baseUrl 命中的预设（用于高亮与展示提示） */
  const [picked, setPicked] = useState<string | undefined>();
  // iOS 上的存储风险提示：标签页会被 7 天清理，主屏 Web App 不会
  const [iosHint, setIosHint] = useState<"none" | "tab" | "home">("none");

  useEffect(() => {
    const env = readPwaEnv();
    if (!isIosDevice(env)) return;
    setIosHint(isStandaloneDisplay(env) ? "home" : "tab");
  }, []);

  useEffect(() => {
    if (open) {
      const cfg = getOCRConfig();
      if (cfg) {
        setBaseUrl(cfg.baseUrl);
        setApiKey(cfg.apiKey);
        setModel(cfg.model);
        setPicked(matchPreset(cfg.baseUrl)?.id);
      } else {
        setBaseUrl("https://api.openai.com/v1");
        setApiKey("");
        setModel("gpt-4o-mini");
        setPicked(undefined);
      }
    }
  }, [open]);

  /** 点预设：只覆盖 Base URL 与模型名，绝不动用户已填的 Key */
  const applyPreset = (preset: OcrPreset) => {
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setPicked(preset.id);
    if (!apiKey.trim()) toast.info("再填入该服务商的 API Key 即可使用");
  };

  const activePreset = OCR_PRESETS.find((p) => p.id === picked);

  const handleSave = () => {
    if (!baseUrl.trim()) {
      toast.error("请输入 Base URL");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("请输入 API Key");
      return;
    }
    if (!model.trim()) {
      toast.error("请输入模型名");
      return;
    }
    const config: OCRConfig = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    };
    saveOCRConfig(config);
    setPicked(matchPreset(config.baseUrl)?.id);
    toast.success("配置已保存");
    onOpenChange(false);
  };

  const handleClear = () => {
    clearOCRConfig();
    setBaseUrl("");
    setApiKey("");
    setModel("");
    setPicked(undefined);
    toast.info("配置已清除");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            OCR 视觉识别配置
          </DialogTitle>
          <DialogDescription className="text-xs">
            配置兼容 OpenAI 协议的视觉模型 API，用于识别图片中的矩阵数字。
            配置信息仅保存在浏览器本地，不会上传到任何第三方。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 服务商预设：Base URL 最容易填错，点一下自动填好 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Zap className="size-3.5 text-muted-foreground" />
              快速选择服务商
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {OCR_PRESETS.map((preset) => {
                const active = picked === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 hover:border-primary/50 hover:bg-muted/60"
                    }`}
                  >
                    <span>{preset.name}</span>
                    {preset.badge && (
                      <span
                        className={`rounded px-1 py-px text-[10px] leading-none ${
                          TONE_CLASS[preset.badgeTone ?? "cheap"]
                        }`}
                      >
                        {preset.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {activePreset ? (
              <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {activePreset.note}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                选一个服务商会自动填好下面两项；也可以直接手填任意 OpenAI 兼容接口。
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ocr-base-url" className="flex items-center gap-2">
              <Globe className="size-3.5 text-muted-foreground" />
              Base URL
            </Label>
            <Input
              id="ocr-base-url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setPicked(undefined);
              }}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              填到 <code className="font-mono">/v1</code> 或 <code className="font-mono">/v4</code> 为止，
              <strong className="text-foreground">不要带</strong> <code className="font-mono">/chat/completions</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ocr-api-key" className="flex items-center gap-2">
              <Key className="size-3.5 text-muted-foreground" />
              API Key
            </Label>
            <Input
              id="ocr-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              密钥仅保存在本地浏览器，不会上传
            </p>
          </div>

          {iosHint === "tab" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              <Info className="size-3.5 mt-0.5 shrink-0" />
              <span>
                iOS 提示：Safari 标签页超过 7 天未打开，系统会清掉这里保存的配置。
                先点底部「分享 → 添加到主屏幕」，再从桌面图标进入，配置就不会被定期清理。
              </span>
            </div>
          )}
          {iosHint === "home" && (
            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="size-3.5 mt-0.5 shrink-0" />
              <span>已从主屏幕启动，这里的配置使用独立存储，不会被系统定期清理。</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ocr-model" className="flex items-center gap-2">
              <Cpu className="size-3.5 text-muted-foreground" />
              视觉模型名
            </Label>
            <Input
              id="ocr-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              必须支持图像输入。推荐非推理模型（如 <code className="font-mono">qwen-vl-max</code>、
              <code className="font-mono">glm-4v-flash</code>）；推理模型（`-flash` 思考型、o 系列）
              四阶以上容易漏读数字。
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-muted-foreground"
          >
            <Trash2 className="size-3.5 mr-1" />
            清除配置
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存配置</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
