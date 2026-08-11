import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listAllDisputes,
  reviewDispute,
  type PayrollDisputeRow,
} from "@/lib/hr/payroll-disputes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, MessageSquareWarning, CheckCircle2, XCircle } from "lucide-react";
import { fmtDate, fmtMonthLabel } from "@/lib/utils/format";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/payroll-disputes")({
  component: PayrollDisputesPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">الصفحة غير موجودة</div>,
});

function PayrollDisputesPage() {
  const me = useCurrentUser();
  const canAccess = hasAnyRole(me, ["hr_admin", "accountant", "owner", "admin"]);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const listFn = useServerFn(listAllDisputes);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll-disputes", tab],
    queryFn: () => listFn({ data: { status: tab === "pending" ? "pending" : "all" } }),
    enabled: canAccess,
  });

  const [reviewing, setReviewing] = useState<PayrollDisputeRow | null>(null);

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          الصفحة متاحة لـ HR والمحاسب فقط.
        </CardContent></Card>
      </div>
    );
  }

  const pendingCount = (data ?? []).filter((d) => d.status === "pending").length;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareWarning className="size-6 text-primary" />
          اعتراضات الرواتب
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة الاعتراضات المفتوحة من الموظفين على قسائم رواتبهم.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">
            قيد المراجعة
            {pendingCount > 0 && (
              <Badge className="ms-2 bg-amber-500 text-white">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">الكل</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <CardHeader><CardTitle className="text-base">الاعتراضات</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
              ) : (data ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-10">لا توجد اعتراضات</div>
              ) : (
                <div className="space-y-3">
                  {(data ?? []).map((d) => (
                    <DisputeCard key={d.id} d={d} onReview={() => setReviewing(d)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {reviewing && (
        <ReviewDialog dispute={reviewing} onClose={() => setReviewing(null)} />
      )}
    </div>
  );
}

function DisputeCard({ d, onReview }: { d: PayrollDisputeRow; onReview: () => void }) {
  return (
    <div className="p-4 rounded-lg border bg-card/50 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium">{d.employee_name}</div>
          <div className="text-xs text-muted-foreground">
            شهر: <span dir="ltr">{fmtMonthLabel(d.period_month)}</span> · فُتح في {fmtDate(d.created_at)}
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>
      <div className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{d.reason}</div>
      {d.hr_response && (
        <div className="text-sm bg-primary/5 border-r-2 border-primary/40 pr-3 py-2">
          <span className="text-[11px] text-muted-foreground">رد HR:</span>
          <div>{d.hr_response}</div>
        </div>
      )}
      <div className="flex items-center gap-2 justify-end pt-1">
        <Link to="/payslip/$id" params={{ id: d.payroll_run_id }}>
          <Button size="sm" variant="outline">فتح القسيمة</Button>
        </Link>
        {d.status === "pending" && (
          <Button size="sm" onClick={onReview}>مراجعة</Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PayrollDisputeRow["status"] }) {
  if (status === "pending")
    return <Badge className="bg-amber-500 text-white">قيد المراجعة</Badge>;
  if (status === "accepted")
    return <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="size-3" />مقبول</Badge>;
  return <Badge className="bg-red-600 text-white gap-1"><XCircle className="size-3" />مرفوض</Badge>;
}

function ReviewDialog({ dispute, onClose }: { dispute: PayrollDisputeRow; onClose: () => void }) {
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewDispute);
  const [response, setResponse] = useState("");
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);

  const mut = useMutation({
    mutationFn: async () => reviewFn({ data: { id: dispute.id, status: decision!, hr_response: response } }),
    onSuccess: () => {
      toast.success("تم إرسال الرد للموظف");
      qc.invalidateQueries({ queryKey: ["payroll-disputes"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "تعذر الحفظ"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مراجعة اعتراض {dispute.employee_name}</DialogTitle>
          <DialogDescription>
            شهر <span dir="ltr">{fmtMonthLabel(dispute.period_month)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{dispute.reason}</div>
        <Textarea
          placeholder="ردّك للموظف (اختياري لكن مستحسن)"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={4}
        />
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button
            variant="destructive"
            onClick={() => { setDecision("rejected"); mut.mutate(); }}
            disabled={mut.isPending}
          >
            {mut.isPending && decision === "rejected" && <Loader2 className="size-4 animate-spin ml-1" />}
            رفض
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { setDecision("accepted"); mut.mutate(); }}
            disabled={mut.isPending}
          >
            {mut.isPending && decision === "accepted" && <Loader2 className="size-4 animate-spin ml-1" />}
            قبول
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
