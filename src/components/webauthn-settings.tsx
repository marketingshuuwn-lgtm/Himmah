import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { startRegistration as wbStartReg, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint, Trash2 } from "lucide-react";
import { listMyDevices, startRegistration, finishRegistration, removeDevice } from "@/lib/hr/webauthn.functions";
import { fmtDateTime } from "@/lib/utils/format";

export function WebauthnSettings() {
  const qc = useQueryClient();
  const list = useServerFn(listMyDevices);
  const start = useServerFn(startRegistration);
  const finish = useServerFn(finishRegistration);
  const remove = useServerFn(removeDevice);
  const [label, setLabel] = useState("جهازي");
  const [busy, setBusy] = useState(false);

  const { data: devices = [] } = useQuery({ queryKey: ["my-devices"], queryFn: () => list() });
  const supported = typeof window !== "undefined" && browserSupportsWebAuthn();

  async function registerDevice() {
    if (!supported) { toast.error("هذا المتصفح لا يدعم WebAuthn"); return; }
    setBusy(true);
    try {
      const opts = await start();
      const attResp = await wbStartReg({ optionsJSON: opts as any });
      await finish({ data: { response: attResp, label } });
      toast.success("تم تسجيل الجهاز");
      qc.invalidateQueries({ queryKey: ["my-devices"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل التسجيل");
    } finally { setBusy(false); }
  }

  const mDel = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-devices"] }); toast.success("حُذف الجهاز"); },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Fingerprint className="size-4" /> الأجهزة الموثوقة (بصمة / Face ID)
        </CardTitle>
        <CardDescription>تُستخدم لتأكيد توقيع العقود ببصمة جهازك بدون كتابة كلمة المرور.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أجهزة مسجلة بعد.</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <p className="text-sm font-medium">{d.device_label || "جهاز"}</p>
                  <p className="text-[11px] text-muted-foreground">سُجّل {fmtDateTime(d.created_at)}{d.last_used_at ? ` · آخر استخدام ${fmtDateTime(d.last_used_at)}` : ""}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => mDel.mutate(d.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 items-end pt-2">
          <div className="flex-1">
            <Label className="text-xs">اسم الجهاز</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: آيفون شخصي" />
          </div>
          <Button onClick={registerDevice} disabled={busy || !supported}>
            <Fingerprint className="size-4" /> {busy ? "..." : "تسجيل هذا الجهاز"}
          </Button>
        </div>
        {!supported && <p className="text-xs text-destructive">المتصفح الحالي لا يدعم بصمة الجهاز.</p>}
      </CardContent>
    </Card>
  );
}
