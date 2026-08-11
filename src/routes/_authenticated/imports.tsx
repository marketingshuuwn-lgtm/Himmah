import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listImportBatches, reviewImportBatch } from "@/lib/hr/imports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Upload, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ImportDialog } from "@/components/import-dialog";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/imports")({
  component: ImportsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">الصفحة غير موجودة</div>,
});

function ImportsPage() {
  const me = useCurrentUser();
  const canReview = hasAnyRole(me, ["hr_admin", "dept_manager", "admin", "owner"]);
  const listFn = useServerFn(listImportBatches);
  const reviewFn = useServerFn(reviewImportBatch);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => listFn(),
  });
  const reviewMut = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject"; note?: string }) => reviewFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["import-batches"] }); toast.success("تمت العملية"); },
    onError: (e: any) => toast.error(e?.message ?? "فشلت المراجعة"),
  });
  const [note, setNote] = useState<Record<string, string>>({});

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="size-6 text-primary" />
            الاستيراد ومراجعة الدفعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            استيراد Excel لسجلات الحضور وبيانات الموظفين مع سير موافقة.
          </p>
        </div>
        <div className="flex gap-2">
          <ImportDialog kind="attendance" onDone={() => qc.invalidateQueries({ queryKey: ["import-batches"] })} trigger={
            <Button variant="outline" className="gap-2"><Upload className="size-4" /> استيراد حضور</Button>
          } />
          {hasAnyRole(me, ["hr_admin", "admin", "owner"]) && (
            <ImportDialog kind="employees" onDone={() => qc.invalidateQueries({ queryKey: ["import-batches"] })} trigger={
              <Button className="gap-2"><Upload className="size-4" /> استيراد موظفين</Button>
            } />
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">آخر الدفعات</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : !data?.length ? (
            <div className="text-center py-10 text-muted-foreground">لا توجد دفعات حتى الآن</div>
          ) : (
            <div className="space-y-3">
              {data.map((b: any) => (
                <div key={b.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {b.kind === "attendance" ? "حضور" : "موظفون"}
                        <StatusBadge s={b.status} />
                        <span className="text-xs text-muted-foreground">{b.filename ?? ""}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        بواسطة {b.submitter_name} · {new Date(b.created_at).toLocaleString("ar-SA")}
                        {" · "}
                        {b.applied_count}/{b.total_count} صف
                      </div>
                      {b.review_note && <div className="text-xs mt-1">📝 {b.review_note}</div>}
                    </div>
                    {canReview && b.status === "pending" && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <input
                          placeholder="ملاحظة (اختياري)"
                          className="text-xs rounded border px-2 py-1 bg-background"
                          value={note[b.id] ?? ""}
                          onChange={(e) => setNote({ ...note, [b.id]: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={() => reviewMut.mutate({ id: b.id, action: "reject", note: note[b.id] })}>
                            <X className="size-3" /> رفض
                          </Button>
                          <Button size="sm" onClick={() => reviewMut.mutate({ id: b.id, action: "approve", note: note[b.id] })}>
                            <Check className="size-3" /> موافقة
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { l: string; c: string }> = {
    pending: { l: "معلّق", c: "bg-amber-500 text-white" },
    approved: { l: "موافَق", c: "bg-emerald-600 text-white" },
    applied: { l: "مطبَّق", c: "bg-emerald-700 text-white" },
    partial: { l: "مطبَّق جزئياً", c: "bg-sky-600 text-white" },
    rejected: { l: "مرفوض", c: "bg-red-600 text-white" },
  };
  const v = map[s] ?? { l: s, c: "bg-muted" };
  return <Badge className={v.c}>{v.l}</Badge>;
}
