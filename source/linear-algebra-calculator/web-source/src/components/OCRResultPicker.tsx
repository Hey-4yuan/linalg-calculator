import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table2, Equal } from "lucide-react";
import type { OcrItem } from "@/lib/ocr-parse";

interface OCRResultPickerProps {
  open: boolean;
  items: OcrItem[];
  onOpenChange: (open: boolean) => void;
  onPick: (item: OcrItem) => void;
}

/** 一行结果摘要：label / 类型 / 尺寸 / 首行内容 */
function previewRow(item: OcrItem): string {
  const first = item.data[0] ?? [];
  const cells = first.slice(0, 6).map((c) => (c === "" ? "∅" : c));
  const tail = first.length > 6 ? " …" : "";
  return `[${cells.join(", ")}${tail}]`;
}

/**
 * 一张图里识别出多个矩阵/行列式时，让用户挑一个载入。
 *
 * 为什么要有这一步：旧版本只取第一个结果，用户拍一整页作业时永远只能拿到第一题；
 * 但计算器一个面板只放得下一个矩阵，所以「全部自动塞进去」也不现实，选择是折中。
 */
export default function OCRResultPicker({
  open,
  items,
  onOpenChange,
  onPick,
}: OCRResultPickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>识别到 {items.length} 个矩阵/行列式</DialogTitle>
          <DialogDescription className="text-xs">
            选择要载入计算器的那个。行列式会作为方阵载入，再点「行列式 det」即可求值。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {items.map((item, index) => {
            const isDet = item.kind === "determinant";
            const Icon = isDet ? Equal : Table2;
            return (
              <button
                key={index}
                type="button"
                onClick={() => onPick(item)}
                className="w-full text-left rounded-lg border border-border/60 bg-card px-3 py-2.5 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-6 shrink-0 rounded-md bg-muted text-xs font-medium flex items-center justify-center">
                    {index + 1}
                  </span>
                  <Icon className="size-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">
                    {item.label || (isDet ? "行列式" : "矩阵")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isDet ? "det" : "matrix"} · {item.rows}×{item.cols}
                  </span>
                </div>
                <div className="mt-1 pl-8 font-mono text-xs text-muted-foreground break-all">
                  {previewRow(item)}
                </div>
                {item.warnings.length > 0 && (
                  <div className="mt-1 pl-8 text-[11px] text-amber-700">
                    {item.warnings.slice(0, 2).join("；")}
                    {item.warnings.length > 2 ? ` 等 ${item.warnings.length} 条` : ""}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
