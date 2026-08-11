import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import {
  listShifts,
  upsertShift,
  deleteShift,
  listEmployeeShifts,
  assignEmployeeShift,
  removeEmployeeShift,
  type ShiftRow,
  type EmployeeShiftRow,
} from "@/lib/hr/shifts.functions";
import { listEmployees } from "@/lib/hr/employees.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sunrise, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({ meta: [{ title: "الورديات · علامة" }] }),
  component: ShiftsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

function ShiftsPage() {
  const user = useCurrentUser();
  if (!hasAnyRole(user, ["hr_admin"])) {
    return (
      <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية لإدارة الورديات.</div>
    );
  }
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <Sunrise className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الورديات</h1>
            <p className="text-sm text-muted-foreground">عرّف ورديات العمل وعيّن الموظفين عليها.</p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">قائمة الورديات</TabsTrigger>
          <TabsTrigger value="assign">تعيين الموظفين</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-4">
          <Suspense fallback={<Loader />}>
            <ShiftCatalog />
          </Suspense>
        </TabsContent>
        <TabsContent value="assign" className="mt-4">
          <Suspense fallback={<Loader />}>
            <AssignmentsList />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loader() {
  return (
    <Card>
      <CardContent className="p-10 flex justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function ShiftCatalog() {
  const fn = useServerFn(listShifts);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["shifts"], queryFn: () => fn() }));
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ShiftDialog mode="create" />
      </div>
      <Card className="border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">من</TableHead>
              <TableHead className="text-right">إلى</TableHead>
              <TableHead className="text-right">استراحة (د)</TableHead>
              <TableHead className="text-right">اللون</TableHead>
              <TableHead className="text-right w-28">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s: ShiftRow) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <div>{s.name_ar}</div>
                  <div className="text-xs text-muted-foreground">{s.name_en}</div>
                </TableCell>
                <TableCell className="num">{s.start_time.slice(0, 5)}</TableCell>
                <TableCell className="num">{s.end_time.slice(0, 5)}</TableCell>
                <TableCell className="num">{s.break_minutes}</TableCell>
                <TableCell>
                  <span className="inline-block size-5 rounded" style={{ background: s.color }} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <ShiftDialog mode="edit" row={s} />
                    <DeleteBtn kind="shift" id={s.id} name={s.name_ar} />
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

function ShiftDialog({ mode, row }: { mode: "create" | "edit"; row?: ShiftRow }) {
  const [open, setOpen] = useState(false);
  const [nameAr, setNameAr] = useState(row?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(row?.name_en ?? "");
  const [start, setStart] = useState(row?.start_time?.slice(0, 5) ?? "09:00");
  const [end, setEnd] = useState(row?.end_time?.slice(0, 5) ?? "17:00");
  const [breakMin, setBreakMin] = useState(row?.break_minutes ?? 60);
  const [color, setColor] = useState(row?.color ?? "#3b82f6");

  const qc = useQueryClient();
  const fn = useServerFn(upsertShift);
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: row?.id,
          name_ar: nameAr,
          name_en: nameEn,
          start_time: start,
          end_time: end,
          break_minutes: breakMin,
          color,
          active: true,
        },
      }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["shifts"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" /> وردية
          </Button>
        ) : (
          <Button variant="ghost" size="icon">
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إنشاء وردية" : "تعديل الوردية"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameAr || !nameEn) return toast.error("الأسماء مطلوبة");
            m.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>اسم عربي *</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>English *</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>من *</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى *</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>استراحة (دقيقة)</Label>
              <Input
                type="number"
                min={0}
                max={480}
                value={breakMin}
                onChange={(e) => setBreakMin(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>اللون</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="size-4 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentsList() {
  const fn = useServerFn(listEmployeeShifts);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["employee-shifts"], queryFn: () => fn() }),
  );
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AssignDialog />
      </div>
      <Card className="border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الموظف</TableHead>
              <TableHead className="text-right">الوردية</TableHead>
              <TableHead className="text-right">من</TableHead>
              <TableHead className="text-right">إلى</TableHead>
              <TableHead className="text-right w-28">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  لا توجد تعيينات
                </TableCell>
              </TableRow>
            )}
            {data.map((r: EmployeeShiftRow) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.employee_name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: r.shift_color }} />
                    {r.shift_name}
                  </span>
                </TableCell>
                <TableCell className="num">{fmtDate(r.effective_from)}</TableCell>
                <TableCell className="num">
                  {r.effective_to ? fmtDate(r.effective_to) : "—"}
                </TableCell>
                <TableCell>
                  <DeleteBtn kind="assign" id={r.id} name={r.employee_name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AssignDialog() {
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState("");

  const empFn = useServerFn(listEmployees);
  const shiftFn = useServerFn(listShifts);
  const empQ = useSuspenseQuery(queryOptions({ queryKey: ["employees"], queryFn: () => empFn() }));
  const shiftQ = useSuspenseQuery(queryOptions({ queryKey: ["shifts"], queryFn: () => shiftFn() }));

  const qc = useQueryClient();
  const fn = useServerFn(assignEmployeeShift);
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          employee_id: empId,
          shift_id: shiftId,
          effective_from: from,
          effective_to: to || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم التعيين");
      qc.invalidateQueries({ queryKey: ["employee-shifts"] });
      setOpen(false);
      setEmpId("");
      setShiftId("");
      setTo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> تعيين
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعيين موظف على وردية</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!empId || !shiftId) return toast.error("اختر الموظف والوردية");
            m.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label>الموظف *</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر موظفاً" />
              </SelectTrigger>
              <SelectContent>
                {empQ.data.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الوردية *</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر وردية" />
              </SelectTrigger>
              <SelectContent>
                {shiftQ.data.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>من *</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="size-4 animate-spin" />} تعيين
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBtn({ kind, id, name }: { kind: "shift" | "assign"; id: string; name: string }) {
  const qc = useQueryClient();
  const shiftFn = useServerFn(deleteShift);
  const assignFn = useServerFn(removeEmployeeShift);
  const m = useMutation({
    mutationFn: () => (kind === "shift" ? shiftFn({ data: { id } }) : assignFn({ data: { id } })),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: [kind === "shift" ? "shifts" : "employee-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (confirm(`حذف «${name}»؟`)) m.mutate();
      }}
    >
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}
