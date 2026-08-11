// Extracted from the attendance route to keep that file reviewable and to
// move the (heavy, management-only) monthly report and rules editor out of
// the route's initial chunk.
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

function WindowPreview({
  workStart,
  workEnd,
  checkinBefore,
  checkinAfter,
  checkoutBefore,
  checkoutAfter,
}: {
  workStart: string;
  workEnd: string;
  checkinBefore: string;
  checkinAfter: string;
  checkoutBefore: string;
  checkoutAfter: string;
}) {
  function shift(hhmm: string, deltaMin: number): string {
    const [h, m] = hhmm.split(":").map(Number);
    let total = h * 60 + m + deltaMin;
    total = Math.max(0, Math.min(24 * 60 - 1, total));
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const inStart = shift(workStart, -(Number(checkinBefore) || 0));
  const inEnd = shift(workStart, Number(checkinAfter) || 0);
  const outStart = shift(workEnd, -(Number(checkoutBefore) || 0));
  const outEnd = shift(workEnd, Number(checkoutAfter) || 0);
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground flex flex-wrap gap-3">
      <span>
        الحضور مفتوح{" "}
        <span dir="ltr" className="tabular-nums font-medium text-foreground">
          {inStart}–{inEnd}
        </span>
      </span>
      <span>·</span>
      <span>
        الانصراف مفتوح{" "}
        <span dir="ltr" className="tabular-nums font-medium text-foreground">
          {outStart}–{outEnd}
        </span>
      </span>
    </div>
  );
}

