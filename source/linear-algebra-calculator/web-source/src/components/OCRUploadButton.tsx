import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Upload, Camera, Settings, Loader2 } from "lucide-react";
import {
  recognizeAllFromImage,
  toLegacyResult,
  hasValidOCRConfig,
  type OCRMatrixResult,
} from "@/lib/ocr-service";
import type { OcrItem } from "@/lib/ocr-parse";
import { toast } from "sonner";
import OCRSettingsDialog from "./OCRSettingsDialog";
import ImageEditorDialog from "./ImageEditorDialog";
import OCRResultPicker from "./OCRResultPicker";
import { Fraction, type FMatrix, toFMatrix } from "@/lib/fraction";

interface OCRUploadButtonProps {
  mode: "matrix" | "system" | "symbolic";
  onResult: (result: OCRMatrixResult) => void;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "secondary";
  label?: string;
}

export default function OCRUploadButton({
  mode,
  onResult,
  size = "sm",
  variant = "ghost",
  label,
}: OCRUploadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<string>("");
  // 一张图识别出多个矩阵/行列式时，先让用户挑
  const [pickerItems, setPickerItems] = useState<OcrItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayLabel = label ?? "图片识别";

  /** 把选中的一项交给调用方（各 section 仍用旧的扁平结构） */
  const applyItem = (item: OcrItem) => {
    const kindText = item.kind === "determinant" ? "行列式" : "矩阵";
    const labelText = item.label ? `「${item.label}」` : "";
    toast.success(`识别成功：${labelText}${kindText} ${item.rows}×${item.cols}`, {
      id: "ocr-loading",
    });
    if (item.warnings.length > 0) {
      toast.warning(item.warnings.slice(0, 2).join("；"), { duration: 6000 });
    }
    onResult(toLegacyResult(item));
  };

  const handleClick = () => {
    if (!hasValidOCRConfig()) {
      setSettingsOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input，允许重复选择同一文件
    e.target.value = "";

    // 先加载图片到编辑器
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
      setEditorOpen(true);
    };
    reader.onerror = () => {
      toast.error("图片读取失败");
    };
    reader.readAsDataURL(file);
  };

  const handleEditorConfirm = async (editedFile: File) => {
    setEditorOpen(false);
    setLoading(true);
    toast.loading("正在识别图片中的内容...", { id: "ocr-loading" });

    try {
      const { items, notes } = await recognizeAllFromImage(editedFile, mode);

      if (items.length === 0) {
        toast.error(
          notes[0] ?? "没有识别到矩阵或行列式，请调整裁剪范围或换一张更清晰的照片",
          { id: "ocr-loading" }
        );
        return;
      }

      if (items.length === 1) {
        applyItem(items[0]);
        return;
      }

      // 多个结果：收起 loading，弹选择框
      toast.dismiss("ocr-loading");
      setPickerItems(items);
      setPickerOpen(true);
    } catch (err) {
      toast.error(String(err), { id: "ocr-loading" });
    } finally {
      setLoading(false);
      setPendingImage("");
    }
  };

  const hasConfig = hasValidOCRConfig();

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={handleClick}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : hasConfig ? (
                <Upload className="size-3.5 mr-1" />
              ) : (
                <Settings className="size-3.5 mr-1" />
              )}
              {size !== "icon" && (hasConfig ? displayLabel : "配置 OCR")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasConfig
              ? "上传图片识别矩阵"
              : "先配置视觉模型 API，再使用图片识别"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {hasConfig && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>OCR 设置</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <OCRSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <ImageEditorDialog
        open={editorOpen}
        onOpenChange={(v) => {
          setEditorOpen(v);
          if (!v) setPendingImage("");
        }}
        imageSrc={pendingImage}
        onConfirm={handleEditorConfirm}
      />

      <OCRResultPicker
        open={pickerOpen}
        items={pickerItems}
        onOpenChange={(v) => {
          setPickerOpen(v);
          if (!v) setPickerItems([]);
        }}
        onPick={(item) => {
          setPickerOpen(false);
          setPickerItems([]);
          applyItem(item);
        }}
      />
    </>
  );
}

// 将 OCR 结果转换为 FMatrix（分数矩阵）
export function ocrResultToFMatrix(result: OCRMatrixResult): FMatrix {
  return toFMatrix(result.data);
}

// 安全解析：对识别失败的单元格置 0
export function safeOcrResultToFMatrix(result: OCRMatrixResult): {
  matrix: FMatrix;
  failedCells: [number, number][];
} {
  const failed: [number, number][] = [];
  const matrix: FMatrix = result.data.map((row, i) =>
    row.map((cell, j) => {
      const f = Fraction.safeParse(cell);
      if (!f) {
        failed.push([i, j]);
        return Fraction.ZERO;
      }
      return f;
    })
  );
  return { matrix, failedCells: failed };
}
