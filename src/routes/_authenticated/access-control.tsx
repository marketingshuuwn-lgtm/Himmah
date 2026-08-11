import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  listRoleCapabilities,
  setCapabilityRoles,
  GRANTABLE_ROLES,
  type Capability,
} from "@/lib/auth/capabilities.functions";
import { useCurrentUser, roleLabels } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, Crown, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/access-control")({
  head: () => ({
    meta: [
      { title: "إدارة الصلاحيات · ألامعا" },
      {
        name: "description",
        content: "تحديد الأدوار التي تملك تعديل الحضور والموافقة على الطلبات وتوليد الرواتب.",
      },
      { property: "og:title", content: "إدارة الصلاحيات · ألامعا" },
      {
        property: "og:description",
        content: "مصفوفة صلاحيات مرنة تحدد من يعدّل الحضور ومن يوافق على الطلبات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccessControlPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">حدث خطأ: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">الصفحة غير موجودة</div>,
});

const CAP_META: Record<Capability, { label: string; hint: string }> = {
  attendance_edit: {
    label: "تعديل سجلات الحضور",
    hint: "التعديل اليدوي على وقت الدخول/الخروج والحالة والخصم.",
  },
  attendance_correction_review: {
    label: "الموافقة على طلبات تصحيح الحضور",
    hint: "قبول أو رفض طلبات تعديل وقت الدخول أو الخروج.",
  },
  leave_review: {
    label: "الموافقة على الإجازات والاستئذان",
    hint: "مراجعة طلبات الإجازة والاستئذان والبتّ فيها.",
  },
  payroll_generate: {
    label: "توليد كشوف الرواتب",
    hint: "تشغيل حساب الرواتب الشهري واعتماده.",
  },
};

function AccessControlPage() {
  const me = useCurrentUser();
  const canEdit = me.roles.includes("owner") || me.roles.includes("admin");

  const listFn = useServerFn(listRoleCapabilities);
  const { data, isLoading } = useQuery({
    queryKey: ["role-capabilities"],
    queryFn: () => listFn(),
  });

  if (!canEdit) {
    return (
      <div className="p-6" dir="rtl">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            هذه الصفحة متاحة لمالك النظام والمدير العام فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" />
          إدارة الصلاحيات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          حدّد أي دور يملك كل صلاحية. يُطبَّق التغيير فوراً على الخادم وليس على الواجهة فقط.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <Crown className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <p>
            مالك النظام والمدير العام يملكان جميع الصلاحيات تلقائياً ولا يمكن سحبها منهما.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(data ?? []).map((row) => (
            <CapabilityCard
              key={row.capability}
              capability={row.capability as Capability}
              roles={row.roles}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CapabilityCard({ capability, roles }: { capability: Capability; roles: string[] }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(setCapabilityRoles);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(roles));

  useEffect(() => {
    setSelected(new Set(roles));
  }, [roles.join(",")]);

  const dirty =
    selected.size !== roles.length || roles.some((r) => !selected.has(r));

  const mut = useMutation({
    mutationFn: async () => saveFn({ data: { capability, roles: [...selected] } }),
    onSuccess: () => {
      toast.success("تم تحديث الصلاحية");
      qc.invalidateQueries({ queryKey: ["role-capabilities"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذر الحفظ"),
  });

  const meta = CAP_META[capability];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{meta.label}</CardTitle>
        <CardDescription>{meta.hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {GRANTABLE_ROLES.map((r) => (
          <label
            key={r}
            className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-accent/40"
          >
            <Checkbox
              checked={selected.has(r)}
              onCheckedChange={(v) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(r);
                  else next.delete(r);
                  return next;
                })
              }
            />
            <span className="text-sm font-medium flex-1">{roleLabels[r]}</span>
            {roles.includes(r) && (
              <Badge variant="secondary" className="text-[10px]">
                مفعّل حالياً
              </Badge>
            )}
          </label>
        ))}
        <div className="pt-1 flex justify-end">
          <Button size="sm" disabled={!dirty || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin ml-1" />
            ) : (
              <Save className="size-4 ml-1" />
            )}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
