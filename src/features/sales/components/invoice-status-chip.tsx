
"use client";

export function InvoiceStatusChip({ status }: { status?: string }) {
  const s = status ?? "DRAFT";

  const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";
  if (s === "POSTED") return <span className={`${base} bg-green-100 text-green-700`}>POSTED</span>;
  if (s === "POSTING") return <span className={`${base} bg-blue-100 text-blue-700`}>POSTING</span>;
  if (s === "FAILED") return <span className={`${base} bg-red-100 text-red-700`}>FAILED</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>DRAFT</span>;
}
