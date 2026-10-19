// 符号表达式引擎 — 支持字母、数字、π、运算符的解析与化简
// 用于矩阵元素含符号的情况：加减乘、行列式、逆、秩、转置、方程组求解

// 表达式类型（AST）
export type Expr =
  | { type: "num"; value: number }        // 数字
  | { type: "var"; name: string }         // 变量/字母
  | { type: "pi" }                         // π
  | { type: "add"; terms: Expr[] }         // 加法 a + b + c
  | { type: "mul"; factors: Expr[] }       // 乘法 a * b * c
  | { type: "pow"; base: Expr; exp: number }; // 幂 a^n (n 为整数)

// ============== 构造器 ==============
export const Num = (v: number): Expr => ({ type: "num", value: v });
export const Var = (n: string): Expr => ({ type: "var", name: n });
export const Pi: Expr = { type: "pi" };
export const Zero: Expr = Num(0);
export const One: Expr = Num(1);
export const NegOne: Expr = Num(-1);

// ============== 解析器 ==============
// 支持语法: 数字、字母、pi/π、+ - * / ^、括号、分数 a/b
export function parseExpr(s: string): Expr {
  s = s.trim();
  if (s === "") return Zero;
  const tokens = tokenize(s);
  const parser = new Parser(tokens);
  const result = parser.parseExpr();
  if (!parser.isEnd()) {
    const remaining = tokens.slice(parser.pos).map(t => t.type === "op" || t.type === "num" || t.type === "ident" ? t.value : t.type).join(" ");
    throw new Error(`表达式未完全解析，多余: ${remaining}`);
  }
  return simplify(result);
}

type Token =
  | { type: "num"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if ("+-*/^".includes(c)) { tokens.push({ type: "op", value: c }); i++; continue; }
    // π 符号
    if (c === "π" || c === "π") { tokens.push({ type: "ident", value: "pi" }); i++; continue; }
    // 数字（含小数）
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ type: "num", value: s.slice(i, j) });
      i = j;
      continue;
    }
    // 标识符（字母开头 + 可选数字下标，如 x1, a2）
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      tokens.push({ type: "ident", value: s.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`无法识别字符: ${c}`);
  }
  return tokens;
}

class Parser {
  pos = 0;
  constructor(private tokens: Token[]) {}

  isEnd(): boolean { return this.pos >= this.tokens.length; }
  peek(): Token | undefined { return this.tokens[this.pos]; }
  consume(): Token { return this.tokens[this.pos++]; }

  parseExpr(): Expr { return this.parseAddSub(); }

  parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (true) {
      const t = this.peek();
      if (!t) break;
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.consume();
        const right = this.parseMulDiv();
        if (t.value === "+") {
          left = addExpr(left, right);
        } else {
          left = subExpr(left, right);
        }
      } else {
        break;
      }
    }
    return left;
  }

  parseMulDiv(): Expr {
    let left = this.parsePower();
    while (true) {
      const t = this.peek();
      if (!t) break;
      // 隐式乘法：数字/变量/右括号 后跟 变量/左括号
      if (this.isImplicitMul(t, left)) {
        const right = this.parsePower();
        left = mulExpr(left, right);
        continue;
      }
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.consume();
        const right = this.parsePower();
        if (t.value === "*") {
          left = mulExpr(left, right);
        } else {
          left = divExpr(left, right);
        }
      } else {
        break;
      }
    }
    return left;
  }

  isImplicitMul(t: Token, left: Expr): boolean {
    if (t.type === "ident") return isNumOrVarOrParen(left);
    if (t.type === "lparen") return isNumOrVarOrParen(left);
    return false;
  }

  parsePower(): Expr {
    let base = this.parseUnary();
    const t = this.peek();
    if (t && t.type === "op" && t.value === "^") {
      this.consume();
      const exp = this.parseUnary();
      // 只支持整数指数
      const expNum = evalAsInteger(exp);
      if (expNum === null) {
        // 非整数指数，保留为 mul 形式
        return { type: "pow", base, exp: 1 }; // 降级处理
      }
      return powExpr(base, expNum);
    }
    return base;
  }

  parseUnary(): Expr {
    const t = this.peek();
    if (t && t.type === "op" && t.value === "-") {
      this.consume();
      const operand = this.parseUnary();
      return negExpr(operand);
    }
    if (t && t.type === "op" && t.value === "+") {
      this.consume();
      return this.parseUnary();
    }
    return this.parseAtom();
  }

  parseAtom(): Expr {
    const t = this.consume();
    if (!t) throw new Error("表达式意外结束");
    if (t.type === "num") {
      const v = parseFloat(t.value);
      if (isNaN(v)) throw new Error(`无效数字: ${t.value}`);
      return Num(v);
    }
    if (t.type === "ident") {
      if (t.value === "pi") return Pi;
      return Var(t.value);
    }
    if (t.type === "lparen") {
      const e = this.parseExpr();
      const rparen = this.consume();
      if (!rparen || rparen.type !== "rparen") throw new Error("缺少右括号");
      return e;
    }
    throw new Error(`意外的 token: ${JSON.stringify(t)}`);
  }
}

