import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getCurrentUser, type AppRole, type CurrentUserInfo } from "@/lib/auth/roles.functions";

export const currentUserQueryOptions = (fetcher: () => Promise<CurrentUserInfo>) =>
  queryOptions({
    queryKey: ["current-user"],
    queryFn: fetcher,
    staleTime: 60_000,
  });

export function useCurrentUser() {
  const fetcher = useServerFn(getCurrentUser);
  return useSuspenseQuery(currentUserQueryOptions(() => fetcher())).data;
}

export function hasAnyRole(user: { roles: AppRole[] }, roles: AppRole[]) {
  return user.roles.some((r) => roles.includes(r));
}

export const roleLabels: Record<AppRole, string> = {
  owner: "مالك النظام",
  admin: "مدير عام",
  hr_admin: "مدير الموارد البشرية",
  dept_manager: "مدير قسم",
  accountant: "محاسب",
  employee: "موظف",
};
