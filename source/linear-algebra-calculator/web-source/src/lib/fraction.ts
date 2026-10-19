// Fraction - 精确分数运算类
// 所有线性代数运算底层使用分数计算，展示时再按偏好转为小数或保留分数

export type Scalar = Fraction | number | string;

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

export class Fraction {
  readonly num: number; // 分子
  readonly den: number; // 分母（正）

  constructor(num: number, den: number = 1) {
    if (den === 0) {
      throw new Error("分母不能为 0");
    }
    // 统一分母为正
    if (den < 0) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den);
    this.num = num / g;
    this.den = den / g;
  }

  static ZERO = new Fraction(0, 1);
  static ONE = new Fraction(1, 1);
  static NEG_ONE = new Fraction(-1, 1);

  static from(v: Scalar): Fraction {
    if (v instanceof Fraction) return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("无效数值");
      // 处理小数：转分数
      if (Number.isInteger(v)) return new Fraction(v, 1);
      const str = v.toString();
      return Fraction.fromString(str);
    }
    return Fraction.fromString(v);
  }

  static fromString(s: string): Fraction {
    s = s.trim();
    if (s === "" || s === "-") return Fraction.ZERO;
    // 分数形式 a/b
    if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length !== 2) throw new Error(`无效分数: ${s}`);
      const num = parseFloat(parts[0].trim());
      const den = parseFloat(parts[1].trim());
      if (isNaN(num) || isNaN(den)) throw new Error(`无效分数: ${s}`);
      // 处理分子/分母为小数的情况
      return new Fraction(num, den);
    }
    // 小数
    const n = parseFloat(s);
    if (isNaN(n)) throw new Error(`无效数值: ${s}`);
    return Fraction.fromDecimal(n);
  }

  static fromDecimal(n: number): Fraction {
    if (Number.isInteger(n)) return new Fraction(n, 1);
    const str = n.toString();
    const dotIdx = str.indexOf(".");
    const decimalPlaces = str.length - dotIdx - 1;
    const multiplier = Math.pow(10, decimalPlaces);
    const num = Math.round(n * multiplier);
    return new Fraction(num, multiplier);
  }

  // 解析单元格输入，失败返回 null
  static safeParse(s: string): Fraction | null {
    try {
      return Fraction.fromString(s);
    } catch {
      return null;
    }
  }

  isZero(): boolean {
    return this.num === 0;
  }

  isOne(): boolean {
    return this.num === 1 && this.den === 1;
  }

  isNegOne(): boolean {
    return this.num === -1 && this.den === 1;
  }

  isInteger(): boolean {
    return this.den === 1;
  }

  isNegative(): boolean {
    return this.num < 0;
  }

  abs(): Fraction {
    return new Fraction(Math.abs(this.num), this.den);
  }

  neg(): Fraction {
    return new Fraction(-this.num, this.den);
  }

  reciprocal(): Fraction {
    if (this.isZero()) throw new Error("零没有倒数");
    return new Fraction(this.den, this.num);
  }

  sign(): number {
    if (this.num === 0) return 0;
    return this.num < 0 ? -1 : 1;
  }

  add(other: Scalar): Fraction {
    const o = Fraction.from(other);
    return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  sub(other: Scalar): Fraction {
    const o = Fraction.from(other);
    return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  mul(other: Scalar): Fraction {
    const o = Fraction.from(other);
    return new Fraction(this.num * o.num, this.den * o.den);
  }

  div(other: Scalar): Fraction {
    const o = Fraction.from(other);
    if (o.isZero()) throw new Error("除以零");
    return new Fraction(this.num * o.den, this.den * o.num);
  }

  pow(n: number): Fraction {
    if (!Number.isInteger(n) || n < 0) {
      // 负指数或非整数：用小数近似
      const val = Math.pow(this.toDecimal(), n);
      return Fraction.fromDecimal(val);
    }
    return new Fraction(Math.pow(this.num, n), Math.pow(this.den, n));
  }

  equals(other: Scalar): boolean {
    const o = Fraction.from(other);
    return this.num === o.num && this.den === o.den;
  }

  compare(other: Scalar): number {
    const o = Fraction.from(other);
    return this.num * o.den - o.num * this.den;
  }

  toDecimal(): number {
    return this.num / this.den;
  }

  // 分数形式字符串
  toFractionString(): string {
    if (this.den === 1) return this.num.toString();
    return `${this.num}/${this.den}`;
  }

  // 小数形式字符串（保留精度）
  toDecimalString(precision: number = 6): string {
    if (this.den === 1) return this.num.toString();
    const val = this.toDecimal();
    // 去除末尾多余的 0
    let str = val.toFixed(precision);
    str = str.replace(/\.?0+$/, "");
    return str;
  }

  toString(opts: { fraction?: boolean; precision?: number } = {}): string {
    if (opts.fraction) return this.toFractionString();
    return this.toDecimalString(opts.precision ?? 6);
  }

  // 用于行变换描述的简洁表达，例如 "3" / "-2" / "1/3" / "-1/2"
  toCoeffString(): string {
    if (this.isOne()) return "";
    if (this.isNegOne()) return "-";
    return this.toFractionString();
  }
}

// 工具：二维数组类型
export type FMatrix = Fraction[][];
export type FVector = Fraction[];

// 从 number[][] / string[][] 创建 FMatrix
export function toFMatrix(data: (number | string)[][]): FMatrix {
  return data.map((row) => row.map((v) => Fraction.from(v)));
}

export function toFVector(data: (number | string)[]): FVector {
  return data.map((v) => Fraction.from(v));
}

// 深拷贝矩阵
export function cloneMatrix(m: FMatrix): FMatrix {
  return m.map((row) => row.slice());
}

// 零矩阵
export function zeroMatrix(rows: number, cols: number): FMatrix {
  const m: FMatrix = [];
  for (let i = 0; i < rows; i++) {
    const row: FVector = [];
    for (let j = 0; j < cols; j++) row.push(Fraction.ZERO);
    m.push(row);
  }
  return m;
}

// 单位矩阵
export function identityMatrix(n: number): FMatrix {
  const m = zeroMatrix(n, n);
  for (let i = 0; i < n; i++) m[i][i] = Fraction.ONE;
  return m;
}

// 随机矩阵
export function randomMatrix(rows: number, cols: number, max = 9): FMatrix {
  const m: FMatrix = [];
  for (let i = 0; i < rows; i++) {
    const row: FVector = [];
    for (let j = 0; j < cols; j++) {
      const val = Math.floor(Math.random() * (max * 2 + 1)) - max;
      row.push(new Fraction(val, 1));
    }
    m.push(row);
  }
  return m;
}

// 转置
export function transpose(m: FMatrix): FMatrix {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  const result: FMatrix = [];
  for (let j = 0; j < cols; j++) {
    const row: FVector = [];
    for (let i = 0; i < rows; i++) row.push(m[i][j]);
    result.push(row);
  }
  return result;
}
