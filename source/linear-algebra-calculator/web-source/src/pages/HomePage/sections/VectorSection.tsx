import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/CopyButton";
import { extractCopyText } from "@/lib/copy-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FVector, Fraction } from "@/lib/fraction";
import {
  dot,
  cross,
  magnitude,
  normalize,
  angleBetween,
  linearCombination,
  EXAMPLE_VECTOR_A,
  EXAMPLE_VECTOR_B,
} from "@/lib/vector-ops";
import {
  Dot,
  X,
  Ruler,
  Target,
  Compass,
  Combine,
  Plus,
  Minus,
} from "lucide-react";

interface VectorSectionProps {
  fractionMode: boolean;
}

type OperationType =
  | "dot"
  | "cross"
  | "magnitude"
  | "normalize"
  | "angle"
  | "combo";

export default function VectorSection({ fractionMode }: VectorSectionProps) {
  const [dim, setDim] = useState(3);
  const [vecA, setVecA] = useState<FVector>(EXAMPLE_VECTOR_A.slice(0, 3));
  const [vecB, setVecB] = useState<FVector>(EXAMPLE_VECTOR_B.slice(0, 3));
  const [result, setResult] = useState<{
    type: OperationType;
    title: string;
    content: React.ReactNode;
  } | null>(null);

  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [comboA, setComboA] = useState("2");
  const [comboB, setComboB] = useState("3");
  // 结果容器：复制按钮从这里按 data-copy-* 标记还原纯文本
  const resultRef = useRef<HTMLDivElement>(null);

  const is3D = dim === 3;

  // 更新维度
  const changeDim = (d: number) => {
    if (d < 2 || d > 5) return;
    const newA: FVector = [];
    const newB: FVector = [];
    for (let i = 0; i < d; i++) {
      newA.push(vecA[i] ?? Fraction.ZERO);
      newB.push(vecB[i] ?? Fraction.ZERO);
    }
    setVecA(newA);
    setVecB(newB);
    setDim(d);
    setResult(null);
  };

  const updateComponent = (
    which: "a" | "b",
    idx: number,
    str: string
  ) => {
    const f = Fraction.safeParse(str);
    if (!f) return;
    if (which === "a") {
      const newV = vecA.slice();
      newV[idx] = f;
      setVecA(newV);
    } else {
      const newV = vecB.slice();
      newV[idx] = f;
      setVecB(newV);
    }
  };

  const calculate = (op: OperationType) => {
    try {
      switch (op) {
        case "dot": {
          const res = dot(vecA, vecB);
          setResult({
            type: "dot",
            title: "点积 v · w",
            content: (
              <div className="space-y-1">
                <div
                  data-copy-value=""
                  className="text-2xl font-mono font-semibold"
                >
                  {fractionMode
                    ? res.toFractionString()
                    : res.toDecimalString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  v · w = v₁w₁ + v₂w₂ + ... + vₙwₙ
                </div>
              </div>
            ),
          });
          break;
        }
        case "cross": {
          if (!is3D) {
            toast.error("叉积仅适用于三维向量");
            return;
          }
          const res = cross(vecA, vecB);
          setResult({
            type: "cross",
            title: "叉积 v × w",
            content: (
              <div className="space-y-2">
                <VectorRow vector={res} fractionMode={fractionMode} />
                <div className="text-xs text-muted-foreground">
                  叉积结果是一个同时垂直于 v 和 w 的向量
                </div>
              </div>
            ),
          });
          break;
        }
        case "magnitude": {
          const magV = magnitude(vecA);
          const magW = magnitude(vecB);
          setResult({
            type: "magnitude",
            title: "向量长度 / 模 ‖v‖",
            content: (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                  <span className="text-sm text-muted-foreground">‖v‖</span>
                  <span
                    data-copy-value=""
                    className="font-mono text-lg font-semibold"
                  >
                    {magV.toFixed(6).replace(/\.?0+$/, "")}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                  <span className="text-sm text-muted-foreground">‖w‖</span>
                  <span
                    data-copy-value=""
                    className="font-mono text-lg font-semibold"
                  >
                    {magW.toFixed(6).replace(/\.?0+$/, "")}
                  </span>
                </div>
              </div>
            ),
          });
          break;
        }
        case "normalize": {
          const nV = normalize(vecA);
          const nW = normalize(vecB);
          const magV = magnitude(vecA);
          const magW = magnitude(vecB);
          setResult({
            type: "normalize",
            title: "单位化 v̂ = v / ‖v‖",
            content: (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">v̂ (单位向量)</div>
                  <VectorRowNumber vector={nV} />
                  <div className="text-xs text-muted-foreground">
                    ‖v‖ = {magV.toFixed(6).replace(/\.?0+$/, "")}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">ŵ (单位向量)</div>
                  <VectorRowNumber vector={nW} />
                  <div className="text-xs text-muted-foreground">
                    ‖w‖ = {magW.toFixed(6).replace(/\.?0+$/, "")}
                  </div>
                </div>
              </div>
            ),
          });
          break;
        }
        case "angle": {
          const angleRad = angleBetween(vecA, vecB);
          const angleDeg = (angleRad * 180) / Math.PI;
          setResult({
            type: "angle",
            title: "向量夹角 θ",
            content: (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                  <span className="text-sm text-muted-foreground">弧度</span>
                  <span
                    data-copy-value=""
                    className="font-mono text-lg font-semibold"
                  >
                    {angleRad.toFixed(6).replace(/\.?0+$/, "")} rad
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                  <span className="text-sm text-muted-foreground">角度</span>
                  <span
                    data-copy-value=""
                    className="font-mono text-lg font-semibold"
                  >
                    {angleDeg.toFixed(4).replace(/\.?0+$/, "")}°
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  cosθ = (v · w) / (‖v‖·‖w‖)
                </div>
              </div>
            ),
          });
          break;
        }
        case "combo": {
          setComboDialogOpen(true);
          break;
        }
      }
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleCombo = () => {
    const a = Fraction.safeParse(comboA);
    const b = Fraction.safeParse(comboB);
    if (!a || !b) {
      toast.error("请输入有效的系数");
      return;
    }
    try {
      const res = linearCombination(vecA, vecB, a, b);
      setResult({
        type: "combo",
        title: `线性组合 ${a.toFractionString()}·v + ${b.toFractionString()}·w`,
        content: (
          <div className="space-y-2">
            <VectorRow vector={res} fractionMode={fractionMode} />
          </div>
        ),
      });
    } catch (e) {
      toast.error(String(e));
    }
    setComboDialogOpen(false);
  };

  const fillExample = () => {
    const a = EXAMPLE_VECTOR_A.slice(0, dim);
    const b = EXAMPLE_VECTOR_B.slice(0, dim);
    while (a.length < dim) a.push(Fraction.ZERO);
    while (b.length < dim) b.push(Fraction.ZERO);
    setVecA(a);
    setVecB(b);
    setResult(null);
    toast.success("已加载示例向量");
  };

  const clearAll = () => {
    const zero = new Array(dim).fill(null).map(() => Fraction.ZERO);
    setVecA([...zero]);
    setVecB([...zero]);
    setResult(null);
  };

  const operations: {
    type: OperationType;
    label: string;
    icon: React.ReactNode;
    only3D?: boolean;
  }[] = [
    { type: "dot", label: "点积 v·w", icon: <Dot className="size-4" /> },
    { type: "cross", label: "叉积 v×w", icon: <X className="size-4" />, only3D: true },
    { type: "magnitude", label: "长度/模", icon: <Ruler className="size-4" /> },
    { type: "normalize", label: "单位化", icon: <Target className="size-4" /> },
    { type: "angle", label: "夹角", icon: <Compass className="size-4" /> },
    { type: "combo", label: "线性组合", icon: <Combine className="size-4" /> },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* 左侧：输入区 */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">向量输入</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">维度:</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeDim(dim - 1)}
                    disabled={dim <= 2}
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-6 text-center font-mono">{dim}</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeDim(dim + 1)}
                    disabled={dim >= 5}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 向量 v */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                向量 v
              </div>
              <div className="flex gap-2 flex-wrap">
                {vecA.map((v, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-5">
                      v<sub>{i + 1}</sub>
                    </span>
                    <VectorInput
                      value={v}
                      onChange={(s) => updateComponent("a", i, s)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 向量 w */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                向量 w
              </div>
              <div className="flex gap-2 flex-wrap">
                {vecB.map((v, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-5">
                      w<sub>{i + 1}</sub>
                    </span>
                    <VectorInput
                      value={v}
                      onChange={(s) => updateComponent("b", i, s)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={fillExample}>
                示例填充
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                清空
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">向量运算</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {operations.map((op) => (
                <Button
                  key={op.type}
                  variant="secondary"
                  onClick={() => calculate(op.type)}
                  disabled={op.only3D && !is3D}
                  className="flex flex-col gap-1 h-auto py-3"
                  title={op.only3D && !is3D ? "仅三维向量可用" : op.label}
                >
                  {op.icon}
                  <span className="text-xs">{op.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 右侧：结果区 */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                {result ? result.title : "计算结果"}
              </CardTitle>
              {result && (
                <CopyButton getText={() => extractCopyText(resultRef.current)} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {result ? (
              <div ref={resultRef} className="min-h-[120px] py-2">
                {result.content}
              </div>
            ) : (
              <div className="min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                选择运算类型查看结果
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 线性组合对话框 */}
      <Dialog open={comboDialogOpen} onOpenChange={setComboDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>线性组合 a·v + b·w</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="combo-a">系数 a</Label>
              <Input
                id="combo-a"
                value={comboA}
                onChange={(e) => setComboA(e.target.value)}
                placeholder="整数、小数或分数"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="combo-b">系数 b</Label>
              <Input
                id="combo-b"
                value={comboB}
                onChange={(e) => setComboB(e.target.value)}
                placeholder="整数、小数或分数"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setComboDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCombo}>计算</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 向量分量输入组件
function VectorInput({
  value,
  onChange,
}: {
  value: Fraction;
  onChange: (s: string) => void;
}) {
  const [text, setText] = useState(value.toFractionString());
  const [isInvalid, setIsInvalid] = useState(false);

  const handleBlur = () => {
    const f = Fraction.safeParse(text);
    if (f) {
      onChange(text);
      setIsInvalid(false);
    } else {
      setIsInvalid(true);
    }
  };

  return (
    <Input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setIsInvalid(false);
      }}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleBlur();
      }}
      className={`w-20 h-8 text-center text-sm font-mono ${
        isInvalid ? "border-destructive focus-visible:ring-destructive" : ""
      }`}
    />
  );
}

// 分数向量行展示
function VectorRow({
  vector,
  fractionMode,
}: {
  vector: Fraction[];
  fractionMode: boolean;
}) {
  return (
    <div className="inline-block relative">
      <div className="absolute left-0 top-0 bottom-0 w-1.5 border-l-2 border-y-2 border-foreground/40 rounded-l-md" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 border-r-2 border-y-2 border-foreground/40 rounded-r-md" />
      <div className="flex gap-0 py-1 px-4" data-copy-row="">
        {vector.map((v, i) => (
          <div
            key={i}
            data-copy-cell=""
            className="font-mono text-center py-1.5 px-3 min-w-[56px] text-lg"
          >
            {fractionMode ? v.toFractionString() : v.toDecimalString()}
          </div>
        ))}
      </div>
    </div>
  );
}

// 小数向量行展示
function VectorRowNumber({ vector }: { vector: number[] }) {
  return (
    <div className="inline-block relative">
      <div className="absolute left-0 top-0 bottom-0 w-1.5 border-l-2 border-y-2 border-foreground/40 rounded-l-md" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 border-r-2 border-y-2 border-foreground/40 rounded-r-md" />
      <div className="flex gap-0 py-1 px-4" data-copy-row="">
        {vector.map((v, i) => (
          <div
            key={i}
            data-copy-cell=""
            className="font-mono text-center py-1.5 px-3 min-w-[56px] text-sm"
          >
            {v.toFixed(6).replace(/\.?0+$/, "") || "0"}
          </div>
        ))}
      </div>
    </div>
  );
}
