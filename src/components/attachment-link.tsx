import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip } from "lucide-react";
import { signDocumentUrl } from "@/lib/hr/documents.functions";

/**
 * Small icon-button that opens a signed URL for a request attachment
 * (leave/permission supporting file). Shared between leaves.tsx and
 * permissions.tsx rather than duplicated.
 */
export function AttachmentLink({ path }: { path: string }) {
  const fn = useServerFn(signDocumentUrl);
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const { url } = await fn({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح المرفق");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={open}
      disabled={loading}
      title="عرض المرفق"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
    </Button>
  );
}