function isNumOrVarOrParen(e: Expr): boolean {
  return e.type === "num" || e.type === "var" || e.type === "pi" || e.type === "pow";
}

// 尝试求整数值
function evalAsInteger(e: Expr): number | null {
  if (e.type === "num" && Number.isInteger(e.value)) return e.value;
  return null;
}

// ============== 运算构造（自动化简） ==============
export function addExpr(a: Expr, b: Expr): Expr {
  a = simplify(a); b = simplify(b);
  // 0 + x = x
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  // 合并数字
  if (a.type === "num" && b.type === "num") {
    return Num(a.value + b.value);
  }
  // 合并 add 平铺
  const terms: Expr[] = [];
  if (a.type === "add") terms.push(...a.terms); else terms.push(a);
  if (b.type === "add") terms.push(...b.terms); else terms.push(b);

  // 合并同类项
  const merged = mergeLikeTerms(terms);
  if (merged.length === 0) return Zero;
  if (merged.length === 1) return merged[0];
  return simplify({ type: "add", terms: merged });
}

export function subExpr(a: Expr, b: Expr): Expr {
  return addExpr(a, negExpr(b));
}

export function mulExpr(a: Expr, b: Expr): Expr {
  a = simplify(a); b = simplify(b);
  // 0 * x = 0
  if (isZero(a) || isZero(b)) return Zero;
  // 1 * x = x
  if (isOne(a)) return b;
  if (isOne(b)) return a;
  // -1 * x = -x
  if (isNegOne(a)) return negExpr(b);
  if (isNegOne(b)) return negExpr(a);
  // 数字相乘
  if (a.type === "num" && b.type === "num") {
    return Num(a.value * b.value);
  }
  // 合并 mul 平铺
  const factors: Expr[] = [];
  if (a.type === "mul") factors.push(...a.factors); else factors.push(a);
  if (b.type === "mul") factors.push(...b.factors); else factors.push(b);

  // 合并数字系数
  let numCoeff = 1;
  const otherFactors: Expr[] = [];
  for (const f of factors) {
    if (f.type === "num") numCoeff *= f.value;
    else otherFactors.push(f);
  }
  // 合并同底幂
  const mergedPowers = mergePowers(otherFactors);

  if (numCoeff === 0) return Zero;
  const allFactors: Expr[] = [];
  if (numCoeff !== 1) allFactors.push(Num(numCoeff));
  allFactors.push(...mergedPowers);

  if (allFactors.length === 0) return One;
  if (allFactors.length === 1) return allFactors[0];
  return { type: "mul", factors: allFactors };
}

export function divExpr(a: Expr, b: Expr): Expr {
  if (isZero(b)) throw new Error("除以零");
  // a / b = a * b^(-1)
  return mulExpr(a, powExpr(b, -1));
}

