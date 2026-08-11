import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState, useMemo, useRef } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import {
  listEmployees,
  upsertEmployee,
  deleteEmployee,
  listAvailableUsers,
  listPendingActivations,
  resequenceEmployeeNumbers,
  type EmployeeRow,
} from "@/lib/hr/employees.functions";
import { listDepartments } from "@/lib/hr/departments.functions";
import { bulkUpdateEmployees, bulkImportEmployees } from "@/lib/hr/bulk.functions";
import { exportToExcel, readExcelFile } from "@/lib/utils/excel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Upload,
  Download,
  X,
  UserCheck,
  Mail,
  Clock3,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "الموظفون · علامة" }] }),
  component: EmployeesPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

const statusLabels: Record<EmployeeRow["status"], string> = {
  active: "نشط",
  on_leave: "إجازة",
  terminated: "منتهي",
};
const statusVariants: Record<
  EmployeeRow["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  on_leave: "secondary",
  terminated: "destructive",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(n);
}

function EmployeesPage() {
  const user = useCurrentUser();
  const canManage = hasAnyRole(user, ["hr_admin"]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <Users className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الموظفون</h1>
            <p className="text-sm text-muted-foreground">
              قائمة الموظفين، أقسامهم، رواتبهم وحالتهم الوظيفية.
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2 flex-wrap">
            <ResequenceNumbersButton />
            <ImportEmployeesDialog />
            <EmployeeDialog mode="create" />
          </div>
        )}
      </header>

      {canManage && (
        <Suspense fallback={null}>
          <PendingActivationsSection />
        </Suspense>
      )}

      <Suspense
        fallback={
          <Card>
            <CardContent className="p-10 flex justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        }
      >
        <EmployeesList canManage={canManage} />
      </Suspense>
    </div>
  );
}

