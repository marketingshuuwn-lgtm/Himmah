import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentLink } from "@/components/attachment-link";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  listLeaveRequests,
  listLeaveTypes,
  myLeaveBalance,
  createLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  cancelApprovedLeave,

  type LeaveRequestRow,
  type LeaveTypeRow,
  type LeaveBalanceRow,
  type LeaveStatus,
} from "@/lib/hr/leaves.functions";
import { bulkReviewLeaves } from "@/lib/hr/bulk.functions";
import { exportToExcel } from "@/lib/utils/excel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plane, Plus, Check, X, Loader2, BookOpenCheck, Download, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtInt } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/leaves")({
  head: () => ({ meta: [{ title: "الإجازات · علامة" }] }),
  component: LeavesPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

const statusLabels: Record<LeaveStatus, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-muted text-muted-foreground" },
  pending: {
    label: "قيد المراجعة",
    cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  },
  approved: {
    label: "موافق عليها",
    cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  rejected: {
    label: "مرفوضة",
    cls: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  },
  cancelled: { label: "ملغاة", cls: "bg-muted text-muted-foreground" },
};

function LeavesPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const canReview = hasAnyRole(user, ["hr_admin", "dept_manager"]) && viewMode === "manager";

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <Plane className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الإجازات</h1>
            <p className="text-sm text-muted-foreground">قدّم طلبات الإجازة وتابع رصيدك السنوي.</p>
          </div>
        </div>
        <NewLeaveDialog />
      </header>

      <Suspense fallback={<LoadingCard />}>
        <BalanceStrip />
      </Suspense>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">طلباتي</TabsTrigger>
          {canReview && <TabsTrigger value="team">طلبات الفريق</TabsTrigger>}
        </TabsList>
        <TabsContent value="mine">
          <Suspense fallback={<LoadingCard />}>
            <RequestsTable scope="mine" canReview={false} />
          </Suspense>
        </TabsContent>
        {canReview && (
          <TabsContent value="team">
            <Suspense fallback={<LoadingCard />}>
              <RequestsTable scope="all" canReview />
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

function BalanceStrip() {
  const fetcher = useServerFn(myLeaveBalance);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["leave-balance"], queryFn: () => fetcher() }),
  );
  if (data.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
      {data.slice(0, 4).map((b: LeaveBalanceRow) => (
        <Card key={b.leave_type_id} className="border-border/60">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: b.color }} />
              <p className="text-xs text-muted-foreground">{b.leave_type_name}</p>
            </div>
            <p className="text-2xl font-bold num">
              {fmtInt(b.remaining)}
              <span className="text-xs text-muted-foreground font-normal">
                {" "}
                / {fmtInt(b.entitled_days)} يوم
              </span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RequestsTable({ scope, canReview }: { scope: "mine" | "all"; canReview: boolean }) {
  const fetcher = useServerFn(listLeaveRequests);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["leave-requests", scope],
      queryFn: () => fetcher({ data: { scope } }),
    }),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pending = data.filter((r) => r.status === "pending");
  const allPendingSelected = pending.length > 0 && pending.every((r) => selected.has(r.id));
  const togglePending = () => {
    setSelected((p) => {
      const n = new Set(p);
      if (allPendingSelected) pending.forEach((r) => n.delete(r.id));
      else pending.forEach((r) => n.add(r.id));
      return n;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function exportExcel() {
    const rows = data.map((r) => ({
      الموظف: r.employee_name,
      النوع: r.leave_type_name,
      من: r.start_date,
      إلى: r.end_date,
      الأيام: r.days,
      السبب: r.reason ?? "",
      الحالة: r.status,
      "ملاحظة المراجعة": r.review_note ?? "",
    }));
    exportToExcel(
      rows,
      `leaves-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "الإجازات",
    );
  }

  if (data.length === 0) {
    return (
      <Card className="border-dashed mt-4">
        <CardContent className="p-10 text-center space-y-3">
          <div className="size-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <BookOpenCheck className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">لا توجد طلبات</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={exportExcel}>
          <Download className="size-4" /> تصدير Excel
        </Button>
      </div>

      {canReview && selected.size > 0 && (
        <BulkLeaveBar ids={Array.from(selected)} onDone={() => setSelected(new Set())} />
      )}

      <Card className="border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {canReview && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPendingSelected}
                    disabled={pending.length === 0}
                    onCheckedChange={togglePending}
                  />
                </TableHead>
              )}
              {scope === "all" && <TableHead className="text-right">الموظف</TableHead>}
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">من</TableHead>
              <TableHead className="text-right">إلى</TableHead>
              <TableHead className="text-right">الأيام</TableHead>
              <TableHead className="text-right w-10"></TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right w-40">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r: LeaveRequestRow) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                {canReview && (
                  <TableCell>
                    {r.status === "pending" ? (
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleOne(r.id)}
                      />
                    ) : null}
                  </TableCell>
                )}
                {scope === "all" && (
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                )}
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: r.leave_type_color }}
                    />
                    {r.leave_type_name}
                  </span>
                </TableCell>
                <TableCell className="num">{fmtDate(r.start_date)}</TableCell>
                <TableCell className="num">{fmtDate(r.end_date)}</TableCell>
                <TableCell className="num font-medium">{fmtInt(r.days)}</TableCell>
                <TableCell>
                  {r.attachment_path && <AttachmentLink path={r.attachment_path} />}
                </TableCell>
                <TableCell>
                  <Badge className={statusLabels[r.status].cls}>
                    {statusLabels[r.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canReview && r.status === "pending" ? (
                    <ReviewButtons id={r.id} />
                  ) : r.status === "pending" ? (
                    <CancelButton id={r.id} />
                  ) : canReview && r.status === "approved" ? (
                    <CancelApprovedButton id={r.id} note={r.review_note} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{r.review_note || "—"}</span>
                  )}
                </TableCell>

              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function BulkLeaveBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const fn = useServerFn(bulkReviewLeaves);
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: (action: "approve" | "reject") => fn({ data: { ids, action, note: note || null } }),
    onSuccess: (_d, action) => {
      toast.success(
        action === "approve" ? `وافقت على ${ids.length} طلب` : `رفضت ${ids.length} طلب`,
      );
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 flex items-center gap-2 flex-wrap">
        <div className="text-sm font-medium">{ids.length} طلب محدد</div>
        <Input
          placeholder="ملاحظة (اختياري)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="flex-1 min-w-40 max-w-sm"
        />
        <Button size="sm" onClick={() => m.mutate("approve")} disabled={m.isPending}>
          <Check className="size-3.5" /> موافقة جماعية
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => m.mutate("reject")}
          disabled={m.isPending}
        >
          <X className="size-3.5" /> رفض جماعي
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewButtons({ id }: { id: string }) {
  const fn = useServerFn(reviewLeaveRequest);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (action: "approve" | "reject") => fn({ data: { id, action } }),
    onSuccess: (_d, action) => {
      toast.success(action === "approve" ? "تمت الموافقة" : "تم الرفض");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => m.mutate("approve")}
        disabled={m.isPending}
      >
        <Check className="size-3.5 text-emerald-600" /> موافقة
      </Button>
      <Button size="sm" variant="outline" onClick={() => m.mutate("reject")} disabled={m.isPending}>
        <X className="size-3.5 text-rose-600" /> رفض
      </Button>
    </div>
  );
}

function CancelButton({ id }: { id: string }) {
  const fn = useServerFn(cancelLeaveRequest);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الإلغاء");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}>
      إلغاء
    </Button>
  );
}

/**
 * Management-only escape hatch: cancels an already-approved leave, rolls back
 * the auto-marked leave days in attendance and returns the balance — all in a
 * single database transaction.
 */
function CancelApprovedButton({ id, note }: { id: string; note: string | null }) {
  const fn = useServerFn(cancelApprovedLeave);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { id, note: reason || null } }),
    onSuccess: () => {
      toast.success("تم إلغاء الإجازة المعتمدة وإرجاع الرصيد");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balance"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{note || "—"}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-destructive">
            إلغاء الاعتماد
          </Button>
        </DialogTrigger>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء إجازة معتمدة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم حذف أيام الإجازة من سجل الحضور وإرجاع الرصيد للموظف.
          </p>
          <Input
            placeholder="سبب الإلغاء (اختياري)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending}>
            تأكيد الإلغاء
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewLeaveDialog() {

  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const typesFn = useServerFn(listLeaveTypes);
  const typesQ = useSuspenseQuery(
    queryOptions({ queryKey: ["leave-types"], queryFn: () => typesFn() }),
  );

  const qc = useQueryClient();
  const createFn = useServerFn(createLeaveRequest);
  const m = useMutation({
    mutationFn: async () => {
      let attachment_path: string | null = null;
      if (file) {
        setUploading(true);
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) throw new Error("الجلسة غير نشطة");
          const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
          const path = `${userData.user.id}/leave-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("documents")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw new Error(upErr.message);
          attachment_path = path;
        } finally {
          setUploading(false);
        }
      }
      return createFn({
        data: {
          leave_type_id: typeId,
          start_date: start,
          end_date: end,
          reason: reason || null,
          attachment_path,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إرسال طلب الإجازة");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balance"] });
      setOpen(false);
      setTypeId("");
      setStart("");
      setEnd("");
      setReason("");
      setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> طلب إجازة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>طلب إجازة جديد</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!typeId || !start || !end) return toast.error("جميع الحقول مطلوبة");
            m.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>نوع الإجازة *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                {typesQ.data.map((t: LeaveTypeRow) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>من *</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى *</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>السبب</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="اختياري"
            />
          </div>
          <div className="space-y-2">
            <Label>مرفق (اختياري) — مثل تقرير طبي</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && <p className="text-xs text-muted-foreground truncate">{file.name}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={m.isPending || uploading}>
              {(m.isPending || uploading) && <Loader2 className="size-4 animate-spin" />} إرسال
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
