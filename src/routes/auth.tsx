import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Loader2, KeyRound, Trash2, Fingerprint } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { startAuthentication } from "@simplewebauthn/browser";
import { passkeyLoginOptions, passkeyLoginVerify } from "@/lib/auth/passkey-login.functions";
import { brand } from "@/lib/brand";
import {
  getPasscodeRecord,
  unlockWithPasscode,
  clearPasscode,
  type PasscodeRecord,
} from "@/lib/passcode";

function safeNext(next: string | undefined): string {
  // /me is the universal landing page (least-privilege default). /dashboard
  // is manager-mode's home and would otherwise immediately bounce every
  // plain employee back out via the view-mode route guard.
  if (!next) return "/me";
  // Only allow same-origin relative paths
  if (!next.startsWith("/") || next.startsWith("//")) return "/me";
  return next;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول · نظام الموارد البشرية" },
      {
        name: "description",
        content: "سجل الدخول إلى نظام إدارة الموارد البشرية والرواتب والعقود الرقمية.",
      },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ href: safeNext(search.next) });
  },
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const next = safeNext(search.next);
  const [passcodeRec, setPasscodeRec] = useState<PasscodeRecord | null>(null);

  useEffect(() => {
    setPasscodeRec(getPasscodeRecord());
  }, []);

  const hasPasscode = !!passcodeRec;

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[image:var(--gradient-brand)]">
      <div className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-cyan-glow)] opacity-80" />
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-primary-glow/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-primary-glow/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="size-20 rounded-2xl bg-white/5 backdrop-blur-xl ring-1 ring-white/10 flex items-center justify-center shadow-[var(--shadow-elegant)] mb-5">
            <img src={brand.mark} alt={brand.nameLatin} className="size-12" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{brand.name}</h1>
          <p className="text-xs font-medium tracking-[0.4em] text-primary-glow/90 mt-1">
            {brand.nameLatin}
          </p>
          <p className="text-sm text-white/70 mt-3">{brand.tagline}</p>
        </div>

        <Card className="border-white/10 bg-card/95 backdrop-blur-xl shadow-[var(--shadow-elegant)]">
          <CardHeader className="pb-3">
            <CardTitle>أهلًا بك</CardTitle>
            <CardDescription>
              {hasPasscode
                ? `مرحبًا ${passcodeRec.fullName || passcodeRec.email}، أدخل رمز الدخول السريع`
                : "سجّل الدخول أو أنشئ حسابًا جديدًا للمتابعة"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={hasPasscode ? "passcode" : "signin"} className="w-full">
              <TabsList className={`grid w-full ${hasPasscode ? "grid-cols-3" : "grid-cols-2"}`}>
                {hasPasscode && <TabsTrigger value="passcode">رمز سريع</TabsTrigger>}
                <TabsTrigger value="signin">دخول</TabsTrigger>
                <TabsTrigger value="signup">حساب جديد</TabsTrigger>
              </TabsList>
              {hasPasscode && (
                <TabsContent value="passcode" className="pt-4">
                  <PasscodeUnlock
                    rec={passcodeRec}
                    onCleared={() => setPasscodeRec(null)}
                    next={next}
                  />
                </TabsContent>
              )}
              <TabsContent value="signin" className="pt-4">
                <SignInForm next={next} />
              </TabsContent>
              <TabsContent value="signup" className="pt-4">
                <SignUpForm next={next} />
              </TabsContent>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">أو</span>
              </div>
            </div>

            <GoogleButton next={next} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PasscodeUnlock({
  rec,
  onCleared,
  next,
}: {
  rec: PasscodeRecord;
  onCleared: () => void;
  next: string;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function tryUnlock(value: string) {
    setLoading(true);
    const tokens = await unlockWithPasscode(value);
    if (!tokens) {
      setLoading(false);
      setCode("");
      return toast.error("رمز غير صحيح");
    }
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error) {
      // refresh token may have expired — try refreshing
      const { error: refErr } = await supabase.auth.refreshSession({
        refresh_token: tokens.refreshToken,
      });
      if (refErr) {
        setLoading(false);
        setCode("");
        toast.error("انتهت صلاحية الجلسة، يرجى الدخول بكلمة المرور");
        clearPasscode();
        onCleared();
        return;
      }
    }
    toast.success("مرحبًا بعودتك");
    window.location.href = next;
  }

  function handleClear() {
    clearPasscode();
    onCleared();
    toast.success("تم حذف الرمز السريع من هذا الجهاز");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
          <KeyRound className="size-5 text-primary" />
        </div>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6 && !loading) tryUnlock(v);
          }}
          disabled={loading}
          dir="ltr"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClear}
        className="w-full text-muted-foreground"
      >
        <Trash2 className="size-4" />
        حذف الرمز من هذا الجهاز
      </Button>
    </div>
  );
}

