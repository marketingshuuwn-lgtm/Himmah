import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { readExcelFile } from "@/lib/utils/excel";
import {
  downloadAttendanceTemplate,
  downloadEmployeesTemplate,
} from "@/lib/utils/import-templates";
import { createImportBatch } from "@/lib/hr/imports.functions";

export type ImportKind = "attendance" | "employees";

export function ImportDialog({
  kind,
  trigger,
  onDone,
}: {
  kind: ImportKind;
  trigger?: React.ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState("upload");
  const [busy, setBusy] = useState(false);
  const submit = useServerFn(createImportBatch);

  const handleFile = useCallback(async (f: File | null) => {
    setFile(f);
    if (!f) return setRows([]);
    try {
      const data = await readExcelFile(f);
      setRows(data);
      setTab("review");
    } catch (e: any) {
      toast.error("تعذّر قراءة الملف: " + (e?.message ?? "غير معروف"));
    }
  }, []);

  const handleSubmit = async () => {
    if (!rows.length) return toast.error("لا يوجد صفوف للاستيراد");
    setBusy(true);
    try {
      const res = await submit({ data: { kind, rows, filename: file?.name ?? null } });
      if (res.autoApplied) {
        toast.success(`تم استيراد ${res.valid} صف بنجاح`);
      } else {
        toast.success(
          `تم إرسال ${res.valid} صف للمراجعة${res.errors ? ` (${res.errors} أخطاء)` : ""}`,
        );
      }
      setOpen(false);
      setFile(null);
      setRows([]);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="size-4" /> استيراد Excel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            استيراد {kind === "attendance" ? "الحضور" : "بيانات الموظفين"}
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full" dir="rtl">
            <TabsTrigger value="upload">الرفع</TabsTrigger>
            <TabsTrigger value="template">النموذج</TabsTrigger>
            <TabsTrigger value="review" disabled={!rows.length}>
              المراجعة {rows.length > 0 && <Badge className="ms-1">{rows.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              اختر ملف Excel بصيغة <code>.xlsx</code> يحتوي الصف الأول عناوين الأعمدة كما في
              النموذج.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {file && <div className="text-xs text-muted-foreground">📄 {file.name}</div>}
            <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
              <div className="font-medium flex items-center gap-1">
                <AlertTriangle className="size-3" /> ملاحظة الصلاحيات:
              </div>
              {kind === "attendance" ? (
                <div>
                  الموظف يستطيع استيراد سجلاته فقط، وسيمر الاستيراد بموافقة المدير أو HR. المدير و
                  HR يستطيعون استيراد لموظفيهم مباشرة.
                </div>
              ) : (
                <div>استيراد الموظفين متاح لموظفي الموارد البشرية فقط.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="template" className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              حمّل قالباً جاهزاً يحتوي على الأعمدة الصحيحة وورقة تعليمات.
            </p>
            <Button
              onClick={() =>
                kind === "attendance" ? downloadAttendanceTemplate() : downloadEmployeesTemplate()
              }
              variant="secondary"
              className="gap-2"
            >
              <Download className="size-4" /> تنزيل النموذج
            </Button>
          </TabsContent>

          <TabsContent value="review" className="space-y-3 py-4">
            <div className="text-sm flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              تم قراءة <strong>{rows.length}</strong> صف. سيتم التحقق من صحتها في الخادم قبل
              التطبيق.
            </div>
            <div className="max-h-64 overflow-auto border rounded-md text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {Object.keys(rows[0] ?? {}).map((k) => (
                      <th key={k} className="px-2 py-1 text-start">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.keys(rows[0] ?? {}).map((k) => (
                        <td key={k} className="px-2 py-1 truncate max-w-[160px]">
                          {String(r[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <div className="p-2 text-muted-foreground text-center">
                  … و {rows.length - 20} صف آخر
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={!rows.length || busy} className="gap-2">
            {busy && <Loader2 className="size-4 animate-spin" />}
            إرسال {rows.length ? `(${rows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