export function MonthlyReport() {
  const [period, setPeriod] = useState(monthKey());
  const fetcher = useServerFn(listMonthlyReport);
  const { data, isFetching } = useSuspenseQuery(
    queryOptions({
      queryKey: ["monthly-report", period],
      queryFn: () => fetcher({ data: { period_month: period } }),
    }),
  );

  function shiftMonth(d: number) {
    const dt = new Date(period);
    dt.setMonth(dt.getMonth() + d);
    setPeriod(monthKey(dt));
  }

  const totals = useMemo(
    () =>
      data.reduce(
        (a, r) => ({
          late: a.late + r.total_late_minutes,
          lateDed: a.lateDed + r.total_late_deduction,
          absDed: a.absDed + r.total_absence_deduction,
        }),
        { late: 0, lateDed: 0, absDed: 0 },
      ),
    [data],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">التقرير الشهري</CardTitle>
            <CardDescription>إجمالي الحضور والتأخر والخصومات لكل الموظفين</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
              <ChevronRight className="size-4" />
            </Button>
            <span dir="ltr" className="font-semibold tabular-nums min-w-[120px] text-center">
              {fmtMonthLabel(period)}
            </span>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <ExportAttendanceCsvButton
              from={`${period}-01`}
              to={new Date(
                new Date(period + "-01").getFullYear(),
                new Date(period + "-01").getMonth() + 1,
                0,
              )
                .toISOString()
                .slice(0, 10)}
            />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3" dir="rtl">
          <TotalTile label="إجمالي دقائق التأخر" value={fmtInt(totals.late)} />
          <TotalTile label="خصم التأخر" value={fmtMoney(totals.lateDed)} tone="amber" />
          <TotalTile label="خصم الغياب" value={fmtMoney(totals.absDed)} tone="rose" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isFetching && (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" /> جاري التحديث…
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">الموظف</TableHead>
                <TableHead className="text-start">حاضر</TableHead>
                <TableHead className="text-start">مبكر</TableHead>
                <TableHead className="text-start">متأخر</TableHead>
                <TableHead className="text-start">نصف يوم</TableHead>
                <TableHead className="text-start">غياب</TableHead>
                <TableHead className="text-start">دقائق تأخر</TableHead>
                <TableHead className="text-start">خصم تأخر</TableHead>
                <TableHead className="text-start">خصم غياب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    لا توجد بيانات لهذا الشهر
                  </TableCell>
                </TableRow>
              )}
              {data.map((r: MonthlyEmployeeReport) => (
                <TableRow key={r.employee_id}>
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                  <TableCell>
                    <Num value={r.present_days} />
                  </TableCell>
                  <TableCell>
                    <Num value={r.early_days} />
                  </TableCell>
                  <TableCell>
                    <Num value={r.late_days} />
                  </TableCell>
                  <TableCell>
                    <Num value={r.half_day_days} />
                  </TableCell>
                  <TableCell>
                    <Num value={r.absent_days} />
                  </TableCell>
                  <TableCell>
                    <Num value={r.total_late_minutes} />
                  </TableCell>
                  <TableCell>
                    <Money value={r.total_late_deduction} />
                  </TableCell>
                  <TableCell>
                    <Money value={r.total_absence_deduction} />
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

function Num({ value }: { value: number }) {
  return (
    <span dir="ltr" className="tabular-nums">
      {fmtInt(value)}
    </span>
  );
}
function Money({ value }: { value: number }) {
  return (
    <span dir="ltr" className={"tabular-nums " + (value > 0 ? "text-destructive" : "")}>
      {fmtMoney(value)}
    </span>
  );
}

function TotalTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "rose";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20"
      : tone === "rose"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20"
        : "bg-primary/5 text-primary ring-primary/20";
  return (
    <div className={`rounded-xl ring-1 p-3 ${cls}`}>
      <p className="text-[11px] opacity-80">{label}</p>
      <p dir="ltr" className="font-bold text-lg tabular-nums mt-1 text-start">
        {value}
      </p>
    </div>
  );
}

// -------------------- Rules --------------------

export function RulesManager() {
  const fetcher = useServerFn(listAttendanceRules);
  const depsFn = useServerFn(listDepartments);
  const { data: rules } = useSuspenseQuery(
    queryOptions({ queryKey: ["attendance-rules"], queryFn: () => fetcher() }),
  );
  const { data: deps } = useSuspenseQuery(
    queryOptions({ queryKey: ["departments"], queryFn: () => depsFn() }),
  );

  const depName = (id: string | null) =>
    id ? (deps.find((d) => d.id === id)?.name ?? "—") : "افتراضية (المؤسسة)";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          القاعدة الافتراضية تنطبق على من لا قاعدة خاصة بقسمه.
        </p>
        <RuleDialog deps={deps} />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">القسم</TableHead>
              <TableHead className="text-start">ساعات العمل</TableHead>
              <TableHead className="text-start">النوع</TableHead>
              <TableHead className="text-start">سماح</TableHead>
              <TableHead className="text-start">خصم تأخير/د</TableHead>
              <TableHead className="text-start">خصم غياب</TableHead>
              <TableHead className="text-start">الموقع</TableHead>
              <TableHead className="text-start w-28">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{depName(r.department_id)}</TableCell>
                <TableCell>
                  <span dir="ltr" className="tabular-nums">
                    {r.work_start.slice(0, 5)} → {r.work_end.slice(0, 5)}
                  </span>
                </TableCell>
                <TableCell>
                  {r.flex_enabled ? (
                    <Badge variant="secondary">مرن</Badge>
                  ) : (
                    <Badge variant="outline">ثابت</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Num value={r.late_grace_minutes} /> د
                </TableCell>
                <TableCell>
                  <Num value={r.late_deduction_per_minute} />
                </TableCell>
                <TableCell>
                  {(r as { absence_calc_mode?: string }).absence_calc_mode === "fixed_amount" ? (
                    <Num value={r.absence_deduction} />
                  ) : (
                    <span className="text-xs text-muted-foreground">الراتب ÷ 30</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.require_geo ? (
                    <Badge variant="secondary">
                      <MapPin className="size-3" /> {r.geo_radius_m}م
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <RuleDialog deps={deps} rule={r} />
                    {r.department_id && <DeleteRuleButton id={r.id} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/**
 * Special work-hours periods (Ramadan/summer hours) — a genuine Saudi
 * Labor Law requirement (reduced Ramadan hours) that Jisr advertises
 * explicitly. Overrides work_start/work_end for classification while
 * active, company-wide or scoped to one department, taking precedence
 * over an individual's regular assigned shift.
 */
function SpecialWorkPeriodsManager({ deps }: { deps: { id: string; name: string }[] }) {
  const fetcher = useServerFn(listSpecialWorkPeriods);
  const { data: periods = [] } = useSuspenseQuery(
    queryOptions({ queryKey: ["special-work-periods"], queryFn: () => fetcher() }),
  );
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteSpecialWorkPeriod);
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["special-work-periods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm font-semibold">ساعات العمل الخاصة (رمضان / الصيف)</p>
          <p className="text-xs text-muted-foreground">
            تُطبَّق تلقائياً بديلاً عن ساعات القسم خلال الفترة المحددة.
          </p>
        </div>
        <SpecialWorkPeriodDialog deps={deps} />
      </div>
      {periods.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد فترات خاصة معرَّفة حالياً.</p>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">الاسم</TableHead>
                <TableHead className="text-start">القسم</TableHead>
                <TableHead className="text-start">من</TableHead>
                <TableHead className="text-start">إلى</TableHead>
                <TableHead className="text-start">ساعات العمل</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name_ar}</TableCell>
                  <TableCell>{p.department_name ?? "كل الأقسام"}</TableCell>
                  <TableCell dir="ltr" className="text-xs">
                    {fmtDate(p.start_date)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-xs">
                    {fmtDate(p.end_date)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-xs">
                    {p.work_start.slice(0, 5)}–{p.work_end.slice(0, 5)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => del.mutate(p.id)}
                      disabled={del.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function SpecialWorkPeriodDialog({ deps }: { deps: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("15:00");
  const qc = useQueryClient();
  const saveFn = useServerFn(upsertSpecialWorkPeriod);
  const m = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name_ar: nameAr,
          department_id: departmentId === "all" ? null : departmentId,
          start_date: startDate,
          end_date: endDate,
          work_start: workStart,
          work_end: workEnd,
        },
      }),
    onSuccess: () => {
      toast.success("تم إضافة الفترة");
      qc.invalidateQueries({ queryKey: ["special-work-periods"] });
      setOpen(false);
      setNameAr("");
      setStartDate("");
      setEndDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" /> إضافة فترة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>فترة ساعات عمل خاصة</DialogTitle>
          <DialogDescription>مثال: رمضان — 09:00 إلى 15:00 لكل الأقسام.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>الاسم</Label>
            <Input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="رمضان ١٤٤٧"
            />
          </div>
          <div className="space-y-2">
            <Label>القسم</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {deps.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>بداية الدوام</Label>
              <Input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>نهاية الدوام</Label>
              <Input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !nameAr || !startDate || !endDate}
          >
            {m.isPending && <Loader2 className="size-4 animate-spin" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  deps,
  rule,
}: {
  deps: { id: string; name: string }[];
  rule?: AttendanceRule;
}) {
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState<string>(rule?.department_id ?? "global");
  const [workStart, setWorkStart] = useState(rule?.work_start?.slice(0, 5) ?? "09:00");
  const [workEnd, setWorkEnd] = useState(rule?.work_end?.slice(0, 5) ?? "17:00");
  const [grace, setGrace] = useState(String(rule?.late_grace_minutes ?? 15));
  const [absenceDed, setAbsenceDed] = useState(String(rule?.absence_deduction ?? 0));
  const [absenceCalcMode, setAbsenceCalcMode] = useState<"salary_per_30" | "fixed_amount">(
    (rule as { absence_calc_mode?: "salary_per_30" | "fixed_amount" } | undefined)
      ?.absence_calc_mode ?? "salary_per_30",
  );
  const [lateDed, setLateDed] = useState(String(rule?.late_deduction_per_minute ?? 0));
  const [requireGeo, setRequireGeo] = useState(rule?.require_geo ?? false);
  const [geoLat, setGeoLat] = useState(rule?.geo_lat?.toString() ?? "");
  const [geoLng, setGeoLng] = useState(rule?.geo_lng?.toString() ?? "");
  const [radius, setRadius] = useState(String(rule?.geo_radius_m ?? 200));
  const [networkLabel, setNetworkLabel] = useState(
    (rule as { network_label?: string | null } | undefined)?.network_label ?? "",
  );
  const [ipRanges, setIpRanges] = useState(
    ((rule as { allowed_ip_ranges?: string[] } | undefined)?.allowed_ip_ranges ?? []).join("\n"),
  );
  const [requireWebauthn, setRequireWebauthn] = useState(rule?.require_webauthn ?? false);
  const [requireSelfie, setRequireSelfie] = useState(rule?.require_selfie ?? false);
  // Flex
  const [flexEnabled, setFlexEnabled] = useState(rule?.flex_enabled ?? false);
  const [earlyStart, setEarlyStart] = useState(rule?.early_window_start?.slice(0, 5) ?? "07:00");
  const [lateEnd, setLateEnd] = useState(rule?.late_window_end?.slice(0, 5) ?? "11:00");
  const [checkoutBefore, setCheckoutBefore] = useState(
    String(rule?.checkout_window_before_min ?? 60),
  );
  const [checkoutAfter, setCheckoutAfter] = useState(String(rule?.checkout_window_after_min ?? 60));
  const [checkinBefore, setCheckinBefore] = useState(String(rule?.checkin_window_before_min ?? 60));
  const [checkinAfter, setCheckinAfter] = useState(String(rule?.checkin_window_after_min ?? 120));
  const [halfDayDed, setHalfDayDed] = useState(String(rule?.half_day_deduction ?? 0));
  const [earlyLeaveEnabled, setEarlyLeaveEnabled] = useState(
    rule?.early_leave_deduction_enabled ?? false,
  );
  const [earlyLeaveGrace, setEarlyLeaveGrace] = useState(
    String(rule?.early_leave_grace_minutes ?? 0),
  );
  const [earlyLeaveRate, setEarlyLeaveRate] = useState(
    String(rule?.early_leave_deduction_per_minute ?? 0),
  );
  const [tiers, setTiers] = useState<LateTier[]>(
    rule?.tiered_late_deduction ?? [
      { from: 1, to: 15, rate: 0 },
      { from: 16, to: 30, rate: 1 },
      { from: 31, to: 60, rate: 2 },
    ],
  );

  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertAttendanceRule);
  const mutation = useMutation({
    mutationFn: (vars: any) => upsertFn({ data: vars }),
    onSuccess: () => {
      toast.success("تم حفظ القاعدة");
      qc.invalidateQueries({ queryKey: ["attendance-rules"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function captureLocation() {
    if (!navigator.geolocation) return toast.error("المتصفح لا يدعم الموقع");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeoLat(p.coords.latitude.toString());
        setGeoLng(p.coords.longitude.toString());
        toast.success("تم تحديد الموقع");
      },
      (e) => toast.error(e.message),
    );
  }

  const myIpFn = useServerFn(getMyNetworkIp);
  async function fillCurrentNetworkIp() {
    try {
      const { ip } = await myIpFn({ data: {} as never });
      if (!ip) return toast.error("تعذر قراءة عنوان الشبكة");
      setIpRanges((prev) => (prev.trim() ? prev.trimEnd() + "\n" + ip : ip));
      toast.success(`أُضيف عنوان شبكتك الحالية: ${ip}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر قراءة العنوان");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      id: rule?.id,
      department_id: departmentId === "global" ? null : departmentId,
      work_start: workStart,
      work_end: workEnd,
      late_grace_minutes: Number(grace) || 0,
      absence_deduction: Number(absenceDed) || 0,
      absence_calc_mode: absenceCalcMode,
      late_deduction_per_minute: Number(lateDed) || 0,
      require_geo: requireGeo,
      geo_lat: geoLat ? Number(geoLat) : null,
      geo_lng: geoLng ? Number(geoLng) : null,
      geo_radius_m: Number(radius) || 200,
      require_webauthn: requireWebauthn,
      require_selfie: requireSelfie,
      flex_enabled: flexEnabled,
      early_window_start: flexEnabled ? earlyStart : null,
      late_window_end: flexEnabled ? lateEnd : null,
      half_day_deduction: Number(halfDayDed) || 0,
      tiered_late_deduction: flexEnabled ? tiers : [],
      checkout_window_before_min: Number(checkoutBefore) || 0,
      checkout_window_after_min: Number(checkoutAfter) || 0,
      checkin_window_before_min: Number(checkinBefore) || 0,
      checkin_window_after_min: Number(checkinAfter) || 0,
      early_leave_deduction_enabled: earlyLeaveEnabled,
      early_leave_grace_minutes: Number(earlyLeaveGrace) || 0,
      early_leave_deduction_per_minute: Number(earlyLeaveRate) || 0,
      network_label: networkLabel.trim() || null,
      allowed_ip_ranges: ipRanges
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {rule ? (
          <Button variant="ghost" size="icon">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> قاعدة جديدة
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-4" /> {rule ? "تعديل قاعدة" : "قاعدة جديدة"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>النطاق</Label>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={!!rule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">الافتراضية (المؤسسة)</SelectItem>
                {deps.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>بداية الدوام</Label>
              <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>نهاية الدوام</Label>
              <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <Label className="flex items-center gap-2">
              <Timer className="size-4" /> نافذة تسجيل الحضور
            </Label>
            <p className="text-xs text-muted-foreground">
              يظهر زر الحضور قبل بداية الدوام بعدد الدقائق المحدد، ويبقى مفتوحاً بعد بدء الدوام بعدد
              الدقائق المحدد.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>يفتح قبل البداية (د)</Label>
                <Input
                  type="number"
                  min="0"
                  max="720"
                  value={checkinBefore}
                  onChange={(e) => setCheckinBefore(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>يبقى بعد البداية (د)</Label>
                <Input
                  type="number"
                  min="0"
                  max="720"
                  value={checkinAfter}
                  onChange={(e) => setCheckinAfter(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <Label className="flex items-center gap-2">
              <Timer className="size-4" /> نافذة تسجيل الانصراف
            </Label>
            <p className="text-xs text-muted-foreground">
              يظهر زر الانصراف قبل نهاية الدوام بعدد الدقائق المحدد، ويبقى مفتوحاً بعدها بعدد
              الدقائق المحدد.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>يفتح قبل النهاية (د)</Label>
                <Input
                  type="number"
                  min="0"
                  max="720"
                  value={checkoutBefore}
                  onChange={(e) => setCheckoutBefore(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>يبقى بعد النهاية (د)</Label>
                <Input
                  type="number"
                  min="0"
                  max="720"
                  value={checkoutAfter}
                  onChange={(e) => setCheckoutAfter(e.target.value)}
                />
              </div>
            </div>
            <WindowPreview
              workStart={workStart}
              workEnd={workEnd}
              checkinBefore={checkinBefore}
              checkinAfter={checkinAfter}
              checkoutBefore={checkoutBefore}
              checkoutAfter={checkoutAfter}
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="flex items-center gap-2">
                  <Timer className="size-4" /> خصم الخروج المبكر
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  عند التفعيل، يُخصم عن كل دقيقة خروج قبل نهاية الدوام بعد تجاوز فترة السماح. مع إذن
                  خروج مبكر معتمد لا يتم أي خصم.
                </p>
              </div>
              <Switch checked={earlyLeaveEnabled} onCheckedChange={setEarlyLeaveEnabled} />
            </div>
            {earlyLeaveEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>سماح الخروج المبكر (د)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="240"
                    value={earlyLeaveGrace}
                    onChange={(e) => setEarlyLeaveGrace(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>الخصم لكل دقيقة (ريال)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={earlyLeaveRate}
                    onChange={(e) => setEarlyLeaveRate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 sm:col-span-3 rounded-lg border p-3">
              <Label className="flex items-center gap-2">
                <Timer className="size-4" /> فترة السماح للتأخير قبل احتساب الخصم (د)
              </Label>
              <Input
                type="number"
                min="0"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                className="max-w-[8rem]"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                هذه <strong>ليست</strong> نافذة ظهور الزر. الزر يظهر حسب "نافذة تسجيل الحضور" أعلاه.
                فترة السماح هنا هي الدقائق المسموح بها بعد بداية الدوام بدون احتساب تأخير أو خصم.
                مثال: بداية 09:00 وسماح 15 د → حضور 09:14 = «حاضر» بدون خصم، وحضور 09:20 = «متأخر»
                بـ 20 دقيقة.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2 rounded-lg border p-3">
              <Label>طريقة احتساب خصم الغياب</Label>
              <Select
                value={absenceCalcMode}
                onValueChange={(v) => setAbsenceCalcMode(v as "salary_per_30" | "fixed_amount")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary_per_30">الراتب ÷ 30 (المعتمد في السعودية)</SelectItem>
                  <SelectItem value="fixed_amount">مبلغ ثابت لكل يوم</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {absenceCalcMode === "salary_per_30"
                  ? "يُحسب خصم كل يوم غياب تلقائياً بقسمة الراتب الأساسي لكل موظف على 30 — متناسب مع راتبه الفعلي."
                  : "يُخصم نفس المبلغ الثابت أدناه عن كل يوم غياب، بصرف النظر عن راتب الموظف."}
              </p>
            </div>
            {absenceCalcMode === "fixed_amount" && (
              <div className="space-y-2">
                <Label>خصم غياب يوم (مبلغ ثابت)</Label>
                <Input
                  type="number"
                  min="0"
                  value={absenceDed}
                  onChange={(e) => setAbsenceDed(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>خصم تأخير/د</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={lateDed}
                onChange={(e) => setLateDed(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Timer className="size-4" /> ساعات مرنة (Flex Hours)
              </Label>
              <Switch checked={flexEnabled} onCheckedChange={setFlexEnabled} />
            </div>
            {flexEnabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>نافذة الحضور المبكر</Label>
                    <Input
                      type="time"
                      value={earlyStart}
                      onChange={(e) => setEarlyStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>أقصى وقت قبل نصف يوم</Label>
                    <Input
                      type="time"
                      value={lateEnd}
                      onChange={(e) => setLateEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>خصم نصف اليوم</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={halfDayDed}
                    onChange={(e) => setHalfDayDed(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>شرائح خصم التأخر</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setTiers([...tiers, { from: 0, to: 0, rate: 0 }])}
                    >
                      <Plus className="size-3" /> إضافة شريحة
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {tiers.map((t, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <Input
                          type="number"
                          placeholder="من (د)"
                          value={t.from}
                          onChange={(e) => {
                            const v = [...tiers];
                            v[i] = { ...t, from: Number(e.target.value) };
                            setTiers(v);
                          }}
                        />
                        <Input
                          type="number"
                          placeholder="إلى (د)"
                          value={t.to}
                          onChange={(e) => {
                            const v = [...tiers];
                            v[i] = { ...t, to: Number(e.target.value) };
                            setTiers(v);
                          }}
                        />
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="مبلغ/د"
                          value={t.rate}
                          onChange={(e) => {
                            const v = [...tiers];
                            v[i] = { ...t, rate: Number(e.target.value) };
                            setTiers(v);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <MapPin className="size-4" /> اشتراط الموقع الجغرافي
              </Label>
              <Switch checked={requireGeo} onCheckedChange={setRequireGeo} />
            </div>
            {requireGeo && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>خط العرض</Label>
                    <Input
                      value={geoLat}
                      onChange={(e) => setGeoLat(e.target.value)}
                      placeholder="24.7136"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>خط الطول</Label>
                    <Input
                      value={geoLng}
                      onChange={(e) => setGeoLng(e.target.value)}
                      placeholder="46.6753"
                    />
                  </div>
                </div>
                <div className="flex gap-3 items-end">
                  <div className="space-y-2 flex-1">
                    <Label>نصف القطر (م)</Label>
                    <Input
                      type="number"
                      value={radius}
                      onChange={(e) => setRadius(e.target.value)}
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={captureLocation}>
                    تحديد موقعي الحالي
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <Label className="flex items-center gap-2">
              <Wifi className="size-4" /> قصر التسجيل على شبكة العمل
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              المتصفح لا يستطيع قراءة اسم شبكة الواي فاي، لذا يتم التقييد بعنوان الشبكة (IP). سجّل
              اسم الشبكة للعرض وعناوينها — سطر لكل عنوان، ويُقبل عنوان كامل أو بادئة تنتهي بنقطة أو
              CIDR. اتركه فارغاً لإلغاء القيد.
            </p>
            <div className="space-y-2">
              <Label>اسم الشبكة (للعرض في الرسائل)</Label>
              <Input
                value={networkLabel}
                onChange={(e) => setNetworkLabel(e.target.value)}
                placeholder="شبكة المكتب الرئيسي"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>العناوين المسموحة</Label>
                <Button type="button" variant="outline" size="sm" onClick={fillCurrentNetworkIp}>
                  إضافة عنوان شبكتي الحالية
                </Button>
              </div>
              <Textarea
                dir="ltr"
                rows={3}
                value={ipRanges}
                onChange={(e) => setIpRanges(e.target.value)}
                placeholder={"84.23.96.10\n84.23.96.0/24"}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="rounded-lg border p-3 flex items-center justify-between">
            <Label>اشتراط التحقق بالجهاز (WebAuthn)</Label>
            <Switch checked={requireWebauthn} onCheckedChange={setRequireWebauthn} />
          </div>

          <div className="rounded-lg border p-3 flex items-center justify-between">
            <Label>اشتراط صورة سيلفي مع كل بصمة</Label>
            <Switch checked={requireSelfie} onCheckedChange={setRequireSelfie} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteAttendanceRule);
  const mutation = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["attendance-rules"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>حذف القاعدة</AlertDialogTitle>
          <AlertDialogDescription>سيُطبق على القسم القواعد الافتراضية.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
