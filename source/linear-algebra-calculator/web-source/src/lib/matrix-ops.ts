// 矩阵运算库 — 基于 Fraction 的精确运算
import {
  Fraction,
  FMatrix,
  FVector,
  cloneMatrix,
  zeroMatrix,
  identityMatrix,
  toFMatrix,
} from "./fraction";

// ============== 行变换步骤记录 ==============
export interface RowStep {
  description: string; // 行变换描述，如 "R₂ ← R₂ − 3R₁"
  matrix: FMatrix; // 变换后的矩阵快照
}

// 行操作类型
type RowOp =
  | { type: "swap"; i: number; j: number }
  | { type: "scale"; i: number; scalar: Fraction }
  | { type: "add"; i: number; j: number; scalar: Fraction }; // R_i ← R_i + scalar * R_j

function subscript(n: number): string {
  // 数字转下标（Unicode）
  const subs = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
  return String(n + 1)
    .split("")
    .map((c) => subs[parseInt(c)])
    .join("");
}

function describeOp(op: RowOp): string {
  switch (op.type) {
    case "swap":
      return `R${subscript(op.i)} ↔ R${subscript(op.j)}`;
    case "scale": {
      const s = op.scalar;
      const sStr = s.isOne() ? "" : `× ${s.toFractionString()}`;
      return `R${subscript(op.i)} ← R${subscript(op.i)} ${sStr}`;
    }
    case "add": {
      const s = op.scalar;
      const rj = `R${subscript(op.j)}`;
      if (s.isOne()) {
        return `R${subscript(op.i)} ← R${subscript(op.i)} + ${rj}`;
      }
      if (s.isNegOne()) {
        return `R${subscript(op.i)} ← R${subscript(op.i)} − ${rj}`;
      }
      if (s.isNegative()) {
        return `R${subscript(op.i)} ← R${subscript(op.i)} − ${s
          .abs()
          .toFractionString()}${rj}`;
      }
      return `R${subscript(op.i)} ← R${subscript(op.i)} + ${s.toFractionString()}${rj}`;
    }
  }
}

function applyRowOp(m: FMatrix, op: RowOp): void {
  const cols = m[0].length;
  switch (op.type) {
    case "swap": {
      const tmp = m[op.i];
      m[op.i] = m[op.j];
      m[op.j] = tmp;
      break;
    }
    case "scale": {
      for (let j = 0; j < cols; j++) {
        m[op.i][j] = m[op.i][j].mul(op.scalar);
      }
      break;
    }
    case "add": {
      for (let j = 0; j < cols; j++) {
        m[op.i][j] = m[op.i][j].add(op.scalar.mul(m[op.j][j]));
      }
      break;
    }
  }
}

// ============== RREF / 高斯消元 ==============
export interface RREFResult {
  rref: FMatrix;
  rank: number;
  pivotCols: number[]; // 主元所在列
  steps: RowStep[];
}

/**
 * 评估候选主元的「友好度」——分数越简单越好（分母越小越好）
 * 返回分数：越小越好。整数返回 0，1/2 返回 1，1/3 返回 2，依此类推
 */
function pivotFriendliness(f: Fraction): number {
  const abs = f.abs();
  // 整数最友好
  if (abs.isInteger()) return 0;
  // 分母越小越友好（同时考虑分子大小）
  return abs.den + Math.abs(abs.num) * 0.1;
}

/**
 * 行最简形（RREF）计算，支持记录步骤
 * 使用「整数友好」主元选择策略：优先选择使中间结果保持为整数或简单分数的主元
 * 只使用行变换，不使用列变换（保证方程组解的正确性、逆矩阵的正确性）
 * @param m 原矩阵
 * @param augmentedCols 增广列数（用于方程组，这些列不参与主元选择但参与行变换）
 */
