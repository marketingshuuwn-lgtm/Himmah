import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useSuspenseQuery,
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Suspense, useState, useEffect } from "react";
import { toast } from "sonner";
import { getPayrollRun, getPayslipDetail } from "@/lib/hr/payroll.functions";
import { employeeApprovePayroll } from "@/lib/hr/payroll-approval.functions";
import {
  openPayrollDispute,
  myDisputesForRun,
  type PayrollDisputeRow,
} from "@/lib/hr/payroll-disputes.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Printer,
  ArrowRight,
  Loader2,
  MessageSquareWarning,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { fmtMoney, fmtInt, fmtDate, fmtDateTime, fmtMonthLabel } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/payslip/$id")({
  head: () => ({ meta: [{ title: "قسيمة الراتب · علامة" }] }),
  component: PayslipPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">القسيمة غير موجودة</div>,
});

function PayslipPage() {
  const { id } = Route.useParams();
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PayslipInner id={id} />
    </Suspense>
  );
}

function PayslipInner({ id }: { id: string }) {
  const fetcher = useServerFn(getPayrollRun);
  const { data: row } = useSuspenseQuery(
    queryOptions({
      queryKey: ["payslip", id],
      queryFn: () => fetcher({ data: { id } }),
      staleTime: 60_000,
    }),
  );

  return (
    <div className="bg-muted/30 min-h-screen print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/payroll">
          <Button variant="ghost" size="sm">
            <ArrowRight className="size-4" />
            رجوع للرواتب
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {row.approval_status === "sent_to_employee" && <ApprovePayslipButton payrollRunId={id} />}
          <DisputeSection payrollRunId={id} disabled={row.approval_status !== "sent_to_employee"} />
          <DetailedPdfButton id={id} />
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            تنزيل / طباعة PDF
          </Button>
        </div>
      </div>

      {row.approval_status === "employee_approved" && (
        <div className="print:hidden mx-4 mt-3 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-400/40 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          اعتمدت هذه القسيمة{" "}
          {row.employee_decided_at ? `— ${fmtDateTime(row.employee_decided_at)}` : ""}
        </div>
      )}
      {row.approval_status === "employee_objected" && (
        <div className="print:hidden mx-4 mt-3 rounded-lg bg-amber-500/10 ring-1 ring-amber-400/40 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          اعتراضك قيد المراجعة من الموارد البشرية
        </div>
      )}

      <div className="max-w-3xl mx-auto p-6 print:p-0">
        <article className="bg-card rounded-lg shadow-sm border print:border-0 print:shadow-none print:rounded-none p-8 print:p-10 print-page">
          {/* Header */}
          <header className="flex items-start justify-between pb-6 border-b">
            <div className="flex items-center gap-3">
              <img src={brand.mark} alt={brand.nameLatin} className="size-12" />
              <div>
                <h1 className="text-xl font-bold leading-tight">{brand.name}</h1>
                <p className="text-xs tracking-[0.3em] text-muted-foreground">{brand.nameLatin}</p>
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs text-muted-foreground">قسيمة راتب</p>
              <p className="font-semibold">{fmtMonthLabel(row.period_month)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                رقم: {row.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </header>

          {/* Employee block */}
          <section className="grid grid-cols-2 gap-x-8 gap-y-3 py-6 border-b text-sm" dir="rtl">
            <Field label="اسم الموظف" value={row.employee_name} />
            <Field label="تاريخ الإصدار" value={fmtDate(row.generated_at)} />
            <Field label="الشهر" value={fmtMonthLabel(row.period_month)} />
            <Field label="أيام العمل المحسوبة" value={fmtInt(row.absence_days)} />
          </section>

          {/* Earnings & Deductions */}
          <section className="grid grid-cols-2 gap-6 py-6" dir="rtl">
            <div>
              <h2 className="text-sm font-bold mb-3 text-emerald-700">المستحقات</h2>
              <Line label="الراتب الأساسي" value={fmtMoney(row.base_salary)} />
              <Line label="البدلات" value={fmtMoney(row.allowances)} />
              <Line label="المكافآت" value={fmtMoney(row.bonuses_total)} />
              <Line
                label="إجمالي المستحقات"
                value={fmtMoney(row.base_salary + row.allowances + row.bonuses_total)}
                bold
              />
            </div>
            <div>
              <h2 className="text-sm font-bold mb-3 text-destructive">الخصومات</h2>
              <Line label="خصومات عامة" value={fmtMoney(row.deductions_total)} />
              <Line
                label={`غياب (${fmtInt(row.absence_days)} يوم)`}
                value={fmtMoney(row.absence_deduction)}
              />
              <Line
                label={`تأخير (${fmtInt(row.late_minutes)} دقيقة)`}
                value={fmtMoney(row.late_deduction)}
              />
              <Line
                label="إجمالي الخصومات"
                value={fmtMoney(row.deductions_total + row.absence_deduction + row.late_deduction)}
                bold
              />
            </div>
          </section>

          {/* Detailed deduction breakdown — printed with the payslip once loaded */}
          <DetailedBreakdown id={id} />

          {/* Net */}
          <section className="py-6 border-t border-b border-double border-foreground/30">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold">صافي الراتب</span>
              <span className="text-2xl font-extrabold text-primary">
                {fmtMoney(row.net_salary)}
              </span>
            </div>
          </section>

          {/* Signatures */}
          <section className="grid grid-cols-2 gap-12 pt-12 text-sm" dir="rtl">
            <SignatureBlock label="المحاسب" />
            <SignatureBlock label="المدير" />
          </section>

          {/* Footer */}
          <footer className="mt-10 pt-4 border-t text-[10px] text-muted-foreground text-center">
            هذه القسيمة صادرة إلكترونياً من نظام {brand.name} ولا تحتاج لتوقيع مادي.
          </footer>
        </article>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 border-b border-dashed ${
        bold ? "font-bold border-foreground/40 mt-2" : "text-sm"
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="h-16 border-b border-foreground/40 mb-2" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ApprovePayslipButton({ payrollRunId }: { payrollRunId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(employeeApprovePayroll);
  const mut = useMutation({
    mutationFn: () => fn({ data: { payroll_run_id: payrollRunId } }),
    onSuccess: () => {
      toast.success("تم اعتماد القسيمة ✓");
      qc.invalidateQueries({ queryKey: ["payslip", payrollRunId] });
      qc.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      className="bg-emerald-600 hover:bg-emerald-700"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      <CheckCircle2 className="size-4" />
      اعتماد القسيمة
    </Button>
  );
}

function DisputeSection({ payrollRunId, disabled }: { payrollRunId: string; disabled?: boolean }) {
  const listFn = useServerFn(myDisputesForRun);
  const openFn = useServerFn(openPayrollDispute);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { data } = useQuery({
    queryKey: ["my-disputes", payrollRunId],
    queryFn: () => listFn({ data: { payroll_run_id: payrollRunId } }),
  });

  const latest: PayrollDisputeRow | undefined = data?.[0];
  const pending = latest?.status === "pending";

  const mut = useMutation({
    mutationFn: () => openFn({ data: { payroll_run_id: payrollRunId, reason } }),
    onSuccess: () => {
      toast.success("تم إرسال اعتراضك — سيتم إشعارك بالرد");
      qc.invalidateQueries({ queryKey: ["my-disputes", payrollRunId] });
      setOpen(false);
      setReason("");
    },
    onError: (e: any) => toast.error(e.message ?? "تعذر الإرسال"),
  });

  return (
    <>
      {latest && <StatusPill status={latest.status} />}
      <Button
        variant={pending ? "outline" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
        disabled={pending || disabled}
      >
        <MessageSquareWarning className="size-4" />
        {pending ? "لديك اعتراض قيد المراجعة" : "فتح اعتراض"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>فتح اعتراض على قسيمة الراتب</DialogTitle>
            <DialogDescription>
              اشرح بالتفصيل سبب الاعتراض (خصم غير صحيح، تأخير غير محتسب، مكافأة ناقصة…). سيصلك إشعار
              عند الرد.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اكتب تفاصيل الاعتراض هنا…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={reason.trim().length < 5 || mut.isPending}
            >
              {mut.isPending && <Loader2 className="size-4 animate-spin ml-1" />}
              إرسال الاعتراض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusPill({ status }: { status: PayrollDisputeRow["status"] }) {
  if (status === "pending") return <Badge className="bg-amber-500 text-white">قيد المراجعة</Badge>;
  if (status === "accepted")
    return (
      <Badge className="bg-emerald-600 text-white gap-1">
        <CheckCircle2 className="size-3" />
        مقبول
      </Badge>
    );
  return (
    <Badge className="bg-red-600 text-white gap-1">
      <XCircle className="size-3" />
      مرفوض
    </Badge>
  );
}

/**
 * Toggles the day-by-day deduction breakdown and immediately opens the print
 * dialog so the exported PDF contains the detailed section.
 */
function DetailedPdfButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getPayslipDetail);
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await qc.fetchQuery({
            queryKey: ["payslip-detail", id],
            queryFn: () => fetchDetail({ data: { id } }),
          });
          window.dispatchEvent(new CustomEvent("payslip:show-detail"));
          setTimeout(() => window.print(), 350);
        } catch (e: any) {
          toast.error(e?.message ?? "تعذر تجهيز التفاصيل");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
      تصدير PDF مفصّل
    </Button>
  );
}

const DAY_STATUS_LABEL: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  early: "مبكر",
  half_day: "نصف يوم",
  absent: "غائب",
  leave: "إجازة",
};

function DetailedBreakdown({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  const fetchDetail = useServerFn(getPayslipDetail);

  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener("payslip:show-detail", on);
    return () => window.removeEventListener("payslip:show-detail", on);
  }, []);

  const { data } = useQuery({
    queryKey: ["payslip-detail", id],
    queryFn: () => fetchDetail({ data: { id } }),
    enabled: show,
  });

  if (!show) return null;
  if (!data) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = data.days.filter(
    (d) => d.late_deduction > 0 || d.early_leave_deduction > 0 || d.status === "absent",
  );

  return (
    <section className="py-6 border-t" dir="rtl">
      <h2 className="text-sm font-bold mb-3">تفصيل الخصومات اليومية</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد خصومات حضور هذا الشهر.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-start py-1.5">التاريخ</th>
              <th className="text-start">الحالة</th>
              <th className="text-start">تأخير (د)</th>
              <th className="text-start">خصم التأخير</th>
              <th className="text-start">خروج مبكر (د)</th>
              <th className="text-start">خصم الخروج المبكر</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.work_date} className="border-b border-dashed">
                <td className="py-1.5 num" dir="ltr">
                  {fmtDate(d.work_date)}
                </td>
                <td>{DAY_STATUS_LABEL[d.status] ?? d.status}</td>
                <td className="num">{fmtInt(d.late_minutes)}</td>
                <td className="num">{fmtMoney(d.late_deduction)}</td>
                <td className="num">{fmtInt(d.early_leave_minutes)}</td>
                <td className="num">{fmtMoney(d.early_leave_deduction)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-1.5" colSpan={2}>
                الإجمالي
              </td>
              <td className="num">{fmtInt(data.totals.late_minutes)}</td>
              <td className="num">{fmtMoney(data.totals.late_deduction)}</td>
              <td className="num">{fmtInt(data.totals.early_leave_minutes)}</td>
              <td className="num">{fmtMoney(data.totals.early_leave_deduction)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {(data.bonuses.length > 0 || data.deductions.length > 0) && (
        <div className="grid grid-cols-2 gap-6 mt-5">
          <div>
            <h3 className="text-xs font-bold mb-2 text-emerald-700">تفصيل المكافآت</h3>
            {data.bonuses.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">لا توجد.</p>
            ) : (
              data.bonuses.map((b, i) => (
                <Line key={i} label={b.reason} value={fmtMoney(b.amount)} />
              ))
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold mb-2 text-destructive">تفصيل الخصومات العامة</h3>
            {data.deductions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">لا توجد.</p>
            ) : (
              data.deductions.map((b, i) => (
                <Line key={i} label={b.reason} value={fmtMoney(b.amount)} />
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
