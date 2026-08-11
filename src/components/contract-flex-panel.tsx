import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getContractFlex,
  saveContractClauses,
  setApprovalFlow,
  managerApproveContract,
  createAddendum,
  DEFAULT_APPROVAL_FLOW,
  type ApprovalFlow,
} from "@/lib/hr/contract-flex.functions";
import {
  ContractClauseEditor,
  clausesToHtml,
  newClause,
  type Clause,
} from "@/components/contract-clause-editor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/utils/format";
import { FilePlus2, ListTree, Loader2, Save, ShieldCheck, Workflow } from "lucide-react";

const FLOW_FIELDS: { key: keyof ApprovalFlow; label: string; hint: string }[] = [
  {
    key: "require_manager_approval",
    label: "موافقة مدير قبل الموظف",
    hint: "يجب اعتماد المدير أولًا قبل إتاحة التوقيع للموظف.",
  },
  {
    key: "require_biometric",
    label: "التحقق بالبصمة إلزامي",
    hint: "لا يُقبل التوقيع بدون تحقق حيوي من الجهاز.",
  },
  {
    key: "notify_by_email",
    label: "إشعار بالبريد الإلكتروني",
    hint: "إرسال نسخة العقد ورابط التوقيع للموظف بالبريد.",
  },
];

export function ContractFlexPanel({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getContractFlex);
  const saveClauses = useServerFn(saveContractClauses);
  const saveFlow = useServerFn(setApprovalFlow);
  const approve = useServerFn(managerApproveContract);

  const { data, isLoading } = useQuery({
    queryKey: ["contract-flex", contractId],
    queryFn: () => load({ data: { contract_id: contractId } }),
  });

  const [clauses, setClauses] = useState<Clause[]>([]);
  const [flow, setFlow] = useState<ApprovalFlow>(DEFAULT_APPROVAL_FLOW);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setClauses(data.clauses);
    setFlow(data.approval_flow);
  }, [data]);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ تحميل إعدادات المرونة…
        </CardContent>
      </Card>
    );
  }

  const isDraft = data.status === "draft";
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["contract-flex", contractId] });
    qc.invalidateQueries({ queryKey: ["contract-status", contractId] });
  };

  return (
    <div className="space-y-4">
      {/* Approval path */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="size-4" /> مسار الاعتماد
          </CardTitle>
          <CardDescription>
            حدّد الخطوات المطلوبة فعليًا لهذا العقد — لا يوجد مسار ثابت مفروض.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FLOW_FIELDS.map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label className="text-sm font-medium">{f.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{f.hint}</p>
              </div>
              <Switch
                checked={flow[f.key]}
                onCheckedChange={(v) => setFlow((p) => ({ ...p, [f.key]: v }))}
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await saveFlow({ data: { contract_id: contractId, flow } });
                  toast.success("تم حفظ مسار الاعتماد");
                  refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save className="size-4 ml-1" /> حفظ المسار
            </Button>

            {flow.require_manager_approval ? (
              data.manager_approved_at ? (
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                  <ShieldCheck className="size-3 ml-1" /> اعتُمد من المدير ·{" "}
                  {fmtDateTime(data.manager_approved_at)}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await approve({ data: { contract_id: contractId } });
                      toast.success("تم اعتماد العقد من المدير");
                      refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <ShieldCheck className="size-4 ml-1" /> اعتماد المدير الآن
                </Button>
              )
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Free clause editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTree className="size-4" /> بنود العقد
          </CardTitle>
          <CardDescription>
            {isDraft
              ? "أضف أو احذف أو أعد ترتيب البنود بحرية — النص النهائي يُبنى من هذه القائمة."
              : "العقد لم يعد مسودة؛ أي تغيير يتم عبر ملحق يحفظ الأصل كما هو."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isDraft ? (
            <>
              <ContractClauseEditor clauses={clauses} onChange={setClauses} />
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await saveClauses({
                      data: {
                        contract_id: contractId,
                        clauses,
                        body: clausesToHtml(clauses),
                      },
                    });
                    toast.success("تم حفظ البنود وتحديث نص العقد");
                    refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Save className="size-4 ml-1" /> حفظ البنود
              </Button>
            </>
          ) : clauses.length ? (
            <ol className="text-sm space-y-1 list-decimal ps-5">
              {clauses.map((c) => (
                <li key={c.id}>{c.title || "بند بدون عنوان"}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">هذا العقد مكتوب كنص واحد بدون بنود مفصولة.</p>
          )}
        </CardContent>
      </Card>

      {/* Addenda */}
      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FilePlus2 className="size-4" /> الملاحق والتعديلات اللاحقة
            </CardTitle>
            <CardDescription>
              كل ملحق عقد مستقل بسجله وتوقيعه، والعقد الأصلي يبقى دون تغيير.
            </CardDescription>
          </div>
          {data.status === "signed" && data.kind === "original" ? (
            <AddendumDialog parentId={contractId} onCreated={refresh} />
          ) : null}
        </CardHeader>
        <CardContent>
          {data.parent_contract_id ? (
            <p className="text-sm">
              هذا المستند ملحق لعقد أصلي —{" "}
              <Link
                to="/contracts/$contractId/status"
                params={{ contractId: data.parent_contract_id }}
                className="underline"
              >
                فتح العقد الأصلي
              </Link>
            </p>
          ) : data.addenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.status === "signed"
                ? "لا توجد ملاحق بعد."
                : "تُتاح الملاحق بعد توقيع العقد الأصلي."}
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {data.addenda.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                  <Link
                    to="/contracts/$contractId/status"
                    params={{ contractId: a.id }}
                    className="font-medium underline-offset-2 hover:underline truncate"
                  >
                    {a.title}
                  </Link>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {a.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(a.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddendumDialog({ parentId, onCreated }: { parentId: string; onCreated: () => void }) {
  const create = useServerFn(createAddendum);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("ملحق تعديل");
  const [clauses, setClauses] = useState<Clause[]>([newClause()]);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FilePlus2 className="size-4 ml-1" /> ملحق جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء ملحق للعقد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>عنوان الملحق</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <ContractClauseEditor clauses={clauses} onChange={setClauses} />
        </div>
        <DialogFooter>
          <Button
            disabled={busy || title.trim().length < 3 || clausesToHtml(clauses).length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await create({
                  data: {
                    parent_contract_id: parentId,
                    title: title.trim(),
                    clauses,
                    body: clausesToHtml(clauses),
                  },
                });
                toast.success("تم إنشاء الملحق كمسودة");
                setOpen(false);
                setClauses([newClause()]);
                onCreated();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin ml-1" /> : null} إنشاء الملحق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