export function rref(m: FMatrix, augmentedCols: number = 0): RREFResult {
  const mat = cloneMatrix(m);
  const steps: RowStep[] = [];
  const pivotCols: number[] = [];
  const rows = mat.length;
  const totalCols = mat[0].length;
  const coeffCols = totalCols - augmentedCols; // 系数部分列数

  let row = 0;
  for (let col = 0; col < coeffCols && row < rows; col++) {
    // 找第 col 列从第 row 行开始的最佳主元（整数友好策略）
    // 策略：优先选绝对值为 1 的（消元系数为整数），其次选分母小的简单分数
    let pivotRow = -1;
    let bestScore = Infinity;
    let maxAbsScore = -Infinity;

    for (let i = row; i < rows; i++) {
      const val = mat[i][col];
      if (val.isZero()) continue;

      const friendliness = pivotFriendliness(val);
      // 第一优先级：友好度（整数 > 简单分数 > 复杂分数）
      // 第二优先级：绝对值更大（数值稳定）
      const score = friendliness * 1000 - val.abs().toDecimal();

      if (score < bestScore) {
        bestScore = score;
        pivotRow = i;
        maxAbsScore = val.abs().toDecimal();
      }
    }

    if (pivotRow === -1 || mat[pivotRow][col].isZero()) {
      continue; // 该列无主元，跳过
    }

    // 行交换
    if (pivotRow !== row) {
      const op: RowOp = { type: "swap", i: row, j: pivotRow };
      applyRowOp(mat, op);
      steps.push({ description: describeOp(op), matrix: cloneMatrix(mat) });
    }

    // 主元行归一化（主元变 1）
    const pivotVal = mat[row][col];
    if (!pivotVal.isOne()) {
      const op: RowOp = { type: "scale", i: row, scalar: pivotVal.reciprocal() };
      applyRowOp(mat, op);
      steps.push({ description: describeOp(op), matrix: cloneMatrix(mat) });
    }

    // 消去该列其他行
    for (let i = 0; i < rows; i++) {
      if (i === row) continue;
      const factor = mat[i][col].neg();
      if (!factor.isZero()) {
        const op: RowOp = { type: "add", i, j: row, scalar: factor };
        applyRowOp(mat, op);
        steps.push({ description: describeOp(op), matrix: cloneMatrix(mat) });
      }
    }

    pivotCols.push(col);
    row++;
  }

  return { rref: mat, rank: pivotCols.length, pivotCols, steps };
}

// ============== 行列式 ==============
export interface DetResult {
  det: Fraction;
  steps: RowStep[];
}

export function determinant(m: FMatrix): DetResult {
  const n = m.length;
  if (n === 0 || m[0].length !== n) {
    throw new Error("行列式仅适用于方阵");
  }

  const mat = cloneMatrix(m);
  const steps: RowStep[] = [];
  let detSign = 1; // 行交换改变符号
  let detScale = Fraction.ONE; // 行缩放的倒数累积

  for (let col = 0; col < n; col++) {
    // 找主元（整数友好策略：优先选简单分数/整数主元）
    let pivotRow = -1;
    let bestScore = Infinity;
    for (let i = col; i < n; i++) {
      const val = mat[i][col];
      if (val.isZero()) continue;
      const friendliness = pivotFriendliness(val);
      const score = friendliness * 1000 - val.abs().toDecimal();
      if (score < bestScore) {
        bestScore = score;
        pivotRow = i;
      }
    }

    if (pivotRow === -1 || mat[pivotRow][col].isZero()) {
      return { det: Fraction.ZERO, steps };
    }

    if (pivotRow !== col) {
      const op: RowOp = { type: "swap", i: col, j: pivotRow };
      applyRowOp(mat, op);
      steps.push({ description: describeOp(op), matrix: cloneMatrix(mat) });
      detSign = -detSign;
    }

    const pivotVal = mat[col][col];

    for (let i = col + 1; i < n; i++) {
      const factor = mat[i][col].div(pivotVal).neg();
      if (!factor.isZero()) {
        const op: RowOp = { type: "add", i, j: col, scalar: factor };
        applyRowOp(mat, op);
        steps.push({ description: describeOp(op), matrix: cloneMatrix(mat) });
      }
    }
  }

  // 上三角行列式 = 对角线乘积 × 符号
  let det = new Fraction(detSign, 1);
  for (let i = 0; i < n; i++) {
    det = det.mul(mat[i][i]);
  }
  det = det.mul(detScale);

  return { det, steps };
}

