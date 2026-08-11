import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { Suspense, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPendingActivations } from "@/lib/hr/employees.functions";
import { useViewMode } from "@/hooks/use-view-mode";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, hasAnyRole, roleLabels } from "@/hooks/use-current-user";
import type { AppRole } from "@/lib/auth/roles.functions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  Wallet,
  TrendingUp,
  FileSignature,
  Star,
  LogOut,
  Loader2,
  Settings,
  Plane,
  Clock4,
  CalendarHeart,
  Sunrise,
  Menu,
  ChevronsLeft,
  ChevronsRight,
  FolderArchive,
  Home,
  ClipboardCheck,
  ShieldCheck,
  MessageSquareWarning,
  UsersRound,
  Upload,
  Search,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brand } from "@/lib/brand";
import { NotificationsBell } from "@/components/notifications-bell";
import { CommandPalette } from "@/components/command-palette";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: undefined } });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Shell />
    </Suspense>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[];
  /** Visible in employee view mode. Items without this flag are manager-only. */
  personal?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Professionally grouped navigation: daily actions first, then people
// management, finance, documents, and system administration.
// `personal: true` marks items visible in employee view mode — the rest
// only appear once the person switches to manager mode (see useViewMode).
const navGroups: NavGroup[] = [
  {
    title: "يومي",
    items: [
      { to: "/me", label: "صفحتي", icon: Home, personal: true },
      { to: "/attendance", label: "الحضور", icon: Clock, personal: true },
      { to: "/leaves", label: "الإجازات", icon: Plane, personal: true },
      { to: "/permissions", label: "الأذونات", icon: Clock4, personal: true },
    ],
  },
  {
    title: "الأشخاص والإدارة",
    items: [
      {
        to: "/dashboard",
        label: "اللوحة",
        icon: LayoutDashboard,
        roles: ["hr_admin", "dept_manager", "accountant"],
      },
      { to: "/my-team", label: "فريقي", icon: UsersRound, roles: ["dept_manager"] },
      {
        to: "/employees",
        label: "الموظفون",
        icon: Users,
        roles: ["hr_admin", "dept_manager", "accountant"],
      },
      { to: "/departments", label: "الأقسام", icon: Building2, roles: ["hr_admin"] },
      {
        to: "/attendance-corrections",
        label: "تصحيح الانصراف",
        icon: ClipboardCheck,
        roles: ["hr_admin", "dept_manager"],
      },
      {
        to: "/attendance-audit",
        label: "سجل تعديلات الحضور",
        icon: ClipboardCheck,
        roles: ["hr_admin", "dept_manager", "owner", "admin"],
      },
      {
        to: "/evaluations",
        label: "التقييم",
        icon: Star,
        roles: ["hr_admin", "dept_manager", "employee"],
        personal: true,
      },
    ],
  },
  {
    title: "المالية",
    items: [
      {
        to: "/finance",
        label: "اللوحة المالية",
        icon: TrendingUp,
        roles: ["hr_admin", "accountant", "owner", "admin"],
      },
      {
        to: "/payroll",
        label: "الرواتب",
        icon: Wallet,
        roles: ["hr_admin", "accountant", "employee"],
        personal: true,
      },
      {
        to: "/payroll-disputes",
        label: "اعتراضات الرواتب",
        icon: MessageSquareWarning,
        roles: ["hr_admin", "accountant", "owner", "admin"],
      },
      {
        to: "/payroll-audit",
        label: "تدقيق الرواتب",
        icon: TrendingUp,
        roles: ["hr_admin", "accountant", "owner", "admin"],
      },
    ],
  },
  {
    title: "الوثائق والعقود",
    items: [
      { to: "/documents", label: "الوثائق", icon: FolderArchive, personal: true },
      { to: "/contracts", label: "العقود", icon: FileSignature, personal: true },
    ],
  },
  {
    title: "النظام",
    items: [
      { to: "/shifts", label: "الورديات", icon: Sunrise, roles: ["hr_admin"] },
      { to: "/holidays", label: "العطل", icon: CalendarHeart, personal: true },
      { to: "/roles", label: "الأدوار والصلاحيات", icon: ShieldCheck, roles: ["owner", "admin"] },
      {
        to: "/access-control",
        label: "إدارة الصلاحيات",
        icon: ShieldCheck,
        roles: ["owner", "admin"],
      },

      { to: "/imports", label: "الاستيراد", icon: Upload },
      { to: "/settings", label: "الإعدادات", icon: Settings, personal: true },
    ],
  },
];

