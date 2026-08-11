import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { useCurrentUser, hasAnyRole, roleLabels } from "@/hooks/use-current-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Building2,
  Wallet,
  FileSignature,
  Star,
  Clock,
  ArrowUpLeft,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Coins,
  Plane,
  Clock4,
  MessageSquareWarning,
  ClipboardCheck,
  Gauge,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { brand } from "@/lib/brand";
import { getDashboardStats } from "@/lib/hr/stats.functions";
import { getAnalyticsDashboard } from "@/lib/hr/analytics.functions";
import { fmtInt, fmtMoney, fmtMonthLabel } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم · علامة" }] }),
  component: Dashboard,
});

const featureCards = [
  {
    icon: Users,
    title: "إدارة الموظفين",
    desc: "بيانات الموظفين، الأقسام، والمناصب الوظيفية.",
    to: "/employees",
  },
  {
    icon: Clock,
    title: "الحضور والانصراف",
    desc: "تسجيل ذكي مع تحقق اختياري بالموقع والبصمة.",
    to: "/attendance",
  },
  {
    icon: Wallet,
    title: "الرواتب والمكافآت",
    desc: "حساب تلقائي للرواتب وإدارة المكافآت والخصومات.",
    to: "/payroll",
  },
  {
    icon: FileSignature,
    title: "العقود الرقمية",
    desc: "إنشاء عقود NDA ووظيفية مع توقيع رقمي معتمد.",
    to: "/contracts",
  },
  {
    icon: Star,
    title: "نظام التقييم",
    desc: "تقييم دوري من المديرين ولوحات تحليلية.",
    to: "/evaluations",
  },
  {
    icon: Building2,
    title: "الأقسام",
    desc: "تنظيم الفرق وتعيين مدير لكل قسم.",
    to: "/departments",
  },
] as const;

