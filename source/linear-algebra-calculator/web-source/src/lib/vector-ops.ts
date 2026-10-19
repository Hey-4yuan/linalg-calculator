// 向量运算库
import { Fraction, FVector, toFVector } from "./fraction";

// 点积
export function dot(a: FVector, b: FVector): Fraction {
  if (a.length !== b.length) {
    throw new Error("点积要求向量维度相同");
  }
  let sum = Fraction.ZERO;
  for (let i = 0; i < a.length; i++) {
    sum = sum.add(a[i].mul(b[i]));
  }
  return sum;
}

// 叉积（仅三维）
export function cross(a: FVector, b: FVector): FVector {
  if (a.length !== 3 || b.length !== 3) {
    throw new Error("叉积仅适用于三维向量");
  }
  return [
    a[1].mul(b[2]).sub(a[2].mul(b[1])),
    a[2].mul(b[0]).sub(a[0].mul(b[2])),
    a[0].mul(b[1]).sub(a[1].mul(b[0])),
  ];
}

// 向量长度 / 模
export function magnitude(v: FVector): number {
  let sum = 0;
  for (const x of v) {
    sum += x.toDecimal() * x.toDecimal();
  }
  return Math.sqrt(sum);
}

// 单位化
export function normalize(v: FVector): number[] {
  const mag = magnitude(v);
  if (mag === 0) throw new Error("零向量不能单位化");
  return v.map((x) => x.toDecimal() / mag);
}

// 向量夹角（弧度）
export function angleBetween(a: FVector, b: FVector): number {
  const d = dot(a, b).toDecimal();
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) throw new Error("零向量无法计算夹角");
  const cos = d / (magA * magB);
  // 数值稳定性
  const clamped = Math.max(-1, Math.min(1, cos));
  return Math.acos(clamped);
}

// 线性组合 a·v + b·w
export function linearCombination(
  v: FVector,
  w: FVector,
  a: Fraction,
  b: Fraction
): FVector {
  if (v.length !== w.length) {
    throw new Error("线性组合要求向量维度相同");
  }
  const result: FVector = [];
  for (let i = 0; i < v.length; i++) {
    result.push(v[i].mul(a).add(w[i].mul(b)));
  }
  return result;
}

// 向量加法
export function addVectors(a: FVector, b: FVector): FVector {
  if (a.length !== b.length) {
    throw new Error("向量加法要求维度相同");
  }
  return a.map((v, i) => v.add(b[i]));
}

// 向量数乘
export function scalarMultiplyVector(v: FVector, s: Fraction): FVector {
  return v.map((x) => x.mul(s));
}

// 示例向量
export const EXAMPLE_VECTOR_A = toFVector([1, 2, 3]);
export const EXAMPLE_VECTOR_B = toFVector([4, 5, 6]);
