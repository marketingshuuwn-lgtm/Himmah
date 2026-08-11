import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";

export interface Clause {
  id: string;
  title: string;
  body: string;
}

export function newClause(): Clause {
  return { id: crypto.randomUUID(), title: "", body: "" };
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Renders a clause list into the contract body HTML (plain text is escaped). */
export function clausesToHtml(clauses: Clause[]): string {
  return clauses
    .filter((c) => c.title.trim() || c.body.trim())
    .map((c, i) => {
      const paragraphs = c.body
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
        .join("");
      return `<h3>البند ${i + 1}: ${escapeHtml(c.title.trim())}</h3>${paragraphs}`;
    })
    .join("\n");
}

/**
 * Free-form clause editor: clauses can be added, edited, reordered and
 * removed. The rendered HTML is derived from the list, so the document,
 * the PDF and the email always match what is edited here.
 */
export function ContractClauseEditor({
  clauses,
  onChange,
}: {
  clauses: Clause[];
  onChange: (next: Clause[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(clauses[0]?.id ?? null);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...clauses];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  const patch = (id: string, p: Partial<Clause>) =>
    onChange(clauses.map((c) => (c.id === id ? { ...c, ...p } : c)));

  return (
    <div className="space-y-2" dir="rtl">
      {clauses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg border-dashed">
          لا توجد بنود بعد — أضف البند الأول.
        </p>
      ) : null}

      {clauses.map((c, i) => {
        const open = openId === c.id;
        return (
          <div key={c.id} className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 p-2">
              <GripVertical className="size-4 text-muted-foreground shrink-0" />
              <button
                type="button"
                className="flex-1 text-right text-sm font-medium truncate"
                onClick={() => setOpenId(open ? null : c.id)}
              >
                البند {i + 1}
                {c.title ? ` — ${c.title}` : ""}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === clauses.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 text-destructive"
                onClick={() => onChange(clauses.filter((x) => x.id !== c.id))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            {open ? (
              <div className="p-3 pt-0 space-y-2">
                <Input
                  value={c.title}
                  placeholder="عنوان البند (مثال: مدة العقد)"
                  onChange={(e) => patch(c.id, { title: e.target.value })}
                />
                <Textarea
                  value={c.body}
                  rows={4}
                  placeholder="نص البند… يمكنك استخدام متغيرات القالب مثل {{employee_name}}"
                  onChange={(e) => patch(c.id, { body: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const c = newClause();
          onChange([...clauses, c]);
          setOpenId(c.id);
        }}
      >
        <Plus className="size-4 ml-1" /> إضافة بند
      </Button>
    </div>
  );
}
