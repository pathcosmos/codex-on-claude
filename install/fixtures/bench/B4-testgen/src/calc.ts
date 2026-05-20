// 12 pure functions for B4-testgen.
export const add = (a: number, b: number) => a + b;
export const sub = (a: number, b: number) => a - b;
export const mul = (a: number, b: number) => a * b;
export const div = (a: number, b: number) => (b === 0 ? NaN : a / b);
export const abs = (a: number) => (a < 0 ? -a : a);
export const max2 = (a: number, b: number) => (a > b ? a : b);
export const min2 = (a: number, b: number) => (a < b ? a : b);
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const isEven = (n: number) => n % 2 === 0;
export const isOdd = (n: number) => Math.abs(n) % 2 === 1;
export const sumArr = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const avg = (xs: number[]) => (xs.length === 0 ? NaN : sumArr(xs) / xs.length);
