export function toDrCr(amount: number) {
  // positive = DR, negative = CR (our convention)
  if (amount >= 0) return { dr: amount, cr: 0, type: "DR" as const };
  return { dr: 0, cr: Math.abs(amount), type: "CR" as const };
}

export function fmt2(n: any) {
  return Number(n || 0).toFixed(2);
}
