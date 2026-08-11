import { brand } from "@/lib/brand";
import { fmtDate } from "@/lib/utils/format";

/**
 * Formal contract document shell used everywhere a contract is shown:
 * HR send-preview, employee viewer, and the html2canvas → PDF export.
 * Keeping one component guarantees the PDF and the email/preview the
 * employee sees are literally the same document.
 */
export function ContractDocument({
  title,
  employeeName,
  referenceId,
  createdAt,
  effectiveDate,
  bodyHtml,
  status,
  children,
}: {
  title: string;
  employeeName: string;
  referenceId: string;
  createdAt: string;
  effectiveDate?: string | null;
  bodyHtml: string;
  status?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      dir="rtl"
      className="bg-white text-slate-900 rounded-lg border shadow-sm px-8 py-7 text-sm leading-loose"
    >
      {/* Letterhead */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <img src={brand.logoOnLight} alt={brand.name} className="h-10 w-auto" />
          <div>
            <p className="font-bold text-base leading-tight">{brand.name}</p>
            <p className="text-[11px] text-slate-500">{brand.tagline}</p>
          </div>
        </div>
        <div className="text-left text-[11px] text-slate-500 space-y-0.5">
          <p>
            رقم المرجع: <span className="font-mono">{referenceId.slice(0, 8).toUpperCase()}</span>
          </p>
          <p>تاريخ التحرير: {fmtDate(createdAt)}</p>
          {effectiveDate ? <p>تاريخ السريان: {fmtDate(effectiveDate)}</p> : null}
        </div>
      </header>

      {/* Title block */}
      <div className="text-center my-6">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <div className="mx-auto mt-2 h-px w-24 bg-slate-300" />
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-3 mb-6 text-[12px]">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">الطرف الأول</p>
          <p className="font-semibold">{brand.name}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">الطرف الثاني</p>
          <p className="font-semibold">{employeeName}</p>
        </div>
      </div>

      {/* Body */}
      <article
        className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 rtl:text-right"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {children}

      {/* Signature block */}
      {status !== "signed" ? (
        <div className="grid grid-cols-2 gap-6 mt-10 pt-4 text-[12px]">
          <div>
            <p className="text-slate-500 mb-6">توقيع الطرف الأول</p>
            <div className="border-t border-slate-400 pt-1">{brand.name}</div>
          </div>
          <div>
            <p className="text-slate-500 mb-6">توقيع الطرف الثاني</p>
            <div className="border-t border-slate-400 pt-1">{employeeName}</div>
          </div>
        </div>
      ) : null}

      <footer className="mt-8 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
        <span>
          {brand.name} · {brand.nameLatin}
        </span>
        <span>هذه الوثيقة صادرة إلكترونيًا ولا تحتاج إلى ختم يدوي.</span>
      </footer>
    </div>
  );
}
