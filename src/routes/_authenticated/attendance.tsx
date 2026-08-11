import { createFileRoute } from "@tanstack/react-router";
import { MonthlyReport, RulesManager } from "@/components/attendance/monthly-report-and-rules";
import { useServerFn } from "@tanstack/react-start";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  getMyAttendance,
  checkIn,
  checkOut,
  listTeamAttendance,
  listAttendanceRules,
  upsertAttendanceRule,
  deleteAttendanceRule,
  listMonthlyReport,
  adminEditAttendance,
  bulkImportHistoricalAttendance,
  requestAttendanceCorrection,
  listMyCorrections,
  type AttendanceRule,
  type AttendanceRecord,
  type AttendanceStatus,
  type MyAttendanceContext,
  type LateTier,
  type MonthlyEmployeeReport,
  type CorrectionInfo,
  getMyNetworkIp,
  classifyCheckIn,
  listAttendanceHistory,
  type AttendanceHistoryEntry,
} from "@/lib/hr/attendance.functions";
import { buildExplanation } from "@/lib/hr/attendance-explain";
import { startAuthentication as wbStartAuthFn } from "@/lib/hr/webauthn.functions";
import { startAuthentication as wbBrowserStartAuth } from "@simplewebauthn/browser";
import { listDepartments } from "@/lib/hr/departments.functions";
import {
  fmtTime,
  fmtTimeWithSeconds,
  fmtDayShort,
  fmtDate,
  fmtMoney,
  fmtInt,
  monthKey,
  fmtMonthLabel,
} from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
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
import { Calendar } from "@/components/ui/calendar";
import { readExcelFile, exportToExcel } from "@/lib/utils/excel";
import {
  listSpecialWorkPeriods,
  upsertSpecialWorkPeriod,
  deleteSpecialWorkPeriod,
} from "@/lib/hr/special-hours.functions";
import { riyadhToday } from "@/lib/hr/time";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Clock,
  MapPin,
  Wifi,
  LogIn,
  LogOut,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Fingerprint,
  Timer,
  CalendarDays,
  Upload,
  Coffee,
  Sun,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  AlertTriangle,
  HelpCircle,
  History,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ExportAttendanceCsvButton } from "@/components/export-buttons";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "الحضور والانصراف · علامة" }] }),
  component: AttendancePage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

function AttendancePage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const canManageRules = hasAnyRole(user, ["hr_admin"]) && viewMode === "manager";
  const canSeeTeam =
    hasAnyRole(user, ["hr_admin", "dept_manager", "accountant"]) && viewMode === "manager";

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
          <Clock className="size-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">الحضور والانصراف</h1>
          <p className="text-sm text-muted-foreground">تسجيل حضورك اليومي ومتابعة سجلاتك بدقة.</p>
        </div>
      </header>

      <Tabs defaultValue="me">
        <TabsList>
          <TabsTrigger value="me">حضوري</TabsTrigger>
          {canSeeTeam && <TabsTrigger value="team">سجلات الفريق</TabsTrigger>}
          {canSeeTeam && <TabsTrigger value="map">الخريطة المباشرة</TabsTrigger>}
          {canSeeTeam && <TabsTrigger value="report">التقرير الشهري</TabsTrigger>}
          {canManageRules && <TabsTrigger value="rules">قواعد الحضور</TabsTrigger>}
        </TabsList>

        <TabsContent value="me" className="mt-6">
          <Suspense fallback={<LoadingCard />}>
            <MyAttendance />
          </Suspense>
        </TabsContent>

        {canSeeTeam && (
          <TabsContent value="team" className="mt-6">
            <Suspense fallback={<LoadingCard />}>
              <TeamAttendance canEdit={canManageRules} />
            </Suspense>
          </TabsContent>
        )}

        {canSeeTeam && (
          <TabsContent value="map" className="mt-6">
            <Suspense fallback={<LoadingCard />}>
              <LiveMapTab />
            </Suspense>
          </TabsContent>
        )}

        {canSeeTeam && (
          <TabsContent value="report" className="mt-6">
            <Suspense fallback={<LoadingCard />}>
              <MonthlyReport />
            </Suspense>
          </TabsContent>
        )}

        {canManageRules && (
          <TabsContent value="rules" className="mt-6">
            <Suspense fallback={<LoadingCard />}>
              <RulesManager />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="p-10 flex justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function LiveMapTab() {
  const fetcher = useServerFn(listTeamAttendance);
  const rulesFetcher = useServerFn(listAttendanceRules);
  const { data: records } = useSuspenseQuery(
    queryOptions({
      queryKey: ["team-attendance-map"],
      queryFn: () => fetcher(),
      refetchInterval: 60_000,
    }),
  );
  const { data: rules } = useSuspenseQuery(
    queryOptions({
      queryKey: ["attendance-rules-map"],
      queryFn: () => rulesFetcher(),
    }),
  );

  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = useMemo(
    () => records.filter((r) => r.work_date === today),
    [records, today],
  );
  const defaultRule = rules.find((r) => r.department_id === null) ?? rules[0];

  // Lazy-load to avoid SSR issues with Leaflet
  const [Map, setMap] = useState<
    null | typeof import("@/components/live-attendance-map").LiveAttendanceMap
  >(null);
  useEffect(() => {
    import("@/components/live-attendance-map").then((m) => setMap(() => m.LiveAttendanceMap));
  }, []);

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="size-4" /> الخريطة المباشرة — حضور اليوم
        </CardTitle>
        <CardDescription>
          يتم التحديث تلقائيًا كل دقيقة. {todayRecords.length} سجل اليوم.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!Map ? (
          <div className="h-[500px] flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Map
            records={todayRecords}
            officeLat={defaultRule?.geo_lat ?? null}
            officeLng={defaultRule?.geo_lng ?? null}
            radiusM={defaultRule?.geo_radius_m ?? 100}
          />
        )}
      </CardContent>
    </Card>
  );
}

const statusMap: Record<
  AttendanceStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tone: string }
> = {
  present: {
    label: "حاضر",
    variant: "default",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  },
  early: {
    label: "مبكر",
    variant: "secondary",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  },
  late: {
    label: "متأخر",
    variant: "secondary",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  },
  half_day: {
    label: "نصف يوم",
    variant: "destructive",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-500/20",
  },
  absent: {
    label: "غائب",
    variant: "destructive",
    tone: "bg-destructive/10 text-destructive ring-destructive/20",
  },
  leave: { label: "إجازة", variant: "outline", tone: "bg-muted text-muted-foreground ring-border" },
};

function MyAttendance() {
  const fetcher = useServerFn(getMyAttendance);
  const { data } = useSuspenseQuery(
    queryOptions<MyAttendanceContext>({
      queryKey: ["my-attendance"],
      queryFn: () => fetcher(),
      refetchInterval: 60_000, // keeps window_state phase in sync as time crosses window boundaries
    }),
  );

  if (!data.employee_id) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center space-y-3">
          <Clock className="size-10 mx-auto text-muted-foreground" />
          <p className="font-medium">لم يتم ربط حسابك بسجل موظف</p>
          <p className="text-sm text-muted-foreground">
            تواصل مع مدير الموارد البشرية لإضافتك إلى قائمة الموظفين.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.missed_checkout && <MissedCheckoutBanner alert={data.missed_checkout} />}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-4">
          <CheckInCard ctx={data} />
          <MonthChip summary={data.month_summary} />
        </div>
        <div className="lg:col-span-3 space-y-4">
          <WeekSummary records={data.recent} />
          <div className="flex justify-end">
            <RequestDayCorrectionDialog />
          </div>
          <RecentList records={data.recent} rule={data.rule} />
        </div>
      </div>
    </div>
  );
}