// ============== 逆矩阵 ==============
export interface InverseResult {
  inverse: FMatrix | null; // 不可逆时为 null
  steps: RowStep[];
}

export function inverse(m: FMatrix): InverseResult {
  const n = m.length;
  if (n === 0 || m[0].length !== n) {
    throw new Error("逆矩阵仅适用于方阵");
  }

  // 构造增广矩阵 [A | I]
  const aug: FMatrix = [];
  for (let i = 0; i < n; i++) {
    const row = m[i].slice();
    for (let j = 0; j < n; j++) {
      row.push(i === j ? Fraction.ONE : Fraction.ZERO);
    }
    aug.push(row);
  }

  const { rref: augRref, rank, steps } = rref(aug, n);

  if (rank < n) {
    return { inverse: null, steps };
  }

  // 右半部分即逆矩阵
  const inv: FMatrix = [];
  for (let i = 0; i < n; i++) {
    inv.push(augRref[i].slice(n));
  }
  return { inverse: inv, steps };
}

// ============== 秩 ==============
export function rank(m: FMatrix): number {
  const { rank: r } = rref(m);
  return r;
}

// ============== 迹 ==============
export function trace(m: FMatrix): Fraction {
  const n = Math.min(m.length, m[0].length);
  let sum = Fraction.ZERO;
  for (let i = 0; i < n; i++) {
    sum = sum.add(m[i][i]);
  }
  return sum;
}

// ============== 矩阵加法 ==============
export function add(a: FMatrix, b: FMatrix): FMatrix {
  if (a.length !== b.length || a[0].length !== b[0].length) {
    throw new Error("矩阵加法要求同型矩阵");
  }
  const result: FMatrix = [];
  for (let i = 0; i < a.length; i++) {
    const row: FVector = [];
    for (let j = 0; j < a[0].length; j++) {
      row.push(a[i][j].add(b[i][j]));
    }
    result.push(row);
  }
  return result;
}

export function subtract(a: FMatrix, b: FMatrix): FMatrix {
  if (a.length !== b.length || a[0].length !== b[0].length) {
    throw new Error("矩阵减法要求同型矩阵");
  }
  const result: FMatrix = [];
  for (let i = 0; i < a.length; i++) {
    const row: FVector = [];
    for (let j = 0; j < a[0].length; j++) {
      row.push(a[i][j].sub(b[i][j]));
    }
    result.push(row);
  }
  return result;
}

