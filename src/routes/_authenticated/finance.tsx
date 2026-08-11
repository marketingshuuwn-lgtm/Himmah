import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, Coins, TrendingUp, Building2, Users, ArrowRight } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getFinanceDashboard } from "@/lib/hr/finance.functions";
import { fmtMoney, fmtInt, fmtMonthLabel } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
});

function FinancePage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const mayView =
    hasAnyRole(user, ["hr_admin", "accountant", "owner", "admin"]) && viewMode === "manager";
  const fn = useServerFn(getFinanceDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: () => fn(),
    enabled: mayView,
  });

  if (!mayView) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center py-16">
        <p className="text-muted-foreground">
          هذه الصفحة متاحة لفريق المالية والموارد البشرية فقط.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Wallet className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">اللوحة المالية</h1>
            <p className="text-sm text-muted-foreground">
              الرواتب المستحقة والمتوقعة — محسوبة من نفس محرك الرواتب الفعلي.
            </p>
          </div>
        </div>
        <Link to="/payroll">
          <button className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            كشوف الرواتب <ArrowRight className="size-3.5" />
          </button>
        </Link>
      </header>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" dir="rtl">
            <KpiTile
              icon={Wallet}
              tone="emerald"
              label={`المستحق حتى ${data.as_of}`}
              value={fmtMoney(data.totals.owed_to_date)}
            />
            <KpiTile
              icon={Coins}
              tone="primary"
              label="المتوقع لنهاية الشهر"
              value={fmtMoney(data.totals.projected_month_end)}
            />
            <KpiTile
              icon={TrendingUp}
              tone="rose"
              label="خصومات الغياب والتأخير"
              value={fmtMoney(
                data.totals.total_absence_deduction + data.totals.total_late_deduction,
              )}
            />
            <KpiTile
              icon={Users}
              tone="sky"
              label="عدد الموظفين النشطين"
              value={fmtInt(data.employees.length)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Historical trend */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  اتجاه إجمالي الرواتب المصروفة — آخر 6 أشهر
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64 pt-2">
                {data.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-16">
                    لا توجد كشوف رواتب مغلقة بعد لعرض الاتجاه.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.history}
                      margin={{ top: 5, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(m: string) => fmtMonthLabel(m)}
                      />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtInt(v)} />
                      <Tooltip
                        labelFormatter={(m) => fmtMonthLabel(String(m))}
                        formatter={(v: number) => [fmtMoney(v), "الإجمالي المصروف"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total_paid"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Department cost breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  التكلفة المتوقعة حسب القسم
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64 pt-2">
                {data.by_department.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-16">
                    لا توجد أقسام بها موظفون بعد.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.by_department}
                      layout="vertical"
                      margin={{ top: 5, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: number) => fmtInt(v)}
                      />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                      <Tooltip
                        formatter={(v: number) => [fmtMoney(v), "المتوقع"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar
                        dataKey="projected_month_end"
                        fill="hsl(var(--primary))"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-employee table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">تفصيل حسب الموظف</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">الموظف</TableHead>
                    <TableHead className="text-start">القسم</TableHead>
                    <TableHead className="text-start">الأساسي</TableHead>
                    <TableHead className="text-start">المستحق حتى اليوم</TableHead>
                    <TableHead className="text-start">المتوقع لنهاية الشهر</TableHead>
                    <TableHead className="text-start">أيام غياب</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.employees.map((e) => (
                    <TableRow key={e.employee_id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/employees/$employeeId"
                          params={{ employeeId: e.employee_id }}
                          className="hover:underline hover:text-primary"
                        >
                          {e.full_name}
                        </Link>
                        <span className="text-xs text-muted-foreground font-mono ms-2">
                          {e.employee_no}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.department_name ?? "—"}
                      </TableCell>
                      <TableCell>{fmtMoney(e.base_salary)}</TableCell>
                      <TableCell>{fmtMoney(e.owed_to_date)}</TableCell>
                      <TableCell className="font-semibold">
                        {fmtMoney(e.projected_month_end)}
                      </TableCell>
                      <TableCell className={e.absence_days > 0 ? "text-rose-600" : ""}>
                        {fmtInt(e.absence_days)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "emerald" | "primary" | "rose" | "sky";
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600"
      : tone === "rose"
        ? "bg-rose-500/10 text-rose-600"
        : tone === "sky"
          ? "bg-sky-500/10 text-sky-600"
          : "bg-primary/10 text-primary";
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 md:p-5 flex items-center gap-3">
        <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${toneCls}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl md:text-2xl font-bold mt-1 truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
