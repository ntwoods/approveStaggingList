import { EligibleItem } from "../types";
import Button from "./Button";

type DetailKey = "dealerName" | "marketingPerson" | "location" | "crm";

const detailRows: { label: string; key: DetailKey }[] = [
  { label: "Dealer", key: "dealerName" },
  { label: "Marketing", key: "marketingPerson" },
  { label: "Location", key: "location" },
  { label: "CRM", key: "crm" }
];

type ApprovalCardProps = {
  item: EligibleItem;
  busy?: boolean;
  onOpenDocs: (item: EligibleItem) => void;
  onMarkChecked: (item: EligibleItem) => void;
};

export default function ApprovalCard({ item, busy, onOpenDocs, onMarkChecked }: ApprovalCardProps) {
  return (
    <div className="glass-card flex h-full flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Order ID</p>
          <h3 className="mt-2 text-xl font-semibold text-ink-900">{item.orderId}</h3>
        </div>
        <span className="badge">{item.segmentLabel}</span>
      </div>

      <div className="space-y-3 text-sm text-ink-700">
        {detailRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="text-ink-500">{row.label}</span>
            <span className="text-right font-medium text-ink-900">{item[row.key] || "-"}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-brand-100/70 p-4 text-xs text-ink-700">
        <p className="font-semibold uppercase tracking-wide text-brand-900">Pending Docs</p>
        <ul className="mt-2 space-y-1">
          {item.docs.length ? (
            item.docs.map((doc, index) => (
              <li key={`${doc}-${index}`} className="break-all">
                {doc}
              </li>
            ))
          ) : (
            <li className="text-ink-500">No documents listed.</li>
          )}
        </ul>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <Button variant="secondary" onClick={() => onOpenDocs(item)}>
          Open Pending Docs
        </Button>
        <Button onClick={() => onMarkChecked(item)} disabled={busy}>
          {busy ? "Marking..." : "Mark Checked"}
        </Button>
      </div>
    </div>
  );
}
