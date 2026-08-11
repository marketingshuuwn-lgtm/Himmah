import { createFileRoute } from "@tanstack/react-router";
import { PasscodeSettings } from "@/components/passcode-settings";
import { WebauthnSettings } from "@/components/webauthn-settings";
import { OrgSettingsCard } from "@/components/org-settings-card";
import { CronHealthCard } from "@/components/cron-health-card";

import { useCurrentUser, roleLabels, hasAnyRole } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "الإعدادات · علامة" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة حسابك والأمان وطرق الدخول.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">معلومات الحساب</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">الاسم</span>
            <span className="font-medium">{user.fullName || "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">الأدوار</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {user.roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {roleLabels[r]}
                </Badge>
              ))}
              {user.roles.length === 0 && <span className="text-xs">بدون دور</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <PasscodeSettings />
      <WebauthnSettings />
      {hasAnyRole(user, ["hr_admin", "owner"]) && viewMode === "manager" && <OrgSettingsCard />}
      {hasAnyRole(user, ["hr_admin", "owner", "admin"]) && viewMode === "manager" && (
        <CronHealthCard />
      )}
    </div>
  );
}
