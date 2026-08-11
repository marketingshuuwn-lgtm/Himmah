import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Clock,
  Plane,
  Clock4,
  Wallet,
  FileSignature,
  Star,
  UsersRound,
  Building2,
  Settings,
  FolderArchive,
  Home,
  ClipboardCheck,
  ShieldCheck,
  Sunrise,
  MessageSquareWarning,
  CalendarHeart,
  Upload,
  User,
} from "lucide-react";
import { commandSearch } from "@/lib/hr/team-metrics.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useViewMode } from "@/hooks/use-view-mode";

interface NavCmd {
  to: string;
  label: string;
  icon: any;
  personal?: boolean;
}

// `personal` mirrors the sidebar's classification in _authenticated/route.tsx
// so the command palette (Ctrl+K) respects the same employee/manager
// separation instead of surfacing management pages to everyone who searches.
const NAV: NavCmd[] = [
  { to: "/me", label: "صفحتي", icon: Home, personal: true },
  { to: "/dashboard", label: "اللوحة", icon: LayoutDashboard },
  { to: "/my-team", label: "فريقي", icon: UsersRound },
  { to: "/attendance", label: "الحضور", icon: Clock, personal: true },
  { to: "/leaves", label: "الإجازات", icon: Plane, personal: true },
  { to: "/permissions", label: "الأذونات", icon: Clock4, personal: true },
  { to: "/attendance-corrections", label: "تصحيح الانصراف", icon: ClipboardCheck },
  { to: "/attendance-audit", label: "سجل تعديلات الحضور", icon: ClipboardCheck },
  { to: "/employees", label: "الموظفون", icon: Users },
  { to: "/departments", label: "الأقسام", icon: Building2 },
  { to: "/documents", label: "الوثائق", icon: FolderArchive, personal: true },
  { to: "/contracts", label: "العقود", icon: FileSignature, personal: true },
  { to: "/payroll", label: "الرواتب", icon: Wallet, personal: true },
  { to: "/payroll-disputes", label: "اعتراضات الرواتب", icon: MessageSquareWarning },
  { to: "/evaluations", label: "التقييم", icon: Star, personal: true },
  { to: "/shifts", label: "الورديات", icon: Sunrise },
  { to: "/holidays", label: "العطل", icon: CalendarHeart, personal: true },
  { to: "/roles", label: "الأدوار والصلاحيات", icon: ShieldCheck },
  { to: "/access-control", label: "إدارة الصلاحيات", icon: ShieldCheck },

  { to: "/imports", label: "الاستيراد ومراجعة الدفعات", icon: Upload },
  { to: "/settings", label: "الإعدادات", icon: Settings, personal: true },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; employee_no: string; full_name: string; position: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const search = useServerFn(commandSearch);
  const user = useCurrentUser();
  const { viewMode } = useViewMode(user.roles);
  const visibleNav = NAV.filter((n) => viewMode === "manager" || n.personal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await search({ data: { q: q.trim() } });
        if (!cancelled) setResults(res as any);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, search]);

  const go = useCallback(
    (to: string) => {
      setOpen(false);
      setQ("");
      navigate({ to });
    },
    [navigate],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="ابحث أو انتقل بسرعة… (Ctrl+K)" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{searching ? "جارٍ البحث…" : "لا نتائج"}</CommandEmpty>
        {results.length > 0 && (
          <>
            <CommandGroup heading="الموظفون">
              {results.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.full_name} ${r.employee_no}`}
                  onSelect={() => go("/employees")}
                >
                  <User className="size-4" />
                  <span>{r.full_name}</span>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {r.employee_no} · {r.position || "—"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="التنقل">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            return (
              <CommandItem key={n.to} value={n.label} onSelect={() => go(n.to)}>
                <Icon className="size-4" />
                {n.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