function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const navigate = useNavigate();
  const optionsFn = useServerFn(passkeyLoginOptions);
  const verifyFn = useServerFn(passkeyLoginVerify);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("فشل تسجيل الدخول", { description: error.message });
    toast.success("تم تسجيل الدخول بنجاح");
    window.location.href = next;
  }

  async function onPasskey() {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      return toast.error("هذا المتصفح لا يدعم الدخول ببصمة الجهاز", {
        description: "استخدم متصفحاً حديثاً (Safari/Chrome/Edge) على جهاز يدعم البصمة أو Face ID.",
      });
    }
    setPasskeyLoading(true);

    // Small retry helper for transient network failures around the RPC.
    const withRetry = async <T,>(fn: () => Promise<T>, tries = 2): Promise<T> => {
      let lastErr: unknown;
      for (let i = 0; i < tries; i++) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          // Only retry on obvious transient/network errors, never on validation.
          if (!/network|fetch|timeout|Failed to fetch|ECONN/i.test(msg)) throw err;
          await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
      }
      throw lastErr;
    };

    // Parse "[code] message" produced by server-side PasskeyLoginError.
    const parseErr = (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      const m = raw.match(/^\[([a-z_]+)\]\s*(.*)$/i);
      return { code: m?.[1] ?? "unknown", message: m?.[2] ?? raw };
    };

    // Run the flow. On expired/missing challenge, restart once automatically.
    const runOnce = async () => {
      const { challenge_id, options } = await withRetry(() =>
        optionsFn({ data: {} as never }),
      );
      const response = await startAuthentication({ optionsJSON: options as never });
      const { token_hash } = await verifyFn({ data: { challenge_id, response } });
      const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash });
      if (error) throw new Error(`[session_verify_failed] ${error.message}`);
    };

    try {
      try {
        await runOnce();
      } catch (err) {
        const { code } = parseErr(err);
        // Auto-retry the whole flow once when the server challenge slot was lost.
        if (code === "challenge_missing" || code === "challenge_expired") {
          toast.message("انتهت الجلسة — نحاول من جديد");
          await runOnce();
        } else {
          throw err;
        }
      }
      toast.success("تم تسجيل الدخول بنجاح");
      window.location.href = next;
    } catch (e) {
      const { code, message } = parseErr(e);
      // User cancelling the browser prompt is not an error worth shouting about.
      if (/NotAllowedError|AbortError|aborted|cancell?ed/i.test(message)) {
        return;
      }
      const guidance: Record<string, { title: string; description: string }> = {
        device_not_registered: {
          title: "الجهاز غير مسجل",
          description: "ادخل بكلمة المرور ثم فعّل بصمة الجهاز من الإعدادات لاستخدامها لاحقاً.",
        },
        challenge_missing: {
          title: "انتهت جلسة الدخول",
          description: "اضغط زر الدخول ببصمة الجهاز مرة أخرى.",
        },
        challenge_expired: {
          title: "انتهت صلاحية الجلسة",
          description: "أعد المحاولة — البصمة صالحة لخمس دقائق فقط بعد الضغط على الزر.",
        },
        verification_failed: {
          title: "لم يتم التعرف على البصمة",
          description: "تأكد من اختيار نفس الجهاز الذي سجّلته، ثم أعد المحاولة.",
        },
        session_verify_failed: {
          title: "تعذر إتمام تسجيل الدخول",
          description: message || "أعد المحاولة، وإذا استمرت المشكلة استخدم كلمة المرور.",
        },
        session_mint_failed: {
          title: "تعذر إنشاء الجلسة",
          description: "أعد المحاولة بعد لحظات، وإذا استمرت المشكلة سجّل الدخول بكلمة المرور.",
        },
        account_unresolved: {
          title: "لا يمكن ربط الجهاز بحساب",
          description: "استخدم كلمة المرور لتسجيل الدخول ثم أعد تسجيل الجهاز من الإعدادات.",
        },
        invalid_response: {
          title: "استجابة غير صالحة من الجهاز",
          description: "أعد المحاولة أو استخدم كلمة المرور.",
        },
        challenge_create_failed: {
          title: "تعذر بدء جلسة الدخول",
          description: "تحقق من الاتصال بالإنترنت وأعد المحاولة.",
        },
      };
      const info = guidance[code] ?? {
        title: "فشل الدخول ببصمة الجهاز",
        description: message || "أعد المحاولة أو استخدم كلمة المرور.",
      };
      toast.error(info.title, { description: info.description });
    } finally {
      setPasskeyLoading(false);
    }
  }

  if (forgotOpen)
    return <ForgotPasswordForm initialEmail={email} onBack={() => setForgotOpen(false)} />;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-email">البريد الإلكتروني</Label>
        <Input
          id="signin-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="signin-password">كلمة المرور</Label>
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            نسيت كلمة المرور؟
          </button>
        </div>
        <Input
          id="signin-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Loader2 className="size-4 animate-spin" />}
        تسجيل الدخول
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">أو</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={passkeyLoading}
        onClick={onPasskey}
      >
        {passkeyLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Fingerprint className="size-4" />
        )}
        الدخول ببصمة الجهاز (Passkey)
      </Button>
    </form>
  );
}

