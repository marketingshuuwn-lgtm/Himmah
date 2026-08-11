import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getContractApprovalStatus, type ContractStep } from "@/lib/hr/contract-status.functions";
import { ContractFlexPanel } from "@/components/contract-flex-panel";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtDateTime } from "@/lib/utils/format";
import {
  ArrowRight,
  Loader2,
  Mail,
  Eye,
  UserCheck,
  Fingerprint,
  FileSignature,
  Sparkles,
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracts/$contractId/status")({
  head: () => ({
    meta: [
      { title: "حالة العقد · ألامعا" },
      {
        name: "description",
        content: "خطوات اعتماد العقد: الإرسال، موافقة الموظف، التحقق الحيوي، والتوقيع.",
      },
      { property: "og:title", content: "حالة العقد · ألامعا" },
      {
        property: "og:description",
        content: "تتبع كل خطوة في مسار اعتماد العقد مع سجل زمني دقيق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatusPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">حدث خطأ: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">الصفحة غير موجودة</div>,
});

const STEP_ICON: Record<ContractStep["key"], LucideIcon> = {
  created: Sparkles,
  sent: Mail,
  opened: Eye,
  employee_decision: UserCheck,
  biometric: Fingerprint,
  signed: FileSignature,
};

const STATE_STYLE: Record<
  ContractStep["state"],
  { ring: string; text: string; badge: string; label: string; Icon: LucideIcon }
> = {
  done: {
    ring: "border-emerald-500 bg-emerald-500/10",
    text: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-800",
    label: "مكتملة",
    Icon: CheckCircle2,
  },
  current: {
    ring: "border-amber-500 bg-amber-500/10",
    text: "text-amber-600",
    badge: "bg-amber-100 text-amber-800",
    label: "قيد التنفيذ",
    Icon: Clock,
  },
  pending: {
    ring: "border-border bg-muted",
    text: "text-muted-foreground",
    badge: "bg-slate-100 text-slate-700",
    label: "بانتظار",
    Icon: Circle,
  },
  failed: {
    ring: "border-rose-500 bg-rose-500/10",
    text: "text-rose-600",
    badge: "bg-rose-100 text-rose-800",
    label: "متوقفة",
    Icon: XCircle,
  },
};

const EVENT_LABEL: Record<string, string> = {
  created: "أُنشئ العقد",
  previewed: "معاينة قبل الإرسال",
  sent: "أُرسل للتوقيع",
  sign_link_opened: "فُتح رابط التوقيع",
  viewed: "شوهد من الموظف",
  pdf_opened: "فُتح ملف PDF",
  employee_note: "ملاحظة الموظف",
  signed: "وُقّع",
  rejected: "رفض الموظف",
  cancelled: "أُلغي من HR",
};

function StatusPage() {
  const { contractId } = Route.useParams();
  const fn = useServerFn(getContractApprovalStatus);
  const { data, isLoading, error } = useQuery({
    queryKey: ["contract-status", contractId],
    queryFn: () => fn({ data: { contract_id: contractId } }),
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin me-2" /> جارٍ التحميل...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        تعذّر تحميل حالة العقد — {(error as Error)?.message ?? "غير متاح"}
      </div>
    );
  }

  const { contract, steps, timeline } = data;
  const doneCount = steps.filter((s) => s.state === "done").length;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6" dir="rtl">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">حالة العقد</h1>
          <p className="text-sm text-muted-foreground">
            {contract.title} — {contract.employee_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/contracts/$contractId/audit" params={{ contractId }}>
              <ScrollText className="size-3.5" /> سجل التدقيق
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/contracts">
              <ArrowRight className="size-3.5" /> رجوع
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid sm:grid-cols-4 gap-3">
        <Tile label="التقدّم" value={`${doneCount} / ${steps.length}`} />
        <Tile label="أُرسل" value={contract.sent_at ? fmtDateTime(contract.sent_at) : "—"} />
        <Tile label="وُقّع" value={contract.signed_at ? fmtDateTime(contract.signed_at) : "—"} />
        <Tile
          label="السريان"
          value={contract.effective_date ? fmtDate(contract.effective_date) : "—"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">خطوات الاعتماد</CardTitle>
          <CardDescription>
            كل خطوة مُستخرجة من الأحداث الفعلية المسجّلة على العقد.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {steps.map((s) => {
              const Icon = STEP_ICON[s.key];
              const st = STATE_STYLE[s.state];
              return (
                <li
                  key={s.key}
                  className="flex items-start gap-3 rounded-lg border p-3 bg-card"
                >
                  <div
                    className={`size-9 shrink-0 rounded-full border-2 flex items-center justify-center ${st.ring}`}
                  >
                    <Icon className={`size-4 ${st.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{s.label}</p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.badge}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.at ? fmtDateTime(s.at) : "—"}
                      {s.actor ? ` · ${s.actor}` : ""}
                    </p>
                    {s.detail ? (
                      <p className="text-xs mt-1 text-muted-foreground">{s.detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <ContractFlexPanel contractId={contractId} />

      <Card>

        <CardHeader className="pb-3">
          <CardTitle className="text-base">السجل الزمني ({timeline.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد أحداث بعد.</p>
          ) : (
            <ol className="relative border-s-2 border-border ms-2 space-y-3">
              {timeline.map((t) => (
                <li key={t.id} className="ms-4 relative">
                  <span className="absolute -start-[22px] top-2 size-2.5 rounded-full bg-primary/60" />
                  <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
                    <span className="font-medium">{EVENT_LABEL[t.event] ?? t.event}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(t.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.actor_name ?? "—"}
                    {t.ip_address ? ` · IP ${t.ip_address}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {contract.employee_note ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ملاحظة الموظف</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {contract.employee_note}
            {contract.employee_note_at ? (
              <Badge variant="outline" className="ms-2 text-[10px]">
                {fmtDateTime(contract.employee_note_at)}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