function Dashboard() {
  const user = useCurrentUser();
  const primaryRole = user.roles[0];

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-6 md:space-y-8">
      {/* Hero brand banner */}
      <Card className="relative overflow-hidden border-0 text-white">
        <div className="absolute inset-0 bg-[image:var(--gradient-brand)]" />
        <div className="absolute inset-0 bg-[image:var(--gradient-cyan-glow)] opacity-70" />
        <div className="absolute -bottom-16 -left-16 size-64 rounded-full bg-primary-glow/20 blur-3xl" />
        <div className="absolute top-6 left-6 opacity-10">
          <img src={brand.mark} alt="" className="size-40 invert" />
        </div>

        <div className="relative p-6 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] md:text-xs font-semibold tracking-[0.35em] text-primary-glow">
              <span className="size-1.5 rounded-full bg-primary-glow inline-block" />
              {brand.nameLatin} · {brand.name}
            </div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
              أهلًا {user.fullName || "بك"} 👋
            </h1>
            <p className="text-white/75 max-w-xl text-sm md:text-base leading-relaxed">
              منصة <span className="font-semibold text-white">علامة</span> — كل ما تحتاجه لإدارة
              فريقك: موظفون، حضور، رواتب، عقود رقمية موقّعة، وتقييمات.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {user.roles.map((r) => (
                <Badge key={r} className="bg-white/10 text-white border-white/15 hover:bg-white/15">
                  {roleLabels[r]}
                </Badge>
              ))}
              {!primaryRole && (
                <Badge variant="outline" className="border-white/30 text-white">
                  لم يُعيَّن دور بعد
                </Badge>
              )}
            </div>
          </div>

          <div className="hidden md:flex size-28 rounded-2xl bg-white/5 ring-1 ring-white/15 backdrop-blur items-center justify-center shrink-0">
            <img src={brand.mark} alt={brand.nameLatin} className="size-16" />
          </div>
        </div>
      </Card>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsRow />
      </Suspense>

      <AnalyticsSection />

      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-base md:text-lg font-semibold">الميزات المتاحة</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              انتقل مباشرة إلى أي وحدة من وحدات النظام.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3" dir="rtl">
          {featureCards.map((f) => {
            const Icon = f.icon;
            return (
              <Link key={f.title} to={f.to}>
                <Card className="group border-border/60 hover:border-primary/40 hover:shadow-[var(--shadow-card)] transition-all h-full">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
                        <Icon className="size-5 text-primary-foreground" />
                      </div>
                      <ArrowUpLeft className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                    <CardDescription className="leading-relaxed">{f.desc}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const statsQO = (fetcher: () => Promise<Awaited<ReturnType<typeof getDashboardStats>>>) =>
  queryOptions({
    queryKey: ["dashboard-stats"],
    queryFn: fetcher,
    staleTime: 30_000,
  });

function StatsRow() {
  const user = useCurrentUser();
  const fetcher = useServerFn(getDashboardStats);
  const { data } = useSuspenseQuery(statsQO(() => fetcher()));
  const elevated = hasAnyRole(user, ["hr_admin", "dept_manager", "accountant"]);

  const tiles: { label: string; value: string; hint?: string; icon: typeof Users; to?: string }[] =
    [];

  if (elevated) {
    tiles.push(
      {
        label: "إجمالي الموظفين",
        value: fmtInt(data.employees ?? 0),
        icon: Users,
        to: "/employees",
      },
      {
        label: "الأقسام",
        value: fmtInt(data.departments ?? 0),
        icon: Building2,
        to: "/departments",
      },
      {
        label: "حضور اليوم",
        value: fmtInt(data.todayAttendance ?? 0),
        icon: Clock,
        to: "/attendance",
      },
      {
        label: "عقود بانتظار التوقيع",
        value: fmtInt(data.pendingContracts ?? 0),
        icon: FileSignature,
        to: "/contracts",
      },
    );
  } else {
    tiles.push(
      {
        label: "حضوري اليوم",
        value:
          data.myAttendanceToday === "out"
            ? "تم الانصراف"
            : data.myAttendanceToday === "in"
              ? "حاضر"
              : "لم يُسجَّل",
        icon: Clock,
        to: "/attendance",
      },
      {
        label: "آخر صافي راتب",
        value: data.myLastNetSalary != null ? fmtMoney(data.myLastNetSalary) : "—",
        icon: Wallet,
        to: "/payroll",
      },
      {
        label: "عقود بانتظار توقيعك",
        value: fmtInt(data.myPendingContracts ?? 0),
        icon: FileSignature,
        to: "/contracts",
      },
    );
  }

  return (
    <div
      className={`grid gap-3 ${tiles.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}
      dir="rtl"
    >
      {tiles.map((t) => {
        const Icon = t.icon;
        const inner = (
          <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
            <CardContent className="p-4 md:p-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{t.label}</p>
                <p className="text-xl md:text-2xl font-bold mt-1 truncate">{t.value}</p>
              </div>
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        );
        return t.to ? (
          <Link key={t.label} to={t.to}>
            {inner}
          </Link>
        ) : (
          <div key={t.label}>{inner}</div>
        );
      })}

      {!elevated && (data.myPendingContracts ?? 0) > 0 && (
        <Card className="sm:col-span-3 border-amber-300/50 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <AlertCircle className="size-5 text-amber-600 shrink-0" />
            <span className="flex-1">لديك عقود بانتظار التوقيع.</span>
            <Link
              to="/contracts"
              className="text-amber-700 dark:text-amber-300 font-medium hover:underline"
            >
              فتح العقود
            </Link>
          </CardContent>
        </Card>
      )}

      {!elevated && data.myAttendanceToday === "out" && (
        <Card className="sm:col-span-3 border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-950/20">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            <span>أنهيت يوم العمل بنجاح. شكرًا لجهودك 👏</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Management analytics — the real dashboard. Visible only to roles that
 * getAnalyticsDashboard authorizes (hr_admin / accountant / owner / admin);
 * the function itself returns null otherwise, so this renders nothing for
 * everyone else (including dept managers, who get their own "فريقي" view).
 */
function AnalyticsSection() {
  const user = useCurrentUser();
  const mayQuery = hasAnyRole(user, ["hr_admin", "accountant", "owner", "admin"]);
  const fn = useServerFn(getAnalyticsDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: () => fn(),
    enabled: mayQuery,
    staleTime: 60_000,
  });

  if (!mayQuery) return null;
  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" dir="rtl">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const complianceTone =
    data.compliance_rate >= 95
      ? "text-emerald-600"
      : data.compliance_rate >= 85
        ? "text-amber-600"
        : "text-rose-600";

  const pendingItems = [
    { label: "إجازات معلقة", value: data.pending.leaves, icon: Plane, to: "/leaves" },
    { label: "أذونات معلقة", value: data.pending.permissions, icon: Clock4, to: "/permissions" },
    {
      label: "تصحيحات انصراف معلقة",
      value: data.pending.attendance_corrections,
      icon: ClipboardCheck,
      to: "/attendance-corrections",
    },
    {
      label: "عقود بانتظار التوقيع",
      value: data.pending.contracts,
      icon: FileSignature,
      to: "/contracts",
    },
    {
      label: "اعتراضات رواتب معلقة",
      value: data.pending.payroll_disputes,
      icon: MessageSquareWarning,
      to: "/payroll-disputes",
    },
  ].filter((p) => p.value > 0);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold">
            نظرة تحليلية — {fmtMonthLabel(data.month)}
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            محسوبة حياً من سجلات الحضور حتى {data.as_of}.
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" dir="rtl">
        <Card className="border-border/60">
          <CardContent className="p-4 md:p-5 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">الموظفون النشطون</p>
              <p className="text-xl md:text-2xl font-bold mt-1">{fmtInt(data.headcount)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4 md:p-5 flex items-center gap-3">
            <div
              className={`size-10 rounded-xl flex items-center justify-center shrink-0 bg-current/10 ${complianceTone}`}
            >
              <Gauge className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">نسبة الالتزام هذا الشهر</p>
              <p className={`text-xl md:text-2xl font-bold mt-1 ${complianceTone}`}>
                {data.compliance_rate}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Link to="/attendance">
          <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
            <CardContent className="p-4 md:p-5 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <TrendingDown className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">كلفة التأخير هذا الشهر</p>
                <p className="text-xl md:text-2xl font-bold mt-1 truncate">
                  {fmtMoney(data.cost_this_month.late_deduction)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/attendance">
          <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
            <CardContent className="p-4 md:p-5 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                <Coins className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">إجمالي كلفة الغياب والتأخير</p>
                <p className="text-xl md:text-2xl font-bold mt-1 truncate">
                  {fmtMoney(data.cost_this_month.total)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Finance: what will actually be paid, computed via the same engine
          as real payroll — never a separate/divergent estimate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" dir="rtl">
        <Link to="/payroll">
          <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
            <CardContent className="p-4 md:p-5 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Wallet className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  المستحق للجميع حتى اليوم ({data.as_of})
                </p>
                <p className="text-xl md:text-2xl font-bold mt-1 truncate">
                  {fmtMoney(data.payroll_projection.owed_to_date)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/payroll">
          <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
            <CardContent className="p-4 md:p-5 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Coins className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  المتوقع لنهاية الشهر (بلا غياب إضافي)
                </p>
                <p className="text-xl md:text-2xl font-bold mt-1 truncate">
                  {fmtMoney(data.payroll_projection.projected_month_end)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Pending items */}
      {pendingItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" dir="rtl">
          {pendingItems.map((p) => {
            const Icon = p.icon;
            return (
              <Link key={p.label} to={p.to}>
                <Card className="border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/60 transition-colors h-full">
                  <CardContent className="p-3.5 flex items-center gap-2.5">
                    <Icon className="size-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-tight">{fmtInt(p.value)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.label}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" dir="rtl">
        {/* 30-day trend chart */}
        <Card className="lg:col-span-3 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              اتجاه الحضور — آخر 30 يوم عمل
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend_30d} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(d) => String(d)}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="present"
                  name="حاضر"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="late"
                  name="متأخر"
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="absent"
                  name="غائب"
                  stroke="#e11d48"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department comparison */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              مقارنة الأقسام — الالتزام
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {data.departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أقسام بها موظفون بعد.</p>
            ) : (
              data.departments.map((d) => {
                const tone =
                  d.compliance_rate >= 95
                    ? "bg-emerald-500"
                    : d.compliance_rate >= 85
                      ? "bg-amber-500"
                      : "bg-rose-500";
                return (
                  <div key={d.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate">{d.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {d.compliance_rate}% · {fmtInt(d.headcount)} موظف
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tone}`}
                        style={{ width: `${Math.min(100, d.compliance_rate)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" dir="rtl">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