function MissedCheckoutBanner({
  alert,
}: {
  alert: NonNullable<MyAttendanceContext["missed_checkout"]>;
}) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const correctFn = useServerFn(requestAttendanceCorrection);
  const mut = useMutation({
    mutationFn: () =>
      correctFn({ data: { record_id: alert.record_id, suggested_check_out: time, reason } }),
    onSuccess: () => {
      toast.success("تم إرسال طلب التصحيح إلى المدير");
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
        <div className="size-10 rounded-xl bg-amber-500/15 grid place-items-center shrink-0">
          <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            لم تسجّل انصرافك ليوم{" "}
            <span dir="ltr" className="tabular-nums">
              {fmtDate(alert.work_date)}
            </span>
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            تم احتساب نصف يوم تلقائيًا. يمكنك تقديم طلب لتصحيح وقت الانصراف لاعتماده من المدير.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0">
              طلب تصحيح
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>طلب تصحيح وقت الانصراف</DialogTitle>
              <DialogDescription>
                ليوم{" "}
                <span dir="ltr" className="tabular-nums">
                  {fmtDate(alert.work_date)}
                </span>{" "}
                · الحضور{" "}
                <span dir="ltr" className="tabular-nums">
                  {fmtTime(alert.check_in_at)}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>وقت الانصراف المقترح</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>السبب</Label>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: انشغلت في اجتماع ولم أتذكر تسجيل الانصراف"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button
                onClick={() => mut.mutate()}
                disabled={mut.isPending || reason.trim().length < 3}
              >
                {mut.isPending && <Loader2 className="size-4 animate-spin" />} إرسال الطلب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/**
 * Shown inside the (dark-gradient) today card when check-in and check-out
 * landed within the same minute — near-zero worked duration. Almost always
 * a mis-tap or a test/admin-override punch. Without this, the day simply
 * shows "تم إنهاء اليوم" as a dead end with no way to flag or fix it.
 */
function AnomalyBanner({
  record,
  correction,
}: {
  record: AttendanceRecord;
  correction: CorrectionInfo | undefined;
}) {
  const [open, setOpen] = useState(false);
  const inHM = record.check_in_at ? riyadhHMClient(record.check_in_at) : "09:00";
  const [checkInTime, setCheckInTime] = useState(inHM);
  const [checkOutTime, setCheckOutTime] = useState(inHM);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const correctFn = useServerFn(requestAttendanceCorrection);
  const mut = useMutation({
    mutationFn: () =>
      correctFn({
        data: {
          record_id: record.id,
          suggested_check_in: checkInTime,
          suggested_check_out: checkOutTime,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال طلب التصحيح إلى المدير");
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      qc.invalidateQueries({ queryKey: ["my-corrections"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (correction) {
    return (
      <div className="rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/40 p-3.5 flex items-center gap-3">
        <AlertTriangle className="size-5 text-amber-200 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-50">هذا التسجيل يبدو غير صحيح</p>
          <p className="text-[11px] text-amber-100/80 mt-0.5">
            {correction.status === "pending"
              ? "طلب التصحيح قيد مراجعة المدير."
              : correction.status === "approved"
                ? "تم اعتماد التصحيح."
                : "رُفض طلب التصحيح — يمكنك تقديم طلب جديد."}
          </p>
        </div>
        {correction.status === "rejected" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="shrink-0">
                إعادة المحاولة
              </Button>
            </DialogTrigger>
            <AnomalyDialogContent
              record={record}
              checkInTime={checkInTime}
              setCheckInTime={setCheckInTime}
              checkOutTime={checkOutTime}
              setCheckOutTime={setCheckOutTime}
              reason={reason}
              setReason={setReason}
              onSubmit={() => mut.mutate()}
              pending={mut.isPending}
              onCancel={() => setOpen(false)}
            />
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/40 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <AlertTriangle className="size-5 text-amber-200 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-50">هذا التسجيل يبدو غير صحيح</p>
          <p className="text-[11px] text-amber-100/80 mt-0.5 leading-relaxed">
            سُجّل الحضور والانصراف في نفس الدقيقة تقريبًا. إن لم يكن هذا يومك الفعلي، يمكنك طلب
            تصحيح الوقتين ليعتمده المدير.
          </p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="shrink-0 bg-white text-amber-900 hover:bg-white/90">
            طلب تصحيح
          </Button>
        </DialogTrigger>
        <AnomalyDialogContent
          record={record}
          checkInTime={checkInTime}
          setCheckInTime={setCheckInTime}
          checkOutTime={checkOutTime}
          setCheckOutTime={setCheckOutTime}
          reason={reason}
          setReason={setReason}
          onSubmit={() => mut.mutate()}
          pending={mut.isPending}
          onCancel={() => setOpen(false)}
        />
      </Dialog>
    </div>
  );
}

/**
 * General-purpose attendance correction request: unlike AnomalyBanner
 * (triggered automatically for a specific same-minute punch) or
 * MissedCheckoutBanner (triggered for today's forgotten checkout), this
 * lets the employee pick ANY past day from a calendar — including a day
 * with no punch at all (a marked absence they believe is wrong) — and
 * request the correct check-in/check-out times.
 */
function RequestDayCorrectionDialog() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [checkOutTime, setCheckOutTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const correctFn = useServerFn(requestAttendanceCorrection);
  const mut = useMutation({
    mutationFn: () =>
      correctFn({
        data: {
          work_date: date ? riyadhToday(date) : undefined,
          suggested_check_in: checkInTime,
          suggested_check_out: checkOutTime,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال طلب التعديل إلى المدير");
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      qc.invalidateQueries({ queryKey: ["my-corrections"] });
      setOpen(false);
      setDate(undefined);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarDays className="size-3.5" />
          طلب تعديل حضور ليوم آخر
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>طلب تعديل حضور</DialogTitle>
          <DialogDescription>
            اختر اليوم — حتى لو لم يُسجَّل فيه أي بصمة — واذكر الوقت الصحيح وسبب التعديل.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-center rounded-lg border p-2">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(d) => d > new Date()}
              className="mx-auto"
            />
          </div>
          {date && (
            <p className="text-sm text-center text-muted-foreground">
              اليوم المحدد: <span className="font-semibold">{fmtDate(riyadhToday(date))}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>وقت الحضور الصحيح</Label>
              <Input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>وقت الانصراف الصحيح</Label>
              <Input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>السبب</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: كنت في مهمة عمل خارجية ولم أستطع تسجيل الحضور"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !date || reason.trim().length < 3}
          >
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} إرسال الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnomalyDialogContent({
  record,
  checkInTime,
  setCheckInTime,
  checkOutTime,
  setCheckOutTime,
  reason,
  setReason,
  onSubmit,
  pending,
  onCancel,
}: {
  record: AttendanceRecord;
  checkInTime: string;
  setCheckInTime: (v: string) => void;
  checkOutTime: string;
  setCheckOutTime: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>طلب تصحيح وقت الحضور والانصراف</DialogTitle>
        <DialogDescription>
          ليوم{" "}
          <span dir="ltr" className="tabular-nums">
            {fmtDate(record.work_date)}
          </span>
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>وقت الحضور الصحيح</Label>
            <Input
              type="time"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>وقت الانصراف الصحيح</Label>
            <Input
              type="time"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>السبب</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: هذا تسجيل خاطئ، لم أكن في العمل بهذا الوقت"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
        <Button onClick={onSubmit} disabled={pending || reason.trim().length < 3}>
          {pending && <Loader2 className="size-4 animate-spin" />} إرسال الطلب
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Per-day time adjustment dialog with a visual before/after comparison.
 * Opened from any row in RecentList so the employee can request a
 * correction to check-in and/or check-out without leaving the page.
 */
function RequestTimeAdjustmentDialog({
  record,
  rule,
  disabled,
}: {
  record: AttendanceRecord;
  rule: AttendanceRule | null;
  disabled?: boolean;
}) {
  const currentIn = record.check_in_at ? riyadhHMClient(record.check_in_at) : "09:00";
  const currentOut = record.check_out_at ? riyadhHMClient(record.check_out_at) : "17:00";
  const [open, setOpen] = useState(false);
  const [inTime, setInTime] = useState(currentIn);
  const [outTime, setOutTime] = useState(currentOut);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const correctFn = useServerFn(requestAttendanceCorrection);

  useEffect(() => {
    if (open) {
      setInTime(currentIn);
      setOutTime(currentOut);
      setReason("");
    }
  }, [open, currentIn, currentOut]);

  const mut = useMutation({
    mutationFn: () =>
      correctFn({
        data: {
          record_id: record.id,
          suggested_check_in: inTime,
          suggested_check_out: outTime,
          reason,
        },
      }),
    onSuccess: () => {
      // Post-confirmation summary uses the exact same numbers the preview showed.
      const d = impact?.diff ?? 0;
      toast.success("تم إرسال طلب التعديل إلى المدير", {
        description: impact
          ? `الخصم الحالي ${impact.currentDeduction.toFixed(2)} SAR ← بعد القبول ${impact.projectedDeduction.toFixed(2)} SAR (${d > 0 ? "+" : ""}${d.toFixed(2)} SAR)`
          : undefined,
      });
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      qc.invalidateQueries({ queryKey: ["my-corrections"] });
      setOpen(false);
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const inDelta = hmDiffMin(currentIn, inTime);
  const outDelta = hmDiffMin(currentOut, outTime);
  const workedBefore = hmDiffMin(currentIn, currentOut);
  const workedAfter = hmDiffMin(inTime, outTime);
  const canSubmit =
    reason.trim().length >= 3 && workedAfter > 0 && (inDelta !== 0 || outDelta !== 0);

  // Impact preview: rerun the SAME classifier the payroll/deduction screens use,
  // then render its breakdown through buildExplanation() — identical source of
  // truth as "كيف تم احتساب الخصم؟", so the two screens can never disagree.
  const impact = useMemo(() => {
    if (!rule) return null;
    const [h, m] = inTime.split(":").map(Number);
    const suggestedDate = new Date(
      `${record.work_date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+03:00`,
    );
    const projected = classifyCheckIn(suggestedDate, rule, 0);
    const currentDeduction = Number(record.late_deduction_amount || 0);
    const projectedExplain = buildExplanation(rule, {
      status: projected.status,
      lateMinutes: projected.lateMinutes,
      deduction: projected.deduction,
    });
    const currentExplain = buildExplanation(rule, {
      status: record.status,
      lateMinutes: record.late_minutes || 0,
      deduction: currentDeduction,
    });
    return {
      currentDeduction,
      projectedDeduction: projectedExplain.totalDeduction,
      diff: projectedExplain.totalDeduction - currentDeduction,
      projectedStatus: projected.status,
      projectedLate: projected.lateMinutes,
      projectedExplain,
      currentExplain,
    };
  }, [
    rule,
    inTime,
    record.work_date,
    record.late_deduction_amount,
    record.status,
    record.late_minutes,
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={disabled}>
          <Pencil className="size-3" />
          طلب تعديل
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>طلب تعديل وقت الحضور/الانصراف</DialogTitle>
          <DialogDescription>
            ليوم{" "}
            <span dir="ltr" className="tabular-nums">
              {fmtDate(record.work_date)}
            </span>
            {" — قارِن الوقت المسجّل بالوقت الذي تقترحه."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">الوقت المسجَّل</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">حضور</span>
              <span dir="ltr" className="tabular-nums font-semibold">
                {currentIn}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">انصراف</span>
              <span dir="ltr" className="tabular-nums font-semibold">
                {currentOut}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t">
              <span className="text-muted-foreground">مدة العمل</span>
              <span dir="ltr" className="tabular-nums">
                {fmtDurationMin(workedBefore)}
              </span>
            </div>
          </div>
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-primary">الوقت المقترح</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">حضور</span>
              <Input
                type="time"
                dir="ltr"
                value={inTime}
                onChange={(e) => setInTime(e.target.value)}
                className="h-8 w-28 text-sm tabular-nums"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">انصراف</span>
              <Input
                type="time"
                dir="ltr"
                value={outTime}
                onChange={(e) => setOutTime(e.target.value)}
                className="h-8 w-28 text-sm tabular-nums"
              />
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-primary/20">
              <span className="text-muted-foreground">مدة العمل</span>
              <span dir="ltr" className="tabular-nums font-semibold text-primary">
                {fmtDurationMin(workedAfter)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/30 p-2.5 text-xs space-y-1" dir="rtl">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">فرق الحضور</span>
            <DeltaBadge minutes={inDelta} kind="check_in" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">فرق الانصراف</span>
            <DeltaBadge minutes={outDelta} kind="check_out" />
          </div>
        </div>

        {impact && (
          <div
            className="rounded-lg border p-3 space-y-2 bg-gradient-to-br from-background to-muted/30"
            dir="rtl"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">معاينة أثر التعديل على الراتب</p>
              <Badge
                variant={impact.diff < 0 ? "default" : impact.diff > 0 ? "destructive" : "outline"}
                className="text-[10px]"
              >
                {impact.projectedStatus === "present"
                  ? "حاضر"
                  : impact.projectedStatus === "late"
                    ? `متأخر ${impact.projectedLate}د`
                    : impact.projectedStatus === "half_day"
                      ? "نصف يوم"
                      : impact.projectedStatus}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">الخصم الحالي</p>
                <p dir="ltr" className="tabular-nums font-semibold">
                  {impact.currentDeduction.toFixed(2)} SAR
                </p>
              </div>
              <div className="rounded-md bg-primary/5 border border-primary/20 p-2 text-center">
                <p className="text-[10px] text-primary mb-0.5">بعد التعديل</p>
                <p dir="ltr" className="tabular-nums font-semibold text-primary">
                  {impact.projectedDeduction.toFixed(2)} SAR
                </p>
              </div>
              <div
                className={`rounded-md p-2 text-center border ${impact.diff < 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400" : impact.diff > 0 ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-muted/40"}`}
              >
                <p className="text-[10px] mb-0.5 opacity-80">الفرق</p>
                <p dir="ltr" className="tabular-nums font-semibold">
                  {impact.diff > 0 ? "+" : ""}
                  {impact.diff.toFixed(2)} SAR
                </p>
              </div>
            </div>
            <details className="group">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                تفاصيل احتساب الخصم بعد التعديل
              </summary>
              <ul className="mt-2 space-y-1.5">
                {impact.projectedExplain.steps.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-md border bg-background/60 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium">{s.label}</p>
                      {s.detail && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.detail}</p>
                      )}
                    </div>
                    {s.value && (
                      <span dir="ltr" className="tabular-nums text-[11px] font-semibold shrink-0">
                        {s.value}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            <p className="text-[10px] text-muted-foreground">
              نفس معادلة شاشة «كيف تم احتساب الخصم؟» — تقديرية بناءً على وقت الحضور المقترح، وتُحسم
              بموافقة المدير.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>سبب التعديل</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: كنت في مهمة عمل خارجية، أو نسيت تسجيل الانصراف في الوقت الصحيح"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} إرسال الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const HISTORY_FIELD_LABELS: Record<string, string> = {
  check_in_at: "وقت الحضور",
  check_out_at: "وقت الانصراف",
  status: "الحالة",
  late_minutes: "دقائق التأخير",
  late_deduction_amount: "خصم التأخير",
  early_leave_minutes: "دقائق الخروج المبكر",
  early_leave_deduction_amount: "خصم الخروج المبكر",
  notes: "ملاحظات",
};

const CORRECTION_STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

/** Full edit timeline for one attendance day: before/after, actor, reason, time. */
function AttendanceHistoryDialog({ record }: { record: AttendanceRecord }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["attendance-history", record.id],
    queryFn: () => listAttendanceHistory({ data: { record_id: record.id } }),
    enabled: open,
  });
  const entries = (data ?? []) as AttendanceHistoryEntry[];

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      timeZone: "Asia/Riyadh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="سجل التعديلات"
          className="inline-flex items-center justify-center size-4 mr-1 text-muted-foreground hover:text-foreground align-middle"
        >
          <History className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>سجل التعديلات</DialogTitle>
          <DialogDescription>
            كل تغيير على سجل يوم{" "}
            <span dir="ltr" className="tabular-nums">
              {fmtDate(record.work_date)}
            </span>{" "}
            — من قام به، ومتى، وقبل/بعد.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            لا توجد تعديلات على هذا السجل.
          </p>
        ) : (
          <ol className="space-y-2.5 max-h-[60vh] overflow-y-auto">
            {entries.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-xs">
                    {e.kind === "correction" ? "طلب تصحيح وقت" : "تعديل مباشر"} — {e.actor_name}
                  </span>
                  <span dir="ltr" className="tabular-nums text-[11px] text-muted-foreground">
                    {fmtWhen(e.at)}
                  </span>
                </div>
                {e.approval_status && (
                  <Badge
                    variant={
                      e.approval_status === "approved"
                        ? "default"
                        : e.approval_status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                    className="mt-1.5"
                  >
                    {CORRECTION_STATUS_LABEL[e.approval_status] ?? e.approval_status}
                  </Badge>
                )}
                {e.reason && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">السبب: {e.reason}</p>
                )}
                {e.changes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {e.changes.map((c, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">
                          {HISTORY_FIELD_LABELS[c.field] ?? c.field}
                        </span>
                        <span dir="ltr" className="tabular-nums">
                          <span className="text-muted-foreground line-through">
                            {c.before ?? "—"}
                          </span>{" "}
                          → <span className="font-medium">{c.after ?? "—"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Per-row "how was this deduction computed?" popover. Uses the pure
 * buildExplanation() so the same breakdown can be unit-tested.
 */
function DeductionExplainDialog({
  record,
  rule,
}: {
  record: AttendanceRecord;
  rule: AttendanceRule | null;
}) {
  const [open, setOpen] = useState(false);
  const explanation = useMemo(
    () =>
      buildExplanation(rule, {
        status: record.status,
        lateMinutes: record.late_minutes || 0,
        deduction: Number(record.late_deduction_amount || 0),
        earlyLeaveMinutes: Number((record as any).early_leave_minutes || 0),
        earlyLeaveDeduction: Number((record as any).early_leave_deduction_amount || 0),
      }),
    [
      rule,
      record.status,
      record.late_minutes,
      record.late_deduction_amount,
      (record as any).early_leave_minutes,
      (record as any).early_leave_deduction_amount,
    ],
  );

  const toneClass = (tone?: string) =>
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="شرح احتساب الخصم"
          className="inline-flex items-center justify-center size-4 text-muted-foreground hover:text-foreground align-middle"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>كيف تم احتساب الخصم؟</DialogTitle>
          <DialogDescription>
            ليوم{" "}
            <span dir="ltr" className="tabular-nums">
              {fmtDate(record.work_date)}
            </span>
            {" — "}
            {explanation.headline}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-2 text-sm">
          {explanation.steps.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-lg border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-xs">{s.label}</p>
                {s.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{s.detail}</p>}
              </div>
              {s.value && (
                <span
                  dir="ltr"
                  className={`tabular-nums text-xs font-semibold shrink-0 ${toneClass(s.tone)}`}
                >
                  {s.value}
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground" dir="rtl">
          الخصم يُحسب تلقائياً من قواعد الحضور — لا يتدخل المدير في المبلغ.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function hmDiffMin(from: string, to: string): number {
  const [fH, fM] = from.split(":").map(Number);
  const [tH, tM] = to.split(":").map(Number);
  return tH * 60 + tM - (fH * 60 + fM);
}

function fmtDurationMin(mins: number): string {
  if (mins <= 0) return "0h 00m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function DeltaBadge({ minutes, kind }: { minutes: number; kind: "check_in" | "check_out" }) {
  if (minutes === 0) {
    return <span className="text-muted-foreground">بدون تغيير</span>;
  }
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const label = h > 0 ? `${h}س ${m}د` : `${m}د`;
  // For check-in: later (+) = late, earlier (-) = early
  // For check-out: later (+) = extra hours, earlier (-) = early leave
  const isBad = (kind === "check_in" && minutes > 0) || (kind === "check_out" && minutes < 0);
  const isGood = (kind === "check_in" && minutes < 0) || (kind === "check_out" && minutes > 0);
  const sign = minutes > 0 ? "+" : "−";
  const tone = isBad
    ? "text-destructive"
    : isGood
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground";
  return (
    <span dir="ltr" className={`tabular-nums font-semibold ${tone}`}>
      {sign}
      {label}
    </span>
  );
}

/** Riyadh HH:MM for an ISO instant, for pre-filling correction dialogs client-side. */
function riyadhHMClient(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hh = parts.find((p) => p.type === "hour")?.value ?? "09";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 12) return { text: "صباح الخير", icon: Sun };
  if (h < 17) return { text: "نهارك سعيد", icon: Sun };
  return { text: "مساء الخير", icon: Coffee };
}

function diffHM(fromIso: string, toIso: string | Date) {
  const toMs = typeof toIso === "string" ? new Date(toIso).getTime() : toIso.getTime();
  const mins = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function CheckInCard({ ctx }: { ctx: MyAttendanceContext }) {
  const qc = useQueryClient();
  const checkInFn = useServerFn(checkIn);
  const checkOutFn = useServerFn(checkOut);
  const startWebauthn = useServerFn(wbStartAuthFn);
  const [now, setNow] = useState(new Date());
  const [geoState, setGeoState] = useState<"idle" | "locating" | "ok" | "fail">("idle");
  const [biometricState, setBiometricState] = useState<"idle" | "verifying" | "ok" | "fail">(
    "idle",
  );
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selfieFile) {
      setSelfiePreview(null);
      return;
    }
    const url = URL.createObjectURL(selfieFile);
    setSelfiePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selfieFile]);

  async function getCoords(required: boolean): Promise<{ lat: number | null; lng: number | null }> {
    if (!required) {
      // Best-effort snapshot: even without an admin-defined geofence, record
      // where the punch happened (admins/managers can view it on the map).
      // Silent: never blocks or errors the punch if unavailable/denied.
      if (!navigator.geolocation) return { lat: null, lng: null };
      try {
        const p = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 4000,
            maximumAge: 60_000,
          });
        });
        return { lat: p.coords.latitude, lng: p.coords.longitude };
      } catch {
        return { lat: null, lng: null };
      }
    }
    if (!navigator.geolocation) throw new Error("المتصفح لا يدعم تحديد الموقع");
    setGeoState("locating");
    try {
      const p = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(new Error(err.message || "تعذّر الحصول على الموقع")),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      });
      const c = { lat: p.coords.latitude, lng: p.coords.longitude };
      const acc = Math.round(p.coords.accuracy ?? 0);
      setGpsAccuracy(acc);
      setLastCoords(c);
      setGeoState("ok");
      if (acc > 100) {
        toast.warning(`إشارة GPS ضعيفة (±${acc}م). حاول الخروج للهواء الطلق أو الاقتراب من نافذة.`);
      } else if (acc > 50) {
        toast.info(`دقة الموقع متوسطة (±${acc}م)`);
      }
      return c;
    } catch (e) {
      setGeoState("fail");
      throw e;
    }
  }

  async function getWebauthnAssertion(required: boolean): Promise<unknown> {
    if (!required) return null;
    setBiometricState("verifying");
    try {
      const opts = await startWebauthn();
      const resp = await wbBrowserStartAuth({ optionsJSON: opts as any });
      setBiometricState("ok");
      return resp;
    } catch (e: any) {
      setBiometricState("fail");
      throw new Error(e?.message || "تعذّر التحقق ببصمة الجهاز");
    }
  }

  async function uploadSelfieIfPresent(kind: "in" | "out"): Promise<string | null> {
    if (!selfieFile) {
      if (ctx.rule?.require_selfie) throw new Error("صورة السيلفي مطلوبة");
      return null;
    }
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) throw new Error("الجلسة منتهية");
    const today = new Date().toISOString().slice(0, 10);
    const ext = (selfieFile.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${uid}/${today}/${kind}-${Date.now()}.${ext}`;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("attendance-selfies")
        .upload(path, selfieFile, { contentType: selfieFile.type, upsert: false });
      if (error) throw new Error(error.message);
      return path;
    } finally {
      setUploading(false);
    }
  }

  const [overrideOn, setOverrideOn] = useState(false);

  const inMut = useMutation({
    mutationFn: async () => {
      const c = await getCoords(!!ctx.rule?.require_geo);
      const webauthn_response = await getWebauthnAssertion(!!ctx.rule?.require_webauthn);
      const selfie_path = await uploadSelfieIfPresent("in");
      return checkInFn({ data: { ...c, webauthn_response, selfie_path, override: overrideOn } });
    },
    onSuccess: (res) => {
      if (res.idempotent) {
        toast.info("أنت مسجَّل بالفعل — سيظهر زر الانصراف عند اقتراب موعده");
      } else {
        const msg =
          res.status === "early"
            ? "حضور مبكر — رائع!"
            : res.status === "late"
              ? `تم الحضور (متأخر ${res.late_minutes} د — خصم ${fmtMoney(res.deduction)})`
              : res.status === "half_day"
                ? `تأخر كبير — تم احتساب نصف يوم (خصم ${fmtMoney(res.deduction)})`
                : "تم تسجيل الحضور بنجاح ✓";
        res.status === "present" || res.status === "early"
          ? toast.success(msg)
          : toast.warning(msg);
      }
      setSelfieFile(null);
      setOverrideOn(false);
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const outMut = useMutation({
    mutationFn: async () => {
      const c = await getCoords(!!ctx.rule?.require_geo);
      const selfie_path = await uploadSelfieIfPresent("out");
      return checkOutFn({ data: { ...c, selfie_path, override: overrideOn } });
    },
    onSuccess: (res) => {
      toast.success(res.updated ? "تم تحديث وقت الانصراف ✓" : "إلى اللقاء! تم تسجيل الانصراف ✓");
      setSelfieFile(null);
      setOverrideOn(false);
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = ctx.today;
  const hasCheckedIn = !!today?.check_in_at;
  const hasCheckedOut = !!today?.check_out_at;
  const isWorking = hasCheckedIn && !hasCheckedOut;
  const isDone = hasCheckedIn && hasCheckedOut;
  const win = ctx.window_state;
  const canOverride = !!ctx.can_override;

  // Anomalous punch: check-in and check-out landed within the same minute
  // (near-zero worked duration) — almost always a mis-tap or a test/override
  // punch, not a real completed day. Detected client-side so the employee
  // always has a way out instead of a frozen "day complete" dead-end.
  const isAnomalous =
    !!today?.check_in_at &&
    !!today?.check_out_at &&
    Math.abs(new Date(today.check_out_at).getTime() - new Date(today.check_in_at).getTime()) <
      2 * 60 * 1000;

  const correctionsFetcher = useServerFn(listMyCorrections);
  const { data: myCorrections } = useQuery({
    queryKey: ["my-corrections"],
    queryFn: () => correctionsFetcher(),
    enabled: isAnomalous,
    staleTime: 15_000,
  });
  const todaysCorrection = today ? myCorrections?.find((c) => c.record_id === today.id) : undefined;

  // Countdown to next window opening (updates via `now` ticker in parent).
  function untilLabel(iso: string | null): string {
    if (!iso) return "";
    const diffMs = new Date(iso).getTime() - now.getTime();
    if (diffMs <= 0) return "الآن";
    const mins = Math.round(diffMs / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}س ${String(m).padStart(2, "0")}د` : `${m}د`;
  }

  // Hours remaining until the end of the shift, shown while actively
  // checked in — one of the most requested "at a glance" facts in
  // professional attendance apps (Deel, BambooHR, Buddy Punch all surface
  // this prominently rather than making the employee do the subtraction).
  const shiftEndM = ctx.rule ? toMinutes(ctx.rule.work_end) : null;
  const remainingLabel = (() => {
    if (!ctx.today?.check_in_at || ctx.today?.check_out_at || shiftEndM == null) return null;
    const nowM = nowMinutes(now);
    const diff = shiftEndM - nowM;
    if (diff <= 0) return "انتهى وقت الدوام الرسمي";
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0
      ? `${h}س ${String(m).padStart(2, "0")}د متبقية على نهاية الدوام`
      : `${m}د متبقية على نهاية الدوام`;
  })();

  // Prominent banner (not just the button's small sub-label) when the
  // check-in window is about to open — gives the employee a heads-up
  // instead of them discovering it's locked only when they try to punch.
  const approachingCheckin = (() => {
    if (ctx.today?.check_in_at || win?.phase !== "before_checkin" || !win.opens_at) return false;
    const diffMs = new Date(win.opens_at).getTime() - now.getTime();
    return diffMs > 0 && diffMs <= 30 * 60 * 1000;
  })();

  type Tone = "in" | "out" | "done" | "locked";
  interface Primary {
    label: string;
    sub: string;
    action: () => void;
    pending: boolean;
    disabled: boolean;
    tone: Tone;
    hidden?: boolean;
    /** Set when this action bypasses the normal punch window — must go
     * through an explicit confirmation dialog, never fire on a single click. */
    isOverride?: "in" | "out";
  }
  const [overrideConfirmOpen, setOverrideConfirmOpen] = useState(false);
  let primary: Primary;
  if (isDone || win?.phase === "done") {
    primary = {
      label: "تم إنهاء اليوم",
      sub: "نراك غدًا 👋",
      action: () => {},
      pending: false,
      disabled: true,
      tone: "done",
    };
  } else if (win?.phase === "before_checkin") {
    primary = {
      label: "خارج وقت التسجيل",
      sub: `يفتح خلال ${untilLabel(win.opens_at)} · ${win.checkin_window.start}–${win.checkin_window.end}`,
      action: () => canOverride && setOverrideConfirmOpen(true),
      pending: inMut.isPending,
      disabled: !canOverride,
      tone: "locked",
      hidden: !canOverride,
      isOverride: "in",
    };
  } else if (win?.phase === "checkin_missed") {
    primary = {
      label: "فات وقت الحضور",
      sub: `النافذة أُغلقت الساعة ${win.checkin_window.end}`,
      action: () => canOverride && setOverrideConfirmOpen(true),
      pending: inMut.isPending,
      disabled: !canOverride,
      tone: "locked",
      hidden: !canOverride,
      isOverride: "in",
    };
  } else if (win?.phase === "checkin_open" || (!win && !isWorking && !isDone)) {
    primary = {
      label: "تسجيل الحضور",
      sub: win ? `النافذة مفتوحة حتى ${win.checkin_window.end}` : "اضغط لبدء يومك",
      action: () => inMut.mutate(),
      pending: inMut.isPending,
      disabled: false,
      tone: "in",
    };
  } else if (win?.phase === "working") {
    primary = {
      label: "أنت على رأس العمل",
      sub: `الانصراف يفتح خلال ${untilLabel(win.opens_at)} · ${win.checkout_window.start}–${win.checkout_window.end}`,
      action: () => canOverride && setOverrideConfirmOpen(true),
      pending: outMut.isPending,
      disabled: !canOverride,
      tone: "locked",
      hidden: !canOverride,
      isOverride: "out",
    };
  } else if (
    win?.phase === "checkout_open" ||
    win?.phase === "checkout_late" ||
    (!win && isWorking)
  ) {
    primary = {
      label: "تسجيل الانصراف",
      sub:
        win?.phase === "checkout_late"
          ? `متأخر عن نافذة الانصراف (${win.checkout_window.end})`
          : `أنت تعمل منذ ${diffHM(today!.check_in_at!, now)}`,
      action: () => outMut.mutate(),
      pending: outMut.isPending,
      disabled: false,
      tone: "out",
    };
  } else {
    primary = {
      label: "—",
      sub: "",
      action: () => {},
      pending: false,
      disabled: true,
      tone: "done",
    };
  }

  const greet = greetingFor(now);
  const GreetIcon = greet.icon;

  return (
    <Card className="relative overflow-hidden border-0 text-white shadow-[var(--shadow-elegant)]">
      <div className="absolute inset-0 bg-[image:var(--gradient-brand)]" />
      <div className="absolute inset-0 bg-[image:var(--gradient-cyan-glow)] opacity-60" />
      <div className="relative p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-glow uppercase tracking-[0.25em]">
              <GreetIcon className="size-3.5 shrink-0" /> {greet.text}
            </p>
            <p className="text-4xl sm:text-5xl font-bold mt-2 leading-none tabular-nums" dir="ltr">
              {fmtTimeWithSeconds(now)}
            </p>
            <p className="text-xs sm:text-sm text-white/70 mt-1.5 truncate" dir="rtl">
              <bdi>{fmtDayShort(now)}</bdi>
              <span className="mx-1">·</span>
              <bdi dir="ltr" className="tabular-nums">
                {fmtDate(now)}
              </bdi>
            </p>
          </div>
          <StatusPill isWorking={isWorking} isDone={isDone} />
        </div>

        {approachingCheckin && win?.opens_at && (
          <div className="rounded-xl bg-sky-400/15 ring-1 ring-sky-300/40 px-3.5 py-2.5 flex items-center gap-2.5">
            <Timer className="size-4 text-sky-200 shrink-0" />
            <p className="text-xs text-sky-50">
              نافذة تسجيل الحضور تفتح خلال{" "}
              <span className="font-semibold">{untilLabel(win.opens_at)}</span>
              {" · "}
              <span dir="ltr" className="tabular-nums">
                {win.checkin_window.start}
              </span>
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-3 sm:p-4">
          <div className="flex items-center justify-between text-[11px] text-white/70 mb-2">
            <span>{ctx.rule?.flex_enabled ? "ساعاتك المرنة اليوم" : "جدولك اليوم"}</span>
            {ctx.rule && (
              <span className="tabular-nums" dir="ltr">
                {ctx.rule.work_start.slice(0, 5)} → {ctx.rule.work_end.slice(0, 5)}
              </span>
            )}
          </div>
          {ctx.rule?.flex_enabled ? (
            <FlexBar rule={ctx.rule} now={now} checkIn={today?.check_in_at ?? null} />
          ) : (
            <TimelineBar
              checkIn={today?.check_in_at ?? null}
              checkOut={today?.check_out_at ?? null}
              now={now}
              workStart={ctx.rule?.work_start ?? null}
              workEnd={ctx.rule?.work_end ?? null}
            />
          )}
          <div className="mt-3 grid grid-cols-3 gap-2" dir="rtl">
            <MiniStat
              label="الحضور"
              value={fmtTime(today?.check_in_at ?? null)}
              tone={
                !today?.check_in_at
                  ? undefined
                  : today.status === "half_day"
                    ? "danger"
                    : today.status === "late"
                      ? "warning"
                      : "success"
              }
            />
            <MiniStat
              label="مدة العمل"
              value={hasCheckedIn ? diffHM(today!.check_in_at!, today?.check_out_at ?? now) : "—"}
              highlight={isWorking}
            />
            <MiniStat
              label="الانصراف"
              value={fmtTime(today?.check_out_at ?? null)}
              tone={
                !today?.check_out_at
                  ? undefined
                  : (today.notes ?? "").includes("override")
                    ? "danger"
                    : "success"
              }
            />
          </div>
          {remainingLabel && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-cyan-100/90">
              <Timer className="size-3.5 shrink-0" />
              {remainingLabel}
            </p>
          )}
        </div>

        {ctx.rule && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {ctx.rule.flex_enabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/20 ring-1 ring-cyan-300/40 px-2.5 py-1">
                <Timer className="size-3" /> ساعات مرنة
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1">
              <Timer className="size-3" /> سماح{" "}
              <span dir="ltr" className="tabular-nums">
                {ctx.rule.late_grace_minutes}
              </span>{" "}
              د
            </span>
            {ctx.rule.require_geo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1">
                <MapPin className="size-3" /> الموقع مطلوب
                {geoState === "locating" && <Loader2 className="size-3 animate-spin" />}
                {geoState === "ok" && <CheckCircle2 className="size-3 text-emerald-300" />}
                {geoState === "fail" && <AlertCircle className="size-3 text-amber-300" />}
              </span>
            )}
            {ctx.rule.require_webauthn && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1">
                <Fingerprint className="size-3" /> بصمة الجهاز
                {biometricState === "verifying" && <Loader2 className="size-3 animate-spin" />}
                {biometricState === "ok" && <CheckCircle2 className="size-3 text-emerald-300" />}
                {biometricState === "fail" && <AlertCircle className="size-3 text-amber-300" />}
              </span>
            )}
            {ctx.rule.require_selfie && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1">
                <CheckCircle2 className="size-3" /> سيلفي مطلوبة
              </span>
            )}
          </div>
        )}

        {!isDone && (
          <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-white/70">
              <span>
                {ctx.rule?.require_selfie ? "صورة سيلفي (مطلوبة)" : "صورة سيلفي (اختيارية)"}
              </span>
              {selfieFile && (
                <button
                  type="button"
                  className="text-white/80 underline"
                  onClick={() => setSelfieFile(null)}
                >
                  إزالة
                </button>
              )}
            </div>
            {selfiePreview ? (
              <img
                src={selfiePreview}
                alt="selfie"
                className="w-full h-32 object-cover rounded-lg ring-1 ring-white/20"
              />
            ) : (
              <label className="flex items-center justify-center h-20 rounded-lg border border-dashed border-white/30 text-xs text-white/70 cursor-pointer hover:bg-white/5">
                التقاط صورة من الكاميرا
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {lastCoords && (
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={`https://www.google.com/maps?q=${lastCoords.lat},${lastCoords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-white/80 underline"
                  dir="ltr"
                >
                  <MapPin className="size-3" /> {lastCoords.lat.toFixed(5)},{" "}
                  {lastCoords.lng.toFixed(5)}
                </a>
                {gpsAccuracy !== null && (
                  <span
                    dir="ltr"
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-inset ${
                      gpsAccuracy <= 50
                        ? "bg-emerald-500/20 text-emerald-100 ring-emerald-300/40"
                        : gpsAccuracy <= 100
                          ? "bg-amber-500/20 text-amber-100 ring-amber-300/40"
                          : "bg-rose-500/20 text-rose-100 ring-rose-300/40"
                    }`}
                    title="دقة إشارة GPS"
                  >
                    ±{gpsAccuracy}m
                  </span>
                )}
              </div>
            )}
            {uploading && (
              <p className="text-[11px] text-white/70 flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> جاري رفع الصورة…
              </p>
            )}
          </div>
        )}

        {isAnomalous && today && <AnomalyBanner record={today} correction={todaysCorrection} />}

        {primary.hidden ? (
          <div className="w-full rounded-2xl bg-white/10 ring-1 ring-white/15 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-white">{primary.label}</p>
            <p className="text-[11px] text-white/70 mt-1" dir="auto">
              {primary.sub}
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={primary.disabled || primary.pending}
            onClick={primary.action}
            className={
              "group relative w-full overflow-hidden rounded-2xl px-5 py-5 text-base font-semibold shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed " +
              (primary.tone === "in"
                ? "bg-white text-primary hover:bg-white/95"
                : primary.tone === "out"
                  ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
                  : primary.tone === "locked"
                    ? "bg-white/10 text-white/80 ring-1 ring-white/20 hover:bg-white/15"
                    : "bg-white/15 text-white/70 ring-1 ring-white/20")
            }
          >
            <span className="flex items-center justify-center gap-2.5">
              {primary.pending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : primary.tone === "in" ? (
                <LogIn className="size-5" />
              ) : primary.tone === "out" ? (
                <LogOut className="size-5" />
              ) : primary.tone === "locked" ? (
                <Timer className="size-5" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
              <span className="text-lg">{primary.label}</span>
            </span>
            <span className="mt-1 block text-xs font-normal opacity-80" dir="auto">
              {primary.sub}
            </span>
            {primary.tone === "locked" && canOverride && (
              <span className="mt-1 block text-[10px] font-normal text-amber-200">
                تجاوز يدوي (Admin/HR)
              </span>
            )}
          </button>
        )}
      </div>

      {/* Any override bypasses the normal punch window and must be a
          deliberate, confirmed action — never a single click that looks
          like a routine status button. */}
      {/* Legitimate re-punch of checkout — last punch wins (see
          attendance_punches). Not an override: just correcting an earlier
          tap while still within the checkout-eligible window. */}
      {win?.phase === "done" && win.can_act && (
        <button
          type="button"
          onClick={() => outMut.mutate()}
          disabled={outMut.isPending}
          className="w-full mt-2 rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/15 px-4 py-2.5 text-xs text-white/80 transition disabled:opacity-50"
        >
          {outMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin inline ms-1.5" />
          ) : (
            <Timer className="size-3.5 inline ms-1.5" />
          )}
          تسجيل انصراف جديد (يُعتمد كآخر وقت)
        </button>
      )}

      <AlertDialog open={overrideConfirmOpen} onOpenChange={setOverrideConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {primary.isOverride === "out"
                ? "تسجيل انصراف خارج وقته المحدد؟"
                : "تسجيل حضور خارج وقته المحدد؟"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {primary.isOverride === "out"
                ? "الوقت الحالي قبل فتح نافذة الانصراف الرسمية. هذا تجاوز إداري (Admin/HR) سيُسجَّل في سجل التدقيق."
                : "الوقت الحالي خارج نافذة تسجيل الحضور الرسمية. هذا تجاوز إداري (Admin/HR) سيُسجَّل في سجل التدقيق."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOverrideOn(true);
                if (primary.isOverride === "out") outMut.mutate();
                else inMut.mutate();
                setOverrideConfirmOpen(false);
              }}
            >
              تأكيد التجاوز
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StatusPill({ isWorking, isDone }: { isWorking: boolean; isDone: boolean }) {
  if (isDone) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 ring-1 ring-emerald-300/40 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
        <CheckCircle2 className="size-3" /> اكتمل
      </span>
    );
  }
  if (isWorking) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 ring-1 ring-emerald-300/40 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
        </span>
        على رأس العمل
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/20 px-2.5 py-1 text-[11px] font-medium text-white/80">
      لم تسجّل بعد
    </span>
  );
}

function MiniStat({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "success" | "warning" | "danger";
}) {
  const toneRing =
    tone === "success"
      ? "ring-emerald-400/40 bg-emerald-500/10"
      : tone === "warning"
        ? "ring-amber-400/40 bg-amber-500/10"
        : tone === "danger"
          ? "ring-rose-400/40 bg-rose-500/10"
          : "ring-white/10 bg-white/5";
  const toneText =
    tone === "success"
      ? "text-emerald-200"
      : tone === "warning"
        ? "text-amber-200"
        : tone === "danger"
          ? "text-rose-200"
          : highlight
            ? "text-emerald-200"
            : "text-white";
  return (
    <div className={`rounded-xl p-2.5 min-w-0 ring-1 ${toneRing}`}>
      <p className="text-[10px] text-white/60 truncate">{label}</p>
      <p
        dir="ltr"
        className={"text-sm font-semibold mt-1 tabular-nums truncate text-start " + toneText}
      >
        {value}
      </p>
    </div>
  );
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
/** Riyadh wall-clock minutes-of-day for an arbitrary Date — not browser-local time. */
function nowMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function TimelineBar({
  checkIn,
  checkOut,
  now,
  workStart,
  workEnd,
}: {
  checkIn: string | null;
  checkOut: string | null;
  now: Date;
  workStart: string | null;
  workEnd: string | null;
}) {
  const startM = workStart ? toMinutes(workStart) : 8 * 60;
  const endM = workEnd ? toMinutes(workEnd) : 17 * 60;
  const span = Math.max(60, endM - startM);
  const pct = (mins: number) => Math.min(100, Math.max(0, ((mins - startM) / span) * 100));

  const inM = checkIn ? nowMinutes(new Date(checkIn)) : null;
  const outM = checkOut ? nowMinutes(new Date(checkOut)) : null;
  const nowM = nowMinutes(now);

  const segStart = inM != null ? pct(inM) : null;
  const segEnd = outM != null ? pct(outM) : inM != null ? pct(Math.min(nowM, endM)) : null;

  return (
    <div className="space-y-1.5" dir="rtl">
      {/*
        RTL mirror: positioned with `right` (not `left`) so 0% (start of day /
        check-in) sits at the right edge — matching Arabic reading direction —
        and 100% (end of day / check-out) sits at the left edge.
      */}
      <div className="relative h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
        {segStart != null && segEnd != null && (
          <div
            className="absolute inset-y-0 bg-gradient-to-l from-emerald-300 to-cyan-300"
            style={{ right: `${segStart}%`, width: `${Math.max(2, segEnd - segStart)}%` }}
          />
        )}
        {nowM >= startM && nowM <= endM && (
          <div
            className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-white ring-2 ring-primary"
            style={{ right: `calc(${pct(nowM)}% - 5px)` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-white/60 tabular-nums">
        <span dir="ltr">{minToHHMM(startM)}</span>
        <span dir="ltr">{minToHHMM(endM)}</span>
      </div>
    </div>
  );
}

/** Flexible-hours bar: shows early / on-time / late / half-day zones */
function FlexBar({
  rule,
  now,
  checkIn,
}: {
  rule: AttendanceRule;
  now: Date;
  checkIn: string | null;
}) {
  const earlyM = rule.early_window_start
    ? toMinutes(rule.early_window_start)
    : toMinutes(rule.work_start) - 120;
  const startM = toMinutes(rule.work_start);
  const graceM = startM + (rule.late_grace_minutes ?? 0);
  const lateEndM = rule.late_window_end ? toMinutes(rule.late_window_end) : startM + 180;

  const left = earlyM - 30;
  const right = lateEndM + 30;
  const span = right - left;
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - left) / span) * 100));

  const nowM = nowMinutes(now);
  const checkInM = checkIn ? nowMinutes(new Date(checkIn)) : null;
  // Out-of-range guard: a punch far outside the displayed window (e.g. an
  // admin-override punch at night) would otherwise clamp the dot to the
  // edge, indistinguishable from a legitimate boundary time.
  const checkInOutOfRange = checkInM != null && (checkInM < left || checkInM > right);

  const zones = [
    { from: earlyM, to: startM, color: "bg-sky-400/60", label: "مبكر" },
    { from: startM, to: graceM, color: "bg-emerald-400/70", label: "رسمي" },
    { from: graceM, to: lateEndM, color: "bg-amber-400/60", label: "متأخر" },
    { from: lateEndM, to: right, color: "bg-rose-400/60", label: "نصف يوم" },
  ];

  if (checkInOutOfRange) {
    return (
      <div className="space-y-2" dir="rtl">
        <div className="rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-[11px] text-white/80 flex items-center justify-between gap-2">
          <span>خارج نطاق الدوام المعروض</span>
          <span dir="ltr" className="tabular-nums font-medium text-white">
            {minToHHMM(checkInM!)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      {/*
        RTL mirror: positioned with `right` (not `left`) so the earliest zone
        (مبكر) sits at the right edge — matching Arabic reading direction —
        and the latest zone (نصف يوم) sits at the left edge.
      */}
      <div className="relative h-3 w-full rounded-full bg-white/10 overflow-hidden">
        {zones.map((z, i) => (
          <div
            key={i}
            className={`absolute inset-y-0 ${z.color}`}
            style={{ right: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%` }}
          />
        ))}
        {checkInM != null && (
          <div
            className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white ring-2 ring-emerald-500 shadow"
            style={{ right: `calc(${pct(checkInM)}% - 6px)` }}
          />
        )}
        {nowM >= left && nowM <= right && checkInM == null && (
          <div
            className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white ring-2 ring-primary shadow animate-pulse"
            style={{ right: `calc(${pct(nowM)}% - 6px)` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-white/60 tabular-nums">
        <span dir="ltr">{minToHHMM(earlyM)}</span>
        <span dir="ltr">{minToHHMM(startM)}</span>
        <span dir="ltr">{minToHHMM(graceM)}</span>
        <span dir="ltr">{minToHHMM(lateEndM)}</span>
      </div>
    </div>
  );
}

function minToHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function MonthChip({ summary }: { summary: MyAttendanceContext["month_summary"] }) {
  // Visual-only summary — no numbers, no money amounts (per user request).
  const total = Math.max(
    1,
    summary.present + summary.early + summary.late + summary.half_day + summary.absent,
  );
  const bars: { key: string; label: string; count: number; color: string; ring: string }[] = [
    {
      key: "present",
      label: "حاضر",
      count: summary.present,
      color: "bg-emerald-500",
      ring: "ring-emerald-500/20",
    },
    {
      key: "early",
      label: "مبكر",
      count: summary.early,
      color: "bg-sky-500",
      ring: "ring-sky-500/20",
    },
    {
      key: "late",
      label: "متأخر",
      count: summary.late,
      color: "bg-amber-500",
      ring: "ring-amber-500/20",
    },
    {
      key: "half_day",
      label: "نصف يوم",
      count: summary.half_day,
      color: "bg-orange-500",
      ring: "ring-orange-500/20",
    },
    {
      key: "absent",
      label: "غائب",
      count: summary.absent,
      color: "bg-rose-500",
      ring: "ring-rose-500/20",
    },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileBarChart2 className="size-4" /> ملخص هذا الشهر
        </CardTitle>
        <CardDescription className="text-[11px]">
          مؤشرات بصرية فقط — تفاصيل الأرقام في التقرير الشهري.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-muted" dir="rtl">
          {bars.map((b) => (
            <div
              key={b.key}
              className={b.color}
              style={{ width: `${(b.count / total) * 100}%` }}
              title={b.label}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {bars.map((b) => (
            <div
              key={b.key}
              className={`flex items-center gap-2 rounded-md bg-muted/40 ring-1 ${b.ring} px-2.5 py-1.5`}
            >
              <span className={`size-2 rounded-full ${b.color}`} />
              <span className="text-[11px] text-foreground/80 truncate">{b.label}</span>
              {b.count > 0 && <span className="ms-auto size-1.5 rounded-full bg-foreground/30" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p dir="ltr" className={`font-bold tabular-nums text-start ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function WeekSummary({ records }: { records: AttendanceRecord[] }) {
  // `records` arrives newest-first from the server. Keep that order and let
  // dir="rtl" place the first (most recent / today) chip at the right edge —
  // the natural reading-start position, matching the recent-records list
  // below it. The previous `.reverse()` combined with a hardcoded dir="ltr"
  // fought each other and made the strip look unsorted.
  const last7 = records.slice(0, 7);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">آخر ٧ أيام</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2 pt-0" dir="rtl">
        {last7.length === 0 && <p className="text-xs text-muted-foreground">لا توجد سجلات</p>}
        {last7.map((r) => {
          const s = statusMap[r.status];
          return (
            <div
              key={r.id}
              className={`flex-1 rounded-xl ring-1 p-2 text-center min-w-0 ${s.tone}`}
            >
              <p className="text-[10px] opacity-80 truncate">{fmtDayShort(r.work_date)}</p>
              <p className="text-[10px] opacity-70 truncate tabular-nums" dir="ltr">
                {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(
                  new Date(r.work_date),
                )}
              </p>
              <p className="text-xs font-semibold mt-0.5 truncate">{s.label}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function correctionChip(c: CorrectionInfo | undefined) {
  if (!c) return null;
  if (c.status === "pending") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-amber-400/60 text-amber-700 dark:text-amber-300"
      >
        تصحيح: قيد المراجعة
      </Badge>
    );
  }
  if (c.status === "approved") {
    return <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">تصحيح مقبول</Badge>;
  }
  if (c.status === "rejected") {
    return (
      <Badge variant="destructive" className="text-[10px]">
        تصحيح مرفوض
      </Badge>
    );
  }
  return null;
}

function RecentList({
  records,
  rule,
}: {
  records: AttendanceRecord[];
  rule: AttendanceRule | null;
}) {
  const fetcher = useServerFn(listMyCorrections);
  const { data: corrections = [] } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-corrections"], queryFn: () => fetcher() }),
  );
  const byRecord = new Map<string, CorrectionInfo>();
  for (const c of corrections) {
    if (!byRecord.has(c.work_date)) byRecord.set(c.work_date, c);
  }

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = records.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      if (!r.work_date.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">السجلات الأخيرة</CardTitle>
            <CardDescription>آخر ١٤ يومًا</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالتاريخ YYYY-MM-DD"
              dir="ltr"
              className="h-8 w-40 text-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="present">حاضر</SelectItem>
                <SelectItem value="early">مبكر</SelectItem>
                <SelectItem value="late">متأخر</SelectItem>
                <SelectItem value="half_day">نصف يوم</SelectItem>
                <SelectItem value="absent">غائب</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="text-center py-10 text-sm text-muted-foreground">لا توجد سجلات مطابقة</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const s = statusMap[r.status];
              const worked =
                r.check_in_at && r.check_out_at ? diffHM(r.check_in_at, r.check_out_at) : null;
              const isMissed = r.notes === "missed_checkout" && !r.check_out_at;
              const corr = byRecord.get(r.work_date);
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 p-3 sm:p-4 ${isMissed ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}`}
                >
                  <div
                    className={`shrink-0 grid place-items-center size-10 rounded-xl ring-1 ${s.tone}`}
                  >
                    {isMissed ? (
                      <AlertTriangle className="size-4" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" dir="rtl">
                      <bdi>{fmtDayShort(r.work_date)}</bdi>
                    </p>
                    <p className="text-xs text-muted-foreground truncate" dir="rtl">
                      <bdi dir="ltr" className="tabular-nums">
                        {fmtTime(r.check_in_at)} — {isMissed ? "—" : fmtTime(r.check_out_at)}
                      </bdi>
                      {isMissed && (
                        <span className="mx-1 text-amber-700 dark:text-amber-300">
                          نسيت الانصراف
                        </span>
                      )}
                      {worked && (
                        <span className="mx-1">
                          <bdi dir="ltr" className="tabular-nums">
                            · {worked}
                          </bdi>
                        </span>
                      )}
                      {r.late_minutes > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {" "}
                          ·{" "}
                          <bdi dir="ltr" className="tabular-nums">
                            +{r.late_minutes}m
                          </bdi>
                        </span>
                      )}
                      {Number((r as any).early_leave_minutes) > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {" "}
                          ·{" "}
                          <bdi dir="ltr" className="tabular-nums">
                            -{(r as any).early_leave_minutes}m
                          </bdi>{" "}
                          خروج مبكر
                        </span>
                      )}
                      {(Number(r.late_deduction_amount) > 0 ||
                        Number((r as any).early_leave_deduction_amount) > 0 ||
                        r.status === "absent" ||
                        r.status === "half_day") && (
                        <>
                          <span className="text-destructive">
                            {" "}
                            ·{" "}
                            <bdi dir="ltr" className="tabular-nums">
                              −
                              {fmtMoney(
                                Number(r.late_deduction_amount || 0) +
                                  Number((r as any).early_leave_deduction_amount || 0),
                              )}
                            </bdi>
                          </span>
                          <DeductionExplainDialog record={r} rule={rule} />
                        </>
                      )}
                      <AttendanceHistoryDialog record={r} />
                    </p>
                    {corr && corr.status === "rejected" && corr.review_note && (
                      <p className="text-[11px] text-destructive/80 mt-0.5 truncate">
                        سبب الرفض: {corr.review_note}
                      </p>
                    )}
                    {corr && corr.status === "approved" && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                        اعتُمد وقت الانصراف{" "}
                        <span dir="ltr" className="tabular-nums">
                          {corr.suggested_check_out}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {correctionChip(corr)}
                    {r.manually_edited && (
                      <Badge variant="outline" className="text-[10px]">
                        معدّل
                      </Badge>
                    )}
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {r.check_in_at && (!corr || corr.status !== "pending") && (
                      <RequestTimeAdjustmentDialog record={r} rule={rule} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- Team --------------------

interface HistoricalImportRow {
  employee_no?: string | number;
  work_date?: string;
  check_in?: string;
  check_out?: string;
  status?: string;
}

/**
 * Manager/HR-only: bulk backfill historical attendance from an Excel
 * sheet — e.g. months predating this system's use, or a paper log being
 * digitized. Bypasses the live-punch window/geo/WebAuthn checks entirely
 * (this is data entry, not a real-time punch) but still recomputes status
 * via the same classification engine for consistency. A manager can only
 * import for their own department's employees; HR can import for anyone —
 * both enforced server-side regardless of what this UI shows.
 */
function HistoricalAttendanceImportDialog() {
  const user = useCurrentUser();
  const canImport = hasAnyRole(user, ["hr_admin", "dept_manager"]);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HistoricalImportRow[]>([]);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    skipped: Array<{ employee_no: string; work_date: string; reason: string }>;
  } | null>(null);
  const qc = useQueryClient();
  const importFn = useServerFn(bulkImportHistoricalAttendance);

  const mut = useMutation({
    mutationFn: () => {
      const cleaned = rows.map((r) => ({
        employee_no: String(r.employee_no ?? "").trim(),
        work_date: String(r.work_date ?? "").trim(),
        check_in: r.check_in ? String(r.check_in).trim() : null,
        check_out: r.check_out ? String(r.check_out).trim() : null,
        status:
          r.status &&
          ["present", "late", "absent", "leave", "early", "half_day"].includes(String(r.status))
            ? (r.status as "present" | "late" | "absent" | "leave" | "early" | "half_day")
            : undefined,
      }));
      return importFn({ data: { rows: cleaned } });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`تم إدراج ${r.inserted} وتحديث ${r.updated} سجل`);
      qc.invalidateQueries({ queryKey: ["team-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File) {
    try {
      const parsed = await readExcelFile<HistoricalImportRow>(file);
      setRows(parsed);
      setResult(null);
      toast.success(`قُرئ ${parsed.length} صف`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذّر قراءة الملف");
    }
  }

  function downloadTemplate() {
    exportToExcel(
      [
        {
          employee_no: "1001",
          work_date: "2026-03-05",
          check_in: "09:00",
          check_out: "17:05",
          status: "",
        },
        {
          employee_no: "1001",
          work_date: "2026-03-06",
          check_in: "",
          check_out: "",
          status: "absent",
        },
      ],
      "attendance-historical-import-template.xlsx",
      "نموذج",
    );
  }

  if (!canImport) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setRows([]);
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-3.5" />
          استيراد حضور أشهر سابقة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>استيراد حضور تاريخي من إكسل</DialogTitle>
          <DialogDescription>
            {hasAnyRole(user, ["hr_admin"])
              ? "يشمل موظفي كل الأقسام."
              : "يقتصر على موظفي قسمك فقط — يُتجاهل أي صف لموظف خارج قسمك."}{" "}
            الأعمدة المطلوبة:{" "}
            <code className="text-xs">employee_no, work_date, check_in, check_out, status</code>.
            اترك check_in وcheck_out فارغين وضع status=absent لتسجيل يوم غياب صراحةً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileBarChart2 className="size-3.5" />
              تنزيل نموذج
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <span className="inline-flex items-center gap-1.5 text-sm rounded-md border px-3 py-1.5 cursor-pointer hover:bg-muted">
                <Upload className="size-3.5" />
                اختيار ملف
              </span>
            </label>
            {rows.length > 0 && (
              <span className="text-xs text-muted-foreground self-center">
                {rows.length} صف جاهز للاستيراد
              </span>
            )}
          </div>

          {result && (
            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <p>
                ✅ أُدرج <b>{result.inserted}</b> سجل جديد، وحُدِّث <b>{result.updated}</b> سجل
                قائم.
              </p>
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-amber-600 font-medium mb-1">
                    تم تخطي {result.skipped.length} صف:
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {result.skipped.map((s, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {s.employee_no} · {s.work_date} — {s.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || rows.length === 0}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} استيراد{" "}
            {rows.length || ""} صف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamAttendance({ canEdit }: { canEdit: boolean }) {
  const fetcher = useServerFn(listTeamAttendance);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["team-attendance"], queryFn: () => fetcher() }),
  );

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">سجلات آخر ٣٠ يومًا</CardTitle>
        <HistoricalAttendanceImportDialog />
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">الموظف</TableHead>
              <TableHead className="text-start">اليوم</TableHead>
              <TableHead className="text-start">حضور</TableHead>
              <TableHead className="text-start">انصراف</TableHead>
              <TableHead className="text-start">تأخير</TableHead>
              <TableHead className="text-start">خصم</TableHead>
              <TableHead className="text-start">الحالة</TableHead>
              {canEdit && <TableHead className="text-start w-16">إجراء</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 8 : 7}
                  className="text-center py-10 text-muted-foreground"
                >
                  لا توجد سجلات بعد
                </TableCell>
              </TableRow>
            ) : (
              data.map((r) => {
                const s = statusMap[r.status];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell>
                      <span dir="ltr" className="tabular-nums">
                        {fmtDate(r.work_date)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span dir="ltr" className="tabular-nums">
                        {fmtTime(r.check_in_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span dir="ltr" className="tabular-nums">
                        {fmtTime(r.check_out_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span dir="ltr" className="tabular-nums">
                        {r.late_minutes > 0 ? `${r.late_minutes}m` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span dir="ltr" className="tabular-nums">
                        {Number(r.late_deduction_amount) > 0
                          ? fmtMoney(r.late_deduction_amount)
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-center">
                        <Badge variant={s.variant}>{s.label}</Badge>
                        {r.manually_edited && (
                          <Badge variant="outline" className="text-[10px]">
                            معدّل
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <AdminEditDialog record={r} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AdminEditDialog({ record }: { record: AttendanceRecord }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [lateMin, setLateMin] = useState(String(record.late_minutes));
  const [deduction, setDeduction] = useState(String(record.late_deduction_amount));
  const [reason, setReason] = useState("");

  const qc = useQueryClient();
  const editFn = useServerFn(adminEditAttendance);
  const mutation = useMutation({
    mutationFn: () =>
      editFn({
        data: {
          id: record.id,
          status,
          late_minutes: Number(lateMin) || 0,
          late_deduction_amount: Number(deduction) || 0,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("تم تعديل السجل");
      qc.invalidateQueries({ queryKey: ["team-attendance"] });
      qc.invalidateQueries({ queryKey: ["monthly-report"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل سجل الحضور</DialogTitle>
          <DialogDescription>
            {record.employee_name} · <span dir="ltr">{fmtDate(record.work_date)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(statusMap) as AttendanceStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {statusMap[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>دقائق التأخر</Label>
              <Input
                type="number"
                min="0"
                value={lateMin}
                onChange={(e) => setLateMin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>مبلغ الخصم</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={deduction}
                onChange={(e) => setDeduction(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>سبب التعديل</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تأكيد من المدير المباشر"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Monthly Report --------------------

// re-export to avoid unused warning for fmtTimeWithSeconds in future use
void fmtTimeWithSeconds;
