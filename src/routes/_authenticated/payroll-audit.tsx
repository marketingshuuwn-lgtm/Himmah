import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { auditPayrollPeriod, type PayrollAuditResult } from "@/lib/hr/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll-audit")({
  head: () => ({
    meta: [
      { title: "تدقيق الرواتب · ألامعا" },
      {
        name: "description",
        content: "مطابقة كشوف الرواتب المولدة مع مصدر البيانات الفعلي للتأكد من عدم وجود اختلاف",
      },
      { property: "og:title", content: "تدقيق الرواتب · ألامعا" },
      {
        property: "og:description",
        content: "آخر وقت توليد للرواتب ومقارنة كل بند مع بيانات الحضور والمكافآت الحالية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const FIELD_LABEL: Record<string, string> = {
  base_salary: "الراتب الأساسي",
  allowances: "البدلات",
  bonuses_total: "المكافآت",
  deductions_total: "الخصومات",
  absence_days: "أيام الغياب",
  absence_deduction: "خصم الغياب",
  late_minutes: "دقائق التأخير",
  late_deduction: "خصم التأخير",
  net_salary: "الصافي",
};

const currentMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

function Page() {
  const user = useCurrentUser();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const allowed = hasAnyRole(user, ["hr_admin", "accountant", "owner", "admin"]);

  const audit = useQuery({
    queryKey: ["payroll-audit", month],
    queryFn: () => auditPayrollPeriod({ data: { period_month: `${month}-01` } }),
    enabled: allowed,
  });

  const res = audit.data as PayrollAuditResult | undefined;
  const diffCount = res?.diffs.length ?? 0;
  const missingCount = res?.missing_employees.length ?? 0;

  // Alert the moment a mismatch between the stored payroll and a fresh
  // recomputation from the source data is detected — once per period/result.
  const alertKey = `${month}:${diffCount}:${missingCount}`;
  const lastAlert = useRef<string | null>(null);
  useEffect(() => {
    if (!res || audit.isFetching) return;
    if (lastAlert.current === alertKey) return;
    lastAlert.current = alertKey;
    if (diffCount > 0 || missingCount > 0) {
      toast.error("اختلاف في تدقيق الرواتب", {
        description: `${diffCount} بند مختلف · ${missingCount} موظف بلا كشف — راجع التفاصيل أدناه.`,
        duration: 8000,
      });
    }
  }, [alertKey, res, audit.isFetching, diffCount, missingCount]);

  if (!allowed) {
    return (
      <div className="p-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6 flex items-center gap-3">
            <ShieldAlert className="size-5 text-destructive" />
            <p className="text-sm">هذه الصفحة مخصصة للموارد البشرية والمحاسبة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const clean = res && diffCount === 0 && missingCount === 0;


  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-bold">تدقيق الرواتب</h1>
          <p className="text-sm text-muted-foreground">
            مقارنة كشوف الرواتب المخزّنة مع إعادة الحساب من مصدر البيانات الحالي.
          </p>
        </div>
        <div className="ms-auto flex items-end gap-2">
          <div className="space-y-1.5">
            <Label>الشهر</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => audit.refetch()} disabled={audit.isFetching}>
            {audit.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {!audit.isLoading && (diffCount > 0 || missingCount > 0) ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-destructive">
                تنبيه: آخر حساب للرواتب لا يطابق بيانات المصدر
              </p>
              <p className="text-sm text-muted-foreground">
                تم رصد <b>{diffCount}</b> بند مختلف و<b>{missingCount}</b> موظف بلا كشف راتب لفترة{" "}
                {res?.period_month}. أعِد توليد الرواتب بعد مراجعة التفاصيل بالأسفل.
              </p>
              {res?.diffs.length ? (
                <ul className="text-xs text-muted-foreground list-disc ps-4 space-y-0.5">
                  {res.diffs.slice(0, 3).map((d, i) => (
                    <li key={i}>
                      {d.employee_name} — {FIELD_LABEL[d.field] ?? d.field}: {d.stored.toFixed(2)} →{" "}
                      {d.expected.toFixed(2)}
                    </li>
                  ))}
                  {res.diffs.length > 3 ? <li>و{res.diffs.length - 3} اختلاف آخر…</li> : null}
                </ul>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}



      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ملخص الفترة</CardTitle>
          <CardDescription>الفترة {res?.period_month ?? currentMonth()}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="آخر توليد"
            value={
              res?.last_generated_at
                ? new Date(res.last_generated_at).toLocaleString("en-GB", {
                    timeZone: "Asia/Riyadh",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })
                : "لم يتم التوليد بعد"
            }
          />
          <Stat label="السجلات المخزّنة" value={String(res?.stored_rows ?? 0)} />
          <Stat label="السجلات المتوقعة" value={String(res?.expected_rows ?? 0)} />
        </CardContent>
      </Card>

      {audit.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ التدقيق…
        </div>
      ) : clean ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-6 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <p className="text-sm">كل السجلات مطابقة تمامًا لمصدر البيانات — لا يوجد اختلاف.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {res?.missing_employees.length ? (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" /> موظفون بلا كشف راتب
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {res.missing_employees.map((n) => (
                  <Badge key={n} variant="outline">
                    {n}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {res?.diffs.length ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" /> اختلافات
                  <Badge variant="destructive">{res.diffs.length}</Badge>
                </CardTitle>
                <CardDescription>
                  القيمة المخزّنة مقابل القيمة الناتجة من إعادة الحساب الآن.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {res.diffs.map((d, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
                  >
                    <span className="font-medium">{d.employee_name}</span>
                    <Badge variant="secondary">{FIELD_LABEL[d.field] ?? d.field}</Badge>
                    <span className="text-muted-foreground line-through">
                      {d.stored.toFixed(2)}
                    </span>
                    <span className="font-semibold">{d.expected.toFixed(2)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  );
}
