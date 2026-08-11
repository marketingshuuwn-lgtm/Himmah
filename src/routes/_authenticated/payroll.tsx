import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  listBonuses,
  addBonus,
  deleteBonus,
  listDeductions,
  addDeduction,
  deleteDeduction,
  listPayrollRuns,
  generatePayroll,
  setPayrollLock,
  myPayroll,
  listEmployeesLite,
  type BonusRow,
  type DeductionRow,
  type PayrollRunRow,
} from "@/lib/hr/payroll.functions";
import {
  requestPayrollApproval,
  approveAndSendPayroll,
  employeeApprovePayroll,
  getPayrollSettings,
  updatePayrollSettings,
} from "@/lib/hr/payroll-approval.functions";
import {
  fmtMoney,
  fmtInt,
  fmtDate,
  fmtDateTime,
  fmtMonthLabel,
  monthKey,
} from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/excel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PayrollWorkflowDiagram } from "@/components/payroll-workflow-diagram";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  FileText,
  Download,
  Lock,
  LockOpen,
  CheckCircle2,
  AlertTriangle,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { ExportSifButton } from "@/components/export-buttons";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => ({ meta: [{ title: "الرواتب والمكافآت · علامة" }] }),
  component: PayrollPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

function PayrollPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const canManage = hasAnyRole(user, ["hr_admin", "accountant"]) && viewMode === "manager";
  const [period, setPeriod] = useState(() => monthKey());

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Wallet className="size-7 text-primary" />
            الرواتب والمكافآت
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            إدارة كشوف الرواتب الشهرية، المكافآت، والخصومات.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthPicker value={period} onChange={setPeriod} />
          {canManage && <ExportSifButton periodMonth={`${period}-01`} />}
        </div>
      </header>

      <Tabs defaultValue={canManage ? "runs" : "mine"} className="space-y-4">
        <TabsList className="bg-background border">
          <TabsTrigger value="mine">راتبي</TabsTrigger>
          {canManage && <TabsTrigger value="runs">كشوف الرواتب</TabsTrigger>}
          {canManage && <TabsTrigger value="bonuses">المكافآت</TabsTrigger>}
          {canManage && <TabsTrigger value="deductions">الخصومات</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
          <Suspense fallback={<Skeleton />}>
            <MyPayrollTab />
          </Suspense>
        </TabsContent>

        {canManage && (
          <>
            <TabsContent value="runs">
              <Suspense fallback={<Skeleton />}>
                <PayrollRunsTab period={period} />
              </Suspense>
            </TabsContent>
            <TabsContent value="bonuses">
              <Suspense fallback={<Skeleton />}>
                <BonusesTab period={period} kind="bonus" />
              </Suspense>
            </TabsContent>
            <TabsContent value="deductions">
              <Suspense fallback={<Skeleton />}>
                <BonusesTab period={period} kind="deduction" />
              </Suspense>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="min-h-[200px] flex items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // value is YYYY-MM-01 → render input type=month as YYYY-MM
  const monthValue = value.slice(0, 7);
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm text-muted-foreground">الشهر</Label>
      <Input
        type="month"
        value={monthValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange(`${v}-01`);
        }}
        className="w-40"
        lang="en"
      />
    </div>
  );
}

