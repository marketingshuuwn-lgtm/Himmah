import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { exportPayrollSif, exportAttendanceCsv } from "@/lib/hr/sif-export.functions";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function ExportSifButton({ periodMonth }: { periodMonth: string }) {
  const fn = useServerFn(exportPayrollSif);
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline" size="sm" disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fn({ data: { period_month: periodMonth } });
          download(res.filename, res.content, "text/plain;charset=utf-8");
          toast.success("تم توليد ملف SIF");
        } catch (e: any) {
          toast.error(e?.message || "فشل التصدير");
        } finally { setLoading(false); }
      }}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      تصدير SIF (WPS)
    </Button>
  );
}

export function ExportAttendanceCsvButton({ from, to }: { from: string; to: string }) {
  const fn = useServerFn(exportAttendanceCsv);
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline" size="sm" disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fn({ data: { from, to } });
          if (!res.content) { toast.info("لا توجد سجلات"); return; }
          download(res.filename, res.content, "text/csv;charset=utf-8");
          toast.success("تم تنزيل ملف الحضور");
        } catch (e: any) {
          toast.error(e?.message || "فشل التصدير");
        } finally { setLoading(false); }
      }}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      تنزيل CSV
    </Button>
  );
}
