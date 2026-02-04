import { EligibleItem } from "../types";
import Button from "./Button";

type DetailKey = "dealerName" | "marketingPerson" | "location" | "crm";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

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
  onReturnToManager: (item: EligibleItem) => void;
};

export default function ApprovalCard({
  item,
  busy,
  onOpenDocs,
  onMarkChecked,
  onReturnToManager
}: ApprovalCardProps) {
  const disabled = Boolean(busy);
  const docCount = item.docs.filter((doc) => isUrl(doc)).length;
  return (
    <div className="glass-card flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Order ID</p>
          <h3 className="mt-2 text-xl font-semibold text-ink-900">{item.orderId}</h3>
        </div>
        <span className="badge">{item.segmentLabel}</span>
      </div>

      <div className="space-y-2.5 text-sm text-ink-700">
        {detailRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="text-ink-500">{row.label}</span>
            <span className="text-right font-medium text-ink-900">{item[row.key] || "-"}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-brand-100/70 px-4 py-3 text-xs text-ink-700">
        <p className="font-semibold uppercase tracking-wide text-brand-900">Pending Docs</p>
        <span className="font-medium text-ink-900">
          {docCount ? `${docCount} link${docCount === 1 ? "" : "s"}` : "None"}
        </span>
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        <Button variant="secondary" size="sm" onClick={() => onOpenDocs(item)} disabled={!docCount}>
          {docCount ? `Open Pending Docs (${docCount})` : "No Pending Docs"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onReturnToManager(item)} disabled={disabled}>
          Return to Manager
        </Button>
        <Button size="sm" onClick={() => onMarkChecked(item)} disabled={disabled}>
          {busy ? "Marking..." : "Mark Checked"}
        </Button>
      </div>
    </div>
  );
}
