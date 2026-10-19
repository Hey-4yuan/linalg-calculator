import { useState, useRef } from "react";
import MatrixGrid from "@/components/MatrixGrid";
import MatrixDisplay, { ScalarResult } from "@/components/MatrixDisplay";
import StepsAccordion from "@/components/StepsAccordion";
import CopyButton from "@/components/CopyButton";
import { extractCopyText } from "@/lib/copy-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FMatrix, toFMatrix, Fraction } from "@/lib/fraction";
import {
  solveLinearSystem,
  EXAMPLE_LINEAR_SYSTEM,
} from "@/lib/matrix-ops";
import { AlertCircle, CheckCircle2, Infinity as InfinityIcon, Lightbulb } from "lucide-react";
import OCRUploadButton, { safeOcrResultToFMatrix } from "@/components/OCRUploadButton";

interface LinearSystemSectionProps {
  fractionMode: boolean;
}

export default function LinearSystemSection({
  fractionMode,
}: LinearSystemSectionProps) {
  // 增广矩阵：系数部分 + 常数项（最后一列）
  const [augmented, setAugmented] = useState<FMatrix>(EXAMPLE_LINEAR_SYSTEM);
  const [result, setResult] = useState<ReturnType<
    typeof solveLinearSystem
  > | null>(null);
  // 结果容器：复制按钮从这里按 data-copy-* 标记还原纯文本
  const resultRef = useRef<HTMLDivElement>(null);

  const rows = augmented.length;
  const totalCols = augmented[0].length;
  const nVars = totalCols - 1;

  // 生成变量名
  const variableLabels = Array.from({ length: nVars }, (_, i) => `x${i + 1}`);
  const allLabels = [...variableLabels, "b"];

  const solve = () => {
    try {
      const res = solveLinearSystem(augmented);
      setResult(res);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const fillExample = () => {
    setAugmented(EXAMPLE_LINEAR_SYSTEM);
    setResult(null);
    toast.success("已加载示例方程组");
  };

  const fillUniqueExample = () => {
    setAugmented(
      toFMatrix([
        [2, 1, -1, 8],
        [-3, -1, 2, -11],
        [-2, 1, 2, -3],
      ])
    );
    setResult(null);
    toast.success("已加载唯一解示例");
  };

  const fillInfiniteExample = () => {
    setAugmented(
      toFMatrix([
        [1, 2, 3, 1],
        [2, 4, 6, 2],
        [3, 6, 9, 3],
      ])
    );
    setResult(null);
    toast.success("已加载无穷多解示例");
  };

  const fillNoSolutionExample = () => {
    setAugmented(
      toFMatrix([
        [1, 1, 1],
        [2, 2, 3],
      ])
    );
    setResult(null);
    toast.success("已加载无解示例");
  };

  const clearAll = () => {
    const m = toFMatrix([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    setAugmented(m);
    setResult(null);
  };

  // 调整行数（方程数）
  const setRows = (newRows: number) => {
    if (newRows < 1 || newRows > 10) return;
    const currentRows = augmented.length;
    if (newRows > currentRows) {
      const newRow = new Array(totalCols).fill(Fraction.ZERO);
      setAugmented([...augmented, ...new Array(newRows - currentRows).fill(null).map(() => [...newRow])]);
    } else {
      setAugmented(augmented.slice(0, newRows));
    }
  };

  // 调整变量数（列数 = 变量数 + 1 增广列）
  const setVars = (newVars: number) => {
    if (newVars < 1 || newVars > 10) return;
    const newCols = newVars + 1;
    setAugmented(
      augmented.map((row) => {
        const newRow: Fraction[] = [];
        for (let j = 0; j < newCols; j++) {
          newRow.push(row[j] ?? Fraction.ZERO);
        }
        return newRow;
      })
    );
  };

  const renderSolution = () => {
    if (!result) return null;

    if (result.type === "unique") {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-5" />
            <span className="font-medium">唯一解</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {result.variableNames.map((name) => (
              <div
                key={name}
                className="p-3 bg-muted/30 rounded-md text-center"
              >
                <div className="text-xs text-muted-foreground mb-1">
                  {name}
                </div>
                <div className="font-mono text-lg font-semibold">
                  {fractionMode
                    ? result.solution![name].toFractionString()
                    : result.solution![name].toDecimalString()}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            系数矩阵秩 = 增广矩阵秩 = {result.rankA} = 未知数个数 {nVars}
          </div>
        </div>
      );
    }

    if (result.type === "infinite") {
      return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-warning">
            <InfinityIcon className="size-5" />
            <span className="font-medium">无穷多解</span>
          </div>

          <div className="text-sm text-muted-foreground">
            自由变量：{result.freeVariables!.join("、")}（共{" "}
            {result.freeVariables!.length} 个）
          </div>

          {/* 通解形式 */}
          <div className="p-4 bg-muted/20 rounded-lg space-y-3">
            <div className="text-sm font-medium">通解形式：</div>
            <div className="text-sm font-mono">
              x = 特解 +{" "}
              {result.freeVariables!.map((fv, i) => (
                <span key={fv}>
                  {fv}·η<sub>{i + 1}</sub>
                  {i < result.freeVariables!.length - 1 ? " + " : ""}
                </span>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-xs text-muted-foreground">特解（取所有自由变量为 0）:</div>
              <div className="flex flex-wrap gap-2">
                {result.variableNames.map((name) => (
                  <div
                    key={name}
                    className="px-2 py-1 bg-card rounded text-xs font-mono border border-border/50"
                  >
                    {name} ={" "}
                    {fractionMode
                      ? result.particularSolution![name].toFractionString()
                      : result.particularSolution![name].toDecimalString(4)}
                  </div>
                ))}
              </div>
            </div>

            {result.basisVectors!.map((vec, i) => (
              <div key={i} className="mt-2 space-y-1">
                <div className="text-xs text-muted-foreground">
                  基础解系 η<sub>{i + 1}</sub>（{result.freeVariables![i]} = 1 时）:
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.variableNames.map((name) => (
                    <div
                      key={name}
                      className="px-2 py-1 bg-card rounded text-xs font-mono border border-border/50"
                    >
                      {name} ={" "}
                      {fractionMode
                        ? vec[name].toFractionString()
                        : vec[name].toDecimalString(4)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">
            秩(A) = 秩([A|b]) = {result.rankA} {"<"} 未知数个数 {nVars}
          </div>
        </div>
      );
    }

    // no-solution
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-5" />
          <span className="font-medium">无解</span>
        </div>
        <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg text-sm">
          方程组存在矛盾方程，没有解。
          <div className="mt-2 text-xs text-muted-foreground">
            系数矩阵秩 = {result.rankA}，增广矩阵秩 = {result.rankAb}
            ，秩不相等故无解。
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* 左侧：输入区 */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">增广矩阵 [A|b]</CardTitle>
              <div className="flex gap-1 items-center">
                <OCRUploadButton
                  mode="system"
                  onResult={(res) => {
                    const { matrix, failedCells } = safeOcrResultToFMatrix(res);
                    setAugmented(matrix);
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
                  示例
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  清空
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">方程数:</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setRows(rows - 1)}
                    disabled={rows <= 1}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center font-mono">{rows}</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setRows(rows + 1)}
                    disabled={rows >= 10}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">未知数:</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setVars(nVars - 1)}
                    disabled={nVars <= 1}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center font-mono">{nVars}</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setVars(nVars + 1)}
                    disabled={nVars >= 10}
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <MatrixGrid
                value={augmented}
                onChange={setAugmented}
                minRows={1}
                maxRows={10}
                minCols={2}
                maxCols={11}
                augmentedCol
                augmentedLabel="b"
                variableLabels={allLabels}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">典型示例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fillUniqueExample}
                className="justify-start"
              >
                <CheckCircle2 className="size-3.5 mr-1.5 text-success" />
                唯一解
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fillInfiniteExample}
                className="justify-start"
              >
                <InfinityIcon className="size-3.5 mr-1.5 text-warning" />
                无穷多解
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fillNoSolutionExample}
                className="justify-start"
              >
                <AlertCircle className="size-3.5 mr-1.5 text-destructive" />
                无解
              </Button>
              <Button onClick={solve} className="justify-start">
                <Lightbulb className="size-3.5 mr-1.5" />
                求解
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 右侧：结果区 */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">求解结果</CardTitle>
              {result && (
                <CopyButton getText={() => extractCopyText(resultRef.current)} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {result ? (
              <div ref={resultRef} className="min-h-[120px]">
                {renderSolution()}
              </div>
            ) : (
              <div className="min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                点击「求解」查看结果
              </div>
            )}
          </CardContent>
        </Card>

        {result && result.steps.length > 0 && (
          <StepsAccordion
            steps={result.steps}
            fractionMode={fractionMode}
            title="高斯消元过程"
            augmentedCol
          />
        )}
      </div>
    </div>
  );
}
