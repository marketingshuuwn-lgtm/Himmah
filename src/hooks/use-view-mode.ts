// App-wide view-mode: separates "employee" experience from "manager"
// experience for people who hold both identities (an HR admin is also an
// employee who checks in, requests leave, etc).
//
// This is a UX/navigation layer, NOT a security boundary — the real
// authorization is (and remains) enforced by RLS policies and server-side
// role checks on every request. Hiding a nav item or tab here never
// replaces that; it only prevents an admin's day-to-day screen from being
// cluttered with management tools, and prevents accidental context-mixing
// (e.g. approving your own request while thinking you're in employee mode).
//
// Design follows the "default to least privilege" pattern used by banking
// apps for dual-role staff (employee-who-is-also-staff always lands in the
// customer view first) combined with Stripe's persistent, explicit
// test/live-mode toggle (a deliberate, always-visible switch rather than a
// buried preference) and AWS's "Switch Role" banner (an unmistakable,
// persistent visual indicator of which context you are currently in).

import { useCallback, useEffect, useState } from "react";
import type { AppRole } from "@/lib/auth/roles.functions";

export type ViewMode = "employee" | "manager";

const STORAGE_KEY = "staff-star.view-mode";
const ELEVATED_ROLES: AppRole[] = ["hr_admin", "dept_manager", "accountant", "owner", "admin"];

export function canElevate(roles: AppRole[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => ELEVATED_ROLES.includes(r));
}

function readStored(): ViewMode {
  if (typeof window === "undefined") return "employee";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "manager" ? "manager" : "employee";
}

/**
 * Returns the current view mode plus a setter. Always resolves to
 * "employee" for people without an elevated role, regardless of any
 * stored preference (defense in depth against a stale/tampered value).
 */
export function useViewMode(roles: AppRole[] | undefined): {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  mayElevate: boolean;
} {
  const mayElevate = canElevate(roles);
  // Always start from the server-rendered default and adopt the stored
  // preference after hydration — reading localStorage in the initializer
  // makes the first client render differ from the SSR output (hydration
  // mismatch), which React resolves by throwing away the whole tree.
  const [stored, setStored] = useState<ViewMode>("employee");

  useEffect(() => {
    setStored(readStored());
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setStored(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setViewMode = useCallback((m: ViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, m);
    setStored(m);
  }, []);

  const viewMode: ViewMode = mayElevate ? stored : "employee";
  return { viewMode, setViewMode, mayElevate };
}
