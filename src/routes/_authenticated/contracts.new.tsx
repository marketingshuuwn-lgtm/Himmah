import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import DOMPurify from "isomorphic-dompurify";
import {
  listTemplates,
  createContract,
  sendContract,
  type ContractTemplateRow,
  type TemplateDepartment,
  type ContractType,
} from "@/lib/hr/contracts.functions";
import { listEmployeesLite } from "@/lib/hr/payroll.functions";
import { getEmployeeProfile } from "@/lib/hr/profile.functions";
import { AUTO_VAR_SOURCES, isAutoContractVar } from "@/lib/hr/contract-autofill";
import { fieldLabel, fieldSource } from "@/lib/hr/contract-fields";
import { useCurrentUser, hasAnyRole } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowLeft,
  FileSignature,
  Search,
  Check,
  Send,
  Sparkles,
  FileText,
  Users,
} from "lucide-react";
import { fmtDate } from "@/lib/utils/format";

export const Route = createFileRoute("/_authenticated/contracts/new")({
  component: ContractWizardPage,
});

const DEPT_LABEL: Record<TemplateDepartment | "all", string> = {
  all: "كل الأقسام",
  tech: "التقنية",
  marketing: "التسويق",
  consulting_finance: "استشارات مالية",
  consulting_admin: "استشارات إدارية",
  consulting_legal: "استشارات قانونية",
  hr: "الموارد البشرية",
  general: "عام",
};
const TYPE_LABEL: Record<ContractType | "all", string> = {
  all: "كل الأنواع",
  employment: "توظيف",
  nda_unilateral: "NDA أحادي",
  nda_mutual: "NDA متبادل",
  consulting: "استشاري",
  salary_amendment: "تعديل راتب",
  termination: "إنهاء خدمة",
};

