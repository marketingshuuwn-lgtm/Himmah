import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, Save } from "lucide-react";
import { toast } from "sonner";
import { getOrgSettings, updateOrgSettings } from "@/lib/hr/sif-export.functions";

export function OrgSettingsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="size-4" /> إعدادات المنشأة (WPS/SIF)
        </CardTitle>
        <CardDescription>تُستخدم في ترويسة ملفات SIF لتحويل الرواتب عبر البنوك.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin" />
            </div>
          }
        >
          <Form />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function Form() {
  const getFn = useServerFn(getOrgSettings);
  const saveFn = useServerFn(updateOrgSettings);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["org-settings"],
      queryFn: () => getFn(),
    }),
  );
  const [form, setForm] = useState(data);
  useEffect(() => {
    setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          establishment_name: form.establishment_name || "",
          employer_id: form.employer_id || "",
          bank_code: form.bank_code || "",
          bank_name: form.bank_name || "",
          iban: form.iban || "",
        },
      }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["org-settings"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل الحفظ"),
  });

  const upd = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="grid gap-3 sm:grid-cols-2"
      dir="rtl"
    >
      <div className="sm:col-span-2">
        <Label>اسم المنشأة</Label>
        <Input
          value={form.establishment_name || ""}
          onChange={(e) => upd("establishment_name", e.target.value)}
        />
      </div>
      <div>
        <Label>رقم صاحب العمل</Label>
        <Input
          value={form.employer_id || ""}
          onChange={(e) => upd("employer_id", e.target.value)}
        />
      </div>
      <div>
        <Label>رمز البنك</Label>
        <Input value={form.bank_code || ""} onChange={(e) => upd("bank_code", e.target.value)} />
      </div>
      <div>
        <Label>اسم البنك</Label>
        <Input value={form.bank_name || ""} onChange={(e) => upd("bank_name", e.target.value)} />
      </div>
      <div>
        <Label>IBAN للمنشأة</Label>
        <Input value={form.iban || ""} onChange={(e) => upd("iban", e.target.value)} dir="ltr" />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          حفظ الإعدادات
        </Button>
      </div>
    </form>
  );
}