// ---------------- My Payroll ----------------
function MyPayrollTab() {
  const fetcher = useServerFn(myPayroll);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["payroll", "mine"], queryFn: () => fetcher(), staleTime: 30_000 }),
  );

  if (!data.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          لا توجد كشوف رواتب صادرة بعد.
        </CardContent>
      </Card>
    );
  }

  const latest = data[0];
  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-[image:var(--gradient-subtle)]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>راتب {fmtMonthLabel(latest.period_month)}</span>
            <Badge variant="secondary">{fmtDate(latest.generated_at)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
          <Stat label="الراتب الأساسي" value={fmtMoney(latest.base_salary)} />
          <Stat label="البدلات" value={fmtMoney(latest.allowances)} />
          <Stat label="المكافآت" value={fmtMoney(latest.bonuses_total)} tone="up" />
          <Stat
            label="إجمالي الخصومات"
            value={fmtMoney(
              latest.deductions_total + latest.absence_deduction + latest.late_deduction,
            )}
            tone="down"
          />
          <Stat label="أيام الغياب" value={fmtInt(latest.absence_days)} />
          <Stat label="دقائق التأخير" value={fmtInt(latest.late_minutes)} />
          <Stat label="خصم تأخير" value={fmtMoney(latest.late_deduction)} tone="down" />
          <Stat label="الصافي" value={fmtMoney(latest.net_salary)} highlight />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل الرواتب</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الشهر</TableHead>
                <TableHead className="text-right">أساسي</TableHead>
                <TableHead className="text-right">بدلات</TableHead>
                <TableHead className="text-right">مكافآت</TableHead>
                <TableHead className="text-right">خصومات</TableHead>
                <TableHead className="text-right">الصافي</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtMonthLabel(r.period_month)}</TableCell>
                  <TableCell>{fmtMoney(r.base_salary)}</TableCell>
                  <TableCell>{fmtMoney(r.allowances)}</TableCell>
                  <TableCell className="text-emerald-600">{fmtMoney(r.bonuses_total)}</TableCell>
                  <TableCell className="text-destructive">
                    {fmtMoney(r.deductions_total + r.absence_deduction + r.late_deduction)}
                  </TableCell>
                  <TableCell className="font-bold">{fmtMoney(r.net_salary)}</TableCell>
                  <TableCell>
                    {r.approval_status === "sent_to_employee" ? (
                      <Badge
                        className="bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        variant="secondary"
                      >
                        بانتظار اعتمادك
                      </Badge>
                    ) : r.approval_status === "employee_approved" ? (
                      <Badge
                        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        variant="secondary"
                      >
                        معتمدة
                      </Badge>
                    ) : r.approval_status === "employee_objected" ? (
                      <Badge
                        className="bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        variant="secondary"
                      >
                        اعتراضك قيد المراجعة
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-end">
                    <Link to="/payslip/$id" params={{ id: r.id }} target="_blank">
                      <Button variant="ghost" size="sm">
                        <FileText className="size-4" />
                        قسيمة
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 bg-card ${highlight ? "ring-2 ring-primary/40" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-bold mt-1 ${
          tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : ""
        } ${highlight ? "text-primary text-xl" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/** HR-configurable: which day of the month payroll auto-generates, and
 * whether the automatic run requires admin approval before reaching
 * employees (recommended: always on). */
function PayrollScheduleButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const getFn = useServerFn(getPayrollSettings);
  const saveFn = useServerFn(updatePayrollSettings);
  const { data } = useQuery({
    queryKey: ["payroll-settings"],
    queryFn: () => getFn(),
    enabled: open,
  });
  const [day, setDay] = useState("25");
  const [requireApproval, setRequireApproval] = useState(true);

  useEffect(() => {
    if (data) {
      setDay(String(data.auto_generate_day));
      setRequireApproval(data.auto_request_approval);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: { auto_generate_day: Number(day), auto_request_approval: requireApproval },
      }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات جدولة الرواتب");
      qc.invalidateQueries({ queryKey: ["payroll-settings"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="جدولة التوليد التلقائي للرواتب">
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>جدولة الرواتب التلقائية</DialogTitle>
          <DialogDescription>
            يتحقق النظام يومياً من هذا الإعداد؛ التوليد الفعلي يحدث فقط في اليوم المحدد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>يوم التوليد التلقائي (من الشهر)</Label>
            <Input
              type="number"
              min="1"
              max="28"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              محصور بين 1 و28 لتجنّب مشاكل الأشهر القصيرة.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>طلب اعتماد HR قبل الإرسال</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                موصى به دائماً — يمنع وصول أي كشف للموظف قبل مراجعته.
              </p>
            </div>
            <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Payroll Runs ----------------
function PayrollRunsTab({ period }: { period: string }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPayrollRuns);
  const genFn = useServerFn(generatePayroll);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["payroll", "runs", period],
      queryFn: () => listFn({ data: { period_month: period } }),
      staleTime: 30_000,
    }),
  );

  const generate = useMutation({
    mutationFn: () => genFn({ data: { period_month: period } }),
    onSuccess: (res: any) => {
      const skipped = res.skipped_locked ? ` (تم تخطي ${res.skipped_locked} كشف مقفل)` : "";
      toast.success(`تم توليد ${res.generated} كشف راتب${skipped}`);
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveSendFn = useServerFn(approveAndSendPayroll);
  const approveSend = useMutation({
    mutationFn: () => approveSendFn({ data: { period_month: period } }),
    onSuccess: (res: any) => {
      toast.success(`تم اعتماد وإرسال ${res.affected} كشف للموظفين`);
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = data.filter(
    (r: any) => r.approval_status === "draft" || r.approval_status === "pending_admin_approval",
  ).length;
  const sentCount = data.filter((r: any) =>
    ["sent_to_employee", "employee_approved", "employee_objected"].includes(r.approval_status),
  ).length;
  const objectedCount = data.filter((r: any) => r.approval_status === "employee_objected").length;
  const approvedCount = data.filter((r: any) => r.approval_status === "employee_approved").length;
  const draftCount = data.filter((r: any) => r.approval_status === "draft").length;
  const pendingApprovalCount = data.filter(
    (r: any) => r.approval_status === "pending_admin_approval",
  ).length;
  const sentToEmployeeCount = data.filter(
    (r: any) => r.approval_status === "sent_to_employee",
  ).length;

  const lockFn = useServerFn(setPayrollLock);
  const allLocked = data.length > 0 && data.every((r: any) => r.locked_at);
  const lockMut = useMutation({
    mutationFn: () => lockFn({ data: { period_month: period, locked: !allLocked } }),
    onSuccess: (res: any) => {
      toast.success(
        allLocked
          ? `تم فتح قفل ${res.affected} كشف`
          : `تم قفل ${res.affected} كشف — لن يُعاد توليدها`,
      );
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    return data.reduce(
      (acc, r) => {
        acc.net += r.net_salary;
        acc.base += r.base_salary + r.allowances;
        acc.bonus += r.bonuses_total;
        acc.ded += r.deductions_total + r.absence_deduction + r.late_deduction;
        return acc;
      },
      { net: 0, base: 0, bonus: 0, ded: 0 },
    );
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
        <Stat label="إجمالي الصافي" value={fmtMoney(totals.net)} highlight />
        <Stat label="الأساسي + البدلات" value={fmtMoney(totals.base)} />
        <Stat label="إجمالي المكافآت" value={fmtMoney(totals.bonus)} tone="up" />
        <Stat label="إجمالي الخصومات" value={fmtMoney(totals.ded)} tone="down" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">
            كشوف رواتب {fmtMonthLabel(period)} ({fmtInt(data.length)})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.length}
              onClick={() =>
                exportToExcel(
                  data.map((r) => ({
                    الموظف: r.employee_name,
                    الشهر: r.period_month,
                    الأساسي: r.base_salary,
                    البدلات: r.allowances,
                    المكافآت: r.bonuses_total,
                    "أيام الغياب": r.absence_days,
                    "خصم الغياب": r.absence_deduction,
                    "دقائق التأخير": r.late_minutes,
                    "خصم التأخير": r.late_deduction,
                    "خصومات أخرى": r.deductions_total,
                    الصافي: r.net_salary,
                  })),
                  `payroll-${period.slice(0, 7)}.xlsx`,
                )
              }
            >
              <Download className="size-4" />
              تصدير Excel
            </Button>
            <PayrollScheduleButton />
            <Button onClick={() => generate.mutate()} disabled={generate.isPending || allLocked}>
              {generate.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              توليد / إعادة توليد
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => approveSend.mutate()}
              disabled={approveSend.isPending || pendingCount === 0}
              title="يعتمد كل الكشوف بحالة مسودة/بانتظار الاعتماد ويرسلها فوراً للموظفين"
            >
              {approveSend.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              اعتماد وإرسال للموظفين {pendingCount > 0 && `(${pendingCount})`}
            </Button>
            <Button
              variant={allLocked ? "outline" : "secondary"}
              disabled={lockMut.isPending || data.length === 0}
              onClick={() => lockMut.mutate()}
              title={
                allLocked
                  ? "فتح القفل يسمح بإعادة توليد كشوف هذا الشهر"
                  : "القفل يعتمد كشوف هذا الشهر ويمنع الكتابة فوقها"
              }
            >
              {lockMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : allLocked ? (
                <LockOpen className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
              {allLocked ? "فتح القفل" : "قفل الشهر"}
            </Button>
          </div>
        </CardHeader>
        {data.length > 0 && (
          <div className="px-6 pb-4">
            <PayrollWorkflowDiagram
              counts={{
                draft: draftCount,
                pending_admin_approval: pendingApprovalCount,
                sent_to_employee: sentToEmployeeCount,
                employee_approved: approvedCount,
                employee_objected: objectedCount,
              }}
            />
          </div>
        )}
        {data.length > 0 && (
          <div className="px-6 pb-3 flex flex-wrap gap-2 text-xs" dir="rtl">
            {pendingCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-700 dark:text-amber-300"
              >
                {pendingCount} بانتظار الاعتماد
              </Badge>
            )}
            {sentCount > 0 && (
              <Badge variant="outline" className="border-sky-500/50 text-sky-700 dark:text-sky-300">
                {sentCount} أُرسل للموظفين
              </Badge>
            )}
            {approvedCount > 0 && (
              <Badge
                variant="outline"
                className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="size-3" /> {approvedCount} اعتمدها الموظف
              </Badge>
            )}
            {objectedCount > 0 && (
              <Badge
                variant="outline"
                className="border-rose-500/50 text-rose-700 dark:text-rose-300"
              >
                <AlertTriangle className="size-3" /> {objectedCount} اعتراض بانتظار المراجعة
              </Badge>
            )}
          </div>
        )}
        <CardContent className="p-0">
          {data.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد كشوف. اضغط "توليد" لإنشاء كشوف هذا الشهر.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">أساسي</TableHead>
                  <TableHead className="text-right">بدلات</TableHead>
                  <TableHead className="text-right">مكافآت</TableHead>
                  <TableHead className="text-right">غياب</TableHead>
                  <TableHead className="text-right">تأخير (د)</TableHead>
                  <TableHead className="text-right">خصومات</TableHead>
                  <TableHead className="text-right">الصافي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <PayrollRow key={r.id} row={r} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollRow({ row }: { row: PayrollRunRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="inline-flex items-center gap-1.5">
          {(row as { locked_at?: string | null }).locked_at ? (
            <Lock className="size-3.5 text-amber-600" aria-label="كشف مقفل" />
          ) : null}
          {row.employee_name}
        </span>
      </TableCell>
      <TableCell>{fmtMoney(row.base_salary)}</TableCell>
      <TableCell>{fmtMoney(row.allowances)}</TableCell>
      <TableCell className="text-emerald-600">{fmtMoney(row.bonuses_total)}</TableCell>
      <TableCell>{fmtInt(row.absence_days)}</TableCell>
      <TableCell>{fmtInt(row.late_minutes)}</TableCell>
      <TableCell className="text-destructive">
        {fmtMoney(row.deductions_total + row.absence_deduction + row.late_deduction)}
      </TableCell>
      <TableCell className="font-bold text-primary">{fmtMoney(row.net_salary)}</TableCell>
      <TableCell>
        {row.approval_status === "draft" ? (
          <Badge variant="outline" className="text-muted-foreground">
            مسودة
          </Badge>
        ) : row.approval_status === "pending_admin_approval" ? (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="secondary">
            بانتظار الاعتماد
          </Badge>
        ) : row.approval_status === "sent_to_employee" ? (
          <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300" variant="secondary">
            أُرسل للموظف
          </Badge>
        ) : row.approval_status === "employee_approved" ? (
          <Badge
            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            variant="secondary"
          >
            اعتمدها الموظف
          </Badge>
        ) : row.approval_status === "employee_objected" ? (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300" variant="secondary">
            اعتراض
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="text-end">
        <Link to="/payslip/$id" params={{ id: row.id }} target="_blank">
          <Button variant="ghost" size="sm">
            <FileText className="size-4" />
            قسيمة
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}

// ---------------- Bonuses / Deductions (shared shape) ----------------
function BonusesTab({ period, kind }: { period: string; kind: "bonus" | "deduction" }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(kind === "bonus" ? listBonuses : listDeductions);
  const addFn = useServerFn(kind === "bonus" ? addBonus : addDeduction);
  const delFn = useServerFn(kind === "bonus" ? deleteBonus : deleteDeduction);
  const empsFn = useServerFn(listEmployeesLite);

  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: [kind, period],
      queryFn: () => listFn({ data: { period_month: period } }),
      staleTime: 30_000,
    }),
  );
  const { data: emps } = useSuspenseQuery(
    queryOptions({
      queryKey: ["employees-lite"],
      queryFn: () => empsFn(),
      staleTime: 5 * 60_000,
    }),
  );

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          employee_id: employeeId,
          amount: Number(amount),
          reason,
          period_month: period,
        },
      }),
    onSuccess: () => {
      toast.success(kind === "bonus" ? "تمت إضافة المكافأة" : "تمت إضافة الخصم");
      setOpen(false);
      setEmployeeId("");
      setAmount("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: [kind] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      queryClient.invalidateQueries({ queryKey: [kind] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = useMemo(() => data.reduce((a, r) => a + r.amount, 0), [data]);
  const Icon = kind === "bonus" ? TrendingUp : TrendingDown;
  const isBonus = kind === "bonus";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4" dir="rtl">
        <Stat
          label={isBonus ? "إجمالي المكافآت" : "إجمالي الخصومات"}
          value={fmtMoney(total)}
          tone={isBonus ? "up" : "down"}
          highlight
        />
        <Stat label="عدد السجلات" value={fmtInt(data.length)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="size-5" />
            {isBonus ? "مكافآت" : "خصومات"} {fmtMonthLabel(period)}
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {isBonus ? "إضافة مكافأة" : "إضافة خصم"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  {isBonus ? "مكافأة جديدة" : "خصم جديد"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>الموظف</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر موظف" />
                    </SelectTrigger>
                    <SelectContent>
                      {emps.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>المبلغ (ر.س)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    lang="en"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>السبب</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={isBonus ? "أداء متميز، مشروع منجز…" : "غياب غير مبرر، مخالفة…"}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  onClick={() => add.mutate()}
                  disabled={!employeeId || !amount || Number(amount) <= 0 || add.isPending}
                >
                  {add.isPending && <Loader2 className="size-4 animate-spin" />}
                  حفظ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {data.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">لا توجد سجلات لهذا الشهر.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">السبب</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r: BonusRow | DeductionRow) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell
                      className={
                        isBonus
                          ? "text-emerald-600 font-semibold"
                          : "text-destructive font-semibold"
                      }
                    >
                      {fmtMoney(r.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.reason || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDateTime(r.created_at)}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => del.mutate(r.id)}
                        disabled={del.isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