export function multiply(a: FMatrix, b: FMatrix): FMatrix {
  if (a[0].length !== b.length) {
    throw new Error("矩阵乘法要求 A 的列数等于 B 的行数");
  }
  const m = a.length;
  const n = b[0].length;
  const p = b.length;
  const result: FMatrix = [];
  for (let i = 0; i < m; i++) {
    const row: FVector = [];
    for (let j = 0; j < n; j++) {
      let sum = Fraction.ZERO;
      for (let k = 0; k < p; k++) {
        sum = sum.add(a[i][k].mul(b[k][j]));
      }
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

// 数乘
export function scalarMultiply(m: FMatrix, scalar: Fraction): FMatrix {
  return m.map((row) => row.map((v) => v.mul(scalar)));
}

// ============== 矩阵幂 A^n ==============
export function matrixPower(m: FMatrix, n: number): FMatrix {
  if (m.length !== m[0].length) {
    throw new Error("矩阵幂要求方阵");
  }
  if (!Number.isInteger(n)) {
    throw new Error("指数必须为整数");
  }
  if (n < 0) {
    const { inverse: inv } = inverse(m);
    if (!inv) throw new Error("负指数要求矩阵可逆");
    return matrixPower(inv, -n);
  }
  if (n === 0) return identityMatrix(m.length);

  // 快速幂
  let result = identityMatrix(m.length);
  let base = cloneMatrix(m);
  let exp = n;
  while (exp > 0) {
    if (exp % 2 === 1) {
      result = multiply(result, base);
    }
    base = multiply(base, base);
    exp = Math.floor(exp / 2);
  }
  return result;
}

// ============== 特征值与特征向量 ==============
// 使用特征多项式方法，支持 2x2 和 3x3 矩阵
// 对于更大矩阵，使用 QR 迭代法近似（小数）

export interface EigenResult {
  eigenvalues: number[]; // 实特征值
  eigenvectors: number[][]; // 对应特征向量（单位化的近似解）
  complexEigenvalues?: { real: number; imag: number }[]; // 复特征值
}

function detNumeric(m: number[][]): number {
  const n = m.length;
  const mat = m.map((r) => r.slice());
  let sign = 1;
  for (let col = 0; col < n; col++) {
    let pivotRow = -1;
    let maxAbs = 0;
    for (let i = col; i < n; i++) {
      if (Math.abs(mat[i][col]) > maxAbs) {
        maxAbs = Math.abs(mat[i][col]);
        pivotRow = i;
      }
    }
    if (pivotRow === -1 || mat[pivotRow][col] === 0) return 0;
    if (pivotRow !== col) {
      [mat[col], mat[pivotRow]] = [mat[pivotRow], mat[col]];
      sign = -sign;
    }
    const pivot = mat[col][col];
    for (let i = col + 1; i < n; i++) {
      const factor = -mat[i][col] / pivot;
      for (let j = col; j < n; j++) {
        mat[i][j] += factor * mat[col][j];
      }
    }
  }
  let det = sign;
  for (let i = 0; i < n; i++) det *= mat[i][i];
  return det;
}

// 用 QR 迭代求特征值（实特征值近似）
function qrEigenvalues(m: number[][], maxIter = 100, tol = 1e-10): number[] {
  const n = m.length;
  let A = m.map((r) => r.slice());

  for (let iter = 0; iter < maxIter; iter++) {
    // QR 分解 (Gram-Schmidt)
    const Q: number[][] = [];
    const R: number[][] = [];
    for (let i = 0; i < n; i++) {
      R.push(new Array(n).fill(0));
    }

    for (let j = 0; j < n; j++) {
      // 取 A 的第 j 列
      const v = new Array(n).fill(0);
      for (let i = 0; i < n; i++) v[i] = A[i][j];

      for (let i = 0; i < j; i++) {
        let dot = 0;
        for (let k = 0; k < n; k++) dot += Q[k][i] * v[k];
        R[i][j] = dot;
        for (let k = 0; k < n; k++) v[k] -= dot * Q[k][i];
      }

      let norm = 0;
      for (let k = 0; k < n; k++) norm += v[k] * v[k];
      norm = Math.sqrt(norm);

      if (norm < tol) {
        R[j][j] = 0;
        if (Q.length === 0) {
          Q.push(new Array(n).fill(0));
        } else {
          // 找正交于前面列的向量
          const q = new Array(n).fill(0);
          q[j] = 1;
          Q.push(q);
        }
      } else {
        R[j][j] = norm;
        const q = v.map((x) => x / norm);
        Q.push(q);
      }
    }

    // 重新构造 Q 为 n×n 矩阵
    const Qmat: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        row.push(Q[j][i]);
      }
      Qmat.push(row);
    }

    // A_new = R * Q
    const Anew: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) sum += R[i][k] * Qmat[k][j];
        row.push(sum);
      }
      Anew.push(row);
    }

    // 检查收敛（下三角是否接近 0）
    let converged = true;
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.abs(Anew[i][j]) > tol) {
          converged = false;
          break;
        }
      }
      if (!converged) break;
    }

    A = Anew;
    if (converged) break;
  }

  // 对角线为特征值
  const evals: number[] = [];
  for (let i = 0; i < n; i++) {
    evals.push(A[i][i]);
  }
  return evals;
}

