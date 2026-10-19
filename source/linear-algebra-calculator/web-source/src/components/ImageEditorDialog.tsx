import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  RotateCw,
  RotateCcw,
  Check,
  RefreshCw,
  Crop,
  FlipHorizontal,
  FlipVertical,
} from "lucide-react";
import { Image } from '@/components/ui/image';

interface ImageEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onConfirm: (croppedFile: File) => void;
}

interface CropBox {
  x: number; // 百分比 0-100
  y: number;
  w: number;
  h: number;
}

/**
 * 默认框 = 整张图。
 * 旧版默认 5%/90%，会在用户毫不知情的情况下切掉四周 5%——行列式占满画面时，
 * 最外一行/一列正好被切，模型看到的就成了 4 阶甚至 3 阶（v1.6.1 的真实事故）。
 */
const CROP_FULL: CropBox = { x: 0, y: 0, w: 100, h: 100 };

export default function ImageEditorDialog({
  open,
  onOpenChange,
  imageSrc,
  onConfirm,
}: ImageEditorDialogProps) {
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<CropBox>(CROP_FULL);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });
  /** 原图像素尺寸，用来算显示区域 */
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  /** 图片在容器里实际占的像素框（裁剪框与它对齐，保证「看到的就是导出的」） */
  const [box, setBox] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isRotated = rotation % 180 !== 0;

  // 重置状态
  useEffect(() => {
    if (open) {
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCrop(CROP_FULL);
      setNatural({ w: 0, h: 0 });
    }
  }, [open, imageSrc]);

  const resetAll = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(CROP_FULL);
  };

  // 读原图像素尺寸（用独立 Image 对象，不依赖 ui/image 是否转发 onLoad）
  useEffect(() => {
    if (!open || !imageSrc) return;
    let alive = true;
    const im = new window.Image();
    im.onload = () => {
      if (alive) setNatural({ w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
    };
    im.src = imageSrc;
    return () => {
      alive = false;
    };
  }, [open, imageSrc]);

  // 计算图片在容器内的实际显示框：box / 容器 = 图片 / 容器（object-contain 等价算法）
  useEffect(() => {
    const el = containerRef.current;
    if (!el || natural.w === 0) return;

    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw === 0 || ch === 0) return;
      const rw = isRotated ? natural.h : natural.w;
      const rh = isRotated ? natural.w : natural.h;
      const scale = Math.min(cw / rw, ch / rh);
      setBox({ w: Math.round(rw * scale), h: Math.round(rh * scale) });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural, isRotated, open]);

  const rotateLeft = () => setRotation((r) => (r - 90 + 360) % 360);
  const rotateRight = () => setRotation((r) => (r + 90) % 360);

  // 触控/鼠标拖拽处理
  const getEventPos = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ("changedTouches" in e && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    const me = e as MouseEvent | React.MouseEvent;
    return { x: me.clientX, y: me.clientY };
  }, []);

  const startDrag = (type: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getEventPos(e);
    setIsDragging(type);
    setDragStart({
      x: pos.x,
      y: pos.y,
      cropX: crop.x,
      cropY: crop.y,
      cropW: crop.w,
      cropH: crop.h,
    });
  };

  useEffect(() => {
    if (!isDragging || !cropBoxRef.current) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const container = cropBoxRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pos = getEventPos(e);

      const dxPct = ((pos.x - dragStart.x) / rect.width) * 100;
      const dyPct = ((pos.y - dragStart.y) / rect.height) * 100;

      setCrop((prev) => {
        let { x, y, w, h } = prev;

        if (isDragging === "move") {
          x = Math.max(0, Math.min(100 - w, dragStart.cropX + dxPct));
          y = Math.max(0, Math.min(100 - h, dragStart.cropY + dyPct));
        } else if (isDragging === "nw") {
          const newX = Math.max(0, Math.min(dragStart.cropX + dragStart.cropW - 5, dragStart.cropX + dxPct));
          const newY = Math.max(0, Math.min(dragStart.cropY + dragStart.cropH - 5, dragStart.cropY + dyPct));
          w = dragStart.cropW - (newX - dragStart.cropX);
          h = dragStart.cropH - (newY - dragStart.cropY);
          x = newX;
          y = newY;
        } else if (isDragging === "ne") {
          const newY = Math.max(0, Math.min(dragStart.cropY + dragStart.cropH - 5, dragStart.cropY + dyPct));
          w = Math.max(5, Math.min(100 - dragStart.cropX, dragStart.cropW + dxPct));
          h = dragStart.cropH - (newY - dragStart.cropY);
          y = newY;
        } else if (isDragging === "sw") {
          const newX = Math.max(0, Math.min(dragStart.cropX + dragStart.cropW - 5, dragStart.cropX + dxPct));
          w = dragStart.cropW - (newX - dragStart.cropX);
          h = Math.max(5, Math.min(100 - dragStart.cropY, dragStart.cropH + dyPct));
          x = newX;
        } else if (isDragging === "se") {
          w = Math.max(5, Math.min(100 - dragStart.cropX, dragStart.cropW + dxPct));
          h = Math.max(5, Math.min(100 - dragStart.cropY, dragStart.cropH + dyPct));
        }

        return { x, y, w, h };
      });
    };

    const handleEnd = () => {
      setIsDragging(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, dragStart, getEventPos]);

  // 生成裁剪后的图片
  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 计算旋转后的画布尺寸和裁剪区域
    const isRotated = rotation % 180 !== 0;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const canvasW = isRotated ? imgH : imgW;
    const canvasH = isRotated ? imgW : imgH;

    // 裁剪区域（基于旋转后画布的百分比）
    const cropX = (crop.x / 100) * canvasW;
    const cropY = (crop.y / 100) * canvasH;
    const cropW = (crop.w / 100) * canvasW;
    const cropH = (crop.h / 100) * canvasH;

    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);

    ctx.save();
    ctx.translate(cropW / 2, cropH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    // 计算绘制位置
    const drawW = isRotated ? imgH : imgW;
    const drawH = isRotated ? imgW : imgH;
    ctx.drawImage(
      img,
      -drawW / 2 - cropX + canvasW / 2,
      -drawH / 2 - cropY + canvasH / 2,
      imgW,
      imgH
    );
    ctx.restore();

    // 转成 File
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], "edited-image.jpg", { type: "image/jpeg" });
          onConfirm(file);
        }
      },
      "image/jpeg",
      0.92
    );
  };

  const handleCornerMouseDown = (corner: string) => (e: React.MouseEvent) => startDrag(corner, e);
  const handleCornerTouchStart = (corner: string) => (e: React.TouchEvent) => startDrag(corner, e);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Crop className="size-4 text-primary" />
            图片编辑
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 md:p-4 space-y-3">
          {/* 编辑画布 */}
          <div
            ref={containerRef}
            className="relative w-full mx-auto bg-muted/30 rounded-md overflow-hidden select-none"
            style={{ height: "min(50vh, 62vw)" }}
          >
            {/* 图片显示框：尺寸按原图比例算，裁剪百分比与导出坐标系一致 */}
            <div
              ref={cropBoxRef}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: box.w || "100%", height: box.h || "100%" }}
            >
              <Image
                ref={imgRef}
                src={imageSrc}
                alt="编辑图片"
                className="pointer-events-none"
                style={
                  isRotated
                    ? {
                        position: "absolute",
                        width: box.h || "100%",
                        height: box.w || "100%",
                        left: "50%",
                        top: "50%",
                        transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                        transition: "transform 0.2s ease",
                      }
                    : {
                        width: "100%",
                        height: "100%",
                        // 原图尺寸还没测出来时先按 contain 显示，避免拉伸变形
                        objectFit: box.w ? undefined : "contain",
                        transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                        transition: "transform 0.2s ease",
                      }
                }
                draggable={false}
              />

              {/* 半透明遮罩 */}
              <div className="absolute inset-0 pointer-events-none">
                {/* 上 */}
                <div
                  className="absolute left-0 right-0 top-0 bg-black/50"
                  style={{ height: `${crop.y}%` }}
                />
                {/* 下 */}
                <div
                  className="absolute left-0 right-0 bottom-0 bg-black/50"
                  style={{ height: `${100 - crop.y - crop.h}%` }}
                />
                {/* 左 */}
                <div
                  className="absolute left-0 bg-black/50"
                  style={{ top: `${crop.y}%`, height: `${crop.h}%`, width: `${crop.x}%` }}
                />
                {/* 右 */}
                <div
                  className="absolute right-0 bg-black/50"
                  style={{ top: `${crop.y}%`, height: `${crop.h}%`, width: `${100 - crop.x - crop.w}%` }}
                />
              </div>

              {/* 裁剪框边框 */}
              <div
                className="absolute border-2 border-white shadow-lg"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                  touchAction: "none",
                }}
              >
                {/* 内部十字参考线 */}
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />

                {/* 拖拽移动区 */}
                <div
                  className="absolute inset-2 cursor-move"
                  onMouseDown={(e) => startDrag("move", e)}
                  onTouchStart={(e) => startDrag("move", e)}
                />

                {/* 四角手柄 */}
                <div
                  className="absolute -left-1.5 -top-1.5 size-3 md:size-4 bg-white border-2 border-primary rounded-full cursor-nw-resize z-10"
                  onMouseDown={handleCornerMouseDown("nw")}
                  onTouchStart={handleCornerTouchStart("nw")}
                />
                <div
                  className="absolute -right-1.5 -top-1.5 size-3 md:size-4 bg-white border-2 border-primary rounded-full cursor-ne-resize z-10"
                  onMouseDown={handleCornerMouseDown("ne")}
                  onTouchStart={handleCornerTouchStart("ne")}
                />
                <div
                  className="absolute -left-1.5 -bottom-1.5 size-3 md:size-4 bg-white border-2 border-primary rounded-full cursor-sw-resize z-10"
                  onMouseDown={handleCornerMouseDown("sw")}
                  onTouchStart={handleCornerTouchStart("sw")}
                />
                <div
                  className="absolute -right-1.5 -bottom-1.5 size-3 md:size-4 bg-white border-2 border-primary rounded-full cursor-se-resize z-10"
                  onMouseDown={handleCornerMouseDown("se")}
                  onTouchStart={handleCornerTouchStart("se")}
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            默认使用<strong className="text-foreground">整张图</strong>。只有需要去掉题号、草稿笔迹或阴影时才拖动裁剪框；裁剪框之外的内容不会送去识别。
          </p>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={rotateLeft}>
                <RotateCcw className="size-4 mr-1" />
                左转
              </Button>
              <Button variant="secondary" size="sm" onClick={rotateRight}>
                <RotateCw className="size-4 mr-1" />
                右转
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setFlipH(!flipH)}>
                <FlipHorizontal className="size-4 mr-1" />
                水平翻转
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setFlipV(!flipV)}>
                <FlipVertical className="size-4 mr-1" />
                垂直翻转
              </Button>
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <RefreshCw className="size-4 mr-1" />
                重置
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              拖拽边框调整裁剪区域 · 旋转每次 90°
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="size-4 mr-1" />
            确认并识别
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
