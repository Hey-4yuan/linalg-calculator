import { useState, useMemo, useRef } from "react";
import MatrixGrid from "@/components/MatrixGrid";
import MatrixDisplay, { ScalarResult } from "@/components/MatrixDisplay";
import StepsAccordion from "@/components/StepsAccordion";
import CopyButton from "@/components/CopyButton";
import { extractCopyText } from "@/lib/copy-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  FMatrix,
  Fraction,
  toFMatrix,
  transpose,
} from "@/lib/fraction";
import {
  determinant,
  inverse,
  rank,
  trace,
  rref,
  eigenvalues,
  matrixPower,
  EXAMPLE_MATRIX,
} from "@/lib/matrix-ops";
import {
  Calculator,
  Hash,
  ArrowRightLeft,
  Table2,
  Sparkles,
  Layers,
  Zap,
  Grid3X3,
  FunctionSquare,
} from "lucide-react";
import OCRUploadButton, { safeOcrResultToFMatrix } from "@/components/OCRUploadButton";
import {
  type SMatrix,
  type Expr,
  parseExpr,
  safeParseExpr,
  sDeterminant,
  sInverse,
  sRank,
  sTranspose,
  sTrace,
  sRref,
  sAdd,
  sMultiply,
  exprToString,
  zeroSMatrix,
  identitySMatrix,
  cloneSMatrix,
} from "@/lib/symbolic";

interface SingleMatrixSectionProps {
  fractionMode: boolean;
}

type OperationType =
  | "det"
  | "inv"
  | "rank"
  | "transpose"
  | "rref"
  | "eigen"
  | "trace"
  | "power";