// 反幂法求特征向量
function inverseIteration(
  m: number[][],
  eigenvalue: number,
  tol = 1e-10,
  maxIter = 50
): number[] {
  const n = m.length;
  // A - λI
  const mat: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      row.push(m[i][j] - (i === j ? eigenvalue : 0));
    }
    mat.push(row);
  }

  // 初始向量
  let v = new Array(n).fill(1 / Math.sqrt(n));

  for (let iter = 0; iter < maxIter; iter++) {
    // 解 (A - λI) w = v，使用高斯消元
    const aug: number[][] = mat.map((r, i) => [...r, v[i]]);

    // 前向消元
    for (let col = 0; col < n; col++) {
      let pivotRow = col;
      let maxAbs = Math.abs(aug[col][col]);
      for (let i = col + 1; i < n; i++) {
        if (Math.abs(aug[i][col]) > maxAbs) {
          maxAbs = Math.abs(aug[i][col]);
          pivotRow = i;
        }
      }
      if (pivotRow !== col) {
        [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
      }
      const pivot = aug[col][col];
      if (Math.abs(pivot) < 1e-12) continue;
      for (let i = col + 1; i < n; i++) {
        const factor = -aug[i][col] / pivot;
        for (let j = col; j <= n; j++) {
          aug[i][j] += factor * aug[col][j];
        }
      }
    }

    // 回代
    const w = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = aug[i][n];
      for (let j = i + 1; j < n; j++) {
        sum -= aug[i][j] * w[j];
      }
      w[i] = Math.abs(aug[i][i]) < 1e-12 ? 0 : sum / aug[i][i];
    }

    // 归一化
    let norm = 0;
    for (let i = 0; i < n; i++) norm += w[i] * w[i];
    norm = Math.sqrt(norm);
    if (norm < tol) break;
    const wn = w.map((x) => x / norm);

    // 检查收敛
    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.pow(Math.abs(wn[i]) - Math.abs(v[i]), 2);
    }
    v = wn;
    if (Math.sqrt(diff) < tol) break;
  }

  return v;
}

export function eigenvalues(m: FMatrix): EigenResult {
  const n = m.length;
  if (n !== m[0].length) {
    throw new Error("特征值仅适用于方阵");
  }

  const numeric = m.map((row) => row.map((v) => v.toDecimal()));

  if (n === 1) {
    return { eigenvalues: [numeric[0][0]], eigenvectors: [[1]] };
  }

  if (n === 2) {
    // 特征方程 λ² - tr(A)λ + det(A) = 0
    const tr = numeric[0][0] + numeric[1][1];
    const det = detNumeric(numeric);
    const discriminant = tr * tr - 4 * det;

    if (discriminant >= 0) {
      const sqrtD = Math.sqrt(discriminant);
      const e1 = (tr + sqrtD) / 2;
      const e2 = (tr - sqrtD) / 2;
      const evals = [e1, e2];
      const evecs = evals.map((ev) => inverseIteration(numeric, ev));
      return { eigenvalues: evals, eigenvectors: evecs };
    } else {
      const realPart = tr / 2;
      const imagPart = Math.sqrt(-discriminant) / 2;
      return {
        eigenvalues: [],
        eigenvectors: [],
        complexEigenvalues: [
          { real: realPart, imag: imagPart },
          { real: realPart, imag: -imagPart },
        ],
      };
    }
  }

  // 3x3 及以上：QR 迭代
  const evals = qrEigenvalues(numeric);
  // 按降序排序
  const sorted = evals.slice().sort((a, b) => b - a);
  const evecs = sorted.map((ev) => inverseIteration(numeric, ev));

  return { eigenvalues: sorted, eigenvectors: evecs };
}

// ============== 线性方程组求解 ==============
export interface LinearSystemResult {
  type: "unique" | "infinite" | "no-solution";
  solution?: Record<string, Fraction>; // 唯一解：变量名 -> 值
  freeVariables?: string[]; // 无穷解：自由变量名
  particularSolution?: Record<string, Fraction>; // 特解
  basisVectors?: Record<string, Fraction>[]; // 基础解系（每个自由变量对应一个向量）
  rankA?: number;
  rankAb?: number;
  steps: RowStep[];
  rref: FMatrix;
  pivotCols: number[];
  variableNames: string[];
}