function ContractWizardPage() {
  const user = useCurrentUser();
  const isHR = hasAnyRole(user, ["hr_admin"]);
  const navigate = useNavigate();

  const listTpl = useServerFn(listTemplates);
  const listEmp = useServerFn(listEmployeesLite);
  const fetchProfile = useServerFn(getEmployeeProfile);
  const createFn = useServerFn(createContract);
  const sendFn = useServerFn(sendContract);

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", "wizard"],
    queryFn: () => listTpl(),
    enabled: isHR,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-lite", "wizard"],
    queryFn: () => listEmp(),
    enabled: isHR,
  });

  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<TemplateDepartment | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ContractType | "all">("all");
  const [tpl, setTpl] = useState<ContractTemplateRow | null>(null);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [salary, setSalary] = useState("");
  const [allowancesAmt, setAllowancesAmt] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  // Single source of truth: pull the selected employee's actual record
  // instead of re-typing name/number/position/salary that already exist —
  // mirrors the same auto-fill used in the modal contract-creation dialog.
  const { data: empProfile } = useQuery({
    queryKey: ["employee-profile-for-contract", employeeId],
    queryFn: () => fetchProfile({ data: { employee_id: employeeId } }),
    enabled: !!employeeId,
  });

  useEffect(() => {
    if (!empProfile) return;
    setVars((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (isAutoContractVar(key)) next[key] = AUTO_VAR_SOURCES[key](empProfile);
      }
      return next;
    });
    setSalary((prev) => (prev.trim() ? prev : String(empProfile.financials?.base_salary ?? "")));
    setAllowancesAmt((prev) =>
      prev.trim() ? prev : String(empProfile.financials?.allowances ?? ""),
    );
    setEffectiveDate((prev) => prev || new Date().toISOString().slice(0, 10));
  }, [empProfile]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (!t.is_active) return false;
      if (deptFilter !== "all" && t.department !== deptFilter) return false;
      if (typeFilter !== "all" && t.contract_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [templates, search, deptFilter, typeFilter]);

  const previewBody = useMemo(() => {
    if (!tpl) return "";
    const rendered = tpl.body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => {
      const v = vars[k];
      return v && v.trim()
        ? `<span class="bg-primary/10 text-primary px-1 rounded">${v}</span>`
        : `<span class="bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1 rounded font-mono text-xs">{{${k}}}</span>`;
    });
    return DOMPurify.sanitize(rendered);
  }, [tpl, vars]);

  const ownerOf = (k: string) => fieldSource(k, tpl?.variable_sources);
  const unfilled = tpl
    ? tpl.variables.filter((v) => (vars[v] ?? "").trim().length === 0)
    : ([] as string[]);
  // Employee-owned blanks aren't HR's job — they're requested from the
  // employee after the contract is sent, then written back to their record.
  const employeeUnfilled = unfilled.filter((v) => ownerOf(v) === "employee");
  const blockingUnfilled = unfilled.filter((v) => ownerOf(v) !== "employee");
  const allFilled = blockingUnfilled.length === 0;

  const handlePickTemplate = (t: ContractTemplateRow) => {
    setTpl(t);
    const init: Record<string, string> = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const v of t.variables) {
      if (isAutoContractVar(v) && empProfile) init[v] = AUTO_VAR_SOURCES[v](empProfile);
      else if (v === "contract_date") init[v] = today;
    }
    setVars(init);
    if (!title) setTitle(t.name);
    setStep(2);
  };

  const mIssue = useMutation({
    mutationFn: async (opts: { send: boolean }) => {
      if (!tpl || !employeeId) throw new Error("بيانات ناقصة");
      const renderedBody = tpl.body.replace(
        /\{\{\s*([\w_]+)\s*\}\}/g,
        (_, k) => vars[k] ?? `{{${k}}}`,
      );
      const res = await createFn({
        data: {
          template_id: tpl.id,
          employee_id: employeeId,
          title: title || tpl.name,
          body: renderedBody,
          data: vars,
          salary: salary.trim() ? Number(salary) : null,
          allowances: allowancesAmt.trim() ? Number(allowancesAmt) : null,
          effective_date: effectiveDate || null,
          pending_employee_fields: employeeUnfilled,
        },
      });
      if (opts.send) {
        await sendFn({ data: { id: res.id } });
      }
      return res;
    },
    onSuccess: (_, opts) => {
      toast.success(opts.send ? "تم إصدار العقد وإرساله للموظف" : "تم حفظ العقد كمسودة");
      navigate({ to: "/contracts" });
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر إصدار العقد"),
  });

  if (!isHR) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <p className="text-muted-foreground">صلاحيات إصدار العقود مخصصة لـ HR.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إصدار عقد جديد</h1>
            <p className="text-sm text-muted-foreground">
              معالج بثلاث خطوات — قالب جاهز، موظف، تعبئة وإرسال
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/contracts">العودة للعقود</Link>
        </Button>
      </header>

      {/* Stepper */}
      <ol className="flex items-center gap-2 text-sm" dir="rtl">
        {[
          { n: 1, label: "اختيار القالب", icon: FileText },
          { n: 2, label: "اختيار الموظف", icon: Users },
          { n: 3, label: "تعبئة ومعاينة", icon: FileSignature },
        ].map((s, i, arr) => (
          <li key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                "size-8 rounded-full flex items-center justify-center font-bold text-xs border-2 transition",
                step === s.n
                  ? "bg-primary text-primary-foreground border-primary"
                  : step > s.n
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-muted text-muted-foreground border-border",
              )}
            >
              {step > s.n ? <Check className="size-4" /> : <s.icon className="size-4" />}
            </div>
            <span
              className={cn(
                "hidden sm:inline",
                step === s.n ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < arr.length - 1 && (
              <div
                className={cn("h-px flex-1 transition", step > s.n ? "bg-primary" : "bg-border")}
              />
            )}
          </li>
        ))}
      </ol>

      {/* Step 1: Template Picker */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">اختر قالب العقد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_200px] gap-3" dir="rtl">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث باسم القالب…"
                  className="ps-9"
                />
              </div>
              <Select
                value={deptFilter}
                onValueChange={(v) => setDeptFilter(v as TemplateDepartment | "all")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEPT_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as ContractType | "all")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                لا توجد قوالب مطابقة.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" dir="rtl">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handlePickTemplate(t)}
                    className="text-start rounded-xl border bg-card hover:border-primary hover:shadow-md transition p-4 space-y-2 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight group-hover:text-primary line-clamp-2">
                        {t.name}
                      </h3>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {TYPE_LABEL[t.contract_type] ?? t.contract_type}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {DEPT_LABEL[t.department] ?? t.department}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {t.variables.length} حقل
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Employee Picker */}
      {step === 2 && tpl && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">القالب: {tpl.name}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              تغيير القالب
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">الموظف المستلم</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر موظفاً…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">عنوان العقد</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tpl.name}
              />
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-semibold">الراتب المهيكل (اختياري)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                عند تعبئته في عقد توظيف أو تعديل راتب، يُطبَّق على راتب الموظف الفعلي تلقائياً فور
                توقيعه — مصدر واحد للحقيقة.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" dir="rtl">
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
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowRight className="size-4" /> رجوع
              </Button>
              <Button disabled={!employeeId} onClick={() => setStep(3)}>
                التالي <ArrowLeft className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Fill + Preview */}
      {step === 3 && tpl && (
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تعبئة المتغيرات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tpl.variables.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد متغيرات لهذا القالب.</p>
              )}
              {tpl.variables.map((v) => {
                const src = ownerOf(v);
                const auto = src === "profile" && isAutoContractVar(v) && !!empProfile;
                return (
                  <div key={v}>
                    <Label className="text-xs font-mono flex items-center gap-1.5">
                      <span className="font-sans">{fieldLabel(v)}</span>
                      {v}
                      {auto && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-sans">
                          من ملف الموظف
                        </Badge>
                      )}
                      {src === "employee" && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 font-sans text-sky-700 border-sky-400/60"
                        >
                          يعبّئه الموظف
                        </Badge>
                      )}
                    </Label>
                    {v.includes("date") ? (
                      <Input
                        type="date"
                        value={vars[v] ?? ""}
                        disabled={auto}
                        onChange={(e) => setVars((p) => ({ ...p, [v]: e.target.value }))}
                      />
                    ) : v === "scope" ||
                      v === "deliverables" ||
                      v === "services" ||
                      v === "objectives" ||
                      v === "acceptance_criteria" ||
                      v === "reason" ||
                      v === "termination_reason" ? (
                      <Textarea
                        value={vars[v] ?? ""}
                        onChange={(e) => setVars((p) => ({ ...p, [v]: e.target.value }))}
                        rows={3}
                      />
                    ) : (
                      <Input
                        value={vars[v] ?? ""}
                        disabled={auto}
                        className={auto ? "bg-muted/60 text-muted-foreground" : ""}
                        onChange={(e) => setVars((p) => ({ ...p, [v]: e.target.value }))}
                        placeholder={v}
                      />
                    )}
                  </div>
                );
              })}
              {!empProfile && tpl.variables.some((v) => isAutoContractVar(v)) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⓘ عُد لاختيار الموظف لتُعبَّأ حقوله تلقائياً.
                </p>
              )}
              {blockingUnfilled.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⓘ حقول الإدارة الناقصة: {blockingUnfilled.map(fieldLabel).join("، ")} — أكملها قبل
                  الإرسال.
                </p>
              )}
              {employeeUnfilled.length > 0 && (
                <p className="text-xs text-sky-600 dark:text-sky-400">
                  ⓘ ستُطلب من الموظف بعد الإرسال: {employeeUnfilled.map(fieldLabel).join("، ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">معاينة العقد</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm max-w-none dark:prose-invert rtl:text-right border rounded-lg p-4 bg-background/50 min-h-[400px]"
                dir="rtl"
                dangerouslySetInnerHTML={{ __html: previewBody }}
              />
              <div className="text-xs text-muted-foreground mt-2">
                التاريخ: {fmtDate(new Date().toISOString())}
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2 flex justify-between flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowRight className="size-4" /> رجوع
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={mIssue.isPending}
                onClick={() => mIssue.mutate({ send: false })}
              >
                حفظ كمسودة
              </Button>
              <Button
                disabled={mIssue.isPending || !allFilled}
                onClick={() => mIssue.mutate({ send: true })}
              >
                <Send className="size-4" /> إصدار وإرسال للموظف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
