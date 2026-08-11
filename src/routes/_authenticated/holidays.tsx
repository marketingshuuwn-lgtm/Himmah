import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  listHolidays,
  upsertHoliday,
  deleteHoliday,
  type HolidayRow,
  type HolidayKind,
} from "@/lib/hr/holidays.functions";
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
import { Switch } from "@/components/ui/switch";
import { CalendarHeart, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/holidays")({
  head: () => ({ meta: [{ title: "العطل الرسمية · علامة" }] }),
  component: HolidaysPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

const kindLabels: Record<HolidayKind, { label: string; cls: string }> = {
  national: {
    label: "وطنية",
    cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  religious: {
    label: "دينية",
    cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  },
  company: {
    label: "شركة",
    cls: "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  weekend_override: { label: "استثناء", cls: "bg-muted text-muted-foreground" },
};

function HolidaysPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const canManage = hasAnyRole(user, ["hr_admin"]) && viewMode === "manager";

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <CalendarHeart className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">العطل الرسمية</h1>
            <p className="text-sm text-muted-foreground">
              تقويم العطل يُستثنى تلقائياً من سجلات الحضور.
            </p>
          </div>
        </div>
        {canManage && <HolidayDialog mode="create" />}
      </header>

      <Suspense
        fallback={
          <Card>
            <CardContent className="p-10 flex justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        }
      >
        <HolidaysTable canManage={canManage} />
      </Suspense>
    </div>
  );
}

function HolidaysTable({ canManage }: { canManage: boolean }) {
  const fn = useServerFn(listHolidays);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["holidays"], queryFn: () => fn() }));

  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center space-y-3">
          <div className="size-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <CalendarHeart className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">لا توجد عطل مسجلة</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الاسم</TableHead>
            <TableHead className="text-right">من</TableHead>
            <TableHead className="text-right">إلى</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">البلد</TableHead>
            <TableHead className="text-right">مدفوعة</TableHead>
            {canManage && <TableHead className="text-right w-28">إجراء</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((h: HolidayRow) => (
            <TableRow key={h.id}>
              <TableCell className="font-medium">
                <div>{h.name_ar}</div>
                <div className="text-xs text-muted-foreground">{h.name_en}</div>
              </TableCell>
              <TableCell className="num">{fmtDate(h.start_date)}</TableCell>
              <TableCell className="num">{fmtDate(h.end_date)}</TableCell>
              <TableCell>
                <Badge className={kindLabels[h.kind].cls}>{kindLabels[h.kind].label}</Badge>
              </TableCell>
              <TableCell className="num">{h.country}</TableCell>
              <TableCell>{h.paid ? "نعم" : "لا"}</TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex gap-1">
                    <HolidayDialog mode="edit" row={h} />
                    <DeleteBtn id={h.id} name={h.name_ar} />
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

function HolidayDialog({ mode, row }: { mode: "create" | "edit"; row?: HolidayRow }) {
  const [open, setOpen] = useState(false);
  const [nameAr, setNameAr] = useState(row?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(row?.name_en ?? "");
  const [start, setStart] = useState(row?.start_date ?? "");
  const [end, setEnd] = useState(row?.end_date ?? "");
  const [kind, setKind] = useState<HolidayKind>(row?.kind ?? "national");
  const [country, setCountry] = useState(row?.country ?? "SA");
  const [paid, setPaid] = useState(row?.paid ?? true);
  const [notes, setNotes] = useState(row?.notes ?? "");

  const qc = useQueryClient();
  const fn = useServerFn(upsertHoliday);
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: row?.id,
          name_ar: nameAr,
          name_en: nameEn,
          start_date: start,
          end_date: end || start,
          kind,
          country,
          paid,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" /> عطلة
          </Button>
        ) : (
          <Button variant="ghost" size="icon">
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة عطلة" : "تعديل العطلة"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameAr || !nameEn || !start) return toast.error("الحقول الأساسية مطلوبة");
            m.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>الاسم (عربي) *</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الاسم (English) *</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>من *</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as HolidayKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(kindLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>البلد</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={4}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>عطلة مدفوعة</Label>
            <Switch checked={paid} onCheckedChange={setPaid} />
          </div>
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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

function DeleteBtn({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(deleteHoliday);
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["holidays"] });
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
          <AlertDialogTitle>حذف العطلة</AlertDialogTitle>
          <AlertDialogDescription>هل تريد حذف «{name}»؟</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              m.mutate();
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