const navItems: NavItem[] = navGroups.flatMap((g) => g.items);
/** Paths that require manager view mode — used for route-level enforcement. */
const MANAGER_ONLY_PATHS = new Set(navItems.filter((i) => !i.personal).map((i) => i.to));

function Shell() {
  const user = useCurrentUser();
  const location = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { viewMode, setViewMode, mayElevate } = useViewMode(user.roles);

  const visibleItems = navItems.filter(
    (item) =>
      (!item.roles || hasAnyRole(user, item.roles)) && (viewMode === "manager" || item.personal),
  );

  // Route-level enforcement: this is the actual guard, not just a hidden
  // nav link. Bookmarking or typing a manager-only URL while in employee
  // mode redirects home instead of silently rendering — the underlying
  // RLS/role checks remain the real security boundary regardless.
  useEffect(() => {
    if (viewMode === "employee" && MANAGER_ONLY_PATHS.has(location.pathname)) {
      // Only nudge users who actually have an elevated role — a plain employee
      // has nothing to switch to, so the "بدّل إلى وضع الإدارة" toast is
      // confusing (they see it when clicking the logo → /dashboard).
      if (mayElevate) {
        toast.info("بدّل إلى وضع الإدارة أولاً للوصول لهذه الصفحة");
      }
      router.navigate({ to: "/me", replace: true });
    }
  }, [viewMode, location.pathname, router, mayElevate]);

  // Logo target: managers land on the dashboard, plain employees on their
  // personal page — clicking the logo should never trigger a redirect.
  const homeTarget = mayElevate && viewMode === "manager" ? "/dashboard" : "/me";

  // Lightweight badge: how many signed-up accounts await activation/linking.
  // Only queried for roles that can act on it; polled, not suspense (must
  // never block the shell from rendering).
  const canActivate = hasAnyRole(user, ["hr_admin"]) && viewMode === "manager";
  const pendingFn = useServerFn(listPendingActivations);
  const { data: pendingActivations } = useQuery({
    queryKey: ["pending-activations"],
    queryFn: () => pendingFn({ data: {} as never }),
    enabled: canActivate,
    refetchInterval: 60_000,
  });
  const pendingCount = pendingActivations?.length ?? 0;

  function toggleViewMode() {
    const next = viewMode === "employee" ? "manager" : "employee";
    setViewMode(next);
    router.navigate({ to: next === "manager" ? "/dashboard" : "/me" });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("تم تسجيل الخروج");
    router.navigate({ to: "/auth", replace: true, search: { next: undefined } });
  }

  const currentItem = visibleItems.find(
    (i) => location.pathname === i.to || location.pathname.startsWith(i.to + "/"),
  );

  return (
    <div className="min-h-screen bg-[image:var(--gradient-subtle)] flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex ${collapsed ? "w-16" : "w-64"} flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border transition-[width] duration-200`}
      >
        <div className="p-3 border-b border-sidebar-border flex items-center gap-2">
          <Link to={homeTarget} className="flex items-center gap-3 group flex-1 min-w-0">
            <div className="size-10 rounded-xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center group-hover:ring-sidebar-primary/50 transition shrink-0">
              <img src={brand.mark} alt={brand.nameLatin} className="size-6" />
            </div>
            {!collapsed && (
              <div className="leading-tight min-w-0">
                <h2 className="font-bold text-base truncate">{brand.name}</h2>
                <p className="text-[10px] font-semibold tracking-[0.3em] text-sidebar-primary/80 truncate">
                  {brand.nameLatin}
                </p>
              </div>
            )}
          </Link>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {navGroups.map((group) => {
            const items = group.items.filter(
              (i) =>
                (!i.roles || hasAnyRole(user, i.roles)) && (viewMode === "manager" || i.personal),
            );
            if (!items.length) return null;
            return (
              <div key={group.title} className="mb-1">
                {collapsed ? (
                  <div className="my-2 mx-2 border-t border-sidebar-border/60" />
                ) : (
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-sidebar-foreground/40 select-none">
                    {group.title}
                  </p>
                )}
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        title={collapsed ? item.label : undefined}
                        className={`relative flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <Icon className="size-4 shrink-0" />
                        {!collapsed && (
                          <span className="truncate flex-1 min-w-0">{item.label}</span>
                        )}
                        {item.to === "/employees" && pendingCount > 0 && (
                          <span
                            className={`shrink-0 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none flex items-center justify-center ${collapsed ? "absolute top-1 left-1 size-2 p-0" : "size-4 min-w-4 px-1"}`}
                            title={`${pendingCount} حساب بانتظار التفعيل`}
                          >
                            {!collapsed && pendingCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-2 border-t border-sidebar-border space-y-2">
          <Button
            onClick={() => setCollapsed((v) => !v)}
            variant="ghost"
            size="sm"
            className="w-full justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label={collapsed ? "توسيع" : "تصغير"}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </Button>
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar className="size-9">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                  {user.fullName.slice(0, 2) || "؟؟"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.fullName || "بدون اسم"}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {user.roles.length === 0 && (
                    <span className="text-[10px] text-sidebar-foreground/60">بدون دور</span>
                  )}
                  {user.roles.map((r) => (
                    <span
                      key={r}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar-primary/20 text-sidebar-primary-foreground/90 border border-sidebar-primary/30"
                    >
                      {roleLabels[r]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <Button
            onClick={handleSignOut}
            variant="ghost"
            size="sm"
            className={`w-full ${collapsed ? "justify-center" : "justify-start"} text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent`}
          >
            <LogOut className="size-4" />
            {!collapsed && "تسجيل الخروج"}
          </Button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-30 h-14 bg-background/80 backdrop-blur border-b border-border/60 flex items-center gap-2 px-3 md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="القائمة">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-sidebar text-sidebar-foreground p-0">
              <SheetHeader className="p-4 border-b border-sidebar-border">
                <SheetTitle className="text-sidebar-foreground text-start">{brand.name}</SheetTitle>
              </SheetHeader>
              <nav className="p-2 overflow-y-auto">
                {navGroups.map((group) => {
                  const items = group.items.filter(
                    (i) =>
                      (!i.roles || hasAnyRole(user, i.roles)) &&
                      (viewMode === "manager" || i.personal),
                  );
                  if (!items.length) return null;
                  return (
                    <div key={group.title} className="mb-1">
                      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-sidebar-foreground/40 select-none">
                        {group.title}
                      </p>
                      <div className="space-y-1">
                        {items.map((item) => {
                          const Icon = item.icon;
                          const active =
                            location.pathname === item.to ||
                            location.pathname.startsWith(item.to + "/");
                          return (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={() => setMobileOpen(false)}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                                active
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                              }`}
                            >
                              <Icon className="size-4" />
                              <span className="flex-1 min-w-0 truncate">{item.label}</span>
                              {item.to === "/employees" && pendingCount > 0 && (
                                <span className="shrink-0 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none size-4 min-w-4 px-1 flex items-center justify-center">
                                  {pendingCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate">{currentItem?.label ?? brand.name}</h2>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex items-center gap-2 text-muted-foreground"
            onClick={() =>
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
            }
            title="بحث سريع (Ctrl+K)"
          >
            <Search className="size-4" />
            <span className="text-xs">Ctrl+K</span>
          </Button>

          {mayElevate && (
            <Button
              variant={viewMode === "manager" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={toggleViewMode}
              title={viewMode === "manager" ? "التبديل إلى وضع الموظف" : "التبديل إلى وضع الإدارة"}
            >
              {viewMode === "manager" ? (
                <ShieldCheck className="size-4" />
              ) : (
                <UsersRound className="size-4" />
              )}
              <span className="hidden sm:inline text-xs">
                {viewMode === "manager" ? "وضع الإدارة" : "وضع الموظف"}
              </span>
            </Button>
          )}

          <NotificationsBell />

          <Avatar className="size-8 hidden sm:flex">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {user.fullName.slice(0, 2) || "؟؟"}
            </AvatarFallback>
          </Avatar>
        </header>

        {viewMode === "manager" && mayElevate && (
          <div className="sticky top-14 z-20 bg-violet-600 text-white text-xs px-3 md:px-6 py-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 shrink-0" />
              أنت في وضع الإدارة — تُعرض هنا أدوات إدارية تؤثر على الفريق بأكمله
            </span>
            <button
              type="button"
              onClick={toggleViewMode}
              className="underline underline-offset-2 shrink-0 hover:opacity-80"
            >
              عودة لوضعي
            </button>
          </div>
        )}

        {/* Mobile bottom nav — top 4 + more */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar text-sidebar-foreground border-t border-sidebar-border">
          <div className="grid grid-cols-5 gap-1 p-2">
            {visibleItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active =
                location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setMobileOpen(true)}
              className="flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] text-sidebar-foreground/70"
            >
              <Menu className="size-4" />
              <span>المزيد</span>
            </button>
          </div>
        </nav>

        <main className="flex-1 min-w-0 pb-24 md:pb-0">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
