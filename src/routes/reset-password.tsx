import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { brand } from "@/lib/brand";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور · علامة" },
      { name: "description", content: "أدخل كلمة مرور جديدة لاستعادة وصولك إلى نظام علامة." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Supabase places the recovery token in the URL hash; the client picks it up
  // automatically and emits PASSWORD_RECOVERY. We just need the session.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (password !== confirm) return toast.error("كلمتا المرور غير متطابقتين");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error("فشل تحديث كلمة المرور", { description: error.message });
    toast.success("تم تحديث كلمة المرور بنجاح");
    navigate({ to: "/me" });
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[image:var(--gradient-brand)]">
      <div className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-cyan-glow)] opacity-80" />
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="size-20 rounded-2xl bg-white/5 backdrop-blur-xl ring-1 ring-white/10 flex items-center justify-center shadow-[var(--shadow-elegant)] mb-5">
            <img src={brand.mark} alt={brand.nameLatin} className="size-12" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">إعادة تعيين كلمة المرور</h1>
        </div>
        <Card className="border-white/10 bg-card/95 backdrop-blur-xl shadow-[var(--shadow-elegant)]">
          <CardHeader>
            <CardTitle>كلمة مرور جديدة</CardTitle>
            <CardDescription>
              {ready
                ? "أدخل كلمة المرور الجديدة لتفعيل حسابك."
                : "جاري التحقق من رابط الاستعادة..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-pass">كلمة المرور الجديدة</Label>
                <Input
                  id="new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  disabled={!ready}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pass">تأكيد كلمة المرور</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  dir="ltr"
                  disabled={!ready}
                />
              </div>
              <Button type="submit" disabled={loading || !ready} className="w-full">
                {loading && <Loader2 className="size-4 animate-spin" />}
                حفظ كلمة المرور
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
