import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import {
  searchAttendanceEdits,
  type AttendanceEditLogRow,
} from "@/lib/hr/attendance.functions";
import { listEmployeesLite } from "@/lib/hr/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert, Search, ArrowLeft, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance-audit")({
  head: () => ({
    meta: [
      { title: "سجل تعديلات الحضور · ألامعا" },
      {
        name: "description",
        content: "بحث وفلترة كل تعديلات الحضور حسب الموظف والحالة والفترة الزمنية",
      },
      { property: "og:title", content: "سجل تعديلات الحضور · ألامعا" },
      {
        property: "og:description",
        content: "تتبّع من عدّل سجل الحضور ومتى وما القيمة قبل وبعد التعديل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const FIELD_LABEL: Record<string, string> = {
  check_in_at: "وقت الحضور",
  check_out_at: "وقت الانصراف",
  status: "الحالة",
  late_minutes: "دقائق التأخير",
  late_deduction_amount: "خصم التأخير",
  early_leave_minutes: "دقائق الخروج المبكر",
  early_leave_deduction_amount: "خصم الخروج المبكر",
  notes: "ملاحظات",
};

const STATUS_LABEL: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  leave: "إجازة",
  early: "خروج مبكر",
  half_day: "نصف يوم",
};

function Page() {
  const user = useCurrentUser();
  const [employeeId, setEmployeeId] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const allowed = hasAnyRole(user, ["hr_admin", "owner", "admin", "dept_manager"]);

  const employees = useQuery({
    queryKey: ["employees-lite"],
    queryFn: () => listEmployeesLite(),
    enabled: allowed,
  });

  const logs = useQuery({
    queryKey: ["attendance-edits", employeeId, status, from, to, q],
    queryFn: () =>
      searchAttendanceEdits({
        data: {
          employee_id: employeeId === "all" ? null : employeeId,
          status: status === "all" ? null : status,
          from: from || null,
          to: to || null,
          q: q || null,
        },
      }),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="p-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6 flex items-center gap-3">
            <ShieldAlert className="size-5 text-destructive" />
            <p className="text-sm">هذا السجل مخصص للإدارة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = (logs.data ?? []) as AttendanceEditLogRow[];

  const reset = () => {
    setEmployeeId("all");
    setStatus("all");
    setFrom("");
    setTo("");
    setQ("");
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">سجل تعديلات الحضور</h1>
        <p className="text-sm text-muted-foreground">
          كل تعديل على سجلات الحضور: من قام به، متى، والقيمة قبل وبعد.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الفلاتر</CardTitle>
          <CardDescription>ابحث حسب الموظف أو الحالة أو الفترة الزمنية.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>الموظف</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {(employees.data ?? []).map((e: { id: string; label: string }) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>حالة اليوم</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>من تاريخ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>إلى تاريخ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>بحث</Label>
            <div className="relative">
              <Search className="absolute start-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="ps-8"
                placeholder="اسم الموظف أو السبب"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="size-4 me-1" /> إعادة ضبط الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            النتائج {rows.length ? <Badge variant="secondary">{rows.length}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد تعديلات مطابقة للفلاتر.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{r.employee_name}</span>
                  <Badge variant="outline">{r.work_date}</Badge>
                  <Badge variant="secondary">
                    {STATUS_LABEL[r.attendance_status] ?? r.attendance_status}
                  </Badge>
                  <span className="text-muted-foreground">بواسطة {r.actor_name}</span>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Riyadh",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                </div>
                {r.reason ? (
                  <p className="text-xs text-muted-foreground">السبب: {r.reason}</p>
                ) : null}
                <ul className="space-y-1">
                  {r.changes.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">
                        {FIELD_LABEL[c.field] ?? c.field}
                      </span>
                      <span className="line-through text-muted-foreground">{c.before ?? "—"}</span>
                      <ArrowLeft className="size-3" />
                      <span className="font-medium">{c.after ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
