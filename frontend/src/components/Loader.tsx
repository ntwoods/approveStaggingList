export default function Loader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-600">
      <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
