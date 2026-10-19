import { type Expr, exprToString } from "@/lib/symbolic";

interface SymbolicMatrixDisplayProps {
  matrix: Expr[][];
  augmentedCol?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function SymbolicMatrixDisplay({
  matrix,
  augmentedCol = false,
  size = "md",
  className = "",
}: SymbolicMatrixDisplayProps) {
  const rows = matrix.length;
  if (rows === 0) return null;
  const cols = matrix[0].length;

  const sizeClasses = {
    sm: "text-xs py-1 px-2 min-w-[40px]",
    md: "text-sm py-1.5 px-2.5 min-w-[52px]",
    lg: "text-base py-2 px-3 min-w-[64px]",
  };

  const cellClass = sizeClasses[size];

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
                    {exprToString(cell)}
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

// 标量结果展示
interface SymbolicScalarResultProps {
  label: string;
  value: Expr;
}

export function SymbolicScalarResult({
  label,
  value,
}: SymbolicScalarResultProps) {
  return (
    <div className="flex items-baseline gap-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        data-copy-value=""
        className="text-2xl font-mono font-semibold text-foreground"
      >
        {exprToString(value)}
      </span>
    </div>
  );
}
