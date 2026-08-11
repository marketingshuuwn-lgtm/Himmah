import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { brand } from "@/lib/brand";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace.
type AuthzDetails = {
  client?: { name?: string; client_uri?: string } | null;
  redirect_uri?: string | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthNs = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
};
function oauthNs(): OAuthNs {
  return (supabase.auth as unknown as { oauth: OAuthNs }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>تعذّر تحميل طلب الاتصال</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </CardContent>
      </Card>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error } = approve
      ? await oauthNs().approveAuthorization(authorization_id)
      : await oauthNs().denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("لم يُرجِع خادم المصادقة عنوان إعادة توجيه.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "التطبيق الخارجي";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-[image:var(--gradient-brand)]"
      dir="rtl"
    >
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle>
            ربط {clientName} بحساب {brand.name}
          </CardTitle>
          <CardDescription>
            سيتمكّن {clientName} من استدعاء أدوات هذا التطبيق بالنيابة عنك أثناء تسجيل دخولك.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {details?.redirect_uri && (
            <div className="text-xs text-muted-foreground text-center break-all">
              عنوان الرجوع: <span dir="ltr">{details.redirect_uri}</span>
            </div>
          )}
          {scopes.length > 0 && (
            <div className="text-xs bg-muted/50 rounded p-3 space-y-1">
              <div className="font-medium">الأذونات المطلوبة:</div>
              <ul className="list-disc pr-5">
                {scopes.map((s: string) => (
                  <li key={s} dir="ltr">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            صلاحيات التطبيق داخل قاعدة البيانات (RLS) تبقى فعّالة ولا يتم تجاوزها.
          </p>
          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => decide(true)}
              disabled={!!busy}
              className="flex-1"
            >
              {busy === "approve" && <Loader2 className="size-4 animate-spin" />}
              الموافقة والاتصال
            </Button>
            <Button
              onClick={() => decide(false)}
              disabled={!!busy}
              variant="outline"
              className="flex-1"
            >
              {busy === "deny" && <Loader2 className="size-4 animate-spin" />}
              رفض
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
