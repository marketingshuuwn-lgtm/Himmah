import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  listMyNotifications, markNotificationRead, markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/hr/notifications.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, CircleCheck, CircleAlert, Info, Plane, Clock4, FileSignature, Wallet, Clock } from "lucide-react";
import { fmtDateTime } from "@/lib/utils/format";

const iconFor = (k: NotificationRow["kind"]) => {
  switch (k) {
    case "success": return <CircleCheck className="size-4 text-emerald-500" />;
    case "warning": return <CircleAlert className="size-4 text-amber-500" />;
    case "error":   return <CircleAlert className="size-4 text-rose-500" />;
    case "leave":   return <Plane className="size-4 text-sky-500" />;
    case "permission": return <Clock4 className="size-4 text-indigo-500" />;
    case "contract": return <FileSignature className="size-4 text-violet-500" />;
    case "payroll": return <Wallet className="size-4 text-emerald-500" />;
    case "attendance": return <Clock className="size-4 text-blue-500" />;
    default: return <Info className="size-4 text-muted-foreground" />;
  }
};

export function NotificationsBell() {
  const fetcher = useServerFn(listMyNotifications);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetcher(),
    refetchInterval: 30_000,
  });
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const readM = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAllM = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Optimistic poll on focus
  useEffect(() => {
    const onFocus = () => qc.invalidateQueries({ queryKey: ["notifications"] });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [qc]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
          <Bell className="size-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -end-1 size-5 p-0 grid place-items-center text-[10px] num bg-rose-500 hover:bg-rose-500 text-white">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <p className="font-semibold">الإشعارات</p>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={() => readAllM.mutate()}>
              <Check className="size-3.5" /> تعليم الكل
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد إشعارات
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const content = (
                  <div className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="mt-0.5">{iconFor(n.kind)}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.read_at ? "font-semibold" : ""}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1 num">{fmtDateTime(n.created_at)}</p>
                    </div>
                    {!n.read_at && <span className="size-2 rounded-full bg-primary mt-1.5" />}
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => { if (!n.read_at) readM.mutate(n.id); }}>
                    {n.link ? <Link to={n.link as any}>{content}</Link> : content}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
