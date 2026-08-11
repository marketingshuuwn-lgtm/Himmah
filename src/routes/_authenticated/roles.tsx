import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  listUsersWithRoles,
  updateUserRoles,
  transferOwnership,
  type UserWithRoles,
} from "@/lib/auth/roles-admin.functions";
import type { AppRole } from "@/lib/auth/roles.functions";
import { roleLabels } from "@/hooks/use-current-user";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck, Crown, Search, UserCog, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/roles")({
  component: RolesPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">حدث خطأ: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">الصفحة غير موجودة</div>,
});

const ASSIGNABLE: { value: AppRole; hint: string }[] = [
  { value: "admin", hint: "صلاحيات إدارية عامة" },
  { value: "hr_admin", hint: "إدارة الموظفين والعقود والحضور" },
  { value: "dept_manager", hint: "متابعة موظفي القسم فقط" },
  { value: "accountant", hint: "الرواتب والخصومات والمكافآت" },
  { value: "employee", hint: "الوصول الأساسي كموظف" },
];

function RolesPage() {
  const me = useCurrentUser();
  const isOwner = me.roles.includes("owner");
  const isAdmin = me.roles.includes("admin");
  const canAccess = isOwner || isAdmin;

  const listFn = useServerFn(listUsersWithRoles);
  const { data, isLoading, error } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: () => listFn(),
    enabled: canAccess,
  });

  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<UserWithRoles | null>(null);
  const [transferUser, setTransferUser] = useState<UserWithRoles | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            هذه الصفحة متاحة لمالك النظام والمدير العام فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            الأدوار والصلاحيات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل مستخدم يمكن أن يحمل عدة أدوار معاً (مثلاً: مدير HR + مدير قسم).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">قائمة المستخدمين</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد"
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : error ? (
            <div className="text-destructive text-sm">{(error as Error).message}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">لا يوجد مستخدمون مطابقون</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card/50 hover:bg-accent/40 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{u.full_name || "بدون اسم"}</span>
                      {u.is_owner && (
                        <Badge className="bg-amber-500 text-white gap-1">
                          <Crown className="size-3" /> مالك النظام
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" dir="ltr">
                      {u.email ?? "—"}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {u.roles.filter((r) => r !== "owner").map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">
                          {roleLabels[r]}
                        </Badge>
                      ))}
                      {u.roles.filter((r) => r !== "owner").length === 0 && (
                        <span className="text-xs text-muted-foreground">لا توجد أدوار إضافية</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditUser(u)}>
                      <UserCog className="size-4 ml-1" />
                      إدارة الأدوار
                    </Button>
                    {isOwner && !u.is_owner && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-amber-600 hover:text-amber-700"
                        onClick={() => setTransferUser(u)}
                      >
                        <ArrowRightLeft className="size-4 ml-1" />
                        نقل الملكية
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editUser && (
        <EditRolesDialog user={editUser} onClose={() => setEditUser(null)} />
      )}
      {transferUser && (
        <TransferOwnershipDialog user={transferUser} onClose={() => setTransferUser(null)} />
      )}
    </div>
  );
}

function EditRolesDialog({ user, onClose }: { user: UserWithRoles; onClose: () => void }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateUserRoles);
  const [selected, setSelected] = useState<Set<AppRole>>(
    () => new Set(user.roles.filter((r) => r !== "owner")),
  );

  const mut = useMutation({
    mutationFn: async () =>
      updateFn({ data: { target_user_id: user.user_id, roles: [...selected] } }),
    onSuccess: () => {
      toast.success("تم تحديث الأدوار");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "تعذر التحديث"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>أدوار {user.full_name || "المستخدم"}</DialogTitle>
          <DialogDescription>
            يمكنك اختيار أكثر من دور. دور "مالك النظام" لا يُعدَّل من هنا.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {ASSIGNABLE.map((r) => {
            const checked = selected.has(r.value);
            return (
              <label
                key={r.value}
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(r.value); else next.delete(r.value);
                      return next;
                    });
                  }}
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{roleLabels[r.value]}</div>
                  <div className="text-xs text-muted-foreground">{r.hint}</div>
                </div>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin ml-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferOwnershipDialog({ user, onClose }: { user: UserWithRoles; onClose: () => void }) {
  const qc = useQueryClient();
  const transferFn = useServerFn(transferOwnership);
  const [confirm, setConfirm] = useState("");

  const mut = useMutation({
    mutationFn: async () => transferFn({ data: { new_owner_id: user.user_id } }),
    onSuccess: () => {
      toast.success("تم نقل الملكية");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
      qc.invalidateQueries({ queryKey: ["current-user"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "تعذر نقل الملكية"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <Crown className="size-5" />
            نقل ملكية النظام
          </DialogTitle>
          <DialogDescription className="pt-2">
            سيتم نقل دور "مالك النظام" إلى <b>{user.full_name || "هذا المستخدم"}</b> بشكل نهائي.
            ستفقد أنت هذا الدور فوراً. اكتب <b>نقل</b> للتأكيد.
          </DialogDescription>
        </DialogHeader>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="اكتب: نقل" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            variant="destructive"
            disabled={confirm.trim() !== "نقل" || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending && <Loader2 className="size-4 animate-spin ml-1" />}
            تأكيد النقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