export function solveLinearSystem(augmented: FMatrix): LinearSystemResult {
  const rows = augmented.length;
  const totalCols = augmented[0].length;
  const nVars = totalCols - 1; // 未知数个数
  const variableNames: string[] = [];
  for (let i = 0; i < nVars; i++) {
    variableNames.push(`x${i + 1}`);
  }

  const { rref: rrefMat, pivotCols, steps } = rref(augmented, 1);
  const rankA = pivotCols.length;
  // 增广矩阵的秩 = 行最简形中非零行的行数（行变换不改变行空间维数）。
  // 注意不能用 rref(augmented, 1).rank：该调用的主元只在系数列中选取，
  // 返回的秩恒等于 rankA，会让「无解」分支打印出两个相等的秩。
  const rankAb = rrefMat.reduce(
    (acc, row) => acc + (row.some((v) => !v.isZero()) ? 1 : 0),
    0
  );

  // 检查无解：若某行系数全为 0 但常数项不为 0
  for (let i = 0; i < rows; i++) {
    let allZero = true;
    for (let j = 0; j < nVars; j++) {
      if (!rrefMat[i][j].isZero()) {
        allZero = false;
        break;
      }
    }
    if (allZero && !rrefMat[i][nVars].isZero()) {
      return {
        type: "no-solution",
        rankA,
        rankAb,
        steps,
        rref: rrefMat,
        pivotCols,
        variableNames,
      };
    }
  }

  if (rankA === nVars) {
    // 唯一解
    const solution: Record<string, Fraction> = {};
    for (let i = 0; i < nVars; i++) {
      // 找到第 i 个主元所在行
      // pivotCols 是有序的，第 i 个主元列对应第 i 行（因为是 RREF）
      solution[variableNames[i]] = rrefMat[i][nVars];
    }
    return {
      type: "unique",
      solution,
      rankA,
      rankAb,
      steps,
      rref: rrefMat,
      pivotCols,
      variableNames,
    };
  } else {
    // 无穷多解
    const freeVars: string[] = [];
    for (let j = 0; j < nVars; j++) {
      if (!pivotCols.includes(j)) {
        freeVars.push(variableNames[j]);
      }
    }

    // 求特解（所有自由变量取 0）
    const particular: Record<string, Fraction> = {};
    for (let i = 0; i < nVars; i++) {
      particular[variableNames[i]] = Fraction.ZERO;
    }
    // 主元变量的值由常数列决定
    for (let r = 0; r < pivotCols.length; r++) {
      const col = pivotCols[r];
      particular[variableNames[col]] = rrefMat[r][nVars];
    }

    // 求基础解系（每个自由变量取 1，其余取 0）
    const basis: Record<string, Fraction>[] = [];
    for (const fv of freeVars) {
      const vec: Record<string, Fraction> = {};
      for (let i = 0; i < nVars; i++) {
        vec[variableNames[i]] = Fraction.ZERO;
      }
      const fvIdx = variableNames.indexOf(fv);
      vec[fv] = Fraction.ONE;

      // 主元变量的值
      for (let r = 0; r < pivotCols.length; r++) {
        const col = pivotCols[r];
        // 该行方程：x_col + Σ(自由变量) * 系数 = 0
        // 所以 x_col = - Σ(自由变量系数) * 自由变量值
        // 因为只有一个自由变量取 1，其余取 0
        vec[variableNames[col]] = rrefMat[r][fvIdx].neg();
      }
      basis.push(vec);
    }

    return {
      type: "infinite",
      freeVariables: freeVars,
      particularSolution: particular,
      basisVectors: basis,
      rankA,
      rankAb,
      steps,
      rref: rrefMat,
      pivotCols,
      variableNames,
    };
  }
}

// 示例矩阵
export const EXAMPLE_MATRIX = toFMatrix([
  [1, 2, 3],
  [0, 1, 4],
  [5, 6, 0],
]);

export const EXAMPLE_MATRIX_2 = toFMatrix([
  [2, -1],
  [1, 3],
  [0, 2],
]);

export const EXAMPLE_MATRIX_3 = toFMatrix([
  [1, 2],
  [3, 4],
]);

// 线性方程组示例（增广矩阵）
export const EXAMPLE_LINEAR_SYSTEM = toFMatrix([
  [1, 2, 3, 1],
  [0, 1, 4, 2],
  [5, 6, 0, 3],
]);