export function negExpr(a: Expr): Expr {
  if (a.type === "num") return Num(-a.value);
  if (a.type === "mul") {
    // 找数字系数取反
    const factors = a.factors.map((f, i) => {
      if (f.type === "num") return Num(-f.value);
      return f;
    });
    // 如果没有数字系数，前面加 -1
    if (!factors.some(f => f.type === "num")) {
      factors.unshift(Num(-1));
    }
    return { type: "mul", factors };
  }
  if (a.type === "add") {
    return { type: "add", terms: a.terms.map(negExpr) };
  }
  return { type: "mul", factors: [NegOne, a] };
}

export function powExpr(base: Expr, n: number): Expr {
  base = simplify(base);
  if (n === 0) return One;
  if (n === 1) return base;
  if (base.type === "num") {
    return Num(Math.pow(base.value, n));
  }
  if (base.type === "pow") {
    return { type: "pow", base: base.base, exp: base.exp * n };
  }
  if (base.type === "mul") {
    // (a*b)^n = a^n * b^n
    const factors = base.factors.map(f => powExpr(f, n));
    return factors.reduce((acc, f) => mulExpr(acc, f), One);
  }
  return { type: "pow", base, exp: n };
}

// ============== 化简 ==============
export function simplify(e: Expr): Expr {
  switch (e.type) {
    case "num":
    case "var":
    case "pi":
      return e;
    case "add": {
      const simplified = e.terms.map(simplify).filter(t => !isZero(t));
      if (simplified.length === 0) return Zero;
      if (simplified.length === 1) return simplified[0];
      const merged = mergeLikeTerms(simplified);
      if (merged.length === 0) return Zero;
      if (merged.length === 1) return merged[0];
      return { type: "add", terms: sortTerms(merged) };
    }
    case "mul": {
      let numCoeff = 1;
      const others: Expr[] = [];
      for (const f of e.factors.map(simplify)) {
        if (f.type === "num") numCoeff *= f.value;
        else if (isZero(f)) return Zero;
        else others.push(f);
      }
      if (numCoeff === 0) return Zero;
      const merged = mergePowers(others);
      const all: Expr[] = [];
      if (numCoeff !== 1) all.push(Num(numCoeff));
      all.push(...merged);
      if (all.length === 0) return One;
      if (all.length === 1) return all[0];
      return { type: "mul", factors: sortFactors(all) };
    }
    case "pow": {
      const base = simplify(e.base);
      if (e.exp === 0) return One;
      if (e.exp === 1) return base;
      if (base.type === "num") return Num(Math.pow(base.value, e.exp));
      return { type: "pow", base, exp: e.exp };
    }
  }
}

// 合并同类项
function mergeLikeTerms(terms: Expr[]): Expr[] {
  // 将每个项拆成 { coeff: number, keyParts: Expr[] }
  const groups = new Map<string, { coeff: number; parts: Expr[] }>();
  for (const t of terms) {
    const { coeff, factors } = splitCoeffAndFactors(t);
    const key = exprKey({ type: "mul", factors });
    const existing = groups.get(key);
    if (existing) {
      existing.coeff += coeff;
    } else {
      groups.set(key, { coeff, parts: factors });
    }
  }
  const result: Expr[] = [];
  for (const { coeff, parts } of groups.values()) {
    if (Math.abs(coeff) < 1e-10) continue;
    if (parts.length === 0) {
      result.push(Num(coeff));
    } else if (coeff === 1) {
      result.push(parts.length === 1 ? parts[0] : { type: "mul", factors: parts });
    } else if (coeff === -1) {
      result.push(negExpr(parts.length === 1 ? parts[0] : { type: "mul", factors: parts }));
    } else {
      result.push({ type: "mul", factors: [Num(coeff), ...parts] });
    }
  }
  return result;
}

// 合并同底幂
function mergePowers(factors: Expr[]): Expr[] {
  const groups = new Map<string, { base: Expr; exp: number }>();
  for (const f of factors) {
    let base: Expr;
    let exp: number;
    if (f.type === "pow") {
      base = f.base;
      exp = f.exp;
    } else {
      base = f;
      exp = 1;
    }
    const key = exprKey(base);
    const existing = groups.get(key);
    if (existing) {
      existing.exp += exp;
    } else {
      groups.set(key, { base, exp });
    }
  }
  const result: Expr[] = [];
  for (const { base, exp } of groups.values()) {
    if (exp === 0) continue;
    if (exp === 1) result.push(base);
    else result.push({ type: "pow", base, exp });
  }
  return result;
}

