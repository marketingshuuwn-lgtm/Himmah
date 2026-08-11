import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { Star, Plus, Pencil, Trash2, Loader2, BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  listEvaluations,
  listEvaluableEmployees,
  upsertEvaluation,
  deleteEvaluation,
  type EvaluationRow,
  type EvaluableEmployee,
} from "@/lib/hr/evaluations.functions";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { fmtDate, fmtNum } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/evaluations")({
  head: () => ({ meta: [{ title: "التقييم · علامة" }] }),
  component: EvaluationsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

const evalsQO = (fn: () => Promise<EvaluationRow[]>) =>
  queryOptions({ queryKey: ["evaluations"], queryFn: fn });
const emplsQO = (fn: () => Promise<EvaluableEmployee[]>) =>
  queryOptions({ queryKey: ["evaluable-employees"], queryFn: fn });

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function EvaluationsPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const canEvaluate = hasAnyRole(user, ["hr_admin", "dept_manager"]) && viewMode === "manager";

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <Star className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">التقييم</h1>
            <p className="text-sm text-muted-foreground">
              معايير: الأداء، الالتزام، التعاون، الجودة (1-5).
            </p>
          </div>
        </div>
        {canEvaluate && <EvaluationDialog mode="create" />}
      </header>

      <Suspense
        fallback={
          <div className="flex justify-center p-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <EvaluationsContent
          canEvaluate={canEvaluate}
          isHR={hasAnyRole(user, ["hr_admin"]) && viewMode === "manager"}
        />
      </Suspense>
    </div>
  );
}

function EvaluationsContent({ canEvaluate, isHR }: { canEvaluate: boolean; isHR: boolean }) {
  const list = useServerFn(listEvaluations);
  const { data: rows } = useSuspenseQuery(evalsQO(() => list()));

  const stats = useMemo(() => {
    if (!rows.length) return { count: 0, avg: 0, byDept: [] as { name: string; avg: number }[] };
    const avg = rows.reduce((s, r) => s + r.average, 0) / rows.length;
    const groups = new Map<string, number[]>();
    rows.forEach((r) => {
      const k = r.department_name || "بدون قسم";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r.average);
    });
    const byDept = Array.from(groups.entries()).map(([name, arr]) => ({
      name,
      avg: Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)),
    }));
    return { count: rows.length, avg, byDept };
  }, [rows]);

  return (
    <>
      {isHR && rows.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4" dir="rtl">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>إجمالي التقييمات</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{fmtNum(stats.count)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>المعدل العام</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-bold">
              {fmtNum(stats.avg.toFixed(2))} / 5
            </CardContent>
          </Card>
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardDescription>عدد الأقسام المُقيَّمة</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{fmtNum(stats.byDept.length)}</CardContent>
          </Card>
        </div>
      )}

      {isHR && stats.byDept.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="size-4" /> متوسط التقييم لكل قسم
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byDept}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="avg" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">لا توجد تقييمات بعد.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead>الفترة</TableHead>
                  <TableHead>المعدل</TableHead>
                  <TableHead>المُقيِّم</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell>{r.department_name || "—"}</TableCell>
                    <TableCell>{r.period}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.average >= 4 ? "default" : r.average >= 3 ? "secondary" : "destructive"
                        }
                      >
                        {fmtNum(r.average.toFixed(2))} / 5
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.evaluator_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(r.created_at)}
                    </TableCell>
                    <TableCell className="text-end">
                      {canEvaluate && <EvaluationActions row={r} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function EvaluationActions({ row }: { row: EvaluationRow }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteEvaluation);
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => del({ data: { id: row.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      toast.success("حُذف التقييم");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر الحذف"),
  });
  return (
    <div className="flex justify-end gap-1">
      <EvaluationDialog mode="edit" row={row} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التقييم؟</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => m.mutate()}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EvaluationDialog({ mode, row }: { mode: "create" | "edit"; row?: EvaluationRow }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertEvaluation);
  const listEmpsFn = useServerFn(listEvaluableEmployees);

  const { data: emps = [] } = useQuery({
    ...emplsQO(() => listEmpsFn()),
    enabled: open,
  });

  const [employeeId, setEmployeeId] = useState(row?.employee_id ?? "");
  const [period, setPeriod] = useState(row?.period ?? currentPeriod());
  const [performance, setPerformance] = useState(row?.performance ?? 3);
  const [commitment, setCommitment] = useState(row?.commitment ?? 3);
  const [teamwork, setTeamwork] = useState(row?.teamwork ?? 3);
  const [quality, setQuality] = useState(row?.quality ?? 3);
  const [notes, setNotes] = useState(row?.notes ?? "");

  const avg = ((performance + commitment + teamwork + quality) / 4).toFixed(2);

  const m = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: row?.id,
          employee_id: employeeId,
          period,
          performance,
          commitment,
          teamwork,
          quality,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      toast.success(mode === "create" ? "أُضيف التقييم" : "حُدّث التقييم");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر الحفظ"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" /> تقييم جديد
          </Button>
        ) : (
          <Button size="sm" variant="ghost">
            <Pencil className="size-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة تقييم" : "تعديل تقييم"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div>
              <Label className="text-xs">الموظف</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={mode === "edit"}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر موظف" />
                </SelectTrigger>
                <SelectContent>
                  {emps.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name} — {e.department_name || "بدون قسم"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الفترة (YYYY-MM)</Label>
              <Input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-06"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <ScoreField label="الأداء" value={performance} onChange={setPerformance} />
            <ScoreField label="الالتزام" value={commitment} onChange={setCommitment} />
            <ScoreField label="التعاون" value={teamwork} onChange={setTeamwork} />
            <ScoreField label="الجودة" value={quality} onChange={setQuality} />
          </div>

          <div className="rounded-md border p-3 flex items-center justify-between bg-muted/40">
            <span className="text-sm text-muted-foreground">المعدل</span>
            <span className="text-lg font-bold">{avg} / 5</span>
          </div>

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={() => m.mutate()} disabled={!employeeId || m.isPending}>
            {m.isPending && <Loader2 className="size-4 animate-spin" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
