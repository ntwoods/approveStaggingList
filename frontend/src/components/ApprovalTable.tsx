import { EligibleItem } from "../types";
import Button from "./Button";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

type ApprovalTableProps = {
  items: EligibleItem[];
  busyMap: Record<string, boolean>;
  getKey: (item: EligibleItem) => string;
  onOpenDocs: (item: EligibleItem) => void;
  onMarkChecked: (item: EligibleItem) => void;
  onReturnToManager: (item: EligibleItem) => void;
};

export default function ApprovalTable({
  items,
  busyMap,
  getKey,
  onOpenDocs,
  onMarkChecked,
  onReturnToManager
}: ApprovalTableProps) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Segment</th>
              <th className="px-4 py-3">Dealer</th>
              <th className="px-4 py-3">Marketing</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">CRM</th>
              <th className="px-4 py-3">Pending Docs</th>
              <th className="sticky right-0 px-4 py-3 text-right bg-white/80 shadow-[-12px_0_18px_rgba(15,23,42,0.06)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {items.map((item, index) => {
              const key = getKey(item);
              const busy = Boolean(busyMap[key]);
              const docCount = item.docs.filter((doc) => isUrl(doc)).length;
              const rowBg = index % 2 ? "bg-white/40" : "bg-white/70";

              return (
                <tr
                  key={key}
                  className={`${rowBg} hover:bg-brand-100/25`}
                >
                  <td className="px-4 py-2.5 font-medium text-ink-900">
                    <span className="whitespace-nowrap tabular-nums">{item.orderId}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="badge-sm whitespace-nowrap">{item.segmentLabel}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    <span className="block max-w-[220px] truncate" title={item.dealerName || ""}>
                      {item.dealerName || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    <span
                      className="block max-w-[200px] truncate"
                      title={item.marketingPerson || ""}
                    >
                      {item.marketingPerson || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    <span className="block max-w-[180px] truncate" title={item.location || ""}>
                      {item.location || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    <span className="block max-w-[160px] truncate" title={item.crm || ""}>
                      {item.crm || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onOpenDocs(item)}
                      disabled={!docCount}
                      title={docCount ? `Open ${docCount} docs` : "No valid document links"}
                    >
                      {docCount ? `Open Docs (${docCount})` : "No Docs"}
                    </Button>
                  </td>
                  <td className={`sticky right-0 ${rowBg} px-4 py-2.5 shadow-[-12px_0_18px_rgba(15,23,42,0.06)]`}>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onReturnToManager(item)}
                        disabled={busy}
                        title="Return to Manager"
                      >
                        Return to Manager
                      </Button>
                      <Button
                        size="xs"
                        onClick={() => onMarkChecked(item)}
                        disabled={busy}
                        title="Mark Checked"
                      >
                        {busy ? "Marking..." : "Mark Checked"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
