import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCronHealth } from "@/lib/hr/cron-health.functions";
import { CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";

const STATUS_META = {
  ok: { label: "يعمل", icon: CheckCircle2, variant: "secondary" as const },
  stale: { label: "متأخر", icon: AlertTriangle, variant: "destructive" as const },
  never: { label: "لم يُشغَّل", icon: CircleSlash, variant: "outline" as const },
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  }).format(new Date(iso));
}

/** Operational visibility for the scheduled jobs (attendance + payroll). */
export function CronHealthCard() {
  const fetchHealth = useServerFn(getCronHealth);
  const { data, isLoading } = useQuery({
    queryKey: ["cron-health"],
    queryFn: () => fetchHealth(),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">حالة المهام المجدولة</CardTitle>
        <CardDescription>آخر تشغيل مسجَّل لكل مهمة تلقائية في النظام</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {(data ?? []).map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.icon;
          return (
            <div
              key={row.action}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{row.label}</p>
                <p className="text-xs text-muted-foreground">
                  {row.expected} • آخر تشغيل: {formatWhen(row.last_run_at)}
                </p>
              </div>
              <Badge variant={meta.variant} className="shrink-0 gap-1">
                <Icon className="size-3.5" />
                {meta.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
