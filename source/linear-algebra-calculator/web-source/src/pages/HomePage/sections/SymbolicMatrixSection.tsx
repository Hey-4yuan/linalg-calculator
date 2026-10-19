import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/CopyButton";
import { extractCopyText } from "@/lib/copy-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  Hash,
  ArrowRightLeft,
  Table2,
  Layers,
  Zap,
  Grid3X3,
  FunctionSquare,
} from "lucide-react";
import OCRUploadButton from "@/components/OCRUploadButton";
import type { OCRMatrixResult } from "@/lib/ocr-service";
import SymbolicMatrixDisplay, {
  SymbolicScalarResult,
} from "@/components/SymbolicMatrixDisplay";
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
  zeroSMatrix,
  identitySMatrix,
  cloneSMatrix,
  Num,
  Var,
  Pi,
  exprToString,
} from "@/lib/symbolic";

type SymbolicOpType =
  | "det"
  | "inv"
  | "rank"
  | "transpose"
  | "rref"
  | "trace";

export default function SymbolicMatrixSection() {
  const [matrix, setMatrix] = useState<SMatrix>(() => {
    const m = zeroSMatrix(3, 3);
    m[0][0] = Var("a"); m[0][1] = Var("b"); m[0][2] = Var("c");
    m[1][0] = Var("d"); m[1][1] = Var("e"); m[1][2] = Var("f");
    m[2][0] = Var("g"); m[2][1] = Var("h"); m[2][2] = Var("i");
    return m;
  });

  const [result, setResult] = useState<{
    type: SymbolicOpType;
    title: string;
    content: React.ReactNode;
  } | null>(null);
  // 结果容器：复制按钮从这里按 data-copy-* 标记还原纯文本
  const resultRef = useRef<HTMLDivElement>(null);

  const rows = matrix.length;
  const cols = matrix[0].length;
  const isSquare = rows === cols;

  // 处理符号矩阵 OCR 结果
  const handleSymbolicOCRResult = (result: OCRMatrixResult) => {
    const newRows = result.rows;
    const newCols = result.cols;
    const newMatrix: Expr[][] = [];
    let failedCount = 0;

    for (let i = 0; i < newRows; i++) {
      const row: Expr[] = [];
      for (let j = 0; j < newCols; j++) {
        const str = result.data[i]?.[j] ?? "0";
        const e = safeParseExpr(str);
        if (e) {
          row.push(e);
        } else {
          row.push(Num(0));
          failedCount++;
        }
      }
      newMatrix.push(row);
    }

    setMatrix(newMatrix);
    setResult(null);

    if (failedCount > 0) {
      toast.warning(
        `有 ${failedCount} 个符号识别失败，已置为 0，请核对`
      );
    } else {
      toast.success(`识别成功：${newRows}×${newCols} 符号矩阵`);
    }
  };

  const addRow = () => {
    if (rows >= 6) return;
    const newRow: Expr[] = [];
    for (let j = 0; j < cols; j++) newRow.push(Num(0));
    setMatrix([...matrix, newRow]);
    setResult(null);
  };

  const removeRow = () => {
    if (rows <= 2) return;
    setMatrix(matrix.slice(0, -1));
    setResult(null);
  };

  const addCol = () => {
    if (cols >= 6) return;
    setMatrix(matrix.map((row) => [...row, Num(0)]));
    setResult(null);
  };

  const removeCol = () => {
    if (cols <= 2) return;
    setMatrix(matrix.map((row) => row.slice(0, -1)));
    setResult(null);
  };

  const updateCell = (i: number, j: number, str: string) => {
    const e = safeParseExpr(str);
    if (!e) return;
    const newMatrix = matrix.map((row, ri) =>
      row.map((v, ci) => (ri === i && ci === j ? e : v))
    );
    setMatrix(newMatrix);
    setResult(null);
  };

  const fillZero = () => {
    setMatrix(zeroSMatrix(rows, cols));
    setResult(null);
  };

  const fillIdentity = () => {
    if (rows !== cols) return;
    setMatrix(identitySMatrix(rows));
    setResult(null);
  };

  const fillExample = () => {
    const m = zeroSMatrix(3, 3);
    m[0][0] = Var("a"); m[0][1] = Var("b"); m[0][2] = Var("c");
    m[1][0] = Var("d"); m[1][1] = Var("e"); m[1][2] = Var("f");
    m[2][0] = Var("g"); m[2][1] = Var("h"); m[2][2] = Var("i");
    setMatrix(m);
    setResult(null);
    toast.success("已加载符号矩阵示例");
  };

  const calculate = (op: SymbolicOpType) => {
    try {
      switch (op) {
        case "det": {
          if (!isSquare) {
            toast.error("行列式仅适用于方阵");
            return;
          }
          if (rows > 3) {
            toast.error("符号行列式最多支持 3 阶矩阵");
            return;
          }
          const det = sDeterminant(matrix);
          setResult({
            type: "det",
            title: "行列式 det(A)",
            content: <SymbolicScalarResult label="det(A) =" value={det} />,
          });
          break;
        }
        case "inv": {
          if (!isSquare) {
            toast.error("逆矩阵仅适用于方阵");
            return;
          }
          if (rows > 3) {
            toast.error("符号逆矩阵最多支持 3 阶矩阵");
            return;
          }
          const inv = sInverse(matrix);
          if (!inv) {
            setResult({
              type: "inv",
              title: "逆矩阵 A⁻¹",
              content: (
                <div className="text-destructive text-sm py-4">
                  该矩阵不可逆（奇异矩阵）
                </div>
              ),
            });
          } else {
            setResult({
              type: "inv",
              title: "逆矩阵 A⁻¹",
              content: <SymbolicMatrixDisplay matrix={inv} />,
            });
          }
          break;
        }
        case "rank": {
          const r = sRank(matrix);
          setResult({
            type: "rank",
            title: "矩阵的秩 rank(A)",
            content: (
              <SymbolicScalarResult label="rank(A) =" value={Num(r)} />
            ),
          });
          break;
        }
        case "transpose": {
          const t = sTranspose(matrix);
          setResult({
            type: "transpose",
            title: "转置 Aᵀ",
            content: <SymbolicMatrixDisplay matrix={t} />,
          });
          break;
        }
        case "rref": {
          if (rows > 4 || cols > 4) {
            toast.error("符号行最简形最多支持 4×4 矩阵");
            return;
          }
          const res = sRref(matrix);
          setResult({
            type: "rref",
            title: "行最简形 RREF(A)",
            content: (
              <div className="space-y-3">
                <SymbolicMatrixDisplay matrix={res.rref} />
                <div className="text-sm text-muted-foreground">
                  秩：{res.rank} ，主元列：
                  {res.pivotCols.map((c) => `第${c + 1}列`).join("、")}
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
          const t = sTrace(matrix);
          setResult({
            type: "trace",
            title: "矩阵的迹 tr(A)",
            content: <SymbolicScalarResult label="tr(A) =" value={t} />,
          });
          break;
        }
      }
    } catch (e) {
      toast.error(String(e));
    }
  };

  const operations: {
    type: SymbolicOpType;
    label: string;
    icon: React.ReactNode;
    needSquare?: boolean;
  }[] = [
    { type: "det", label: "行列式 det", icon: <Hash className="size-4" />, needSquare: true },
    { type: "inv", label: "逆矩阵", icon: <ArrowRightLeft className="size-4" />, needSquare: true },
    { type: "rank", label: "秩 rank", icon: <Layers className="size-4" /> },
    { type: "transpose", label: "转置 Aᵀ", icon: <Grid3X3 className="size-4" /> },
    { type: "rref", label: "行最简形 RREF", icon: <Table2 className="size-4" /> },
    { type: "trace", label: "迹 tr", icon: <Zap className="size-4" />, needSquare: true },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* 左侧：输入区 */}
      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
               <CardTitle className="text-base flex items-center gap-2">
                 <FunctionSquare className="size-4 text-primary" />
                 符号矩阵输入
               </CardTitle>
               <div className="flex items-center gap-2">
                 <OCRUploadButton
                   mode="symbolic"
                   size="sm"
                   variant="ghost"
                   label="符号识别"
                   onResult={handleSymbolicOCRResult}
                 />
                 <Button variant="ghost" size="sm" onClick={fillExample}>
                   示例
                 </Button>
                 <Button variant="ghost" size="sm" onClick={fillZero}>
                   清零
                 </Button>
               </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 min-w-0">
            {/* 行列调整 */}
            <div className="flex items-center gap-3 flex-wrap">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm" onClick={removeRow} disabled={rows <= 2}>
                      <Minus className="size-3.5" /> 行
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>减少一行</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm" onClick={addRow} disabled={rows >= 6}>
                      <Plus className="size-3.5" /> 行
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>增加一行（最多 6 行）</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm" onClick={removeCol} disabled={cols <= 2}>
                      <Minus className="size-3.5" /> 列
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>减少一列</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm" onClick={addCol} disabled={cols >= 6}>
                      <Plus className="size-3.5" /> 列
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>增加一列（最多 6 列）</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-5 w-px bg-border mx-1" />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={fillIdentity} disabled={!isSquare}>
                      单位阵
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>生成单位矩阵（需方阵）</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <span className="text-xs text-muted-foreground ml-auto">
                {rows}×{cols} · 支持字母、π、+ − × ÷ 运算
              </span>
            </div>

            {/* 符号矩阵输入网格 */}
            <div className="w-full overflow-x-auto">
              <div className="inline-block relative min-w-0">
                <div className="absolute left-0 top-0 bottom-0 w-2 border-l-2 border-y-2 border-primary/30 rounded-l-lg" />
                <div className="absolute right-0 top-0 bottom-0 w-2 border-r-2 border-y-2 border-primary/30 rounded-r-lg" />
                <div className="flex flex-col gap-1 py-1 px-3">
                  {matrix.map((row, i) => (
                    <div key={i} className="flex items-center gap-1">
                      {row.map((cell, j) => (
                        <SymbolicCell
                          key={j}
                          value={cell}
                          onChange={(s) => updateCell(i, j, s)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
              <strong>输入提示：</strong>支持整数、小数、分数(3/4)、字母(a,b,x₁)、π、以及 + − * / ^ 运算。例如：
              <code className="mx-1 px-1 bg-background rounded">2*a+3</code>
              <code className="mx-1 px-1 bg-background rounded">pi*r^2</code>
              <code className="mx-1 px-1 bg-background rounded">a/b + c</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">符号运算</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {operations.map((op) => (
                <Button
                  key={op.type}
                  variant="secondary"
                  onClick={() => calculate(op.type)}
                  disabled={op.needSquare && !isSquare}
                  className="flex flex-col gap-1 h-auto py-3"
                >
                  {op.icon}
                  <span className="text-xs">{op.label}</span>
                </Button>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              注：符号运算基于代数化简，阶数越高表达式可能越复杂。
              行列式/逆矩阵最多支持 3 阶，RREF 最多支持 4×4。
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
                {result ? result.title : "符号计算结果"}
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
                className="min-h-[120px] flex items-start py-2 overflow-hidden w-full"
              >
                {result.content}
              </div>
            ) : (
              <div className="min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                选择运算类型查看符号结果
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SymbolicCell({
  value,
  onChange,
}: {
  value: Expr;
  onChange: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = { current: null as HTMLInputElement | null };

  const startEdit = () => {
    setText(exprToString(value));
    setEditing(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
  };

  const finishEdit = () => {
    const e = safeParseExpr(text);
    if (e) {
      onChange(text);
      setEditing(false);
    }
  };

  const isValid = safeParseExpr(text) !== null;

  if (!editing) {
    return (
      <div
        onClick={startEdit}
        className="w-16 h-9 flex items-center justify-center text-sm cursor-text hover:bg-muted/50 rounded border border-transparent font-mono select-none text-center px-1"
        title="点击编辑"
      >
        <span className="truncate w-full text-center">
          {exprToString(value)}
        </span>
      </div>
    );
  }

  return (
    <Input
      ref={(el) => { inputRef.current = el; }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={finishEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finishEdit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      autoFocus
      className={`w-16 h-9 text-center text-xs font-mono p-0 ${
        !isValid && text.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""
      }`}
    />
  );
}
