import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getContractWithAudit } from "@/lib/hr/contracts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtDateTime } from "@/lib/utils/format";
import {
  ArrowRight,
  ScrollText,
  FileSignature,
  Eye,
  Send,
  ShieldCheck,
  Ban,
  StickyNote,
  Download,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracts/$contractId/audit")({
  head: () => ({
    meta: [
      { title: "سجل تدقيق العقد" },
      { name: "description", content: "الخط الزمني الكامل لكل خطوة على العقد." },
    ],
  }),
  component: AuditPage,
});

const EVENT_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  created: { label: "أُنشئ العقد", icon: Sparkles, color: "text-primary" },
  previewed: { label: "معاينة قبل الإرسال", icon: Eye, color: "text-sky-600" },
  sent: { label: "أُرسل للتوقيع", icon: Send, color: "text-amber-600" },
  sign_link_opened: { label: "فُتح رابط التوقيع", icon: Eye, color: "text-indigo-600" },
  viewed: { label: "شوهد من الموظف", icon: Eye, color: "text-slate-600" },
  pdf_opened: { label: "فُتح ملف PDF", icon: Download, color: "text-slate-600" },
  employee_note: { label: "ملاحظة الموظف", icon: StickyNote, color: "text-amber-600" },
  signed: { label: "وُقّع", icon: ShieldCheck, color: "text-emerald-600" },
  rejected: { label: "رفض الموظف", icon: Ban, color: "text-rose-600" },
  cancelled: { label: "أُلغي من HR", icon: Ban, color: "text-rose-600" },
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    sent: "bg-amber-100 text-amber-800",
    signed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-rose-100 text-rose-800",
  };
  const label: Record<string, string> = {
    draft: "مسودة",
    sent: "مُرسل",
    signed: "موقّع",
    cancelled: "ملغى",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${map[s]}`}>{label[s] ?? s}</span>;
}

function AuditPage() {
  const { contractId } = Route.useParams();
  const fn = useServerFn(getContractWithAudit);
  const { data, isLoading, error } = useQuery({
    queryKey: ["contract-audit", contractId],
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
        تعذّر تحميل سجل التدقيق — {(error as Error)?.message ?? "غير متاح"}
      </div>
    );
  }
  const { contract, audit } = data;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ScrollText className="size-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">سجل تدقيق العقد</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
              <FileSignature className="size-3.5" /> {contract.title} — {contract.employee_name}
              {statusBadge(contract.status)}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/contracts">
            <ArrowRight className="size-3.5" /> رجوع للعقود
          </Link>
        </Button>
      </header>

      <div className="grid sm:grid-cols-4 gap-3">
        <MetaTile label="أُنشئ" value={fmtDate(contract.created_at)} />
        <MetaTile label="أُرسل" value={contract.sent_at ? fmtDateTime(contract.sent_at) : "—"} />
        <MetaTile label="وُقّع" value={contract.signed_at ? fmtDateTime(contract.signed_at) : "—"} />
        <MetaTile
          label="السريان"
          value={contract.effective_date ? fmtDate(contract.effective_date) : "—"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="size-4" /> الخط الزمني ({audit.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد أحداث مسجّلة بعد.
            </p>
          ) : (
            <ol className="relative border-s-2 border-border ms-2 space-y-4">
              {audit.map((a) => {
                const meta = EVENT_META[a.event] ?? {
                  label: a.event,
                  icon: ScrollText,
                  color: "text-muted-foreground",
                };
                const Icon = meta.icon;
                const details = Object.entries(a.details ?? {}).filter(
                  ([, v]) => v !== null && v !== "" && v !== false,
                );
                return (
                  <li key={a.id} className="ms-4 relative">
                    <span className="absolute -start-[26px] top-1 size-4 rounded-full bg-background border-2 border-border flex items-center justify-center">
                      <Icon className={`size-2.5 ${meta.color}`} />
                    </span>
                    <div className="rounded-lg border bg-card p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className={`text-sm font-semibold ${meta.color}`}>{meta.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime(a.created_at)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        بواسطة: {a.actor_name ?? "—"}
                        {a.ip_address ? ` · IP ${a.ip_address}` : ""}
                      </p>
                      {details.length > 0 && (
                        <ul className="mt-2 text-xs space-y-0.5">
                          {details.map(([k, v]) => (
                            <li key={k}>
                              <span className="text-muted-foreground">{k}:</span>{" "}
                              <span className="font-medium">{String(v)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {a.user_agent && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1 truncate" title={a.user_agent}>
                          {a.user_agent}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