// 拆分数字系数和其他因子
function splitCoeffAndFactors(e: Expr): { coeff: number; factors: Expr[] } {
  if (e.type === "num") return { coeff: e.value, factors: [] };
  if (e.type === "mul") {
    let coeff = 1;
    const factors: Expr[] = [];
    for (const f of e.factors) {
      if (f.type === "num") coeff *= f.value;
      else factors.push(f);
    }
    return { coeff, factors };
  }
  return { coeff: 1, factors: [e] };
}

// ============== 工具函数 ==============
export function isZero(e: Expr): boolean {
  return e.type === "num" && Math.abs(e.value) < 1e-12;
}
export function isOne(e: Expr): boolean {
  return e.type === "num" && Math.abs(e.value - 1) < 1e-12;
}
export function isNegOne(e: Expr): boolean {
  return e.type === "num" && Math.abs(e.value + 1) < 1e-12;
}

// 表达式唯一键（用于比较结构相等）
export function exprKey(e: Expr): string {
  return JSON.stringify(normalizeForCompare(e));
}

function normalizeForCompare(e: Expr): unknown {
  switch (e.type) {
    case "num": return ["num", e.value];
    case "var": return ["var", e.name];
    case "pi": return ["pi"];
    case "add": return ["add", ...e.terms.map(exprKey).sort()];
    case "mul": return ["mul", ...e.factors.map(exprKey).sort()];
    case "pow": return ["pow", exprKey(e.base), e.exp];
  }
}

// 排序项（用于稳定输出）
function sortTerms(terms: Expr[]): Expr[] {
  return [...terms].sort((a, b) => {
    const ka = termSortKey(a);
    const kb = termSortKey(b);
    return ka.localeCompare(kb);
  });
}

function termSortKey(e: Expr): string {
  const { factors } = splitCoeffAndFactors(e);
  return factors.map(f => exprKey(f)).join("*");
}

function sortFactors(factors: Expr[]): Expr[] {
  // 数字系数放前面
  return [...factors].sort((a, b) => {
    if (a.type === "num" && b.type !== "num") return -1;
    if (a.type !== "num" && b.type === "num") return 1;
    return exprKey(a).localeCompare(exprKey(b));
  });
}

// ============== 字符串输出 ==============
export function exprToString(e: Expr): string {
  e = simplify(e);
  switch (e.type) {
    case "num":
      return formatNumber(e.value);
    case "var":
      return e.name;
    case "pi":
      return "π";
    case "add":
      return e.terms.map((t, i) => {
        const s = exprToString(t);
        if (i === 0) return s;
        if (s.startsWith("-")) return " − " + s.slice(1).trim();
        return " + " + s;
      }).join("");
    case "mul": {
      return e.factors.map((f, i) => {
        const s = factorToString(f);
        if (i === 0) return s;
        // 判断是否需要乘号
        const prev = e.factors[i - 1];
        if ((prev.type === "num") && (f.type === "var" || f.type === "pi" || (f.type === "pow" && f.base.type !== "num"))) {
          return s; // 隐式乘，如 2x
        }
        return "·" + s;
      }).join("");
    }
    case "pow": {
      const baseStr = baseToString(e.base);
      if (e.exp > 0) return baseStr + "^" + e.exp;
      return baseStr + "^(" + e.exp + ")";
    }
  }
}

function factorToString(e: Expr): string {
  if (e.type === "num" && e.value === -1) return "−";
  if (e.type === "add") return "(" + exprToString(e) + ")";
  return exprToString(e);
}

function baseToString(e: Expr): string {
  if (e.type === "num" || e.type === "var" || e.type === "pi") return exprToString(e);
  return "(" + exprToString(e) + ")";
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  // 最多保留 4 位小数，去掉末尾 0
  let s = n.toFixed(6);
  s = s.replace(/\.?0+$/, "");
  return s;
}

