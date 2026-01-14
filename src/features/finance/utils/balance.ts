export function toDrCr(amount: number) {
  // positive = DR, negative = CR (our convention)
  if (amount >= 0) return { dr: amount, cr: 0, type: "DR" as const };
  return { dr: 0, cr: Math.abs(amount), type: "CR" as const };
}

export function fmt2(n: any) {
  return Number(n || 0).toFixed(2);
}

export function netFromOpening(openingBalance: number, type: "DR" | "CR") {
  const amt = Number(openingBalance || 0);
  return type === "DR" ? amt : -amt;
}

export function toDrCrFromNet(net: number) {
  if (net >= 0) return { dr: net, cr: 0, type: "DR" as const };
  return { dr: 0, cr: Math.abs(net), type: "CR" as const };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