export default function SingleMatrixSection({
  fractionMode,
}: SingleMatrixSectionProps) {
  const [matrix, setMatrix] = useState<FMatrix>(EXAMPLE_MATRIX);
  const [result, setResult] = useState<{
    type: OperationType;
    title: string;
    content: React.ReactNode;
    steps?: import("@/lib/matrix-ops").RowStep[];
    hasAugmentedSteps?: boolean;
  } | null>(null);

  const [powerDialogOpen, setPowerDialogOpen] = useState(false);
  const [powerValue, setPowerValue] = useState("2");
  // 结果容器：复制按钮从这里按 data-copy-* 标记还原纯文本
  const resultRef = useRef<HTMLDivElement>(null);

  const isSquare = matrix.length === matrix[0].length;
  const size = matrix.length;

  const calculate = (op: OperationType) => {
    try {
      switch (op) {
        case "det": {
          if (!isSquare) {
            toast.error("行列式仅适用于方阵");
            return;
          }
          const res = determinant(matrix);
          setResult({
            type: "det",
            title: "行列式 det(A)",
            content: (
              <ScalarResult
                label="det(A) ="
                value={res.det}
                fractionMode={fractionMode}
              />
            ),
            steps: res.steps,
          });
          break;
        }
        case "inv": {
          if (!isSquare) {
            toast.error("逆矩阵仅适用于方阵");
            return;
          }
          const res = inverse(matrix);
          if (!res.inverse) {
            setResult({
              type: "inv",
              title: "逆矩阵 A⁻¹",
              content: (
                <div className="text-destructive text-sm py-4">
                  该矩阵不可逆（奇异矩阵），行列式为 0
                </div>
              ),
              steps: res.steps,
              hasAugmentedSteps: true,
            });
          } else {
            setResult({
              type: "inv",
              title: "逆矩阵 A⁻¹",
              content: (
                <MatrixDisplay
                  matrix={res.inverse}
                  fractionMode={fractionMode}
                />
              ),
              steps: res.steps,
              hasAugmentedSteps: true,
            });
          }
          break;
        }
        case "rank": {
          const r = rank(matrix);
          setResult({
            type: "rank",
            title: "矩阵的秩 rank(A)",
            content: (
              <ScalarResult
                label="rank(A) ="
                value={r.toString()}
                fractionMode={fractionMode}
              />
            ),
          });
          break;
        }
        case "transpose": {
          const t = transpose(matrix);
          setResult({
            type: "transpose",
            title: "转置 Aᵀ",
            content: (
              <MatrixDisplay matrix={t} fractionMode={fractionMode} />
            ),
          });
          break;
        }
        case "rref": {
          const res = rref(matrix);
          setResult({
            type: "rref",
            title: "行最简形 RREF(A)",
            content: (
              <div className="space-y-3">
                <MatrixDisplay
                  matrix={res.rref}
                  fractionMode={fractionMode}
                />
                <div className="text-sm text-muted-foreground">
                  秩：{res.rank} ，主元列：
                  {res.pivotCols.map((c) => `第${c + 1}列`).join("、")}
                </div>
              </div>
            ),
            steps: res.steps,
          });
          break;
        }
        case "eigen": {
          if (!isSquare) {
            toast.error("特征值仅适用于方阵");
            return;
          }
          if (size > 5) {
            toast.error("特征值计算最多支持 5 阶矩阵");
            return;
          }
          const res = eigenvalues(matrix);
          setResult({
            type: "eigen",
            title: "特征值与特征向量",
            content: (
              <div className="space-y-4">
                {res.eigenvalues.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      实特征值
                    </div>
                    <div className="space-y-3">
                      {res.eigenvalues.map((ev, i) => (
                        <div
                          key={i}
                          className="flex flex-col gap-2 p-3 bg-muted/30 rounded-md"
                        >
                          <div className="text-sm font-mono">
                            λ<sub>{i + 1}</sub> ={" "}
                            {ev.toFixed(6).replace(/\.?0+$/, "")}
                          </div>
                          {res.eigenvectors[i] && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                特征向量:
                              </span>
                              <div className="text-xs font-mono">
                                [
                                {res.eigenvectors[i]
                                  .map(
                                    (v) =>
                                      v.toFixed(4).replace(/\.?0+$/, "") || "0"
                                  )
                                  .join(", ")}
                                ]
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {res.complexEigenvalues && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      复特征值
                    </div>
                    {res.complexEigenvalues.map((ev, i) => (
                      <div key={i} className="text-sm font-mono p-3 bg-muted/30 rounded-md">
                        λ<sub>{i + 1}</sub> ={" "}
                        {ev.real.toFixed(6).replace(/\.?0+$/, "")}
                        {ev.imag >= 0 ? " + " : " − "}
                        {Math.abs(ev.imag).toFixed(6).replace(/\.?0+$/, "")}i
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  注：特征值与特征向量采用数值方法近似计算，结果可能存在微小误差
                </div>
              </div>
            ),
          });
          break;
        }
        case "trace": {
          if (!isSquare) {
            toast.error("迹仅适用于方阵");
            return;
          }
          const t = trace(matrix);
          setResult({
            type: "trace",
            title: "矩阵的迹 tr(A)",
            content: (
              <ScalarResult
                label="tr(A) ="
                value={t}
                fractionMode={fractionMode}
              />
            ),
          });
          break;
        }
        case "power": {
          setPowerDialogOpen(true);
          break;
        }
      }
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handlePower = () => {
    const n = parseInt(powerValue);
    if (isNaN(n)) {
      toast.error("请输入有效的整数指数");
      return;
    }
    if (!isSquare) {
      toast.error("矩阵幂仅适用于方阵");
      setPowerDialogOpen(false);
      return;
    }
    try {
      const res = matrixPower(matrix, n);
      setResult({
        type: "power",
        title: `矩阵幂 A^${n}`,
        content: <MatrixDisplay matrix={res} fractionMode={fractionMode} />,
      });
    } catch (e) {
      toast.error(String(e));
    }
    setPowerDialogOpen(false);
  };

  const fillExample = () => {
    setMatrix(EXAMPLE_MATRIX);
    setResult(null);
    toast.success("已加载示例矩阵");
  };

  const clearAll = () => {
    const m = toFMatrix([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    setMatrix(m);
    setResult(null);
  };

  const operations: {
    type: OperationType;
    label: string;
    icon: React.ReactNode;
    needSquare?: boolean;
  }[] = [
    { type: "det", label: "行列式 det", icon: <Hash className="size-4" />, needSquare: true },
    { type: "inv", label: "逆矩阵", icon: <ArrowRightLeft className="size-4" />, needSquare: true },
    { type: "rank", label: "秩 rank", icon: <Layers className="size-4" /> },
    { type: "transpose", label: "转置 Aᵀ", icon: <Grid3X3 className="size-4" /> },
    { type: "rref", label: "行最简形 RREF", icon: <Table2 className="size-4" /> },
    { type: "eigen", label: "特征值/向量", icon: <Sparkles className="size-4" />, needSquare: true },
    { type: "trace", label: "迹 tr", icon: <Zap className="size-4" />, needSquare: true },
    { type: "power", label: "幂 Aⁿ", icon: <Calculator className="size-4" />, needSquare: true },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* 左侧：输入区 */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">矩阵输入</CardTitle>
                <div className="flex gap-1 items-center">
                  <OCRUploadButton
                    mode="matrix"
                    onResult={(res) => {
                      const { matrix, failedCells } = safeOcrResultToFMatrix(res);
                      setMatrix(matrix);
                      setResult(null);
                      if (failedCells.length > 0) {
                        toast.warning(
                          `有 ${failedCells.length} 个单元格识别失败，已置为 0，请核对`
                        );
                      } else {
                        toast.success("识别成功");
                      }
                    }}
                  />
                  <Button variant="ghost" size="sm" onClick={fillExample}>
                    示例填充
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    清空
                  </Button>
                </div>
              </div>
          </CardHeader>
          <CardContent>
            <MatrixGrid value={matrix} onChange={setMatrix} minRows={1} maxRows={10} minCols={1} maxCols={10} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">单矩阵运算</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {operations.map((op) => (
                <Button
                  key={op.type}
                  variant="secondary"
                  onClick={() => calculate(op.type)}
                  disabled={op.needSquare && !isSquare}
                  className="flex flex-col gap-1 h-auto py-3"
                  title={op.needSquare && !isSquare ? "仅适用于方阵" : op.label}
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
      <div className="space-y-4 min-w-0">
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
          <CardContent className="min-w-0">
            {result ? (
              <div
                ref={resultRef}
                className="min-h-[120px] flex items-start py-2 min-w-0 overflow-hidden"
              >
                {result.content}
              </div>
            ) : (
              <div className="min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                选择运算类型查看结果
              </div>
            )}
          </CardContent>
        </Card>

        {result?.steps && result.steps.length > 0 && (
          <StepsAccordion
            steps={result.steps}
            fractionMode={fractionMode}
            augmentedCol={result.hasAugmentedSteps}
            title="消元过程"
          />
        )}
      </div>

      {/* 幂运算对话框 */}
      <Dialog open={powerDialogOpen} onOpenChange={setPowerDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>矩阵幂 Aⁿ</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="power-n">指数 n</Label>
              <Input
                id="power-n"
                type="number"
                value={powerValue}
                onChange={(e) => setPowerValue(e.target.value)}
                placeholder="请输入整数指数"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              支持正整数（矩阵自乘）和负整数（逆矩阵的幂）
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setPowerDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handlePower}>计算</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
