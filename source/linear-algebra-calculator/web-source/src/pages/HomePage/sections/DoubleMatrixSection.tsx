import { useState, useRef } from "react";
import MatrixGrid from "@/components/MatrixGrid";
import MatrixDisplay from "@/components/MatrixDisplay";
import CopyButton from "@/components/CopyButton";
import { extractCopyText } from "@/lib/copy-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FMatrix, toFMatrix } from "@/lib/fraction";
import { add, subtract, multiply } from "@/lib/matrix-ops";
import { Plus, Minus, X } from "lucide-react";
import OCRUploadButton, { safeOcrResultToFMatrix } from "@/components/OCRUploadButton";

interface DoubleMatrixSectionProps {
  fractionMode: boolean;
}

type OperationType = "add" | "subtract" | "multiply";

export default function DoubleMatrixSection({
  fractionMode,
}: DoubleMatrixSectionProps) {
  const [matA, setMatA] = useState<FMatrix>(
    toFMatrix([
      [1, 2, 3],
      [4, 5, 6],
    ])
  );
  const [matB, setMatB] = useState<FMatrix>(
    toFMatrix([
      [7, 8],
      [9, 10],
      [11, 12],
    ])
  );
  const [result, setResult] = useState<{
    type: OperationType;
    title: string;
    matrix: FMatrix;
    description: string;
  } | null>(null);
  // 结果容器：复制按钮从这里按 data-copy-* 标记还原纯文本
  const resultRef = useRef<HTMLDivElement>(null);

  const rowsA = matA.length;
  const colsA = matA[0].length;
  const rowsB = matB.length;
  const colsB = matB[0].length;

  const canAdd = rowsA === rowsB && colsA === colsB;
  const canMultiply = colsA === rowsB;

  const calculate = (op: OperationType) => {
    try {
      switch (op) {
        case "add": {
          if (!canAdd) {
            toast.error(
              `矩阵加法要求同型矩阵。A 为 ${rowsA}×${colsA}，B 为 ${rowsB}×${colsB}`
            );
            return;
          }
          const res = add(matA, matB);
          setResult({
            type: "add",
            title: "A + B",
            matrix: res,
            description: `${rowsA}×${colsA} + ${rowsB}×${colsB} = ${res.length}×${res[0].length}`,
          });
          break;
        }
        case "subtract": {
          if (!canAdd) {
            toast.error(
              `矩阵减法要求同型矩阵。A 为 ${rowsA}×${colsA}，B 为 ${rowsB}×${colsB}`
            );
            return;
          }
          const res = subtract(matA, matB);
          setResult({
            type: "subtract",
            title: "A − B",
            matrix: res,
            description: `${rowsA}×${colsA} − ${rowsB}×${colsB} = ${res.length}×${res[0].length}`,
          });
          break;
        }
        case "multiply": {
          if (!canMultiply) {
            toast.error(
              `矩阵乘法要求 A 的列数等于 B 的行数。A 为 ${rowsA}×${colsA}，B 为 ${rowsB}×${colsB}`
            );
            return;
          }
          const res = multiply(matA, matB);
          setResult({
            type: "multiply",
            title: "A × B",
            matrix: res,
            description: `${rowsA}×${colsA} × ${rowsB}×${colsB} = ${res.length}×${res[0].length}`,
          });
          break;
        }
      }
    } catch (e) {
      toast.error(String(e));
    }
  };

  const fillExample = () => {
    setMatA(
      toFMatrix([
        [1, 2, 3],
        [4, 5, 6],
      ])
    );
    setMatB(
      toFMatrix([
        [7, 8],
        [9, 10],
        [11, 12],
      ])
    );
    setResult(null);
    toast.success("已加载示例矩阵");
  };

  const clearAll = () => {
    setMatA(
      toFMatrix([
        [0, 0],
        [0, 0],
      ])
    );
    setMatB(
      toFMatrix([
        [0, 0],
        [0, 0],
      ])
    );
    setResult(null);
  };

  return (
    <div className="space-y-6">
      {/* 输入区：两个矩阵并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">矩阵 A</CardTitle>
              <div className="flex items-center gap-2">
                <OCRUploadButton
                  mode="matrix"
                  size="icon"
                  label="识别到A"
                  onResult={(res) => {
                    const { matrix, failedCells } = safeOcrResultToFMatrix(res);
                    setMatA(matrix);
                    setResult(null);
                    if (failedCells.length > 0) {
                      toast.warning(
                        `有 ${failedCells.length} 个单元格识别失败，已置为 0，请核对`
                      );
                    } else {
                      toast.success("已识别到矩阵 A");
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {rowsA}×{colsA}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MatrixGrid
              value={matA}
              onChange={setMatA}
              minRows={1}
              maxRows={10}
              minCols={1}
              maxCols={10}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">矩阵 B</CardTitle>
              <div className="flex items-center gap-2">
                <OCRUploadButton
                  mode="matrix"
                  size="icon"
                  label="识别到B"
                  onResult={(res) => {
                    const { matrix, failedCells } = safeOcrResultToFMatrix(res);
                    setMatB(matrix);
                    setResult(null);
                    if (failedCells.length > 0) {
                      toast.warning(
                        `有 ${failedCells.length} 个单元格识别失败，已置为 0，请核对`
                      );
                    } else {
                      toast.success("已识别到矩阵 B");
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {rowsB}×{colsB}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MatrixGrid
              value={matB}
              onChange={setMatB}
              minRows={1}
              maxRows={10}
              minCols={1}
              maxCols={10}
            />
          </CardContent>
        </Card>
      </div>

      {/* 运算按钮 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">双矩阵运算</CardTitle>
            <div className="flex gap-2">
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
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => calculate("add")}
              variant={!canAdd ? "secondary" : "default"}
              className="flex items-center gap-2"
            >
              <Plus className="size-4" />
              A + B
            </Button>
            <Button
              onClick={() => calculate("subtract")}
              variant={!canAdd ? "secondary" : "default"}
              className="flex items-center gap-2"
            >
              <Minus className="size-4" />
              A − B
            </Button>
            <Button
              onClick={() => calculate("multiply")}
              variant={!canMultiply ? "secondary" : "default"}
              className="flex items-center gap-2"
            >
              <X className="size-4" />
              A × B
            </Button>

            <div className="flex-1" />

            <div className="text-xs text-muted-foreground flex items-center">
              加减需同型矩阵 · 乘法需 A列 = B行
            </div>
          </div>

          {/* 维度匹配提示 */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs">
            <div
              className={`px-3 py-1.5 rounded-md ${
                canAdd
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              加减法：{canAdd ? "✓ 维度匹配" : "✗ 维度不匹配"}
            </div>
            <div
              className={`px-3 py-1.5 rounded-md ${
                canMultiply
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              乘法：{canMultiply ? "✓ 维度匹配" : "✗ 维度不匹配"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 结果区 */}
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
            <div ref={resultRef} className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {result.description}
              </div>
              <MatrixDisplay
                matrix={result.matrix}
                fractionMode={fractionMode}
                size="md"
              />
            </div>
          ) : (
            <div className="min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
              选择运算类型查看结果
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
