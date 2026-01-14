
'use client';

import * as React from "react";
import { useParams } from "next/navigation";
import { doc, collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { postInvoice } from "@/features/sales/services/post-invoice.client";
import { InvoiceStatusChip } from "@/features/sales/components/invoice-status-chip";
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollectionQuery } from '@/hooks/use-collection-query';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Loader2 } from "lucide-react";
import { SalesInvoice } from "@/lib/types";


function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default function SalesInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const firestore = useFirestore();

  // ✅ Replace with your real contexts
  const companyId = "default";

  const invoiceRef = React.useMemo(
    () => doc(firestore, `salesInvoices/${invoiceId}`),
    [firestore, invoiceId]
  );

  const { data: invoice, loading, error } = useDoc<any>(invoiceRef);

  const [posting, setPosting] = React.useState(false);

  const status = (invoice?.status ?? "DRAFT") as string;
  
  const journalQ = React.useMemo(() => {
    if (!invoice?.voucherId) return null;
    const ref = collection(firestore, `companies/${companyId}/journal_entries`);
    return query(ref, where("voucherId", "==", invoice.voucherId), orderBy("lineNo", "asc"), limit(100));
  }, [companyId, invoice?.voucherId, firestore]);

  const movementsQ = React.useMemo(() => {
    if (!invoiceId) return null;
    const ref = collection(firestore, `companies/${companyId}/stock_movements`);
    return query(ref, where("refType", "==", "SALES_INVOICE"), where("refId", "==", invoiceId), limit(500));
  }, [companyId, invoiceId, firestore]);

  const { data: journalLines, loading: jLoading, error: jErr } = useCollectionQuery(
    journalQ,
    `journal:${companyId}:${invoice?.voucherId ?? "none"}`,
    { enabled: status === "POSTED" }
  );

  const { data: movements, loading: mLoading, error: mErr } = useCollectionQuery(
    movementsQ,
    `movements:${companyId}:${invoiceId}`,
    { enabled: status === "POSTED" }
  );
  const previewLoading = jLoading || mLoading;

  const subTotal = round2(
    (invoice?.items ?? []).reduce((s: number, it: any) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  );
  const gstTotal = round2(
    (invoice?.items ?? []).reduce((s: number, it: any) => {
      const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
      return s + amt * ((Number(it.gstRate) || 0) / 100);
    }, 0)
  );
  const discount = Number(invoice?.discount) || 0;
  const shipping = Number(invoice?.shipping) || 0;
  const grandTotal = round2(subTotal - discount + shipping + gstTotal);

  async function handlePost() {
    if (!invoiceId) return;
    setPosting(true);
    try {
      await postInvoice("default", invoiceId);
      // status will update live through onSnapshot()
    } catch (e: any) {
      // status will likely become FAILED and postError filled by function
      console.error(e);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Sales Invoice Detail" />
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Sales Invoice</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              ID: {invoiceId} {invoice?.invoiceNo ? ` • No: ${invoice.invoiceNo}` : ""}
            </div>
          </div>
          <InvoiceStatusChip status={status} />
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && <div className="text-sm flex items-center gap-2"><Loader2 className="animate-spin h-4 w-4" />Loading...</div>}
          {error && <div className="text-sm text-destructive">{String(error?.message ?? error)}</div>}

          {invoice && (
            <>
              {/* Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground text-xs">Invoice Date</div>
                  <div className="font-medium">{invoice.invoiceDate ?? "-"}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground text-xs">Customer</div>
                  <div className="font-medium">{invoice.customerId ?? "-"}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground text-xs">Warehouse</div>
                  <div className="font-medium">{invoice.warehouseId ?? "-"}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground text-xs">Voucher</div>
                  <div className="font-medium">{invoice.voucherId ?? "-"}</div>
                </div>
              </div>

              {/* Post error */}
              {invoice.postError && (
                <div className="border rounded-xl p-3 text-sm text-destructive bg-destructive/10">
                  <div className="font-medium">Posting Error</div>
                  <div className="mt-1 whitespace-pre-wrap">{invoice.postError}</div>
                </div>
              )}

              {/* Items */}
              <div className="border rounded-2xl p-3">
                <div className="font-medium mb-2">Items</div>
                <div className="space-y-2 text-sm">
                  {(invoice.items ?? []).map((it: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 border rounded-xl p-2">
                      <div className="md:col-span-6">
                        <div className="text-xs text-muted-foreground">Product</div>
                        <div className="font-medium">{it.productId}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs text-muted-foreground">Qty</div>
                        <div className="font-medium">{it.qty}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs text-muted-foreground">Rate</div>
                        <div className="font-medium">{it.rate}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs text-muted-foreground">GST%</div>
                        <div className="font-medium">{it.gstRate ?? 0}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">SubTotal</div>
                  <div className="font-semibold">{subTotal.toFixed(2)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">GST</div>
                  <div className="font-semibold">{gstTotal.toFixed(2)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">Grand Total</div>
                  <div className="font-semibold">{grandTotal.toFixed(2)}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {(status === "DRAFT" || status === "FAILED") && (
                  <Button onClick={handlePost} disabled={posting}>
                    {posting ? "Posting..." : status === "FAILED" ? "Retry Post" : "Post Invoice"}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Posting Preview */}
      {status === "POSTED" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Journal Entries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {jLoading && <div className="text-muted-foreground">Loading...</div>}
              {jErr && <div className="text-destructive">Error: {jErr.message}</div>}
              {journalLines.length === 0 && !jLoading && <div className="text-muted-foreground">No journal lines found.</div>}
              {journalLines.map((l) => (
                <div key={l.id} className="border rounded-xl p-2">
                  <div className="text-xs text-muted-foreground">Line {l.lineNo}</div>
                  <div className="font-medium">Ledger: {l.ledgerId}</div>
                  <div className="flex justify-between mt-1">
                    <span>DR: {Number(l.dr || 0).toFixed(2)}</span>
                    <span>CR: {Number(l.cr || 0).toFixed(2)}</span>
                  </div>
                  {l.narration ? <div className="text-xs text-muted-foreground mt-1">{l.narration}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Stock Movements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {mLoading && <div className="text-muted-foreground">Loading...</div>}
              {mErr && <div className="text-destructive">Error: {mErr.message}</div>}
              {movements.length === 0 && !mLoading && <div className="text-muted-foreground">No stock movements found.</div>}
              {movements.map((m) => (
                <div key={m.id} className="border rounded-xl p-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{m.type}</span>
                    <span className="text-muted-foreground">Qty: {m.qty}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Product: {m.productId} • Warehouse: {m.warehouseId}
                  </div>
                  {m.note ? <div className="text-xs text-muted-foreground mt-1">{m.note}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