function EmployeesList({ canManage }: { canManage: boolean }) {
  const fetcher = useServerFn(listEmployees);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["employees"], queryFn: () => fetcher() }),
  );
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter(
      (e) =>
        e.full_name.toLowerCase().includes(s) ||
        (e.employee_no ?? "").toLowerCase().includes(s) ||
        e.position.toLowerCase().includes(s) ||
        (e.department_name ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));
  const toggleAll = () => {
    setSelected((p) => {
      const n = new Set(p);
      if (allFilteredSelected) filtered.forEach((e) => n.delete(e.id));
      else filtered.forEach((e) => n.add(e.id));
      return n;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  function exportExcel() {
    const rows = (selected.size ? filtered.filter((e) => selected.has(e.id)) : filtered).map(
      (e) => ({
        "الرقم الوظيفي": e.employee_no,
        الاسم: e.full_name,
        المسمى: e.position,
        القسم: e.department_name ?? "",
        "الراتب الأساسي": e.base_salary,
        البدلات: e.allowances,
        "تاريخ التعيين": e.hire_date,
        الحالة: statusLabels[e.status],
      }),
    );
    exportToExcel(rows, `employees-${new Date().toISOString().slice(0, 10)}.xlsx`, "الموظفون");
  }

  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center space-y-3">
          <div className="size-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <Users className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">لا يوجد موظفون بعد</p>
          <p className="text-sm text-muted-foreground">
            أضِف أول موظف لربط حسابه ببياناته الوظيفية والمالية.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-60 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم، الرقم، المسمى…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="size-4" /> تصدير Excel{selected.size ? ` (${selected.size})` : ""}
        </Button>
      </div>

      {canManage && selected.size > 0 && (
        <BulkEmployeeBar
          ids={Array.from(selected)}
          onClear={() => setSelected(new Set())}
          onDone={() => setSelected(new Set())}
        />
      )}

      <Card className="border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-10">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                </TableHead>
              )}
              <TableHead className="text-right">الموظف</TableHead>
              <TableHead className="text-right">الرقم</TableHead>
              <TableHead className="text-right">المسمى</TableHead>
              <TableHead className="text-right">القسم</TableHead>
              <TableHead className="text-right">الراتب الإجمالي</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              {canManage && <TableHead className="text-right w-28">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} data-state={selected.has(e.id) ? "selected" : undefined}>
                {canManage && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(e.id)}
                      onCheckedChange={() => toggleOne(e.id)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {e.full_name.slice(0, 2) || "؟؟"}
                      </AvatarFallback>
                    </Avatar>
                    <Link
                      to="/employees/$employeeId"
                      params={{ employeeId: e.id }}
                      className="font-medium hover:underline hover:text-primary transition-colors"
                    >
                      {e.full_name}
                    </Link>
                    {e.missing_fields.length > 0 && (
                      <span
                        title={`بيانات ناقصة: ${e.missing_fields.join("، ")}`}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 shrink-0"
                      >
                        <AlertTriangle className="size-3" />
                        {e.missing_fields.length}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{e.employee_no}</TableCell>
                <TableCell>{e.position || "—"}</TableCell>
                <TableCell>
                  {e.department_name || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-medium">{fmt(e.base_salary + e.allowances)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariants[e.status]}>{statusLabels[e.status]}</Badge>
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-1">
                      <EmployeeDialog mode="edit" emp={e} />
                      <DeleteEmployeeButton id={e.id} name={e.full_name} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 8 : 6}
                  className="text-center py-8 text-muted-foreground"
                >
                  لا توجد نتائج
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

// ---------- Bulk action bar ----------
function BulkEmployeeBar({
  ids,
  onClear,
  onDone,
}: {
  ids: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(bulkUpdateEmployees);
  const depsFn = useServerFn(listDepartments);
  const depsQ = useSuspenseQuery(
    queryOptions({ queryKey: ["departments"], queryFn: () => depsFn() }),
  );

  const [deptOpen, setDeptOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [dept, setDept] = useState("none");
  const [status, setStatus] = useState<EmployeeRow["status"]>("active");
  const [salaryAction, setSalaryAction] = useState<"set" | "add_pct" | "add_amount">("add_pct");
  const [salaryValue, setSalaryValue] = useState("0");

  type BulkVars = {
    ids: string[];
    department_id?: string | null;
    status?: EmployeeRow["status"];
    salary_action?: "set" | "add_pct" | "add_amount";
    salary_value?: number;
  };
  const m = useMutation({
    mutationFn: (vars: BulkVars) => fn({ data: vars }),
    onSuccess: (r) => {
      toast.success(`تم تحديث ${r.count} موظف`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      setDeptOpen(false);
      setStatusOpen(false);
      setSalaryOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 flex items-center gap-2 flex-wrap">
        <div className="text-sm font-medium">{ids.length} محدد</div>
        <div className="flex-1" />

        <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              تغيير القسم
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تعيين القسم لـ {ids.length} موظف</DialogTitle>
            </DialogHeader>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون قسم</SelectItem>
                {depsQ.data.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                onClick={() => m.mutate({ ids, department_id: dept === "none" ? null : dept })}
                disabled={m.isPending}
              >
                تطبيق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              تغيير الحالة
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تعيين الحالة لـ {ids.length} موظف</DialogTitle>
            </DialogHeader>
            <Select value={status} onValueChange={(v) => setStatus(v as EmployeeRow["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="on_leave">إجازة</SelectItem>
                <SelectItem value="terminated">منتهي</SelectItem>
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button onClick={() => m.mutate({ ids, status })} disabled={m.isPending}>
                تطبيق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              تعديل الراتب
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تعديل راتب {ids.length} موظف</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>نوع التعديل</Label>
                <Select
                  value={salaryAction}
                  onValueChange={(v) => setSalaryAction(v as typeof salaryAction)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add_pct">زيادة بنسبة مئوية (%)</SelectItem>
                    <SelectItem value="add_amount">إضافة مبلغ ثابت</SelectItem>
                    <SelectItem value="set">تعيين قيمة محددة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القيمة</Label>
                <Input
                  type="number"
                  value={salaryValue}
                  onChange={(e) => setSalaryValue(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {salaryAction === "add_pct"
                    ? "مثال: 10 = زيادة 10٪"
                    : salaryAction === "add_amount"
                      ? "مثال: 500 = إضافة 500 ر.س"
                      : "مثال: 8000 = تعيين الراتب إلى 8000 ر.س"}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() =>
                  m.mutate({
                    ids,
                    salary_action: salaryAction,
                    salary_value: Number(salaryValue) || 0,
                  })
                }
                disabled={m.isPending}
              >
                تطبيق على الراتب الأساسي
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="size-3.5" /> إلغاء التحديد
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- Import Dialog ----------
type ImportRow = {
  user_id?: string;
  employee_no?: string;
  position?: string;
  department_id?: string;
  base_salary?: number | string;
  allowances?: number | string;
  hire_date?: string;
  status?: string;
};

/**
 * Surfaces every signed-up account not yet linked to an employee record.
 * HR admins see this the moment they open the page — no digging required —
 * and can activate + assign a department in one click (opens EmployeeDialog
 * pre-filled with that account).
 */
function PendingActivationsSection() {
  const fn = useServerFn(listPendingActivations);
  const { data } = useSuspenseQuery({
    queryKey: ["pending-activations"],
    queryFn: () => fn({ data: {} as never }),
  });

  if (!data.length) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <Clock3 className="size-4 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-sm">{data.length} حساب بانتظار التفعيل</p>
            <p className="text-xs text-muted-foreground">
              سجّل هؤلاء حسابات جديدة ولم يُربطوا بعد بسجل موظف أو قسم.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {data.map((p) => (
            <div
              key={p.user_id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2.5 pr-3 flex-wrap"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-amber-500/15 text-amber-700 text-xs font-semibold">
                    {p.name.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {p.email && (
                    <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
                      <Mail className="size-3" />
                      {p.email}
                    </p>
                  )}
                </div>
              </div>
              <EmployeeDialog mode="create" presetUser={{ id: p.user_id, name: p.name }} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One-time (or periodic) cleanup: renumbers every employee that has a
 * department into a clean, contiguous per-department sequence
 * (`CODE-001`, `CODE-002`, …) ordered by hire date. Confirmed via
 * dialog since it rewrites every `employee_no` at once.
 */
function ResequenceNumbersButton() {
  const qc = useQueryClient();
  const fn = useServerFn(resequenceEmployeeNumbers);
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: () => fn(),
    onSuccess: (res) => {
      toast.success(`أُعيد ترقيم ${res.renumbered} موظف بتسلسل قسمي متكامل`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Hash className="size-4" /> إعادة ترقيم الموظفين
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>إعادة ترقيم كل الموظفين؟</AlertDialogTitle>
          <AlertDialogDescription>
            سيُعاد تعيين الرقم الوظيفي لكل موظف مرتبط بقسم بتسلسل متكامل بلا فجوات ولا تكرار،
            حسب رمز القسم وترتيب تاريخ التعيين — بصيغة CODE-001, CODE-002 …
            الموظفون بدون قسم يبقون كما هم.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} تأكيد إعادة الترقيم
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ImportEmployeesDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const importFn = useServerFn(bulkImportEmployees);

  const m = useMutation({
    mutationFn: () => {
      const cleaned = rows.map((r) => ({
        user_id: String(r.user_id ?? ""),
        employee_no: String(r.employee_no ?? ""),
        position: String(r.position ?? ""),
        department_id: r.department_id ? String(r.department_id) : null,
        base_salary: Number(r.base_salary ?? 0),
        allowances: Number(r.allowances ?? 0),
        hire_date: String(r.hire_date ?? new Date().toISOString().slice(0, 10)),
        status: (r.status === "on_leave" || r.status === "terminated" ? r.status : "active") as
          | "active"
          | "on_leave"
          | "terminated",
      }));
      return importFn({ data: { rows: cleaned } });
    },
    onSuccess: (r) => {
      toast.success(`تم استيراد ${r.count} موظف`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["available-users"] });
      setOpen(false);
      setRows([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File) {
    try {
      const parsed = await readExcelFile<ImportRow>(file);
      setRows(parsed);
      toast.success(`قُرئ ${parsed.length} صف`);
    } catch (e: any) {
      toast.error(e.message || "تعذّر قراءة الملف");
    }
  }

  function downloadTemplate() {
    exportToExcel(
      [
        {
          user_id: "00000000-0000-0000-0000-000000000000",
          employee_no: "EMP-001",
          position: "مطور",
          department_id: "",
          base_salary: 7000,
          allowances: 1000,
          hire_date: "2025-01-01",
          status: "active",
        },
      ],
      "employees-import-template.xlsx",
      "نموذج",
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> استيراد Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>استيراد موظفين من Excel</DialogTitle>
          <DialogDescription>
            الأعمدة المطلوبة: <code className="text-xs">user_id, employee_no, hire_date</code>.
            الاختيارية:{" "}
            <code className="text-xs">
              position, department_id, base_salary, allowances, status
            </code>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-4" /> نموذج فارغ
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> اختر ملفاً
            </Button>
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرقم الوظيفي</TableHead>
                    <TableHead>المسمى</TableHead>
                    <TableHead>الراتب</TableHead>
                    <TableHead>تاريخ التعيين</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 20).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">
                        {String(r.employee_no ?? "—")}
                      </TableCell>
                      <TableCell className="text-xs">{String(r.position ?? "—")}</TableCell>
                      <TableCell className="text-xs">{String(r.base_salary ?? 0)}</TableCell>
                      <TableCell className="text-xs">{String(r.hire_date ?? "—")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 20 && (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  + {rows.length - 20} صف إضافي
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setRows([]);
            }}
          >
            إلغاء
          </Button>
          <Button onClick={() => m.mutate()} disabled={!rows.length || m.isPending}>
            {m.isPending && <Loader2 className="size-4 animate-spin" />}
            استيراد ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDialog({
  mode,
  emp,
  presetUser,
}: {
  mode: "create" | "edit";
  emp?: EmployeeRow;
  presetUser?: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(emp?.user_id ?? presetUser?.id ?? "");
  const [employeeNo, setEmployeeNo] = useState(emp?.employee_no ?? "");
  const [position, setPosition] = useState(emp?.position ?? "");
  const [departmentId, setDepartmentId] = useState(emp?.department_id ?? "none");
  const [baseSalary, setBaseSalary] = useState(String(emp?.base_salary ?? 0));
  const [allowances, setAllowances] = useState(String(emp?.allowances ?? 0));
  const [hireDate, setHireDate] = useState(emp?.hire_date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<EmployeeRow["status"]>(emp?.status ?? "active");
  const [nationalId, setNationalId] = useState(emp?.national_id ?? "");
  const [bankName, setBankName] = useState(emp?.bank_name ?? "");
  const [iban, setIban] = useState(emp?.iban ?? "");

  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertEmployee);
  const usersFn = useServerFn(listAvailableUsers);
  const depsFn = useServerFn(listDepartments);

  const usersQ = useSuspenseQuery(
    queryOptions({
      queryKey: ["available-users"],
      queryFn: () => usersFn(),
      staleTime: 30_000,
    }),
  );
  const depsQ = useSuspenseQuery(
    queryOptions({
      queryKey: ["departments"],
      queryFn: () => depsFn(),
    }),
  );

  const userOptions = useMemo(() => {
    if (mode === "edit" && emp) {
      const exists = usersQ.data.some((u) => u.id === emp.user_id);
      if (!exists) return [{ id: emp.user_id, name: emp.full_name }, ...usersQ.data];
    }
    return usersQ.data;
  }, [usersQ.data, mode, emp]);

  type UpsertVars = {
    id?: string;
    user_id: string;
    employee_no?: string;
    position: string;
    department_id: string | null;
    base_salary: number;
    allowances: number;
    hire_date: string;
    status: EmployeeRow["status"];
    national_id: string | null;
    bank_name: string | null;
    iban: string | null;
  };
  const mutation = useMutation({
    mutationFn: (vars: UpsertVars) => upsertFn({ data: vars }),
    onSuccess: () => {
      toast.success(mode === "create" ? "تم إضافة الموظف" : "تم تحديث البيانات");
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["available-users"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["pending-activations"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return toast.error("اختر حساب المستخدم");
    mutation.mutate({
      id: emp?.id,
      user_id: userId,
      // Single source of truth for numbering: omitted on create (the
      // database sequence auto-assigns the next number); passed through
      // unchanged on edit since the field is read-only in the UI — the
      // sanctioned way to change numbers in bulk is "إعادة ترقيم الموظفين".
      ...(mode === "edit" && employeeNo ? { employee_no: employeeNo } : {}),
      position: position.trim(),
      department_id: departmentId === "none" ? null : departmentId,
      base_salary: Number(baseSalary) || 0,
      allowances: Number(allowances) || 0,
      hire_date: hireDate,
      status,
      national_id: nationalId.trim() || null,
      bank_name: bankName.trim() || null,
      iban: iban.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {presetUser ? (
          <Button size="sm">
            <UserCheck className="size-4" /> تفعيل وربط بقسم
          </Button>
        ) : mode === "create" ? (
          <Button>
            <Plus className="size-4" /> موظف جديد
          </Button>
        ) : (
          <Button variant="ghost" size="icon">
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة موظف" : "تعديل بيانات الموظف"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>الحساب *</Label>
            <Select value={userId} onValueChange={setUserId} disabled={mode === "edit"}>
              <SelectTrigger>
                <SelectValue placeholder="اختر حساب مستخدم مسجّل" />
              </SelectTrigger>
              <SelectContent>
                {userOptions.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">لا يوجد مستخدمون متاحون.</div>
                ) : (
                  userOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>الرقم الوظيفي</Label>
              {mode === "create" ? (
                <div className="h-9 flex items-center px-3 rounded-md border border-dashed text-xs text-muted-foreground">
                  سيُنشأ تلقائياً بصيغة «رمز القسم-٠٠١» عند اختيار القسم
                </div>
              ) : (
                <Input
                  value={employeeNo || "— بانتظار تعيين القسم —"}
                  disabled
                  className="font-mono text-muted-foreground bg-muted/40"
                  title="الرقم الوظيفي مُدار تلقائياً حسب رمز القسم"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>تاريخ التعيين</Label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>المسمى الوظيفي</Label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="مطور برمجيات"
            />
          </div>

          <div className="space-y-2">
            <Label>القسم</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر قسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون قسم</SelectItem>
                {depsQ.data.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>الراتب الأساسي</Label>
              <Input
                type="number"
                min="0"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>البدلات</Label>
              <Input
                type="number"
                min="0"
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold">الهوية والبيانات المصرفية</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تُستخدم هذه البيانات تلقائياً عند إنشاء العقود ومصدر الرواتب — تسجَّل مرة واحدة هنا.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" dir="rtl">
              <div className="space-y-1.5">
                <Label className="text-xs">رقم الهوية</Label>
                <Input
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">اسم البنك</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">رقم الآيبان (IBAN)</Label>
                <Input value={iban} onChange={(e) => setIban(e.target.value)} dir="ltr" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EmployeeRow["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="on_leave">إجازة</SelectItem>
                <SelectItem value="terminated">منتهي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteEmployee);
  const mutation = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الموظف");
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["available-users"] });
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
          <AlertDialogTitle>حذف الموظف</AlertDialogTitle>
          <AlertDialogDescription>
            هل تريد حذف سجل «{name}»؟ لن يؤثر ذلك على حساب المستخدم.
          </AlertDialogDescription>
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
