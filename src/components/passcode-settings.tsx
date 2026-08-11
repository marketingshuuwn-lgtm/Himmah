import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { KeyRound, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPasscodeRecord, savePasscode, clearPasscode } from "@/lib/passcode";
import { useCurrentUser } from "@/hooks/use-current-user";

export function PasscodeSettings() {
  const user = useCurrentUser();
  const [hasPasscode, setHasPasscode] = useState(false);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"idle" | "enter" | "confirm">("idle");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHasPasscode(!!getPasscodeRecord());
  }, []);

  function reset() {
    setCode("");
    setConfirm("");
    setStage("idle");
  }

  async function persist(finalCode: string) {
    setSaving(true);
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      setSaving(false);
      return toast.error("تعذّر حفظ الرمز، أعد تسجيل الدخول");
    }
    try {
      await savePasscode({
        passcode: finalCode,
        refreshToken: data.session.refresh_token,
        accessToken: data.session.access_token,
        email: user.email ?? "",
        fullName: user.fullName,
      });
      setHasPasscode(true);
      reset();
      toast.success("تم حفظ الرمز السريع لهذا الجهاز");
    } catch {
      toast.error("فشل حفظ الرمز");
    } finally {
      setSaving(false);
    }
  }

  function handleRemove() {
    clearPasscode();
    setHasPasscode(false);
    toast.success("تم حذف الرمز السريع");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="size-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">رمز الدخول السريع</CardTitle>
            <CardDescription>
              رمز من 6 أرقام للدخول السريع من هذا الجهاز دون كلمة المرور.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPasscode && stage === "idle" && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-emerald-500" />
              <span>الرمز مفعّل على هذا الجهاز</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRemove}>
              <Trash2 className="size-4" />
              إزالة
            </Button>
          </div>
        )}

        {stage === "idle" && (
          <Button onClick={() => setStage("enter")} variant={hasPasscode ? "outline" : "default"}>
            {hasPasscode ? "تغيير الرمز" : "إنشاء رمز سريع"}
          </Button>
        )}

        {stage === "enter" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">أدخل الرمز الجديد</p>
            <div dir="ltr" className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (v.length === 6) setStage("confirm");
                }}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>إلغاء</Button>
          </div>
        )}

        {stage === "confirm" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">أعد إدخال الرمز للتأكيد</p>
            <div dir="ltr" className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={confirm}
                onChange={(v) => {
                  setConfirm(v);
                  if (v.length === 6) {
                    if (v !== code) {
                      toast.error("الرمزان غير متطابقين");
                      setConfirm("");
                      setCode("");
                      setStage("enter");
                    } else {
                      persist(v);
                    }
                  }
                }}
                disabled={saving}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {saving && (
              <div className="flex items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>إلغاء</Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          الرمز محفوظ مشفّرًا في هذا المتصفح فقط. لا يُرسل للخادم ولا يعمل على أجهزة أخرى.
        </p>
      </CardContent>
    </Card>
  );
}
