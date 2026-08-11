import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import {
  listPendingCorrections, reviewAttendanceCorrection,
  type PendingCorrectionRow,
} from "@/lib/hr/attendance.functions";
import { fmtDate, fmtTime, fmtDateTime } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, Loader2, ShieldAlert, User2, Calendar, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance-corrections")({
  head: () => ({
    meta: [
      { title: "طلبات تصحيح الانصراف · ألامعا" },
      { name: "description", content: "مراجعة طلبات تصحيح وقت الانصراف من الموظفين" },
    ],
  }),
  component: Page,
});

function Page() {
  const user = useCurrentUser();
  if (!hasAnyRole(user, ["hr_admin", "dept_manager"])) {
    return (
      <div className="p-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6 flex items-center gap-3">
            <ShieldAlert className="size-5 text-destructive" />
            <p className="text-sm">هذه الصفحة مخصصة لمدير الموارد البشرية أو مدير القسم.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const canReview = hasAnyRole(user, ["hr_admin"]);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">طلبات تصحيح الانصراف</h1>
        <p className="text-sm text-muted-foreground">مراجعة طلبات الموظفين لتعديل وقت الانصراف عند النسيان.</p>
      </div>
      <Suspense fallback={<Loading />}>
        <CorrectionsList canReview={canReview} />
      </Suspense>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function CorrectionsList({ canReview }: { canReview: boolean }) {
  const fetcher = useServerFn(listPendingCorrections);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["pending-corrections"], queryFn: () => fetcher() }),
  );

  const pending = data.filter((r) => r.status === "pending");
  const done = data.filter((r) => r.status !== "pending");

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">
          قيد المراجعة {pending.length > 0 && <Badge variant="secondary" className="ms-2">{pending.length}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="history">السجل ({done.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="mt-4">
        {pending.length === 0 ? (
          <EmptyState msg="لا توجد طلبات بانتظار المراجعة" />
        ) : (
          <div className="grid gap-3">
            {pending.map((r) => <CorrectionCard key={r.permission_id} row={r} canReview={canReview} />)}
          </div>
        )}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        {done.length === 0 ? (
          <EmptyState msg="لا يوجد سجل سابق" />
        ) : (
          <div className="grid gap-3">
            {done.map((r) => <CorrectionCard key={r.permission_id} row={r} canReview={false} />)}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );
}

function statusBadge(s: PendingCorrectionRow["status"]) {
  if (s === "pending") return <Badge variant="outline" className="border-amber-400/60 text-amber-700 dark:text-amber-300"><Clock className="size-3 me-1" />قيد المراجعة</Badge>;
  if (s === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="size-3 me-1" />مقبول</Badge>;
  if (s === "rejected") return <Badge variant="destructive"><XCircle className="size-3 me-1" />مرفوض</Badge>;
  return <Badge variant="secondary">ملغى</Badge>;
}

function CorrectionCard({ row, canReview }: { row: PendingCorrectionRow; canReview: boolean }) {
  const [openReject, setOpenReject] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewAttendanceCorrection);
  const mut = useMutation({
    mutationFn: (vars: { action: "approve" | "reject"; note?: string }) =>
      reviewFn({ data: { permission_id: row.permission_id, action: vars.action, note: vars.note ?? null } }),
    onSuccess: (_res, vars) => {
      toast.success(vars.action === "approve" ? "تمت الموافقة" : "تم الرفض");
      qc.invalidateQueries({ queryKey: ["pending-corrections"] });
      setOpenReject(false);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <User2 className="size-4 text-muted-foreground" />
              {row.employee_name}
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><Calendar className="size-3" /><span dir="ltr" className="tabular-nums">{fmtDate(row.work_date)}</span></span>
              <span className="text-muted-foreground">·</span>
              <span dir="ltr" className="tabular-nums">
                {fmtTime(row.check_in_at)} <ArrowRight className="inline size-3 mx-1" /> {row.suggested_check_out}
              </span>
            </CardDescription>
          </div>
          {statusBadge(row.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground mb-1">سبب الطلب:</p>
          <p>{row.reason || "—"}</p>
        </div>
        {row.review_note && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">ملاحظة المراجع:</p>
            <p>{row.review_note}</p>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground" dir="ltr">
          أُنشئ: <span className="tabular-nums">{fmtDateTime(row.created_at)}</span>
          {row.reviewed_at && <> · روجع: <span className="tabular-nums">{fmtDateTime(row.reviewed_at)}</span></>}
        </p>
        {canReview && row.status === "pending" && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => mut.mutate({ action: "approve" })}
              disabled={mut.isPending}
            >
              {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              موافقة واعتماد الوقت
            </Button>
            <Dialog open={openReject} onOpenChange={setOpenReject}>
              <Button size="sm" variant="destructive" onClick={() => setOpenReject(true)} disabled={mut.isPending}>
                <XCircle className="size-4" /> رفض
              </Button>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>رفض طلب التصحيح</DialogTitle>
                  <DialogDescription>سبب الرفض سيظهر للموظف في الإشعار.</DialogDescription>
                </DialogHeader>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الرفض (اختياري)" />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenReject(false)}>إلغاء</Button>
                  <Button variant="destructive" onClick={() => mut.mutate({ action: "reject", note })} disabled={mut.isPending}>
                    {mut.isPending && <Loader2 className="size-4 animate-spin" />} تأكيد الرفض
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
