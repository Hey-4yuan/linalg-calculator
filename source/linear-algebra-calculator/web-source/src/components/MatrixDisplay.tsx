import { FMatrix, Fraction } from "@/lib/fraction";

interface MatrixDisplayProps {
  matrix: FMatrix;
  fractionMode?: boolean;
  precision?: number;
  augmentedCol?: boolean; // 最后一列是否为增广列（用竖线分隔）
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function MatrixDisplay({
  matrix,
  fractionMode = false,
  precision = 6,
  augmentedCol = false,
  size = "md",
  className = "",
}: MatrixDisplayProps) {
  const rows = matrix.length;
  if (rows === 0) return null;
  const cols = matrix[0].length;

  const sizeClasses = {
    sm: "text-xs py-1 px-2 min-w-[36px]",
    md: "text-sm py-1.5 px-2.5 min-w-[48px]",
    lg: "text-base py-2 px-3 min-w-[56px]",
  };

  const cellClass = sizeClasses[size];

  // 计算每列最大宽度（用于对齐）—— 由于用 monospace 字体，简单对齐即可
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <div className="inline-block relative min-w-0">
        {/* 左大括号 */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 border-l-2 border-y-2 border-foreground/40 rounded-l-md" />
        {/* 右大括号 */}
        <div className="absolute right-0 top-0 bottom-0 w-1.5 border-r-2 border-y-2 border-foreground/40 rounded-r-md" />

        <div className="flex flex-col gap-0.5 py-1 px-4">
          {matrix.map((row, i) => (
            <div key={i} className="flex items-center gap-0" data-copy-row="">
              {row.map((cell, j) => {
                const isLastCol = j === cols - 1;
                const isAug = augmentedCol && isLastCol;
                return (
                  <div
                    key={j}
                    data-copy-cell=""
                    className={`font-mono text-center whitespace-nowrap ${cellClass} ${
                      isAug ? "border-l border-foreground/30 ml-1" : ""
                    }`}
                  >
                    {fractionMode
                      ? cell.toFractionString()
                      : cell.toDecimalString(precision)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 向量展示（列向量）
interface VectorDisplayProps {
  vector: Fraction[];
  fractionMode?: boolean;
  precision?: number;
  label?: string;
  size?: "sm" | "md" | "lg";
}

export function VectorDisplay({
  vector,
  fractionMode = false,
  precision = 6,
  label,
  size = "md",
}: VectorDisplayProps) {
  const mat: FMatrix = vector.map((v) => [v]);
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <MatrixDisplay
        matrix={mat}
        fractionMode={fractionMode}
        precision={precision}
        size={size}
      />
    </div>
  );
}

// 行列式展示（用竖线包围）
interface DetDisplayProps {
  matrix: FMatrix;
  fractionMode?: boolean;
  precision?: number;
  size?: "sm" | "md" | "lg";
}

export function DetDisplay({
  matrix,
  fractionMode = false,
  precision = 6,
  size = "md",
}: DetDisplayProps) {
  const sizeClasses = {
    sm: "text-xs py-1 px-2 min-w-[36px]",
    md: "text-sm py-1.5 px-2.5 min-w-[48px]",
    lg: "text-base py-2 px-3 min-w-[56px]",
  };

  const cellClass = sizeClasses[size];

  return (
    <div className="inline-block relative">
      <div className="absolute left-0 top-0 bottom-0 w-px bg-foreground/50" />
      <div className="absolute right-0 top-0 bottom-0 w-px bg-foreground/50" />

      <div className="flex flex-col gap-0.5 py-1 px-3">
        {matrix.map((row, i) => (
          <div key={i} className="flex items-center gap-0" data-copy-row="">
            {row.map((cell, j) => (
              <div
                key={j}
                data-copy-cell=""
                className={`font-mono text-center ${cellClass}`}
              >
                {fractionMode
                  ? cell.toFractionString()
                  : cell.toDecimalString(precision)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 标量结果展示
interface ScalarResultProps {
  label: string;
  value: Fraction | number | string;
  fractionMode?: boolean;
  precision?: number;
  unit?: string;
}

export function ScalarResult({
  label,
  value,
  fractionMode = false,
  precision = 6,
  unit,
}: ScalarResultProps) {
  let display: string;
  if (value instanceof Fraction) {
    display = fractionMode
      ? value.toFractionString()
      : value.toDecimalString(precision);
  } else {
    display = String(value);
  }

  return (
    <div className="flex items-baseline gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        data-copy-value=""
        className="text-lg font-semibold font-mono text-foreground"
      >
        {display}
        {unit && (
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}
