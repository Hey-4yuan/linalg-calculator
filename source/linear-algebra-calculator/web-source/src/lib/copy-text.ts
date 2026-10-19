/**
 * 结果 → 纯文本。
 *
 * 两套入口：
 *  1. 数据入口 matrixToText / joinRows —— 给算法层与单测用，纯函数；
 *  2. DOM 入口 extractCopyText —— 结果卡里的内容形态太多（矩阵、标量、特征值、
 *     特解、符号表达式…），逐处拼文本既啰嗦又容易漏，改成在展示组件上打
 *     data-copy-* 标记，复制时统一按标记还原。
 *
 * 输出约定：一行一个矩阵行，单元格之间用制表符（粘到 Excel / 记事本都对齐）。
 */
import type { FMatrix } from "./fraction";

/** 单元格分隔符：制表符，粘到表格软件会自动分列 */
export const CELL_SEPARATOR = "\t";

/** 行与行之间用换行 —— Windows 记事本、Excel、微信都能正确识别 */
export const ROW_SEPARATOR = "\n";

/** 把二维字符串按「行内制表符、行间换行」拼成纯文本 */
export function joinRows(rows: string[][]): string {
  return rows.map((row) => row.join(CELL_SEPARATOR)).join(ROW_SEPARATOR);
}

/** 数值矩阵 → 纯文本（分数模式用 a/b，小数模式按 precision 截断） */
export function matrixToText(
  matrix: FMatrix,
  fractionMode: boolean,
  precision = 6
): string {
  return joinRows(
    matrix.map((row) =>
      row.map((cell) => {
        if (!cell) return "0";
        return fractionMode
          ? cell.toFractionString()
          : cell.toDecimalString(precision);
      })
    )
  );
}

/**
 * 从已渲染的结果节点里还原纯文本。
 *
 * 优先级：
 *  1. 有 `[data-copy-row]`（矩阵类）就按行拼接，行内取 `[data-copy-cell]`；
 *  2. 否则收集 `[data-copy-value]`（标量、表达式）逐行输出；
 *  3. 都没有时退化成 textContent，至少不会复制出空字符串。
 */
export function extractCopyText(root: Element | null): string {
  if (!root) return "";

  const rowNodes = Array.from(root.querySelectorAll("[data-copy-row]"));
  const lines: string[] = [];

  for (const row of rowNodes) {
    const cells = Array.from(row.querySelectorAll("[data-copy-cell]"))
      .map((cell) => (cell.textContent ?? "").trim())
      .filter((text) => text.length > 0);
    if (cells.length > 0) lines.push(cells.join(CELL_SEPARATOR));
  }

  // 散落的标量（如「秩：3」「λ₁ = 2」）追加在后面，跳过已在矩阵行里的
  for (const node of Array.from(root.querySelectorAll("[data-copy-value]"))) {
    if (node.closest("[data-copy-row]")) continue;
    const text = (node.textContent ?? "").trim();
    if (text) lines.push(text);
  }

  if (lines.length > 0) return lines.join(ROW_SEPARATOR);
  return (root.textContent ?? "").trim();
}
