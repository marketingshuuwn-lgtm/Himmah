import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getMyAttendance } from "@/lib/hr/attendance.functions";
import { myLeaveBalance } from "@/lib/hr/leaves.functions";
import { listDocuments } from "@/lib/hr/documents.functions";
import { listMyNotifications } from "@/lib/hr/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Plane,
  Clock4,
  FileSignature,
  FolderArchive,
  Bell,
  LogIn,
  LogOut as LogOutIcon,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtTime, fmtDate } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "صفحتي · علامة" }] }),
  component: MePage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

function MePage() {
  const user = useCurrentUser();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "صباح الخير" : hour < 18 ? "مساء الخير" : "مساء النور";
  const firstName = (user.fullName || "").split(" ")[0] || "بك";

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greet}،</p>
          <h1 className="text-2xl font-bold tracking-tight">{firstName} 👋</h1>
        </div>
        <Link to="/settings">
          <Button variant="outline" size="sm">
            إعداداتي
          </Button>
        </Link>
      </header>

      <Suspense fallback={<SkeletonCard />}>
        <PunchCard />
      </Suspense>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
        <QuickLink to="/leaves" label="الإجازات" icon={Plane} />
        <QuickLink to="/permissions" label="الأذونات" icon={Clock4} />
        <QuickLink to="/contracts" label="العقود" icon={FileSignature} />
        <QuickLink to="/documents" label="وثائقي" icon={FolderArchive} />
      </div>

      <Suspense fallback={<SkeletonCard />}>
        <MyAttendanceChart />
      </Suspense>

      <div className="grid md:grid-cols-2 gap-4" dir="rtl">
        <Suspense fallback={<SkeletonCard />}>
          <LeaveBalanceCard />
        </Suspense>
        <Suspense fallback={<SkeletonCard />}>
          <ExpiringDocsCard />
        </Suspense>
      </div>

      <Suspense fallback={<SkeletonCard />}>
        <RecentNotificationsCard />
      </Suspense>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-8 flex justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function QuickLink({ to, label, icon: Icon }: { to: string; label: string; icon: any }) {
  return (
    <Link to={to} className="group">
      <Card className="hover:border-primary/40 hover:shadow-[var(--shadow-elegant)] transition">
        <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="size-5" />
          </div>
          <p className="text-sm font-medium">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function PunchCard() {
  const fn = useServerFn(getMyAttendance);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-attendance"], queryFn: () => fn() }),
  );
  const today = data.today;
  const checkedIn = !!today?.check_in_at;
  const checkedOut = !!today?.check_out_at;

  return (
    <Card className="bg-[image:var(--gradient-primary)] text-primary-foreground border-0 shadow-[var(--shadow-elegant)]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80">{fmtDate(new Date())}</p>
            <p className="text-xl font-bold">
              {checkedOut ? "انتهى دوامك اليوم" : checkedIn ? "أنت في الدوام" : "ابدأ يومك"}
            </p>
          </div>
          <Clock className="size-8 opacity-70" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-center" dir="rtl">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[11px] opacity-80">حضور</p>
            <p className="text-lg font-bold num">
              {today?.check_in_at ? fmtTime(today.check_in_at) : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[11px] opacity-80">انصراف</p>
            <p className="text-lg font-bold num">
              {today?.check_out_at ? fmtTime(today.check_out_at) : "—"}
            </p>
          </div>
        </div>
        <Link to="/attendance" className="block">
          <Button size="lg" variant="secondary" className="w-full font-bold">
            {checkedOut ? (
              <>
                <CheckCircle2 className="size-5" /> عرض السجل
              </>
            ) : checkedIn ? (
              <>
                <LogOutIcon className="size-5" /> تسجيل الانصراف
              </>
            ) : (
              <>
                <LogIn className="size-5" /> تسجيل الحضور
              </>
            )}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

const STATUS_COLOR: Record<string, string> = {
  present: "#10b981",
  early: "#38bdf8",
  late: "#d97706",
  half_day: "#e11d48",
  leave: "#8b5cf6",
};
const STATUS_LABEL: Record<string, string> = {
  present: "حاضر",
  early: "مبكر",
  late: "متأخر",
  half_day: "نصف يوم",
  leave: "إجازة",
};

/**
 * Personal attendance trend — the employee dashboard's flagship chart.
 * Reuses the same cached ["my-attendance"] query PunchCard already fetches
 * (no extra network call), rendering the last two weeks as colored bars
 * plus a month-to-date breakdown, so the employee sees their own pattern
 * at a glance instead of only today's punch.
 */
function MyAttendanceChart() {
  const fn = useServerFn(getMyAttendance);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-attendance"], queryFn: () => fn() }),
  );
  const days = [...data.recent].reverse().map((r) => ({
    date: r.work_date.slice(5),
    value: 1,
    status: r.status,
  }));
  const s = data.month_summary;
  const chips = [
    { key: "present", label: "حاضر", value: s.present },
    { key: "late", label: "متأخر", value: s.late },
    { key: "half_day", label: "نصف يوم", value: s.half_day },
    { key: "absent", label: "غائب", value: s.absent },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          سجل حضوري — آخر أسبوعين
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد سجلات بعد</p>
        ) : (
          <div className="h-40" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis hide domain={[0, 1]} />
                <Tooltip
                  formatter={(_: number, __: string, p: any) => [
                    STATUS_LABEL[p.payload.status] ?? p.payload.status,
                    "الحالة",
                  ]}
                  labelFormatter={(d) => String(d)}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {days.map((d, i) => (
                    <Cell key={i} fill={STATUS_COLOR[d.status] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="grid grid-cols-4 gap-2 text-center" dir="rtl">
          {chips.map((c) => (
            <div key={c.key} className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold">{c.value}</p>
              <p className="text-[10px] text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LeaveBalanceCard() {
  const fn = useServerFn(myLeaveBalance);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-leave-balance"], queryFn: () => fn() }),
  );
  const items = (data as any[]).slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Plane className="size-4 text-primary" /> رصيد الإجازات
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أرصدة مسجلة.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((b: any) => (
              <li
                key={b.leave_type_id || b.id}
                className="flex items-center justify-between text-sm"
              >
                <span>{b.leave_type_name_ar || b.name_ar || "إجازة"}</span>
                <Badge variant="outline" className="num">
                  {b.remaining ?? b.balance ?? 0} يوم
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Link to="/leaves" className="block mt-3">
          <Button variant="ghost" size="sm" className="w-full">
            عرض الكل
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ExpiringDocsCard() {
  const fn = useServerFn(listDocuments);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["documents", "mine"],
      queryFn: () => fn({ data: { scope: "mine" } }),
    }),
  );
  const items = data
    .filter((d) => d.days_to_expiry !== null && d.days_to_expiry! <= 60)
    .sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0))
    .slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderArchive className="size-4 text-primary" /> وثائق قاربت الانتهاء
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا شيء يحتاج تجديداً قريباً ✅</p>
        ) : (
          <ul className="space-y-2">
            {items.map((d) => {
              const exp = d.days_to_expiry!;
              const cls =
                exp < 0
                  ? "text-destructive"
                  : exp <= 7
                    ? "text-red-600 dark:text-red-400"
                    : exp <= 30
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground";
              return (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span className="truncate flex items-center gap-2">
                    {exp <= 30 && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />}
                    {d.title}
                  </span>
                  <span className={`text-xs num ${cls}`}>{exp < 0 ? "منتهية" : `${exp} يوم`}</span>
                </li>
              );
            })}
          </ul>
        )}
        <Link to="/documents" className="block mt-3">
          <Button variant="ghost" size="sm" className="w-full">
            إدارة الوثائق
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RecentNotificationsCard() {
  const fn = useServerFn(listMyNotifications);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-notifications-mini"], queryFn: () => fn() }),
  );
  const items = data.items.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="size-4 text-primary" /> آخر التنبيهات
          {data.unread > 0 && <Badge className="num">{data.unread}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد تنبيهات.</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-2.5 text-sm">
                <div
                  className={`mt-1.5 size-2 rounded-full shrink-0 ${n.read_at ? "bg-muted" : "bg-primary"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground line-clamp-1">{n.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