// ============== 安全解析（失败返回 null） ==============
export function safeParseExpr(s: string): Expr | null {
  try {
    return parseExpr(s);
  } catch {
    return null;
  }
}

// ============== 求倒数（用于行变换） ==============
export function reciprocal(e: Expr): Expr {
  return powExpr(e, -1);
}

// ============== 符号矩阵类型 ==============
export type SMatrix = Expr[][];
export type SVector = Expr[];

export function toSMatrix(data: (string | number)[][]): SMatrix {
  return data.map(row => row.map(v => typeof v === "number" ? Num(v) : parseExpr(v)));
}

export function cloneSMatrix(m: SMatrix): SMatrix {
  return m.map(row => row.slice());
}

export function zeroSMatrix(rows: number, cols: number): SMatrix {
  const m: SMatrix = [];
  for (let i = 0; i < rows; i++) {
    const row: SVector = [];
    for (let j = 0; j < cols; j++) row.push(Zero);
    m.push(row);
  }
  return m;
}

export function identitySMatrix(n: number): SMatrix {
  const m = zeroSMatrix(n, n);
  for (let i = 0; i < n; i++) m[i][i] = One;
  return m;
}

// ============== 符号矩阵运算 ==============
export function sTranspose(m: SMatrix): SMatrix {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  const result: SMatrix = [];
  for (let j = 0; j < cols; j++) {
    const row: SVector = [];
    for (let i = 0; i < rows; i++) row.push(m[i][j]);
    result.push(row);
  }
  return result;
}

export function sAdd(a: SMatrix, b: SMatrix): SMatrix {
  if (a.length !== b.length || a[0].length !== b[0].length) {
    throw new Error("矩阵加法要求同型矩阵");
  }
  return a.map((row, i) => row.map((v, j) => addExpr(v, b[i][j])));
}

export function sSubtract(a: SMatrix, b: SMatrix): SMatrix {
  if (a.length !== b.length || a[0].length !== b[0].length) {
    throw new Error("矩阵减法要求同型矩阵");
  }
  return a.map((row, i) => row.map((v, j) => subExpr(v, b[i][j])));
}

