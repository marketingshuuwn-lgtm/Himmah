import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getEmployeeProfile } from "@/lib/hr/profile.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  MapPin,
  LogIn,
  LogOut,
  Star,
  FolderArchive,
  Clock4,
  Sunrise,
  BadgeCheck,
  Building2,
  CalendarDays,
  Clock,
  FileSignature,
  Hash,
  Lock,
  Plane,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import { fmtMoney, fmtInt, fmtDate, fmtMonthLabel } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/employees/$employeeId")({
  component: EmployeeProfilePage,
});

const statusLabels: Record<string, { label: string; cls: string }> = {
  active: { label: "نشط", cls: "bg-emerald-500/15 text-emerald-600" },
  on_leave: { label: "في إجازة", cls: "bg-amber-500/15 text-amber-600" },
  terminated: { label: "منتهي", cls: "bg-rose-500/15 text-rose-600" },
};

const leaveStatusLabels: Record<string, string> = {
  pending: "معلق",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

function EmployeeProfilePage() {
  const { employeeId } = Route.useParams();
  const profileFn = useServerFn(getEmployeeProfile);
  const { data, isLoading, error } = useQuery({
    queryKey: ["employee-profile", employeeId],
    queryFn: () => profileFn({ data: { employee_id: employeeId } }),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "تعذر تحميل الملف"}
            </p>
            <Button asChild variant="outline">
              <Link to="/employees">
                <ArrowRight className="size-4" />
                العودة للموظفين
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const st = statusLabels[data.status] ?? { label: data.status, cls: "bg-muted" };
  const m = data.month_summary;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Identity header */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar className="size-16 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {data.full_name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold truncate">{data.full_name}</h1>
                <Badge className={st.cls} variant="secondary">
                  {st.label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="size-3.5" />
                  <span className="font-mono">{data.employee_no}</span>
                </span>
                {data.position && (
                  <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className="size-3.5" />
                    {data.position}
                  </span>
                )}
                {data.department_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5" />
                    {data.department_name}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  تعيين {fmtDate(data.hire_date)}
                </span>
                {data.shift && (
                  <span className="inline-flex items-center gap-1.5">
                    <Sunrise className="size-3.5" />
                    وردية {data.shift.name} ({data.shift.start}–{data.shift.end})
                  </span>
                )}
              </div>
            </div>
            <Button asChild variant="ghost" size="sm" className="self-start">
              <Link to="/employees">
                <ArrowRight className="size-4" />
                الموظفون
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Month stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
        <StatCard
          icon={Clock}
          label={`حضور ${fmtMonthLabel(m.month)}`}
          value={fmtInt(m.present + m.late + m.early + m.half_day)}
        />
        <StatCard
          icon={Clock}
          label="دقائق التأخير"
          value={fmtInt(m.late_minutes)}
          tone={m.late_minutes > 0 ? "warn" : undefined}
        />
        <StatCard
          icon={Plane}
          label="إجازة معتمدة هذا العام"
          value={`${fmtInt(data.leaves.approved_days_this_year)} يوم`}
        />
        {data.financials ? (
          <StatCard
            icon={Wallet}
            label="الراتب الأساسي"
            value={fmtMoney(data.financials.base_salary)}
          />
        ) : (
          <StatCard icon={FileSignature} label="العقود" value={fmtInt(data.contracts.length)} />
        )}
      </div>

      {/* Profile completeness — visible only where financials are visible (self/HR/accountant) */}
      {data.missing_fields.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/[0.06]">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                الملف الوظيفي غير مكتمل
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                البيانات الناقصة: {data.missing_fields.join("، ")}
                {data.is_self
                  ? " — يرجى التواصل مع الموارد البشرية لاستكمالها."
                  : " — يرجى استكمالها من زر التعديل أعلاه."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial details (self / HR / accountant only) */}
      {data.financials && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">البيانات المالية والهوية</CardTitle>
          </CardHeader>
          <CardContent
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm"
            dir="rtl"
          >
            <InfoRow label="الراتب الأساسي" value={fmtMoney(data.financials.base_salary)} />
            <InfoRow label="البدلات" value={fmtMoney(data.financials.allowances)} />
            <InfoRow label="رقم الهوية" value={data.financials.national_id || "—"} mono />
            <InfoRow label="البنك" value={data.financials.bank_name || "—"} />
            <InfoRow
              label="IBAN"
              value={data.financials.iban || "—"}
              mono
              className="sm:col-span-2"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" dir="rtl">
        {/* Recent leaves */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Plane className="size-4 text-muted-foreground" />
              آخر الإجازات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.leaves.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">لا توجد إجازات</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">من</TableHead>
                    <TableHead className="text-start">إلى</TableHead>
                    <TableHead className="text-start">الأيام</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leaves.recent.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{fmtDate(l.start_date)}</TableCell>
                      <TableCell>{fmtDate(l.end_date)}</TableCell>
                      <TableCell>{fmtInt(l.days)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{leaveStatusLabels[l.status] ?? l.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Contracts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <FileSignature className="size-4 text-muted-foreground" />
              العقود
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">لا توجد عقود</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">العنوان</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    <TableHead className="text-start">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[180px] truncate">{c.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c.status}</Badge>
                      </TableCell>
                      <TableCell>{fmtDate(c.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evaluations + Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" dir="rtl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Star className="size-4 text-muted-foreground" />
              التقييمات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.evaluations.count === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد</p>
            ) : (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-2xl font-bold">{data.evaluations.average} / 5</p>
                  <p className="text-xs text-muted-foreground">
                    المتوسط العام ({fmtInt(data.evaluations.count)} تقييم)
                  </p>
                </div>
                {data.evaluations.latest && (
                  <div>
                    <p className="text-2xl font-bold">{data.evaluations.latest.avg} / 5</p>
                    <p className="text-xs text-muted-foreground">
                      آخر تقييم ({data.evaluations.latest.period})
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <FolderArchive className="size-4 text-muted-foreground" />
              الوثائق
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">لا توجد وثائق</p>
            ) : (
              <Table>
                <TableBody>
                  {data.documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-[160px] truncate">{d.title}</TableCell>
                      <TableCell>
                        {d.days_to_expiry == null ? (
                          <span className="text-muted-foreground text-xs">بلا انتهاء</span>
                        ) : d.days_to_expiry < 0 ? (
                          <Badge variant="destructive">منتهية</Badge>
                        ) : d.days_to_expiry <= 30 ? (
                          <Badge className="bg-amber-500/15 text-amber-600" variant="secondary">
                            تنتهي خلال {fmtInt(d.days_to_expiry)} يوم
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {fmtDate(d.expiry_date!)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Permissions */}
      {data.permissions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Clock4 className="size-4 text-muted-foreground" />
              آخر الأذونات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {data.permissions.map((pr) => (
                  <TableRow key={pr.id}>
                    <TableCell>
                      {{
                        late_arrival: "تأخر مبرر",
                        early_leave: "خروج مبكر",
                        personal_excuse: "استئذان شخصي",
                        makeup_hours: "تعويض ساعات",
                      }[pr.type] ?? pr.type}
                    </TableCell>
                    <TableCell>{fmtDate(pr.request_date)}</TableCell>
                    <TableCell dir="ltr" className="text-xs font-mono">
                      {pr.from_time.slice(0, 5)}–{pr.to_time.slice(0, 5)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pr.status === "approved" ? "default" : "secondary"}>
                        {{
                          approved: "معتمد",
                          pending: "معلق",
                          rejected: "مرفوض",
                          cancelled: "ملغي",
                        }[pr.status] ?? pr.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Punch log with locations */}
      {data.punches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              سجل البصمات ومواقعها
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">النوع</TableHead>
                  <TableHead className="text-start">الوقت</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="text-start">الموقع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.punches.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        {p.kind === "in" ? (
                          <LogIn className="size-3.5 text-emerald-600" />
                        ) : (
                          <LogOut className="size-3.5 text-sky-600" />
                        )}
                        {p.kind === "in" ? "دخول" : "خروج"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(p.punched_at).toLocaleString("ar-SA-u-nu-latn", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap gap-1">
                        <Badge variant={p.adopted ? "default" : "secondary"}>
                          {p.adopted ? "معتمدة" : "غير معتمدة"}
                        </Badge>
                        {p.via_override && <Badge variant="outline">تجاوز</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.lat != null && p.lng != null ? (
                        <a
                          href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                        >
                          <MapPin className="size-3.5" />
                          عرض على الخريطة
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payroll history (gated) */}
      {data.payroll && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              آخر كشوف الرواتب
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.payroll.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">لا توجد كشوف بعد</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">الشهر</TableHead>
                    <TableHead className="text-start">الغياب</TableHead>
                    <TableHead className="text-start">دقائق التأخير</TableHead>
                    <TableHead className="text-start">الصافي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payroll.map((r) => (
                    <TableRow key={r.period_month}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {r.locked && (
                            <Lock className="size-3.5 text-amber-600" aria-label="مقفل" />
                          )}
                          {fmtMonthLabel(r.period_month)}
                        </span>
                      </TableCell>
                      <TableCell>{fmtInt(r.absence_days)}</TableCell>
                      <TableCell>{fmtInt(r.late_minutes)}</TableCell>
                      <TableCell className="font-semibold">{fmtMoney(r.net_salary)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
            tone === "warn" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight truncate">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-medium ${mono ? "font-mono text-xs" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </p>
    </div>
  );
}
