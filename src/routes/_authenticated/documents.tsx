import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { Suspense, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  listDocuments,
  upsertDocument,
  deleteDocument,
  signDocumentUrl,
  documentCategoryLabels,
  type DocumentRow,
  type DocumentCategory,
} from "@/lib/hr/documents.functions";
import { listEmployeesLite } from "@/lib/hr/payroll.functions";
import { runReminders } from "@/lib/hr/reminders.functions";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FolderArchive,
  Plus,
  Trash2,
  Loader2,
  Download,
  AlertTriangle,
  FileText,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "أرشيف الوثائق · علامة" }] }),
  component: DocumentsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

function DocumentsPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const isAdmin = hasAnyRole(user, ["hr_admin"]) && viewMode === "manager";
  const isManager = hasAnyRole(user, ["dept_manager"]) && viewMode === "manager";
  const canSeeAll = isAdmin || isManager;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elegant)]">
            <FolderArchive className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">أرشيف الوثائق</h1>
            <p className="text-sm text-muted-foreground">
              رفع الهويات والشهادات والعقود مع تنبيه قبل انتهاء الصلاحية.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <RemindersButton />}
          <UploadDialog isAdmin={isAdmin} />
        </div>
      </header>

      <Tabs defaultValue={canSeeAll ? "all" : "mine"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="mine">وثائقي</TabsTrigger>
          {canSeeAll && (
            <TabsTrigger value="all">{isAdmin ? "كل الموظفين" : "موظفو قسمي"}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine">
          <Suspense fallback={<LoadingCard />}>
            <DocumentsTable scope="mine" canManage />
          </Suspense>
        </TabsContent>

        {canSeeAll && (
          <TabsContent value="all">
            <Suspense fallback={<LoadingCard />}>
              <DocumentsTable scope="all" canManage={isAdmin} />
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

function RemindersButton() {
  const fn = useServerFn(runReminders);
  const m = useMutation({
    mutationFn: () => fn(),
    onSuccess: (res: any) => {
      toast.success(
        `تم إرسال ${res.documents_notified} تذكير وثيقة و ${res.contracts_notified} تذكير عقد` +
          (res.skipped_dupes ? ` (تم تخطي ${res.skipped_dupes} مكرر)` : ""),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <AlertTriangle className="size-4" />
      )}
      تشغيل تذكيرات الانتهاء
    </Button>
  );
}

function DocumentsTable({ scope, canManage }: { scope: "mine" | "all"; canManage: boolean }) {
  const fn = useServerFn(listDocuments);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["documents", scope],
      queryFn: () => fn({ data: { scope } }),
    }),
  );

  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center space-y-3">
          <div className="size-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <FolderArchive className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">لا توجد وثائق بعد</p>
          <p className="text-sm text-muted-foreground">
            ابدأ برفع الهوية أو الشهادات الجامعية أو الرخصة.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الوثيقة</TableHead>
            <TableHead className="text-right">الفئة</TableHead>
            {scope === "all" && <TableHead className="text-right">الموظف</TableHead>}
            <TableHead className="text-right">رقم</TableHead>
            <TableHead className="text-right">إصدار</TableHead>
            <TableHead className="text-right">انتهاء</TableHead>
            <TableHead className="text-right w-32">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d: DocumentRow) => (
            <Row key={d.id} d={d} canManage={canManage} scope={scope} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function Row({
  d,
  canManage,
  scope,
}: {
  d: DocumentRow;
  canManage: boolean;
  scope: "mine" | "all";
}) {
  const sign = useServerFn(signDocumentUrl);
  const [busy, setBusy] = useState(false);
  async function openDoc() {
    setBusy(true);
    try {
      const { url } = await sign({ data: { path: d.storage_path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  const exp = d.days_to_expiry;
  const expBadge =
    exp === null ? null : exp < 0 ? (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> منتهية
      </Badge>
    ) : exp <= 7 ? (
      <Badge className="bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300 gap-1">
        <AlertTriangle className="size-3" /> {exp} يوم
      </Badge>
    ) : exp <= 30 ? (
      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
        {exp} يوم
      </Badge>
    ) : (
      <Badge variant="outline">{exp} يوم</Badge>
    );

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          {d.title}
        </div>
        {d.issuing_authority && (
          <div className="text-xs text-muted-foreground">{d.issuing_authority}</div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{documentCategoryLabels[d.category]}</Badge>
      </TableCell>
      {scope === "all" && <TableCell>{d.employee_name}</TableCell>}
      <TableCell className="num">{d.document_number || "—"}</TableCell>
      <TableCell className="num">{fmtDate(d.issue_date)}</TableCell>
      <TableCell className="num">
        <div className="flex items-center gap-2">
          {fmtDate(d.expiry_date)} {expBadge}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={openDoc} disabled={busy} title="تنزيل">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </Button>
          {canManage && <DeleteBtn id={d.id} name={d.title} scope={scope} />}
        </div>
      </TableCell>
    </TableRow>
  );
}

function DeleteBtn({ id, name, scope }: { id: string; name: string; scope: "mine" | "all" }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(deleteDocument);
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["documents", scope] });
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
          <AlertDialogTitle>حذف الوثيقة</AlertDialogTitle>
          <AlertDialogDescription>
            هل تريد حذف «{name}»؟ سيتم حذف الملف من التخزين أيضاً.
          </AlertDialogDescription>
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

const MAX_FILE_MB = 10;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function UploadDialog({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("national_id");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [issue, setIssue] = useState("");
  const [expiry, setExpiry] = useState("");
  const [authority, setAuthority] = useState("");
  const [notes, setNotes] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const upsert = useServerFn(upsertDocument);
  const listEmps = useServerFn(listEmployeesLite);
  const { data: emps = [] } = useQuery({
    queryKey: ["emps-lite"],
    queryFn: () => listEmps(),
    enabled: isAdmin && open,
  });

  function reset() {
    setCategory("national_id");
    setTitle("");
    setNumber("");
    setIssue("");
    setExpiry("");
    setAuthority("");
    setNotes("");
    setEmployeeId("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("اختر ملفاً للرفع");
    if (!ALLOWED_TYPES.includes(file.type))
      return toast.error("يُسمح بـ PDF أو صور (JPG/PNG/WEBP)");
    if (file.size > MAX_FILE_MB * 1024 * 1024) return toast.error(`الحد الأقصى ${MAX_FILE_MB}MB`);
    if (!title) return toast.error("اكتب عنوان الوثيقة");

    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("الجلسة غير نشطة");
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${userData.user.id}/${category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      await upsert({
        data: {
          employee_id: isAdmin && employeeId ? employeeId : undefined,
          category,
          title,
          document_number: number || null,
          issue_date: issue || null,
          expiry_date: expiry || null,
          issuing_authority: authority || null,
          notes: notes || null,
          storage_path: path,
          file_size: file.size,
          mime_type: file.type,
        },
      });
      toast.success("تم رفع الوثيقة");
      qc.invalidateQueries({ queryKey: ["documents"] });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "فشل الرفع");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> رفع وثيقة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>رفع وثيقة جديدة</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {isAdmin && (
            <div className="space-y-2">
              <Label>الموظف (اتركه فارغاً لتُضاف لك)</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {emps.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>الفئة *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(documentCategoryLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>عنوان مختصر *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: الهوية الوطنية"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>الرقم</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>الجهة المصدرة</Label>
              <Input value={authority} onChange={(e) => setAuthority(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" dir="rtl">
            <div className="space-y-2">
              <Label>تاريخ الإصدار</Label>
              <Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الانتهاء</Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>الملف * (PDF / صورة، حتى {MAX_FILE_MB}MB)</Label>
            <Input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}{" "}
              رفع
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
