export type Toast = {
  id: string;
  type: "success" | "error" | "info";
  message: string;
};

type ToastItemProps = {
  toast: Toast;
  onDismiss: (id: string) => void;
};

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const accent =
    toast.type === "success"
      ? "border-emerald-400 text-emerald-700"
      : toast.type === "error"
      ? "border-rose-400 text-rose-700"
      : "border-brand-300 text-ink-700";

  return (
    <div className={`glass-card flex items-center gap-3 border-l-4 px-4 py-3 ${accent}`}>
      <span className="text-sm font-medium">{toast.message}</span>
      <button
        className="ml-auto text-xs font-semibold uppercase tracking-wide text-ink-500"
        onClick={() => onDismiss(toast.id)}
      >
        Close
      </button>
    </div>
  );
}