function ForgotPasswordForm({
  initialEmail,
  onBack,
}: {
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error("تعذّر إرسال الرسالة", { description: error.message });
    setSent(true);
    toast.success("تم إرسال رابط الاستعادة إلى بريدك");
  }

  return (
    <div className="space-y-4">
      {sent ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          تحقّق من صندوق الوارد لاستكمال إعادة تعيين كلمة المرور.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">البريد الإلكتروني</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">سنرسل رابطًا لإعادة تعيين كلمة المرور.</p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="size-4 animate-spin" />}
            إرسال رابط الاستعادة
          </Button>
        </form>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="w-full">
        رجوع لتسجيل الدخول
      </Button>
    </div>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin + next : undefined,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error("فشل إنشاء الحساب", { description: error.message });
    toast.success("تم إنشاء الحساب بنجاح");
    window.location.href = next;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">الاسم الكامل</Label>
        <Input
          id="signup-name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">البريد الإلكتروني</Label>
        <Input
          id="signup-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">كلمة المرور</Label>
        <Input
          id="signup-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">
          8 أحرف على الأقل، يُفضّل خليط من الأرقام والرموز.
        </p>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Loader2 className="size-4 animate-spin" />}
        إنشاء الحساب
      </Button>
    </form>
  );
}

function GoogleButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  async function onGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + next,
    });
    if (result.error) {
      setLoading(false);
      toast.error("فشل تسجيل الدخول بحساب Google", { description: result.error.message });
      return;
    }
    if (result.redirected) return;
    setLoading(false);
    window.location.href = next;
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onGoogle}
      disabled={loading}
      className="w-full"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
      المتابعة بحساب Google
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 11v3.2h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.6 3.4 14.5 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.3 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}
