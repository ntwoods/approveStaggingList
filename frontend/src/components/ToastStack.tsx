import { Toast, ToastItem } from "./Toast";

type ToastStackProps = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

export default function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="fixed right-6 top-6 z-50 flex max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
