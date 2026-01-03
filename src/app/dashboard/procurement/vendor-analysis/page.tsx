import { PageHeader } from '@/components/page-header';

export default function VendorAnalysisPage() {
  return (
    <>
      <PageHeader title="Vendor Analysis" />
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-2xl font-bold tracking-tight">
            No vendor analysis data
          </h3>
          <p className="text-sm text-muted-foreground">
            Analyze and compare vendor performance here.
          </p>
        </div>
      </div>
    </>
  );
}
