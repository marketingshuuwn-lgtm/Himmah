import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import {
  listDepartments, upsertDepartment, deleteDepartment, listEligibleManagers,
  type DepartmentRow,
} from "@/lib/hr/departments.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({ meta: [{ title: "الأقسام · علامة" }] }),
  component: DepartmentsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

const depsQO = (fn: () => Promise<DepartmentRow[]>) =>
  queryOptions({ queryKey: ["departments"], queryFn: fn });

function DepartmentsPage() {
  const user = useCurrentUser();
  const canManage = hasAnyRole(user, ["hr_admin"]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <Building2 className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الأقسام</h1>
            <p className="text-sm text-muted-foreground">نظّم فرق العمل وعيّن مديراً لكل قسم.</p>
          </div>
        </div>
        {canManage && <DepartmentDialog mode="create" />}
      </header>

      <Suspense fallback={<LoadingCard />}>
        <DepartmentsList canManage={canManage} />
      </Suspense>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card><CardContent className="p-10 flex justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </CardContent></Card>
  );
}

function DepartmentsList({ canManage }: { canManage: boolean }) {
  const fetcher = useServerFn(listDepartments);
  const { data } = useSuspenseQuery(depsQO(() => fetcher()));

  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center space-y-3">
          <div className="size-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">لا توجد أقسام بعد</p>
          <p className="text-sm text-muted-foreground">ابدأ بإضافة قسم لتجميع موظفيك تحت مدير مسؤول.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">القسم</TableHead>
            <TableHead className="text-right">الرمز</TableHead>
            <TableHead className="text-right">المدير</TableHead>
            <TableHead className="text-right">الموظفون</TableHead>
            <TableHead className="text-right">الوصف</TableHead>
            {canManage && <TableHead className="text-right w-32">إجراءات</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell>
                {d.code ? (
                  <Badge variant="outline" className="font-mono">{d.code}</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">بلا رمز</Badge>
                )}
              </TableCell>
              <TableCell>
                {d.manager_name ? (
                  <span>{d.manager_name}</span>
                ) : (
                  <Badge variant="outline" className="text-xs">بدون مدير</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="gap-1">
                  <Users className="size-3" />
                  {d.employee_count}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs text-sm text-muted-foreground truncate">
                {d.description || "—"}
              </TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex gap-1">
                    <DepartmentDialog mode="edit" dep={d} />
                    <DeleteDepartmentButton id={d.id} name={d.name} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function DepartmentDialog({ mode, dep }: { mode: "create" | "edit"; dep?: DepartmentRow }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(dep?.name ?? "");
  const [code, setCode] = useState(dep?.code ?? "");
  const [description, setDescription] = useState(dep?.description ?? "");
  const [managerId, setManagerId] = useState<string>(dep?.manager_id ?? "none");

  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertDepartment);
  const managersFn = useServerFn(listEligibleManagers);

  const managersQ = useSuspenseQuery(queryOptions({
    queryKey: ["eligible-managers"], queryFn: () => managersFn(),
    staleTime: 30_000,
  }));

  const mutation = useMutation({
    mutationFn: (vars: { id?: string; name: string; code: string | null; description: string | null; manager_id: string | null }) =>
      upsertFn({ data: vars }),
    onSuccess: () => {
      toast.success(mode === "create" ? "تم إنشاء القسم" : "تم تحديث القسم");
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("اسم القسم مطلوب");
    mutation.mutate({
      id: dep?.id,
      name: name.trim(),
      code: code.trim() ? code.trim().toUpperCase() : null,
      description: description.trim() || null,
      manager_id: managerId === "none" ? null : managerId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button><Plus className="size-4" /> قسم جديد</Button>
        ) : (
          <Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إنشاء قسم" : "تعديل القسم"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>اسم القسم *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الموارد البشرية" />
            </div>
            <div className="space-y-2">
              <Label>الرمز *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="MRT"
                maxLength={8}
                className="font-mono uppercase"
              />
              <p className="text-[11px] text-muted-foreground">يُستخدم لترقيم الموظفين تلقائياً (MRT-001).</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>المدير المسؤول</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger><SelectValue placeholder="اختر مديراً" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون مدير</SelectItem>
                {managersQ.data.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
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

function DeleteDepartmentButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteDepartment);
  const mutation = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف القسم");
      qc.invalidateQueries({ queryKey: ["departments"] });
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
          <AlertDialogTitle>حذف القسم</AlertDialogTitle>
          <AlertDialogDescription>
            هل تريد حذف «{name}»؟ سيتم فك ارتباط الموظفين بهذا القسم.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); mutation.mutate(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
