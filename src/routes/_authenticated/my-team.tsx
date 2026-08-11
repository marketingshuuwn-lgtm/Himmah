import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getMyTeam, listMyTeamPendingActions } from "@/lib/hr/my-team.functions";
import { reviewLeaveRequest } from "@/lib/hr/leaves.functions";
import { reviewPermission } from "@/lib/hr/permissions.functions";
import { toast } from "sonner";
import { AttachmentLink } from "@/components/attachment-link";
import { getMyTeamMetrics } from "@/lib/hr/team-metrics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ClipboardList,
  UsersRound,
  CheckCircle2,
  Clock,
  XCircle,
  Plane,
  Coffee,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/my-team")({
  component: MyTeamPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">الصفحة غير موجودة</div>,
});

type Preset = "month" | "week" | "custom";

function computeRange(preset: Preset, customFrom: string, customTo: string) {
  const today = new Date();
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "week") {
    const to = today.toISOString().slice(0, 10);
    const fromDt = new Date(today);
    fromDt.setDate(fromDt.getDate() - 6);
    return { from: fromDt.toISOString().slice(0, 10), to };
  }
  // month
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return { from, to };
}

function MyTeamPage() {
  const me = useCurrentUser();
  const canAccess = hasAnyRole(me, ["dept_manager", "hr_admin", "admin", "owner"]);
  const fetchTeam = useServerFn(getMyTeam);
  const fetchMetrics = useServerFn(getMyTeamMetrics);
  const [preset, setPreset] = useState<Preset>("month");
  const today = new Date().toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: () => fetchTeam(),
    enabled: canAccess,
  });
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["my-team-metrics", range.from, range.to],
    queryFn: () => fetchMetrics({ data: range }),
    enabled: canAccess,
  });

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            هذه الصفحة متاحة لمديري الأقسام فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="size-6 text-primary" />
            فريقي
            {data?.department_name && (
              <span className="text-base font-normal text-muted-foreground">
                · {data.department_name}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            مؤشرات الأداء ومقارنة الفترة والطلبات المعلّقة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">الشهر الحالي</SelectItem>
              <SelectItem value="week">آخر 7 أيام</SelectItem>
              <SelectItem value="custom">مخصص</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <Input
                type="date"
                className="w-40"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <Input
                type="date"
                className="w-40"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          )}
        </div>
      </div>

      <PendingActionsCenter />

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6" dir="rtl">
        <Kpi
          label="نسبة الحضور"
          value={`${metrics?.attendance_rate ?? 0}%`}
          prev={metrics?.prev.attendance_rate}
          cur={metrics?.attendance_rate}
          higherIsBetter
          loading={metricsLoading}
        />
        <Kpi
          label="التأخيرات"
          value={metrics?.late_days ?? 0}
          prev={metrics?.prev.late_days}
          cur={metrics?.late_days}
          loading={metricsLoading}
        />
        <Kpi
          label="أيام الغياب"
          value={metrics?.absent_days ?? 0}
          prev={metrics?.prev.absent_days}
          cur={metrics?.absent_days}
          loading={metricsLoading}
        />
        <Kpi
          label="أيام الإجازات"
          value={metrics?.leaves_taken ?? 0}
          prev={metrics?.prev.leaves_taken}
          cur={metrics?.leaves_taken}
          loading={metricsLoading}
        />
        <Kpi
          label="الأذونات"
          value={metrics?.permissions_used ?? 0}
          prev={metrics?.prev.permissions_used}
          cur={metrics?.permissions_used}
          loading={metricsLoading}
        />
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">طلبات معلّقة</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold">
                {(metrics?.pending_leaves ?? 0) + (metrics?.pending_permissions ?? 0)}
              </span>
              {(metrics?.pending_leaves ?? 0) + (metrics?.pending_permissions ?? 0) > 0 && (
                <AlertCircle className="size-4 text-amber-500" />
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {metrics?.pending_leaves ?? 0} إجازة · {metrics?.pending_permissions ?? 0} إذن
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">أعضاء الفريق</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : !data?.members.length ? (
            <div className="text-center text-muted-foreground py-10">لا يوجد موظفون في قسمك</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" dir="rtl">
              {data.members.map((m) => (
                <Link
                  key={m.employee_id}
                  to="/employees/$employeeId"
                  params={{ employeeId: m.employee_id }}
                  className="p-4 rounded-lg border bg-card/50 space-y-2 hover:border-primary/50 hover:shadow-sm transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.position || "—"} {m.employee_no && `· ${m.employee_no}`}
                      </div>
                    </div>
                    <TodayBadge s={m.today_status} />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {m.pending_leaves > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Plane className="size-3" /> {m.pending_leaves} إجازة معلّقة
                      </Badge>
                    )}
                    {m.pending_permissions > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="size-3" /> {m.pending_permissions} إذن معلّق
                      </Badge>
                    )}
                    {m.pending_leaves === 0 && m.pending_permissions === 0 && (
                      <span className="text-xs text-muted-foreground">لا طلبات معلّقة</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Manager pending-actions center: pending leave and permission requests
 * across the whole team, with inline approve/reject — the thing this
 * page was missing (it only ever showed counts, never let the manager
 * act without navigating away to /leaves or /permissions).
 */
function PendingActionsCenter() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listMyTeamPendingActions);
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-team-pending-actions"],
    queryFn: () => fetchFn(),
  });

  const reviewLeaveFn = useServerFn(reviewLeaveRequest);
  const reviewPermFn = useServerFn(reviewPermission);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(item: (typeof data)[number], action: "approve" | "reject") {
    setBusyId(item.id);
    try {
      if (item.kind === "leave") {
        await reviewLeaveFn({ data: { id: item.id, action } });
      } else {
        await reviewPermFn({ data: { id: item.id, action } });
      }
      toast.success(action === "approve" ? "تم الاعتماد ✓" : "تم الرفض");
      qc.invalidateQueries({ queryKey: ["my-team-pending-actions"] });
      qc.invalidateQueries({ queryKey: ["my-team"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (data.length === 0) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/[0.04]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="size-4 text-amber-600" />
          مركز المعلقات ({data.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((item) => (
          <div
            key={`${item.kind}-${item.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{item.employee_name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {item.kind === "leave" ? item.leave_type_name : item.type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.kind === "leave" ? (
                  <>
                    {item.start_date} → {item.end_date} · {item.days} يوم
                  </>
                ) : (
                  <>
                    {item.request_date} · {item.from_time.slice(0, 5)}–{item.to_time.slice(0, 5)}
                  </>
                )}
                {item.reason && ` — ${item.reason}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.attachment_path && <AttachmentLink path={item.attachment_path} />}
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={busyId === item.id}
                onClick={() => act(item, "reject")}
              >
                رفض
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={busyId === item.id}
                onClick={() => act(item, "approve")}
              >
                {busyId === item.id ? <Loader2 className="size-3.5 animate-spin" /> : "اعتماد"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  prev,
  cur,
  higherIsBetter,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  prev?: number;
  cur?: number;
  higherIsBetter?: boolean;
  loading?: boolean;
}) {
  const delta = (cur ?? 0) - (prev ?? 0);
  const good = higherIsBetter ? delta > 0 : delta < 0;
  const bad = higherIsBetter ? delta < 0 : delta > 0;
  const Icon = delta === 0 ? Minus : good ? TrendingUp : TrendingDown;
  const cls =
    delta === 0
      ? "text-muted-foreground"
      : good
        ? "text-emerald-600"
        : bad
          ? "text-red-600"
          : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">
          {loading ? <Loader2 className="size-5 animate-spin" /> : value}
        </div>
        {!loading && prev !== undefined && (
          <div className={`text-[10px] mt-1 flex items-center gap-1 ${cls}`}>
            <Icon className="size-3" />
            {Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)} مقابل الفترة السابقة
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TodayBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    present: { label: "حاضر", cls: "bg-emerald-600 text-white", Icon: CheckCircle2 },
    late: { label: "متأخر", cls: "bg-amber-500 text-white", Icon: Clock },
    absent: { label: "غائب", cls: "bg-red-600 text-white", Icon: XCircle },
    leave: { label: "إجازة", cls: "bg-sky-600 text-white", Icon: Plane },
    off: { label: "عطلة", cls: "bg-muted text-muted-foreground", Icon: Coffee },
    pending: { label: "لم يسجل بعد", cls: "bg-muted text-muted-foreground", Icon: Clock },
  };
  const v = map[s] ?? map.pending;
  const Icon = v.Icon;
  return (
    <Badge className={`${v.cls} gap-1`}>
      <Icon className="size-3" />
      {v.label}
    </Badge>
  );
}
