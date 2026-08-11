import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listTemplates,
  upsertTemplate,
  deleteTemplate,
  listContracts,
  myContracts,
  submitEmployeeContractFields,
  createContract,
  sendContract,
  cancelContract,
  signContract,
  addContractNote,
  attachPdf,
  getContractAudit,
  recordContractEvent,
  rejectContract,
  type ContractRow,
  type ContractTemplateRow,
  type Jurisdiction,
  type TemplateDepartment,
  type ContractType,
  type TemplateLanguage,
} from "@/lib/hr/contracts.functions";
import { listEmployeesLite } from "@/lib/hr/payroll.functions";
import { getEmployeeProfile } from "@/lib/hr/profile.functions";
import { AUTO_VAR_SOURCES, isAutoContractVar, interpolateContract, unfilledPlaceholders } from "@/lib/hr/contract-autofill";
import { extractContractFields, readFileAsText } from "@/lib/hr/contract-extract";
import {
  fieldSource,
  fieldLabel,
  fieldKind,
  FIELD_SOURCE_LABELS,
  type FieldSource,
} from "@/lib/hr/contract-fields";
import { startAuthentication, listMyDevices } from "@/lib/hr/webauthn.functions";
import DOMPurify from "isomorphic-dompurify";
import { ContractDocument } from "@/components/contract-document";
import { startAuthentication as wbStartAuth } from "@simplewebauthn/browser";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { bulkUpdateContractStatus, bulkIssueContracts } from "@/lib/hr/bulk.functions";
import { exportToExcel } from "@/lib/utils/excel";
import {
  FileSignature,
  Plus,
  Send,
  Trash2,
  Eye,
  ShieldCheck,
  Download,
  ScrollText,
  Fingerprint,
  Search,
  X,
  Globe,
  MapPin,
  Building2,
  Sparkles,
  MessageSquareWarning,
  Loader2,
  Wand2,
  UploadCloud,
  Ban,
} from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { fmtDate, fmtDateTime } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: ContractsPage,
});

/**
 * Contract bodies are authored by HR (rich text templates + variable interpolation).
 * The stored body may legitimately contain HTML tags (h2/p/ul/strong...). Rendering
 * as plain text was leaking raw markup to the signer's screen. We sanitize with
 * DOMPurify before injection so HR-provided markup renders, and any accidental
 * <script>/on* is stripped.
 */
function renderContractBodyHtml(body: string): string {
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  const html = looksLikeHtml
    ? body
    : body
        // Preserve author's paragraph breaks even for plain-text templates.
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1","h2","h3","h4","p","br","hr","strong","em","u","b","i",
      "ul","ol","li","blockquote","table","thead","tbody","tr","th","td","span","div",
    ],
    ALLOWED_ATTR: ["class","dir","style","colspan","rowspan"],
  });
}

function ContractsPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const isHR = hasAnyRole(user, ["hr_admin"]) && viewMode === "manager";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <FileSignature className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">العقود والمستندات</h1>
            <p className="text-sm text-muted-foreground">
              قوالب، توقيع رقمي بالإصبع، وتحقق بصمة الجهاز
            </p>
          </div>
        </div>
        {isHR && (
          <Button asChild>
            <Link to="/contracts/new">
              <Sparkles className="size-4" /> إصدار عقد جديد
            </Link>
          </Button>
        )}
      </header>

      <Tabs defaultValue={isHR ? "contracts" : "mine"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="mine">عقودي</TabsTrigger>
          {isHR && <TabsTrigger value="contracts">إدارة العقود</TabsTrigger>}
          {isHR && <TabsTrigger value="templates">القوالب</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
          <MyContracts />
        </TabsContent>
        {isHR && (
          <TabsContent value="contracts">
            <AdminContracts />
          </TabsContent>
        )}
        {isHR && (
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ---------- Templates Library ----------
const JURISDICTIONS: { v: Jurisdiction | "all"; label: string; flag: string; tone: string }[] = [
  { v: "all", label: "الكل", flag: "✦", tone: "bg-muted text-foreground" },
  {
    v: "global",
    label: "عالمي",
    flag: "🌍",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  {
    v: "mena",
    label: "شرق أوسط",
    flag: "🌐",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  {
    v: "gcc",
    label: "خليجي",
    flag: "🕌",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  { v: "ksa", label: "سعودي", flag: "🇸🇦", tone: "bg-primary/10 text-primary border-primary/30" },
];
const DEPARTMENTS: { v: TemplateDepartment | "all"; label: string }[] = [
  { v: "all", label: "كل الأقسام" },
  { v: "tech", label: "تقنية" },
  { v: "marketing", label: "تسويق" },
  { v: "consulting_finance", label: "استشارات مالية" },
  { v: "consulting_admin", label: "استشارات إدارية" },
  { v: "consulting_legal", label: "استشارات قانونية" },
  { v: "hr", label: "موارد بشرية" },
  { v: "general", label: "عام" },
];
const TYPES: { v: ContractType | "all"; label: string }[] = [
  { v: "all", label: "كل الأنواع" },
  { v: "employment", label: "توظيف" },
  { v: "nda_unilateral", label: "NDA أحادي" },
  { v: "nda_mutual", label: "NDA متبادل" },
  { v: "consulting", label: "استشارات/خدمات" },
  { v: "salary_amendment", label: "ملحق راتب" },
  { v: "termination", label: "إنهاء خدمة" },
];
const LANGS: { v: TemplateLanguage | "all"; label: string }[] = [
  { v: "all", label: "كل اللغات" },
  { v: "ar", label: "عربي" },
  { v: "en", label: "إنجليزي" },
  { v: "bilingual", label: "ثنائي" },
];

function jurisdictionMeta(j: Jurisdiction) {
  return JURISDICTIONS.find((x) => x.v === j)!;
}
function deptLabel(d: TemplateDepartment) {
  return DEPARTMENTS.find((x) => x.v === d)?.label ?? d;
}
function typeLabel(t: ContractType) {
  return TYPES.find((x) => x.v === t)?.label ?? t;
}
function langLabel(l: TemplateLanguage) {
  return LANGS.find((x) => x.v === l)?.label ?? l;
}

function TemplatesTab() {
  const fetcher = useServerFn(listTemplates);
  const { data = [] } = useQuery({ queryKey: ["contract-templates"], queryFn: () => fetcher() });
  const [editing, setEditing] = useState<ContractTemplateRow | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [preview, setPreview] = useState<ContractTemplateRow | null>(null);
  const [useNow, setUseNow] = useState<ContractTemplateRow | null>(null);

  const [q, setQ] = useState("");
  const [fJur, setFJur] = useState<Jurisdiction | "all">("all");
  const [fDept, setFDept] = useState<TemplateDepartment | "all">("all");
  const [fType, setFType] = useState<ContractType | "all">("all");
  const [fLang, setFLang] = useState<TemplateLanguage | "all">("all");
  const [onlyActive, setOnlyActive] = useState(true);

  const filtered = data.filter((t) => {
    if (onlyActive && !t.is_active) return false;
    if (fJur !== "all" && t.jurisdiction !== fJur) return false;
    if (fDept !== "all" && t.department !== fDept) return false;
    if (fType !== "all" && t.contract_type !== fType) return false;
    if (fLang !== "all" && t.language !== fLang) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = [t.name, t.description ?? "", ...(t.tags ?? [])].join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const activeFilters =
    (fJur !== "all" ? 1 : 0) +
    (fDept !== "all" ? 1 : 0) +
    (fType !== "all" ? 1 : 0) +
    (fLang !== "all" ? 1 : 0) +
    (q.trim() ? 1 : 0);

  function resetFilters() {
    setQ("");
    setFJur("all");
    setFDept("all");
    setFType("all");
    setFLang("all");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg">مكتبة قوالب العقود</h2>
                <p className="text-xs text-muted-foreground">
                  نماذج جاهزة للاستخدام الفوري — عالمية، شرق أوسط، خليجي، سعودي
                </p>
              </div>
            </div>
            <Dialog
              open={openEdit}
              onOpenChange={(o) => {
                setOpenEdit(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="size-4" /> قالب جديد
                </Button>
              </DialogTrigger>
              <TemplateDialog template={editing} onClose={() => setOpenEdit(false)} />
            </Dialog>
          </div>

          {/* Search + filter row */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالاسم أو الوسم..."
                className="pr-9"
              />
            </div>

            <FilterChips label="النطاق" icon={<Globe className="size-3.5" />}>
              {JURISDICTIONS.map((j) => (
                <Chip
                  key={j.v}
                  active={fJur === j.v}
                  onClick={() => setFJur(j.v)}
                  className={fJur === j.v ? j.tone : ""}
                >
                  <span>{j.flag}</span> {j.label}
                </Chip>
              ))}
            </FilterChips>

            <FilterChips label="القسم" icon={<Building2 className="size-3.5" />}>
              {DEPARTMENTS.map((d) => (
                <Chip key={d.v} active={fDept === d.v} onClick={() => setFDept(d.v)}>
                  {d.label}
                </Chip>
              ))}
            </FilterChips>

            <FilterChips label="النوع" icon={<FileSignature className="size-3.5" />}>
              {TYPES.map((t) => (
                <Chip key={t.v} active={fType === t.v} onClick={() => setFType(t.v)}>
                  {t.label}
                </Chip>
              ))}
            </FilterChips>

            <FilterChips label="اللغة" icon={<MapPin className="size-3.5" />}>
              {LANGS.map((l) => (
                <Chip key={l.v} active={fLang === l.v} onClick={() => setFLang(l.v)}>
                  {l.label}
                </Chip>
              ))}
            </FilterChips>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{filtered.length}</span> من{" "}
                {data.length} قالب
                <span className="hidden sm:inline">·</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Switch checked={onlyActive} onCheckedChange={setOnlyActive} />
                  نشط فقط
                </label>
              </div>
              {activeFilters > 0 && (
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  <X className="size-3.5" /> تصفير الفلاتر ({activeFilters})
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            لا توجد قوالب مطابقة. جرّب تصفير الفلاتر أو أنشئ قالباً جديداً.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" dir="rtl">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onEdit={() => {
                setEditing(t);
                setOpenEdit(true);
              }}
              onPreview={() => setPreview(t)}
              onUse={() => setUseNow(t)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
      >
        {preview && (
          <PreviewTemplateDialog
            t={preview}
            onUse={() => {
              setUseNow(preview);
              setPreview(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={!!useNow}
        onOpenChange={(o) => {
          if (!o) setUseNow(null);
        }}
      >
        {useNow && <CreateContractDialog onClose={() => setUseNow(null)} presetTemplate={useNow} />}
      </Dialog>
    </div>
  );
}

function FilterChips({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground min-w-14">
        {icon} {label}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs border transition-all",
        active
          ? className || "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background hover:bg-muted/60 border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TemplateCard({
  t,
  onEdit,
  onPreview,
  onUse,
}: {
  t: ContractTemplateRow;
  onEdit: () => void;
  onPreview: () => void;
  onUse: () => void;
}) {
  const qc = useQueryClient();
  const del = useServerFn(deleteTemplate);
  const m = useMutation({
    mutationFn: () => del({ data: { id: t.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("حُذف القالب");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const jm = jurisdictionMeta(t.jurisdiction);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-md transition-shadow flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-semibold border inline-flex items-center gap-1",
              jm.tone,
            )}
          >
            <span>{jm.flag}</span> {jm.label}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {deptLabel(t.department)}
          </Badge>
        </div>
        {!t.is_active && (
          <Badge variant="secondary" className="text-[10px]">
            معطّل
          </Badge>
        )}
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="font-semibold text-sm leading-tight">{t.name}</h3>
        {t.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1 text-[10px]">
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {typeLabel(t.contract_type)}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {langLabel(t.language)}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {t.variables.length} متغير
        </span>
        {(t.tags ?? []).slice(0, 2).map((tag) => (
          <span key={tag} className="px-1.5 py-0.5 rounded bg-primary/5 text-primary">
            #{tag}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 pt-1 border-t">
        <Button size="sm" className="flex-1" onClick={onUse}>
          <FileSignature className="size-3.5" /> استخدم
        </Button>
        <Button size="sm" variant="outline" onClick={onPreview}>
          <Eye className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          تعديل
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => m.mutate()}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PreviewTemplateDialog({ t, onUse }: { t: ContractTemplateRow; onUse: () => void }) {
  const jm = jurisdictionMeta(t.jurisdiction);
  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          <span
            className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border", jm.tone)}
          >
            {jm.flag} {jm.label}
          </span>
          {t.name}
        </DialogTitle>
      </DialogHeader>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
        <span>القسم: {deptLabel(t.department)}</span>
        <span>· النوع: {typeLabel(t.contract_type)}</span>
        <span>· اللغة: {langLabel(t.language)}</span>
      </div>
      {t.description && <p className="text-sm">{t.description}</p>}
      <div
        className="rounded-lg border bg-white text-slate-900 p-5 prose prose-sm max-w-none rtl:prose-headings:text-right"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t.body) }}
      />
      {t.variables.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-semibold mb-2">المتغيرات ({t.variables.length})</p>
          <div className="flex flex-wrap gap-1">
            {t.variables.map((v) => (
              <code
                key={v}
                className="text-[10px] bg-background border px-1.5 py-0.5 rounded"
              >{`{{${v}}}`}</code>
            ))}
          </div>
        </div>
      )}
      <DialogFooter>
        <Button onClick={onUse}>
          <FileSignature className="size-4" /> استخدم هذا القالب
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TemplateDialog({
  template,
  onClose,
}: {
  template: ContractTemplateRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertTemplate);
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [body, setBody] = useState(
    template?.body ??
      "<h2>عنوان العقد</h2>\n<p>أنا الموقّع أدناه {{employee_name}} (رقم وظيفي {{employee_no}}) أوافق على الشروط بتاريخ {{date}}.</p>",
  );
  const [varsStr, setVarsStr] = useState(
    (template?.variables ?? ["employee_name", "employee_no", "date"]).join(", "),
  );
  const [tagsStr, setTagsStr] = useState((template?.tags ?? []).join(", "));
  // Who fills each variable — the default comes from the shared registry and
  // HR only overrides the exceptions.
  const [varSources, setVarSources] = useState<Record<string, FieldSource>>(
    template?.variable_sources ?? {},
  );
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(template?.jurisdiction ?? "ksa");
  const [department, setDepartment] = useState<TemplateDepartment>(
    template?.department ?? "general",
  );
  const [contractType, setContractType] = useState<ContractType>(
    template?.contract_type ?? "employment",
  );
  const [language, setLanguage] = useState<TemplateLanguage>(template?.language ?? "ar");

  const varNames = Array.from(
    new Set(
      varsStr
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  );



  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: template?.id,
          name,
          description,
          body,
          is_active: isActive,
          variables: varNames,
          variable_sources: varSources,
          tags: tagsStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          jurisdiction,
          department,
          contract_type: contractType,
          language,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("تم الحفظ");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{template ? "تعديل القالب" : "قالب جديد"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>اسم القالب</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>الوصف</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2" dir="rtl">
          <div>
            <Label>النطاق</Label>
            <Select value={jurisdiction} onValueChange={(v) => setJurisdiction(v as Jurisdiction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTIONS.filter((x) => x.v !== "all").map((x) => (
                  <SelectItem key={x.v} value={x.v}>
                    {x.flag} {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>القسم</Label>
            <Select
              value={department}
              onValueChange={(v) => setDepartment(v as TemplateDepartment)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.filter((x) => x.v !== "all").map((x) => (
                  <SelectItem key={x.v} value={x.v}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>نوع العقد</Label>
            <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.filter((x) => x.v !== "all").map((x) => (
                  <SelectItem key={x.v} value={x.v}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>اللغة</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as TemplateLanguage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.filter((x) => x.v !== "all").map((x) => (
                  <SelectItem key={x.v} value={x.v}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>المتغيرات (مفصولة بفاصلة)</Label>
          <Input
            value={varsStr}
            onChange={(e) => setVarsStr(e.target.value)}
            placeholder="employee_name, salary, date"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            استخدمها في النص بالشكل {`{{employee_name}}`}
          </p>
          {varNames.length > 0 && (
            <div className="mt-3 rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold">مصدر تعبئة كل حقل</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                «تلقائي من ملف الموظف» لا يُطلب من أحد، و«يعبّئه الموظف» يظهر للموظف في صفحة عقوده
                قبل التوقيع.
              </p>
              {varNames.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="text-xs flex-1 truncate font-mono">{v}</span>
                  <span className="text-[11px] text-muted-foreground w-24 truncate">
                    {fieldLabel(v)}
                  </span>
                  <Select
                    value={fieldSource(v, varSources)}
                    onValueChange={(val) =>
                      setVarSources((p) => ({ ...p, [v]: val as FieldSource }))
                    }
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FIELD_SOURCE_LABELS) as FieldSource[]).map((k) => (
                        <SelectItem key={k} value={k} className="text-xs">
                          {FIELD_SOURCE_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label>الوسوم (مفصولة بفاصلة)</Label>
          <Input
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="IP, عدم منافسة"
          />
        </div>
        <div>
          <Label>نص العقد (يدعم HTML)</Label>
          <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>القالب نشط</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          حفظ
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------- Admin Contracts ----------
function AdminContracts() {
  const fetcher = useServerFn(listContracts);
  const { data = [] } = useQuery({ queryKey: ["contracts-all"], queryFn: () => fetcher() });
  const [open, setOpen] = useState(false);
  const [bulkIssueOpen, setBulkIssueOpen] = useState(false);
  const [viewing, setViewing] = useState<ContractRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractRow["status"]>("all");

  const stats = {
    all: data.length,
    draft: data.filter((c) => c.status === "draft").length,
    sent: data.filter((c) => c.status === "sent").length,
    signed: data.filter((c) => c.status === "signed").length,
    cancelled: data.filter((c) => c.status === "cancelled").length,
  };
  const term = q.trim().toLowerCase();
  const rows = data.filter(
    (c) =>
      (statusFilter === "all" || c.status === statusFilter) &&
      (!term ||
        c.title.toLowerCase().includes(term) ||
        c.employee_name.toLowerCase().includes(term) ||
        (c.template_name ?? "").toLowerCase().includes(term)),
  );

  const toggleAll = () => {
    setSelected((p) => {
      if (data.every((c) => p.has(c.id))) return new Set();
      return new Set(data.map((c) => c.id));
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
    const rows = (selected.size ? data.filter((c) => selected.has(c.id)) : data).map((c) => ({
      العنوان: c.title,
      الموظف: c.employee_name,
      القالب: c.template_name ?? "",
      الحالة: c.status,
      "تاريخ الإنشاء": c.created_at,
      "تاريخ السريان": c.effective_date ?? "",
      "تاريخ الإرسال": c.sent_at ?? "",
      "تاريخ التوقيع": c.signed_at ?? "",
    }));
    exportToExcel(rows, `contracts-${new Date().toISOString().slice(0, 10)}.xlsx`, "العقود");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">العقود ({data.length})</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={exportExcel}>
            <Download className="size-4" /> تصدير{selected.size ? ` (${selected.size})` : ""}
          </Button>
          <Dialog open={bulkIssueOpen} onOpenChange={setBulkIssueOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Sparkles className="size-4" /> إصدار جماعي
              </Button>
            </DialogTrigger>
            <BulkIssueContractsDialog onClose={() => setBulkIssueOpen(false)} />
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> إنشاء عقد
              </Button>
            </DialogTrigger>
            <CreateContractDialog onClose={() => setOpen(false)} />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد عقود بعد.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث باسم الموظف أو عنوان العقد…"
                className="h-8 max-w-xs"
              />
              {(
                [
                  ["all", `الكل (${stats.all})`],
                  ["draft", `مسودة (${stats.draft})`],
                  ["sent", `بانتظار التوقيع (${stats.sent})`],
                  ["signed", `موقّع (${stats.signed})`],
                  ["cancelled", `ملغي (${stats.cancelled})`],
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={statusFilter === k ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setStatusFilter(k as typeof statusFilter)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {selected.size > 0 && (
              <BulkContractStatusBar
                ids={Array.from(selected)}
                onDone={() => setSelected(new Set())}
              />
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border-b">
              <Checkbox
                checked={data.length > 0 && data.every((c) => selected.has(c.id))}
                onCheckedChange={toggleAll}
              />
              <span>تحديد الكل</span>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                لا توجد عقود مطابقة للبحث.
              </p>
            ) : (
              rows.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selected.has(c.id)}
                    onCheckedChange={() => toggleOne(c.id)}
                    className="me-2"
                  />
                  <div className="flex-1">
                    <AdminContractRow c={c} onView={() => setViewing(c)} />
                  </div>
                </div>
              ))
            )}
          </div>

        )}
      </CardContent>
      <Dialog
        open={!!viewing}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
      >
        {viewing && <ContractViewerDialog contract={viewing} isAdmin />}
      </Dialog>
    </Card>
  );
}

function BulkContractStatusBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(bulkUpdateContractStatus);
  const m = useMutation({
    mutationFn: (action: "send" | "cancel") => fn({ data: { ids, action } }),
    onSuccess: (r, action) => {
      toast.success(`${action === "send" ? "أُرسل" : "أُلغي"} ${r.count} عقد`);
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border border-primary/30 bg-primary/5">
      <div className="text-sm font-medium">{ids.length} عقد محدد</div>
      <div className="flex-1" />
      <Button size="sm" onClick={() => m.mutate("send")} disabled={m.isPending}>
        <Send className="size-3.5" /> إرسال للتوقيع
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => m.mutate("cancel")}
        disabled={m.isPending}
      >
        <Trash2 className="size-3.5" /> إلغاء
      </Button>
    </div>
  );
}

function BulkIssueContractsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fetchEmps = useServerFn(listEmployeesLite);
  const fetchTpls = useServerFn(listTemplates);
  const issue = useServerFn(bulkIssueContracts);
  const { data: emps = [] } = useQuery({ queryKey: ["emps-lite"], queryFn: () => fetchEmps() });
  const { data: tpls = [] } = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => fetchTpls(),
  });

  const [templateId, setTemplateId] = useState("");
  const [empIds, setEmpIds] = useState<Set<string>>(new Set());
  const [sendNow, setSendNow] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredEmps = emps.filter(
    (e) => !filter || e.label.toLowerCase().includes(filter.toLowerCase()),
  );
  const toggle = (id: string) =>
    setEmpIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const m = useMutation({
    mutationFn: () =>
      issue({
        data: {
          template_id: templateId,
          employee_ids: Array.from(empIds),
          send_immediately: sendNow,
          data: {},
        },
      }),
    onSuccess: (r) => {
      toast.success(`أُصدر ${r.count} عقد`);
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>إصدار جماعي من قالب</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>القالب *</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر قالباً" />
            </SelectTrigger>
            <SelectContent>
              {tpls
                .filter((t) => t.is_active)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            متغيرات <code>employee_name</code>، <code>employee_no</code>، <code>issue_date</code>{" "}
            تُعبّأ تلقائياً.
          </p>
        </div>
        <div>
          <Label>الموظفون ({empIds.size} محدد)</Label>
          <Input
            placeholder="بحث…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-1 mb-2"
          />
          <div className="rounded-lg border max-h-60 overflow-auto">
            <div className="p-2 border-b flex items-center gap-2 text-xs sticky top-0 bg-background">
              <Checkbox
                checked={filteredEmps.length > 0 && filteredEmps.every((e) => empIds.has(e.id))}
                onCheckedChange={() => {
                  setEmpIds((p) => {
                    const allSel = filteredEmps.every((e) => p.has(e.id));
                    const n = new Set(p);
                    if (allSel) filteredEmps.forEach((e) => n.delete(e.id));
                    else filteredEmps.forEach((e) => n.add(e.id));
                    return n;
                  });
                }}
              />
              تحديد الكل ({filteredEmps.length})
            </div>
            {filteredEmps.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 p-2 text-sm hover:bg-muted/40 cursor-pointer border-b last:border-0"
              >
                <Checkbox checked={empIds.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                {e.label}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={sendNow} onCheckedChange={setSendNow} />
          إرسال للتوقيع فوراً بعد الإصدار
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          onClick={() => m.mutate()}
          disabled={!templateId || empIds.size === 0 || m.isPending}
        >
          إصدار ({empIds.size})
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function statusBadge(s: ContractRow["status"]) {
  const map = {
    draft: { label: "مسودة", variant: "secondary" as const },
    sent: { label: "في انتظار التوقيع", variant: "default" as const },
    signed: { label: "موقّع", variant: "default" as const },
    cancelled: { label: "ملغى", variant: "destructive" as const },
  };
  const m = map[s];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function AdminContractRow({ c, onView }: { c: ContractRow; onView: () => void }) {
  const qc = useQueryClient();
  const send = useServerFn(sendContract);
  const cancel = useServerFn(cancelContract);
  const inv = () => qc.invalidateQueries({ queryKey: ["contracts-all"] });
  const mSend = useMutation({
    mutationFn: () => send({ data: { id: c.id } }),
    onSuccess: () => {
      inv();
      toast.success("أُرسل للتوقيع");
    },
  });
  const mCancel = useMutation({
    mutationFn: () => cancel({ data: { id: c.id } }),
    onSuccess: () => {
      inv();
      toast.success("ألغي العقد");
    },
  });

  const missing = unfilledPlaceholders(c.body ?? "", {});
  const canSend = missing.length === 0;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{c.title}</p>
        <p className="text-xs text-muted-foreground">
          {c.employee_name} · أُنشئ {fmtDateTime(c.created_at)}
          {c.effective_date && <> · يسري من {fmtDate(c.effective_date)}</>}
        </p>
        {c.status === "draft" && !canSend && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
            لا يمكن الإرسال — حقول ناقصة: {missing.join("، ")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {c.employee_note && (
          <span title={c.employee_note} className="inline-flex">
            <Badge
              variant="outline"
              className="border-amber-500/60 text-amber-700 dark:text-amber-300 gap-1"
            >
              <MessageSquareWarning className="size-3" /> ملاحظة
            </Badge>
          </span>
        )}
        {statusBadge(c.status)}
        <Button size="sm" variant="ghost" onClick={onView}>
          <Eye className="size-4" />
        </Button>
        {c.status === "draft" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={!canSend}
              title={canSend ? "معاينة الرسالة قبل الإرسال" : missing.join("، ")}
            >
              <Send className="size-3.5" /> معاينة وإرسال
            </Button>
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <SendPreviewDialog
                contract={c}
                onConfirm={() => mSend.mutate()}
                pending={mSend.isPending}
                onClose={() => setPreviewOpen(false)}
              />
            </Dialog>
          </>
        )}
        {c.status !== "cancelled" && c.status !== "signed" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => mCancel.mutate()}
          >
            إلغاء
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Shows the employee exactly what they'll receive — the rendered contract
 * plus the notification/email wording that will land in their inbox — so
 * HR confirms nothing surprising goes out. Send is blocked entirely when
 * any {{placeholder}} in the body is still unfilled.
 */
function SendPreviewDialog({
  contract,
  onConfirm,
  pending,
  onClose,
}: {
  contract: ContractRow;
  onConfirm: () => void;
  pending: boolean;
  onClose: () => void;
}) {
  const missing = unfilledPlaceholders(contract.body ?? "", {});
  const canSend = missing.length === 0;
  const rec = useServerFn(recordContractEvent);
  useEffect(() => {
    rec({ data: { contract_id: contract.id, event: "previewed" } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id]);
  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Send className="size-4 text-primary" /> معاينة الإرسال — {contract.title}
        </DialogTitle>
        <DialogDescription>
          هذه هي الرسالة الفعلية التي سيراها {contract.employee_name} قبل التوقيع.
        </DialogDescription>
      </DialogHeader>

      {!canSend && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
            العقد غير مكتمل — لا يمكن الإرسال قبل تعبئة:
          </p>
          <ul className="list-disc ps-5 text-amber-900 dark:text-amber-100">
            {missing.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
        <p className="text-[11px] uppercase text-muted-foreground">إشعار الموظف</p>
        <p className="font-semibold">عقد بحاجة إلى توقيعك</p>
        <p className="text-muted-foreground">
          «{contract.title}» بانتظار توقيعك — يرجى المراجعة والتوقيع.
        </p>
      </div>

      <ContractDocument
        title={contract.title}
        employeeName={contract.employee_name}
        referenceId={contract.id}
        createdAt={contract.created_at}
        effectiveDate={contract.effective_date}
        status={contract.status}
        bodyHtml={renderContractBodyHtml(contract.body)}
      />


      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          إغلاق
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          disabled={!canSend || pending}
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          <Send className="size-3.5" /> تأكيد الإرسال للتوقيع
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CreateContractDialog({
  onClose,
  presetTemplate,
}: {
  onClose: () => void;
  presetTemplate?: ContractTemplateRow;
}) {
  const qc = useQueryClient();
  const fetchEmps = useServerFn(listEmployeesLite);
  const fetchTpls = useServerFn(listTemplates);
  const fetchProfile = useServerFn(getEmployeeProfile);
  const create = useServerFn(createContract);
  const { data: emps = [] } = useQuery({ queryKey: ["emps-lite"], queryFn: () => fetchEmps() });
  const { data: tpls = [] } = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => fetchTpls(),
  });
  const [employeeId, setEmployeeId] = useState("");
  const [templateId, setTemplateId] = useState<string>(presetTemplate?.id ?? "");
  const [title, setTitle] = useState(presetTemplate?.name ?? "");
  const [body, setBody] = useState(presetTemplate?.body ?? "");
  const [vars, setVars] = useState<Record<string, string>>(
    presetTemplate ? Object.fromEntries(presetTemplate.variables.map((k) => [k, ""])) : {},
  );

  const tpl = tpls.find((t) => t.id === templateId);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = tpls.find((x) => x.id === id);
    if (t) {
      setBody(t.body);
      setTitle(t.name);
      const v: Record<string, string> = {};
      for (const k of t.variables) {
        v[k] = isAutoVar(k) && empProfile ? AUTO_VAR_SOURCES[k](empProfile) : "";
      }
      setVars(v);
    }
  }

  const [salary, setSalary] = useState("");
  const [allowancesAmt, setAllowancesAmt] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  // Single source of truth: pull the employee's actual record instead of
  // re-typing name/number/position/salary that already exist in their
  // profile. Known variable names are auto-filled and locked; only
  // custom/unmapped template variables stay freely editable.
  const { data: empProfile } = useQuery({
    queryKey: ["employee-profile-for-contract", employeeId],
    queryFn: () => fetchProfile({ data: { employee_id: employeeId } }),
    enabled: !!employeeId,
  });

  const isAutoVar = isAutoContractVar;

  useEffect(() => {
    if (!empProfile) return;
    setVars((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (isAutoContractVar(key)) next[key] = AUTO_VAR_SOURCES[key](empProfile);
      }
      return next;
    });
    // Suggest the employee's current salary/allowances as the contract's
    // structured starting point — still editable (a contract may set a
    // raise), unlike the identity fields above.
    setSalary((prev) => (prev.trim() ? prev : String(empProfile.financials?.base_salary ?? "")));
    setAllowancesAmt((prev) =>
      prev.trim() ? prev : String(empProfile.financials?.allowances ?? ""),
    );
    setEffectiveDate((prev) => prev || new Date().toISOString().slice(0, 10));
  }, [empProfile]);

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          template_id: templateId || undefined,
          employee_id: employeeId,
          title,
          body,
          data: vars,
          salary: salary.trim() ? Number(salary) : null,
          allowances: allowancesAmt.trim() ? Number(allowancesAmt) : null,
          effective_date: effectiveDate || null,
          pending_employee_fields: employeeUnfilled,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      toast.success(
        employeeUnfilled.length
          ? `أُنشئ العقد كمسودة — ${employeeUnfilled.length} حقل سيُطلب من الموظف`
          : "أُنشئ العقد كمسودة",
      );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Merge structured salary fields into the interpolated preview so the
  // author sees exactly what the signer will see — a real WYSIWYG contract.
  const mergedVars: Record<string, string> = {
    ...vars,
    ...(salary.trim() ? { salary, base_salary: salary, basic_salary: salary } : {}),
    ...(allowancesAmt.trim() ? { allowances: allowancesAmt, allowance: allowancesAmt } : {}),
    ...(effectiveDate ? { effective_date: fmtDate(effectiveDate), start_date: fmtDate(effectiveDate) } : {}),
  };
  const previewHtml = renderContractBodyHtml(interpolateContract(body, mergedVars));
  const unfilled = (body.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [])
    .map((m) => m.replace(/[{}\s]/g, ""))
    .filter((k) => !mergedVars[k] || mergedVars[k].length === 0);
  const uniqueUnfilled = Array.from(new Set(unfilled));
  const ownerOf = (k: string) => fieldSource(k, tpl?.variable_sources);
  // Fields the employee owns are not a blocker for HR — they are requested
  // from the employee after the contract is sent.
  const employeeUnfilled = uniqueUnfilled.filter((k) => ownerOf(k) === "employee");
  const blockingUnfilled = uniqueUnfilled.filter((k) => ownerOf(k) !== "employee");

  const readyToCreate =
    !!employeeId && !!title.trim() && !!body.trim() && blockingUnfilled.length === 0 && !m.isPending;

  return (
    <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0">
      <DialogHeader className="p-5 pb-3 border-b">
        <DialogTitle className="flex items-center gap-2">
          <FileSignature className="size-4 text-primary" /> إنشاء عقد جديد
        </DialogTitle>
        <DialogDescription>
          البيانات المسحوبة من ملف الموظف تُملأ تلقائياً وتُقفَل — التعديل من صفحة الموظف.
        </DialogDescription>
      </DialogHeader>

      <div className="grid md:grid-cols-2 gap-0 max-h-[70vh] overflow-hidden">
        {/* Left: form */}
        <div className="p-5 space-y-3 overflow-y-auto border-e">
          <div>
            <Label>الموظف *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر موظفاً" />
              </SelectTrigger>
              <SelectContent>
                {emps.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employeeId && empProfile?.missing_fields?.length ? (
              <p className="text-[11px] text-amber-600 mt-1.5">
                ملف الموظف ناقص: {empProfile.missing_fields.join("، ")} — الحقول المرتبطة ستبقى فارغة.
              </p>
            ) : null}
          </div>
          <div>
            <Label>القالب (اختياري)</Label>
            <Select value={templateId} onValueChange={pickTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="بدون قالب" />
              </SelectTrigger>
              <SelectContent>
                {tpls
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>عنوان العقد *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {tpl && tpl.variables.length > 0 && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold">قيم المتغيرات</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!employeeId || !empProfile}
                    onClick={() => {
                      if (!empProfile) return;
                      let refilled = 0;
                      setVars((prev) => {
                        const next = { ...prev };
                        for (const k of Object.keys(next)) {
                          if (isAutoContractVar(k)) {
                            const v = AUTO_VAR_SOURCES[k](empProfile);
                            if (v) {
                              if (next[k] !== v) refilled += 1;
                              next[k] = v;
                            }
                          }
                        }
                        return next;
                      });
                      setSalary((prev) =>
                        prev.trim() ? prev : String(empProfile.financials?.base_salary ?? ""),
                      );
                      setAllowancesAmt((prev) =>
                        prev.trim() ? prev : String(empProfile.financials?.allowances ?? ""),
                      );
                      // Fire strict validation after fill by nudging state
                      // — the reactive `uniqueUnfilled` will re-compute.
                      toast.success(
                        refilled
                          ? `تمت التعبئة من ملف الموظف — ${refilled} حقل`
                          : "جميع الحقول المرتبطة معبّأة بالفعل",
                      );
                    }}
                  >
                    <Wand2 className="size-3" /> تعبئة تلقائية
                  </Button>
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".txt,.md,.csv,text/*"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        const text = await readFileAsText(f);
                        if (!text.trim()) {
                          toast.error("تعذّر قراءة الملف — الرجاء استخدام ملف نصي (.txt).");
                          return;
                        }
                        // Only fill currently-empty slots; never overwrite
                        // values the user or profile already provided.
                        const emptyKeys = tpl.variables.filter(
                          (k) => !(vars[k] ?? "").trim(),
                        );
                        const extracted = extractContractFields(text, emptyKeys);
                        const count = Object.keys(extracted).length;
                        if (!count) {
                          toast.info("لم يتم العثور على حقول قابلة للاستخراج في الملف.");
                          return;
                        }
                        setVars((prev) => ({ ...prev, ...extracted }));
                        toast.success(`استُخرج ${count} حقل من الملف المرفوع`);
                      }}
                    />
                    <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] cursor-pointer hover:bg-muted">
                      <UploadCloud className="size-3" /> استخراج من ملف
                    </span>
                  </label>
                </div>
              </div>
              {!employeeId && tpl.variables.some((v) => isAutoVar(v)) && (
                <p className="text-[11px] text-amber-600">
                  اختر موظفاً أولاً لتعبئة الحقول المرتبطة بملفه تلقائياً.
                </p>
              )}
              {tpl.variables.map((v) => {
                const src = fieldSource(v, tpl.variable_sources);
                const auto = src === "profile" && isAutoVar(v) && !!empProfile;
                const byEmployee = src === "employee";
                return (
                  <div key={v}>
                    <Label className="text-xs flex items-center gap-1.5">
                      {fieldLabel(v)}
                      <span className="font-mono text-[9px] text-muted-foreground">{v}</span>
                      {auto && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          من ملف الموظف
                        </Badge>
                      )}
                      {byEmployee && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 text-sky-700 border-sky-400/60"
                        >
                          يعبّئه الموظف
                        </Badge>
                      )}
                    </Label>
                    <Input
                      type={fieldKind(v) === "date" ? "date" : fieldKind(v) === "number" ? "number" : "text"}
                      value={vars[v] ?? ""}
                      disabled={auto}
                      placeholder={byEmployee ? "يُترك فارغاً ليعبّئه الموظف" : ""}
                      className={auto ? "bg-muted/60 text-muted-foreground" : ""}
                      onChange={(e) => setVars((p) => ({ ...p, [v]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <Label>نص العقد (يدعم HTML)</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold">الراتب المهيكل (اختياري)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              يُطبَّق على راتب الموظف تلقائياً فور توقيع العقد ويظهر مباشرةً في المعاينة.
            </p>
            <div className="grid grid-cols-3 gap-3" dir="rtl">
              <div>
                <Label className="text-xs">الراتب الأساسي</Label>
                <Input
                  type="number"
                  min="0"
                  dir="ltr"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">البدلات</Label>
                <Input
                  type="number"
                  min="0"
                  dir="ltr"
                  value={allowancesAmt}
                  onChange={(e) => setAllowancesAmt(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">تاريخ السريان</Label>
                <Input
                  type="date"
                  dir="ltr"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="bg-muted/30 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-muted/30 backdrop-blur px-4 py-2 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Eye className="size-3.5 text-primary" /> معاينة مباشرة
            </div>
            {blockingUnfilled.length > 0 ? (
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400/60">
                {blockingUnfilled.length} حقل غير مُعبَّأ
              </Badge>
            ) : employeeUnfilled.length > 0 ? (
              <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-400/60">
                {employeeUnfilled.length} حقل بانتظار الموظف
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-400/60">
                مكتمل
              </Badge>
            )}
          </div>
          {blockingUnfilled.length > 0 && (
            <div className="mx-4 mt-3 rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs">
              <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                لا يمكن الإرسال قبل تعبئة الإدارة لـ:
              </p>
              <ul className="list-disc ps-5 space-y-0.5 text-amber-900 dark:text-amber-100">
                {blockingUnfilled.map((k) => (
                  <li key={k}>{fieldLabel(k)}</li>
                ))}
              </ul>
            </div>
          )}
          {employeeUnfilled.length > 0 && (
            <div className="mx-4 mt-3 rounded-md border border-sky-400/50 bg-sky-50 dark:bg-sky-500/10 p-3 text-xs">
              <p className="font-semibold text-sky-800 dark:text-sky-200 mb-1">
                ستُطلب هذه البيانات من الموظف قبل التوقيع:
              </p>
              <ul className="list-disc ps-5 space-y-0.5 text-sky-900 dark:text-sky-100">
                {employeeUnfilled.map((k) => (
                  <li key={k}>{fieldLabel(k)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="p-4">
            {!employeeId ? (
              <div className="text-center text-xs text-muted-foreground py-16">
                اختر موظفاً وقالباً لعرض العقد كما سيصل للموقّع.
              </div>
            ) : (
              <ContractDocument
                title={title || "عنوان العقد"}
                employeeName={empProfile?.full_name ?? ""}
                referenceId={employeeId}
                createdAt={new Date().toISOString()}
                effectiveDate={effectiveDate || null}
                bodyHtml={previewHtml}
              />
            )}
          </div>
        </div>
      </div>

      <DialogFooter className="p-4 border-t bg-background">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => m.mutate()} disabled={!readyToCreate}>
          {m.isPending && <Loader2 className="size-3.5 animate-spin" />} إنشاء كمسودة
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------- My Contracts ----------
/**
 * Contract templates only ever become a real contract *bound to one
 * employee*. Anything the company already knows is pre-filled; anything
 * only the employee can answer is requested here, once, and then stored on
 * their record so no later contract asks again.
 */
function EmployeeFieldsCard({ contract }: { contract: ContractRow }) {
  const qc = useQueryClient();
  const submit = useServerFn(submitEmployeeContractFields);
  const fields = contract.pending_employee_fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: () => submit({ data: { contract_id: contract.id, values } }),
    onSuccess: (r: { remaining: number }) => {
      toast.success(
        r.remaining ? `تم الحفظ — تبقّى ${r.remaining} حقل` : "اكتملت بياناتك — يمكنك التوقيع الآن",
      );
      setValues({});
      qc.invalidateQueries({ queryKey: ["my-contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!fields.length) return null;
  const allFilled = fields.every((f) => (values[f] ?? "").trim().length > 0);

  return (
    <Card className="border-sky-400/60 bg-sky-500/[0.04]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareWarning className="size-4 text-sky-600" />
          بيانات مطلوبة منك — «{contract.title}»
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          هذه الحقول لا تتوفر في ملفك، وهي مطلوبة لإكمال العقد قبل التوقيع. ستُحفظ في ملفك ولن
          تُطلب منك مرة أخرى.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f}>
              <Label className="text-xs">{fieldLabel(f)}</Label>
              {fieldKind(f) === "textarea" ? (
                <Textarea
                  rows={2}
                  value={values[f] ?? ""}
                  onChange={(e) => setValues((p) => ({ ...p, [f]: e.target.value }))}
                />
              ) : (
                <Input
                  type={
                    fieldKind(f) === "date"
                      ? "date"
                      : fieldKind(f) === "number"
                        ? "number"
                        : "text"
                  }
                  value={values[f] ?? ""}
                  onChange={(e) => setValues((p) => ({ ...p, [f]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={!allFilled || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="size-3.5 animate-spin" />} حفظ البيانات
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyContracts() {
  const fetcher = useServerFn(myContracts);
  const { data = [] } = useQuery({ queryKey: ["my-contracts"], queryFn: () => fetcher() });
  const [viewing, setViewing] = useState<ContractRow | null>(null);
  const pending = data.filter((c) => c.status === "sent");
  const needData = pending.filter((c) => (c.pending_employee_fields ?? []).length > 0);
  const readyToSign = pending.filter((c) => (c.pending_employee_fields ?? []).length === 0);

  return (
    <div className="space-y-4">
      {needData.map((c) => (
        <EmployeeFieldsCard key={c.id} contract={c} />
      ))}
      {/* Prominent, unmissable — this is the single biggest gap the previous
          quiet list had: an employee could easily miss that a contract was
          waiting on them. */}
      {readyToSign.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-l from-amber-500 to-amber-600 text-white p-4 sm:p-5 flex items-center gap-4 shadow-lg">
          <div className="size-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <FileSignature className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {readyToSign.length === 1
                ? "لديك عقد بحاجة إلى توقيعك"
                : `لديك ${readyToSign.length} عقود بحاجة إلى توقيعك`}
            </p>
            <p className="text-sm text-white/90 truncate">{readyToSign[0].title}</p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0 bg-white text-amber-700 hover:bg-white/90"
            onClick={() => setViewing(readyToSign[0])}
          >
            مراجعة وتوقيع
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">عقودي</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد عقود مُرسلة إليك حالياً.
            </p>
          ) : (
            <div className="space-y-2">
              {data.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                    c.status === "sent" ? "border-amber-400/50 bg-amber-500/[0.04]" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>أُنشئ {fmtDate(c.created_at)}</span>
                      {c.effective_date && <span>يسري من {fmtDate(c.effective_date)}</span>}
                      {c.status === "signed" && <span>وُقّع {fmtDateTime(c.signed_at)}</span>}
                    </div>
                  </div>
                  {(c.pending_employee_fields ?? []).length > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-sky-700 border-sky-400/60"
                    >
                      بانتظار بياناتك
                    </Badge>
                  )}
                  {statusBadge(c.status)}
                  <Button
                    size="sm"
                    variant={
                      c.status === "sent" && (c.pending_employee_fields ?? []).length === 0
                        ? "default"
                        : "outline"
                    }
                    disabled={c.status === "sent" && (c.pending_employee_fields ?? []).length > 0}
                    onClick={() => setViewing(c)}
                  >
                    {c.status === "sent" && (c.pending_employee_fields ?? []).length === 0 ? (
                      <>
                        <FileSignature className="size-3.5" /> توقيع
                      </>
                    ) : (
                      <>
                        <Eye className="size-3.5" /> عرض
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!viewing}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
      >
        {viewing && <ContractViewerDialog contract={viewing} isAdmin={false} />}
      </Dialog>
    </div>
  );
}

// ---------- Contract Viewer + Sign ----------
/**
 * Lets the employee flag an issue with a sent contract (e.g. a salary
 * discrepancy) without needing to sign it or take any drastic action.
 * Surfaces to HR as a prominent, unmissable banner (see ContractViewerDialog
 * admin branch) rather than sitting unnoticed in a body of text.
 */
function ContractNoteComposer({ contract }: { contract: ContractRow }) {
  const qc = useQueryClient();
  const fn = useServerFn(addContractNote);
  const [note, setNote] = useState(contract.employee_note ?? "");
  const [open, setOpen] = useState(!!contract.employee_note);
  const mut = useMutation({
    mutationFn: () => fn({ data: { contract_id: contract.id, note: note.trim() } }),
    onSuccess: () => {
      toast.success("أُرسلت ملاحظتك إلى الموارد البشرية");
      qc.invalidateQueries({ queryKey: ["my-contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquareWarning className="size-3.5" /> لدي ملاحظة على هذا العقد
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label className="text-sm font-semibold">ملاحظتك على العقد</Label>
      <Textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="مثال: الراتب المذكور غير مطابق لما تم الاتفاق عليه"
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending || note.trim().length < 1}
        >
          {mut.isPending && <Loader2 className="size-3.5 animate-spin" />} إرسال للمراجعة
        </Button>
      </div>
    </div>
  );
}

function ContractViewerDialog({ contract, isAdmin }: { contract: ContractRow; isAdmin: boolean }) {
  const qc = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [sigData, setSigData] = useState<string | null>(null);
  const [useBiometric, setUseBiometric] = useState(false);
  const [busy, setBusy] = useState(false);

  const sign = useServerFn(signContract);
  const attach = useServerFn(attachPdf);
  const startAuth = useServerFn(startAuthentication);
  const listDevices = useServerFn(listMyDevices);

  const audit = useServerFn(getContractAudit);
  const rec = useServerFn(recordContractEvent);
  const reject = useServerFn(rejectContract);
  const { data: auditRows = [] } = useQuery({
    queryKey: ["audit", contract.id],
    queryFn: () => audit({ data: { contract_id: contract.id } }),
  });
  const { data: devices = [] } = useQuery({
    queryKey: ["my-devices"],
    queryFn: () => listDevices(),
    enabled: !isAdmin && contract.status === "sent",
  });

  // Log an "opened" touchpoint on the timeline: employees fire
  // `sign_link_opened` on a sent contract, otherwise `viewed`. Fire-and-
  // forget — a logging failure must never block viewing.
  useEffect(() => {
    const ev =
      !isAdmin && contract.status === "sent" ? "sign_link_opened" : "viewed";
    rec({ data: { contract_id: contract.id, event: ev } })
      .then(() => qc.invalidateQueries({ queryKey: ["audit", contract.id] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id]);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const mReject = useMutation({
    mutationFn: () =>
      reject({ data: { contract_id: contract.id, reason: rejectReason.trim() } }),
    onSuccess: () => {
      toast.success("تم رفض العقد وإبلاغ الموارد البشرية");
      qc.invalidateQueries({ queryKey: ["my-contracts"] });
      qc.invalidateQueries({ queryKey: ["audit", contract.id] });
      setRejectOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bodyMissing = unfilledPlaceholders(contract.body ?? "", {});
  const canSign = !isAdmin && contract.status === "sent" && bodyMissing.length === 0;

  async function handleSign() {
    if (bodyMissing.length) {
      toast.error(`لا يمكن التوقيع — العقد غير مكتمل: ${bodyMissing.join("، ")}`);
      return;
    }
    if (!sigData) {
      toast.error("الرجاء التوقيع أولاً");
      return;
    }
    setBusy(true);
    try {
      let webauthn_response: unknown = null;

      if (useBiometric) {
        if (devices.length === 0)
          throw new Error("لا توجد أجهزة مسجلة — سجّل جهازك من صفحة الإعدادات");
        const opts = await startAuth();
        webauthn_response = await wbStartAuth({ optionsJSON: opts as any });
      }

      await sign({
        data: {
          contract_id: contract.id,
          signature_image: sigData,
          webauthn_response,
        },
      });

      // Generate PDF and upload
      try {
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);
        const node = bodyRef.current!;
        const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2 });
        const img = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const ratio = canvas.height / canvas.width;
        pdf.addImage(img, "PNG", 24, 24, pageW - 48, (pageW - 48) * ratio);
        const blob = pdf.output("blob");
        const path = `${contract.id}/contract-${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage.from("contracts").upload(path, blob, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (!upErr) {
          const { data: signed } = await supabase.storage
            .from("contracts")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          if (signed?.signedUrl)
            await attach({ data: { contract_id: contract.id, pdf_url: signed.signedUrl } });
        }
      } catch (e) {
        console.warn("PDF upload failed", e);
      }

      toast.success("تم توقيع العقد");
      qc.invalidateQueries({ queryKey: ["my-contracts"] });
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      qc.invalidateQueries({ queryKey: ["audit", contract.id] });
    } catch (e: any) {
      toast.error(e?.message || "فشل التوقيع");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileSignature className="size-4" /> {contract.title}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span>تاريخ الإنشاء: {fmtDate(contract.created_at)}</span>
          {contract.effective_date && (
            <span>تاريخ السريان: {fmtDate(contract.effective_date)}</span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div ref={bodyRef}>
        <ContractDocument
          title={contract.title}
          employeeName={contract.employee_name}
          referenceId={contract.id}
          createdAt={contract.created_at}
          effectiveDate={contract.effective_date}
          status={contract.status}
          bodyHtml={renderContractBodyHtml(contract.body)}
        >
          {contract.status === "signed" && (
            <div className="mt-8 pt-4 border-t">
              <p className="text-xs text-slate-500 mb-2">
                التوقيع — {fmtDateTime(contract.signed_at)}
              </p>
              <SignedSignatureImg contractId={contract.id} />
            </div>
          )}
        </ContractDocument>
      </div>


      {/* Employee's note/objection — prominent for HR, never buried in the body */}
      {isAdmin && contract.employee_note && (
        <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-400/50 p-3.5 flex items-start gap-2.5">
          <MessageSquareWarning className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              ملاحظة الموظف{" "}
              {contract.employee_note_at && `— ${fmtDateTime(contract.employee_note_at)}`}
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-0.5">
              {contract.employee_note}
            </p>
          </div>
        </div>
      )}

      {/* Employee note/objection composer — available while the contract
          awaits their decision, even if they're not ready to sign yet */}
      {!isAdmin && contract.status === "sent" && <ContractNoteComposer contract={contract} />}

      {!isAdmin && contract.status === "sent" && bodyMissing.length > 0 && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
            لا يمكن التوقيع — العقد غير مكتمل
          </p>
          <p className="text-xs text-amber-900 dark:text-amber-100">
            الحقول الناقصة: {bodyMissing.join("، ")}. الرجاء التواصل مع HR لاستكمالها.
          </p>
        </div>
      )}

      {canSign && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label className="text-sm font-semibold">التوقيع</Label>
          <SignaturePad onChange={setSigData} />
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">تحقق ببصمة الجهاز</p>
                <p className="text-[11px] text-muted-foreground">
                  {devices.length > 0
                    ? `${devices.length} جهاز مسجل`
                    : "لا توجد أجهزة مسجلة — يمكنك إضافتها من الإعدادات"}
                </p>
              </div>
            </div>
            <Switch
              checked={useBiometric}
              onCheckedChange={setUseBiometric}
              disabled={devices.length === 0}
            />
          </div>
          <Button className="w-full" onClick={handleSign} disabled={busy || !sigData}>
            <ShieldCheck className="size-4" /> {busy ? "جارٍ التوقيع..." : "تأكيد التوقيع"}
          </Button>
        </div>
      )}

      {/* Employee-side reject: an explicit "لا أوافق" path so a disputed
          contract doesn't sit indefinitely in "sent". Writes an audit
          entry distinct from an HR cancel. */}
      {!isAdmin && contract.status === "sent" && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setRejectOpen(true)}
          >
            <Ban className="size-3.5" /> رفض العقد
          </Button>
        </div>
      )}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="size-4 text-destructive" /> رفض العقد
            </DialogTitle>
            <DialogDescription>
              سبب الرفض يُبلَّغ للموارد البشرية ويظهر في سجل التدقيق.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="مثال: الراتب المذكور غير مطابق"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={mReject.isPending || rejectReason.trim().length < 3}
              onClick={() => mReject.mutate()}
            >
              {mReject.isPending && <Loader2 className="size-3.5 animate-spin" />}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contract.pdf_url && (
        <a
          href={contract.pdf_url}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            rec({ data: { contract_id: contract.id, event: "pdf_opened" } })
              .then(() => qc.invalidateQueries({ queryKey: ["audit", contract.id] }))
              .catch(() => {})
          }
        >
          <Button variant="outline" className="w-full">
            <Download className="size-4" /> تنزيل ملف PDF
          </Button>
        </a>
      )}

      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2 border-b text-sm font-semibold">
          <span className="flex items-center gap-2">
            <ScrollText className="size-4" /> سجل التدقيق
          </span>
          <span className="flex items-center gap-1">
            <Button asChild size="sm" variant="ghost" className="h-7 text-[11px]">
              <Link to="/contracts/$contractId/status" params={{ contractId: contract.id }}>
                حالة الاعتماد
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-7 text-[11px]">
              <Link to="/contracts/$contractId/audit" params={{ contractId: contract.id }}>
                الصفحة الكاملة
              </Link>
            </Button>
          </span>

        </div>
        <ul className="text-xs divide-y">
          {auditRows.map((a) => (
            <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="font-medium">{eventLabel(a.event)}</span>
              <span className="text-muted-foreground">
                {a.actor_name ?? "—"} · {fmtDateTime(a.created_at)}
                {a.ip_address ? ` · ${a.ip_address}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DialogContent>
  );
}

function eventLabel(e: string) {
  return (
    (
      { created: "أُنشئ", sent: "أُرسل", signed: "وُقّع", cancelled: "أُلغي" } as Record<
        string,
        string
      >
    )[e] ?? e
  );
}

function SignedSignatureImg({ contractId }: { contractId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("signatures")
      .select("signature_image")
      .eq("contract_id", contractId)
      .maybeSingle()
      .then(({ data }) => setSrc(data?.signature_image ?? null));
  }, [contractId]);
  if (!src) return null;
  return <img src={src} alt="signature" className="h-20 object-contain" />;
}
