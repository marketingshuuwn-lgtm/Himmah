import { Workflow } from "lucide-react";

interface StageCounts {
  draft: number;
  pending_admin_approval: number;
  sent_to_employee: number;
  employee_approved: number;
  employee_objected: number;
}

/**
 * Professional flowchart of the payroll approval workflow — a permanent,
 * always-current diagram (not a one-off chat visualization) that mirrors
 * the actual payroll_runs.approval_status state machine. Each node shows
 * the live count of this period's runs sitting in that state, and the
 * objection path is drawn looping back to draft to make the correction
 * cycle explicit. Renders its own content only — no Card wrapper, so
 * callers can place it wherever fits their layout.
 */
export function PayrollWorkflowDiagram({ counts }: { counts: StageCounts }) {
  const nodes: Array<{
    key: keyof StageCounts | "approved";
    label: string;
    x: number;
    tone: string;
  }> = [
    { key: "draft", label: "مسودة", x: 40, tone: "#94a3b8" },
    { key: "pending_admin_approval", label: "بانتظار اعتماد HR", x: 220, tone: "#d97706" },
    { key: "approved", label: "اعتماد + إرسال", x: 400, tone: "#0ea5e9" },
    { key: "employee_approved", label: "اعتمدها الموظف", x: 580, tone: "#10b981" },
  ];

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
        <Workflow className="size-3.5 text-muted-foreground" />
        مسار اعتماد الرواتب
      </p>
      <svg viewBox="0 0 680 220" className="w-full h-auto">
        {/* Forward flow arrows */}
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1={nodes[i].x + 90}
            y1={50}
            x2={nodes[i + 1].x + 10}
            y2={50}
            stroke="currentColor"
            className="text-border"
            strokeWidth={2}
            markerEnd="url(#arrow)"
          />
        ))}

        {/* Objection loop-back: employee_objected -> back to draft */}
        <path
          d="M 580 90 C 580 170, 40 170, 40 95"
          fill="none"
          stroke="#e11d48"
          strokeWidth={2}
          strokeDasharray="5 4"
          markerEnd="url(#arrow-red)"
        />
        <text x="310" y="196" textAnchor="middle" className="fill-rose-600 text-[11px] font-medium">
          اعتراض الموظف — يعاد للمراجعة والتصحيح
          {counts.employee_objected > 0 ? ` (${counts.employee_objected})` : ""}
        </text>

        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="fill-border" />
          </marker>
          <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#e11d48" />
          </marker>
        </defs>

        {/* Nodes */}
        {nodes.map((n) => {
          const count =
            n.key === "approved"
              ? counts.sent_to_employee // "approved+sent" is one combined action in this app
              : counts[n.key as keyof StageCounts];
          return (
            <g key={n.key}>
              <rect
                x={n.x}
                y={20}
                width={100}
                height={60}
                rx={10}
                fill={n.tone}
                fillOpacity={0.12}
                stroke={n.tone}
                strokeWidth={1.5}
              />
              <text
                x={n.x + 50}
                y={45}
                textAnchor="middle"
                className="text-[11px] font-semibold"
                fill={n.tone}
              >
                {n.label}
              </text>
              {count > 0 && (
                <text
                  x={n.x + 50}
                  y={68}
                  textAnchor="middle"
                  className="text-[15px] font-bold"
                  fill={n.tone}
                >
                  {count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