export function sMultiply(a: SMatrix, b: SMatrix): SMatrix {
  if (a[0].length !== b.length) {
    throw new Error("矩阵乘法要求 A 的列数等于 B 的行数");
  }
  const m = a.length;
  const n = b[0].length;
  const p = b.length;
  const result: SMatrix = [];
  for (let i = 0; i < m; i++) {
    const row: SVector = [];
    for (let j = 0; j < n; j++) {
      let sum: Expr = Zero;
      for (let k = 0; k < p; k++) {
        sum = addExpr(sum, mulExpr(a[i][k], b[k][j]));
      }
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

// 行列式（符号）—— 使用递展开，小矩阵可用
export function sDeterminant(m: SMatrix): Expr {
  const n = m.length;
  if (n === 0 || m[0].length !== n) throw new Error("行列式仅适用于方阵");
  if (n === 1) return m[0][0];
  if (n === 2) {
    // ad - bc
    return subExpr(mulExpr(m[0][0], m[1][1]), mulExpr(m[0][1], m[1][0]));
  }
  if (n === 3) {
    // Sarrus 法则
    const a=m[0][0], b=m[0][1], c=m[0][2];
    const d=m[1][0], e=m[1][1], f=m[1][2];
    const g=m[2][0], h=m[2][1], i=m[2][2];
    // aei + bfg + cdh - ceg - bdi - afh
    return addExpr(
      addExpr(mulExpr(mulExpr(a, e), i), mulExpr(mulExpr(b, f), g)),
      subExpr(
        mulExpr(mulExpr(c, d), h),
        addExpr(
          addExpr(mulExpr(mulExpr(c, e), g), mulExpr(mulExpr(b, d), i)),
          mulExpr(mulExpr(a, f), h)
        )
      )
    );
  }
  // 对于 n>3，使用高斯消元法（行变换记录略）计算
  return sDetGauss(m);
}

// 高斯消元法求行列式（符号）
function sDetGauss(m: SMatrix): Expr {
  const n = m.length;
  const mat = cloneSMatrix(m);
  let sign = 1;

  for (let col = 0; col < n; col++) {
    // 找主元（第一个非零）
    let pivotRow = -1;
    for (let i = col; i < n; i++) {
      if (!isZero(mat[i][col])) { pivotRow = i; break; }
    }
    if (pivotRow === -1) return Zero;

    if (pivotRow !== col) {
      [mat[col], mat[pivotRow]] = [mat[pivotRow], mat[col]];
      sign = -sign;
    }

    const pivot = mat[col][col];
    for (let i = col + 1; i < n; i++) {
      const factor = divExpr(negExpr(mat[i][col]), pivot);
      for (let j = col; j < n; j++) {
        mat[i][j] = addExpr(mat[i][j], mulExpr(factor, mat[col][j]));
      }
    }
  }

  let det = Num(sign);
  for (let i = 0; i < n; i++) {
    det = mulExpr(det, mat[i][i]);
  }
  return simplify(det);
}

// 符号矩阵的秩
export function sRank(m: SMatrix): number {
  const { rank } = sRref(m);
  return rank;
}

// 符号矩阵 RREF
export interface SRREFResult {
  rref: SMatrix;
  rank: number;
  pivotCols: number[];
}

export function sRref(m: SMatrix, augmentedCols: number = 0): SRREFResult {
  const mat = cloneSMatrix(m);
  const rows = mat.length;
  const totalCols = mat[0].length;
  const coeffCols = totalCols - augmentedCols;
  const pivotCols: number[] = [];

  let row = 0;
  for (let col = 0; col < coeffCols && row < rows; col++) {
    // 找主元
    let pivotRow = -1;
    for (let i = row; i < rows; i++) {
      if (!isZero(mat[i][col])) { pivotRow = i; break; }
    }
    if (pivotRow === -1) continue;

    if (pivotRow !== row) {
      [mat[row], mat[pivotRow]] = [mat[pivotRow], mat[row]];
    }

    // 主元行归一化
    const pivotVal = mat[row][col];
    if (!isOne(pivotVal)) {
      const inv = reciprocal(pivotVal);
      for (let j = col; j < totalCols; j++) {
        mat[row][j] = mulExpr(mat[row][j], inv);
      }
    }

    // 消去其他行
    for (let i = 0; i < rows; i++) {
      if (i === row) continue;
      const factor = negExpr(mat[i][col]);
      if (!isZero(factor)) {
        for (let j = col; j < totalCols; j++) {
          mat[i][j] = addExpr(mat[i][j], mulExpr(factor, mat[row][j]));
        }
      }
    }

    pivotCols.push(col);
    row++;
  }

  // 化简所有元素
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < totalCols; j++) {
      mat[i][j] = simplify(mat[i][j]);
    }
  }

  return { rref: mat, rank: pivotCols.length, pivotCols };
}

// 符号逆矩阵
export function sInverse(m: SMatrix): SMatrix | null {
  const n = m.length;
  if (n === 0 || m[0].length !== n) throw new Error("逆矩阵仅适用于方阵");

  const aug: SMatrix = [];
  for (let i = 0; i < n; i++) {
    const row = m[i].slice();
    for (let j = 0; j < n; j++) row.push(i === j ? One : Zero);
    aug.push(row);
  }

  const { rref: augRref, rank } = sRref(aug, n);
  if (rank < n) return null;

  const inv: SMatrix = [];
  for (let i = 0; i < n; i++) inv.push(augRref[i].slice(n));
  return inv;
}

// 符号矩阵的迹
export function sTrace(m: SMatrix): Expr {
  const n = Math.min(m.length, m[0].length);
  let sum: Expr = Zero;
  for (let i = 0; i < n; i++) sum = addExpr(sum, m[i][i]);
  return simplify(sum);
}
