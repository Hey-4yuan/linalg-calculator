import { useState, useCallback, useRef, useEffect } from "react";
import { Fraction, FMatrix, zeroMatrix, toFMatrix } from "@/lib/fraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, RotateCw, Copy, Grid3X3, Shuffle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface MatrixGridProps {
  value: FMatrix;
  onChange: (m: FMatrix) => void;
  minRows?: number;
  maxRows?: number;
  minCols?: number;
  maxCols?: number;
  label?: string;
  augmentedCol?: boolean; // 是否显示增广列（最后一列用竖线分隔）
  augmentedLabel?: string; // 增广列标签
  variableLabels?: string[]; // 变量名标签（显示在列头）
}

export default function MatrixGrid({
  value,
  onChange,
  minRows = 1,
  maxRows = 10,
  minCols = 1,
  maxCols = 10,
  label,
  augmentedCol = false,
  augmentedLabel = "b",
  variableLabels,
}: MatrixGridProps) {
  const rows = value.length;
  const cols = value[0]?.length ?? 0;

  const addRow = () => {
    if (rows >= maxRows) return;
    const newRow: Fraction[] = [];
    for (let j = 0; j < cols; j++) newRow.push(Fraction.ZERO);
    onChange([...value, newRow]);
  };

  const removeRow = () => {
    if (rows <= minRows) return;
    onChange(value.slice(0, -1));
  };

  const addCol = () => {
    if (cols >= maxCols) return;
    onChange(value.map((row) => [...row, Fraction.ZERO]));
  };

  const removeCol = () => {
    if (cols <= minCols) return;
    onChange(value.map((row) => row.slice(0, -1)));
  };

  const updateCell = (i: number, j: number, str: string) => {
    const f = Fraction.safeParse(str);
    const newMatrix = value.map((row, ri) =>
      row.map((v, ci) => {
        if (ri === i && ci === j) {
          return f ?? v;
        }
        return v;
      })
    );
    onChange(newMatrix);
  };

  const fillZero = () => {
    onChange(zeroMatrix(rows, cols));
  };

  const fillIdentity = () => {
    if (rows !== cols) return;
    const m = zeroMatrix(rows, rows);
    for (let i = 0; i < rows; i++) m[i][i] = Fraction.ONE;
    onChange(m);
  };

  const fillRandom = () => {
    const m: FMatrix = [];
    for (let i = 0; i < rows; i++) {
      const row: Fraction[] = [];
      for (let j = 0; j < cols; j++) {
        const val = Math.floor(Math.random() * 19) - 9;
        row.push(new Fraction(val, 1));
      }
      m.push(row);
    }
    onChange(m);
  };

  const transposeFill = () => {
    const result: FMatrix = [];
    for (let j = 0; j < cols; j++) {
      const row: Fraction[] = [];
      for (let i = 0; i < rows; i++) row.push(value[i][j]);
      result.push(row);
    }
    onChange(result);
  };

  return (
    <div className="flex flex-col gap-3">
      {label && (
        <div className="text-sm font-medium text-muted-foreground">
          {label}
          <span className="ml-2 text-xs font-normal text-muted-foreground/70">
            {rows}×{cols}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={removeRow}
                disabled={rows <= minRows}
              >
                <Minus className="size-3.5" />
                行
              </Button>
            </TooltipTrigger>
            <TooltipContent>减少一行</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={addRow}
                disabled={rows >= maxRows}
              >
                <Plus className="size-3.5" />
                行
              </Button>
            </TooltipTrigger>
            <TooltipContent>增加一行</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={removeCol}
                disabled={cols <= minCols}
              >
                <Minus className="size-3.5" />
                列
              </Button>
            </TooltipTrigger>
            <TooltipContent>减少一列</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={addCol}
                disabled={cols >= maxCols}
              >
                <Plus className="size-3.5" />
                列
              </Button>
            </TooltipTrigger>
            <TooltipContent>增加一列</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-5 w-px bg-border mx-1" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={fillZero}>
                <Grid3X3 className="size-3.5 mr-1" />
                零矩阵
              </Button>
            </TooltipTrigger>
            <TooltipContent>生成零矩阵</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={fillIdentity}
                disabled={rows !== cols}
              >
                <Copy className="size-3.5 mr-1" />
                单位阵
              </Button>
            </TooltipTrigger>
            <TooltipContent>生成单位矩阵（需方阵）</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={fillRandom}>
                <Shuffle className="size-3.5 mr-1" />
                随机
              </Button>
            </TooltipTrigger>
            <TooltipContent>填充随机整数</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={transposeFill}>
                <RotateCw className="size-3.5 mr-1" />
                转置填充
              </Button>
            </TooltipTrigger>
            <TooltipContent>用当前矩阵的转置替换</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block relative">
          {/* 列头变量名 */}
          {variableLabels && (
            <div
              className="flex gap-1 mb-1"
              style={{ paddingLeft: "8px", paddingRight: "8px" }}
            >
              {variableLabels.map((lbl, j) => (
                <div
                  key={j}
                  className="text-xs text-muted-foreground text-center"
                  style={{ width: "64px" }}
                >
                  {lbl}
                </div>
              ))}
              {augmentedCol && (
                <div
                  className="text-xs text-muted-foreground text-center pl-3"
                  style={{ width: "64px" }}
                >
                  {augmentedLabel}
                </div>
              )}
            </div>
          )}

          {/* 矩阵左括号 */}
          <div className="absolute left-0 top-0 bottom-0 w-2 border-l-2 border-y-2 border-primary/30 rounded-l-lg" />
          {/* 矩阵右括号 */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 border-r-2 border-y-2 border-primary/30 rounded-r-lg"
            style={{ display: augmentedCol ? "block" : "block" }}
          />

          <div
            className="flex flex-col gap-1 py-1 px-3"
            style={{ position: "relative" }}
          >
            {value.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-1"
                style={{ position: "relative" }}
              >
                {row.map((cell, j) => {
                  const isAugCol = augmentedCol && j === row.length - 1;
                  return (
                    <div
                      key={j}
                      className="relative"
                      style={
                        isAugCol
                          ? {
                              borderLeft: "2px solid hsl(var(--primary) / 0.3)",
                              paddingLeft: "8px",
                              marginLeft: "4px",
                            }
                          : undefined
                      }
                    >
                      <MatrixCell
                        value={cell}
                        onChange={(s) => updateCell(i, j, s)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 单元格组件：支持分数/小数输入，非法时红框
function MatrixCell({
  value,
  onChange,
}: {
  value: Fraction;
  onChange: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    if (!editing) {
      // 展示模式：用分数形式
      setText(value.toFractionString());
      setIsInvalid(false);
    }
  }, [value, editing]);

  const startEdit = useCallback(() => {
    setText(value.toFractionString());
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  const finishEdit = useCallback(() => {
    const f = Fraction.safeParse(text);
    if (f) {
      onChange(text);
      setIsInvalid(false);
      setEditing(false);
    } else {
      setIsInvalid(true);
    }
  }, [text, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finishEdit();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setEditing(false);
      setIsInvalid(false);
    }
  };

  if (!editing) {
    return (
      <div
        onClick={startEdit}
        className="w-16 h-9 flex items-center justify-center text-sm cursor-text hover:bg-muted/50 rounded border border-transparent font-mono select-none"
        title="点击编辑"
      >
        {value.toFractionString()}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setIsInvalid(false);
      }}
      onBlur={finishEdit}
      onKeyDown={handleKeyDown}
      autoFocus
      className={`w-16 h-9 text-center text-sm font-mono p-0 ${
        isInvalid ? "border-destructive focus-visible:ring-destructive" : ""
      }`}
    />
  );
}

// 导出 toFMatrix 方便外部使用
export { toFMatrix };
