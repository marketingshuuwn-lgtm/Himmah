import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentLink } from "@/components/attachment-link";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  listPermissions,
  createPermission,
  reviewPermission,
  cancelPermission,
  permissionLabels,
  type PermissionRow,
  type PermissionType,
  type PermissionStatus,
} from "@/lib/hr/permissions.functions";
import { Card, CardContent } from "@/components/ui/card";
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
import { Clock4, Plus, Check, X, Loader2, FileClock } from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtInt } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "الأذونات · علامة" }] }),
  component: PermissionsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

const statusLabels: Record<PermissionStatus, { label: string; cls: string }> = {
  pending: {
    label: "قيد المراجعة",
    cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  },
  approved: {
    label: "موافق عليه",
    cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  rejected: {
    label: "مرفوض",
    cls: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  },
  cancelled: { label: "ملغاة", cls: "bg-muted text-muted-foreground" },
};

function PermissionsPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const canReview = hasAnyRole(user, ["hr_admin", "dept_manager"]) && viewMode === "manager";

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <Clock4 className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الأذونات والاستئذان</h1>
            <p className="text-sm text-muted-foreground">
              طلبات تأخر مبرر، خروج مبكر، وتعويض ساعات.
            </p>
          </div>
        </div>
        <NewPermissionDialog />
      </header>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">طلباتي</TabsTrigger>
          {canReview && <TabsTrigger value="team">طلبات الفريق</TabsTrigger>}
        </TabsList>
        <TabsContent value="mine">
          <Suspense fallback={<LoadingCard />}>
            <Table_ scope="mine" canReview={false} />
          </Suspense>
        </TabsContent>
        {canReview && (
          <TabsContent value="team">
            <Suspense fallback={<LoadingCard />}>
              <Table_ scope="all" canReview />
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

function Table_({ scope, canReview }: { scope: "mine" | "all"; canReview: boolean }) {
  const fetcher = useServerFn(listPermissions);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["permissions", scope],
      queryFn: () => fetcher({ data: { scope } }),
    }),
  );
  if (data.length === 0) {
    return (
      <Card className="border-dashed mt-4">
        <CardContent className="p-10 text-center space-y-3">
          <div className="size-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <FileClock className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">لا توجد طلبات أذونات</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/60 mt-4 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {scope === "all" && <TableHead className="text-right">الموظف</TableHead>}
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">من</TableHead>
            <TableHead className="text-right">إلى</TableHead>
            <TableHead className="text-right">الدقائق</TableHead>
            <TableHead className="text-right">السبب</TableHead>
            <TableHead className="text-right w-10"></TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right w-40">إجراء</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r: PermissionRow) => (
            <TableRow key={r.id}>
              {scope === "all" && <TableCell className="font-medium">{r.employee_name}</TableCell>}
              <TableCell>{permissionLabels[r.type]}</TableCell>
              <TableCell className="num">{fmtDate(r.request_date)}</TableCell>
              <TableCell className="num">{r.from_time.slice(0, 5)}</TableCell>
              <TableCell className="num">{r.to_time.slice(0, 5)}</TableCell>
              <TableCell className="num font-medium">{fmtInt(r.duration_minutes)}</TableCell>
              <TableCell className="max-w-xs text-sm text-muted-foreground truncate">
                {r.reason}
              </TableCell>
              <TableCell>
                {r.attachment_path && <AttachmentLink path={r.attachment_path} />}
              </TableCell>
              <TableCell>
                <Badge className={statusLabels[r.status].cls}>{statusLabels[r.status].label}</Badge>
              </TableCell>
              <TableCell>
                {canReview && r.status === "pending" ? (
                  <ReviewButtons id={r.id} />
                ) : r.status === "pending" ? (
                  <CancelBtn id={r.id} />
                ) : (
                  <span className="text-xs text-muted-foreground">{r.review_note || "—"}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ReviewButtons({ id }: { id: string }) {
  const fn = useServerFn(reviewPermission);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (action: "approve" | "reject") => fn({ data: { id, action } }),
    onSuccess: (_d, action) => {
      toast.success(action === "approve" ? "تمت الموافقة" : "تم الرفض");
      qc.invalidateQueries({ queryKey: ["permissions"] });
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
        <Check className="size-3.5 text-emerald-600" />
      </Button>
      <Button size="sm" variant="outline" onClick={() => m.mutate("reject")} disabled={m.isPending}>
        <X className="size-3.5 text-rose-600" />
      </Button>
    </div>
  );
}

function CancelBtn({ id }: { id: string }) {
  const fn = useServerFn(cancelPermission);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الإلغاء");
      qc.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}>
      إلغاء
    </Button>
  );
}

function NewPermissionDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PermissionType>("late_arrival");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const qc = useQueryClient();
  const createFn = useServerFn(createPermission);
  const m = useMutation({
    mutationFn: async () => {
      let attachment_path: string | null = null;
      if (file) {
        setUploading(true);
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) throw new Error("الجلسة غير نشطة");
          const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
          const path = `${userData.user.id}/permission-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
        data: { type, request_date: date, from_time: from, to_time: to, reason, attachment_path },
      });
    },
    onSuccess: () => {
      toast.success("تم إرسال طلب الإذن");
      qc.invalidateQueries({ queryKey: ["permissions"] });
      setOpen(false);
      setDate("");
      setFrom("");
      setTo("");
      setReason("");
      setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> طلب إذن
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>طلب إذن جديد</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || !from || !to || reason.length < 3)
              return toast.error("جميع الحقول مطلوبة");
            m.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>نوع الإذن *</Label>
            <Select value={type} onValueChange={(v) => setType(v as PermissionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(permissionLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>التاريخ *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>من *</Label>
              <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى *</Label>
              <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>السبب *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>مرفق (اختياري)</Label>
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
