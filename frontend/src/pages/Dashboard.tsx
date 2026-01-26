import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { listEligible, markChecked, UploadFilePayload } from "../api";
import ApprovalCard from "../components/ApprovalCard";
import Button from "../components/Button";
import Loader from "../components/Loader";
import ToastStack from "../components/ToastStack";
import { Toast } from "../components/Toast";
import { EligibleItem } from "../types";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

export default function DashboardPage() {
  const { token, email, logout, setEmail } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<EligibleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const [pendingItem, setPendingItem] = useState<EligibleItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const itemKey = useCallback(
    (item: EligibleItem) =>
      item.rowIndex
        ? `${item.orderId}-${item.segmentIndex}-${item.rowIndex}`
        : `${item.orderId}-${item.segmentIndex}`,
    []
  );

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  }, []);

  const loadItems = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const result = await listEligible(token);
      const nextItems = (result.items || []) as EligibleItem[];
      setItems(nextItems);
      if (result.email) {
        setEmail(result.email);
      }
      return nextItems;
    } catch (error: any) {
      const message = error?.message || "Unable to load approvals";
      addToast(message, "error");
      if (message.toLowerCase().includes("unauthorized")) {
        logout();
        navigate("/login", { replace: true });
      }
    } finally {
      setLoading(false);
    }
    return null;
  }, [addToast, logout, navigate, setEmail, token]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return items;
    }
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      return [
        item.orderId,
        item.dealerName,
        item.marketingPerson,
        item.location,
        item.crm
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [items, search]);

  const pendingCount = items.length;

  const handleOpenDocs = (item: EligibleItem) => {
    const urls = item.docs.filter((doc) => isUrl(doc));
    urls.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
    if (urls.length) {
      addToast(`Opened ${urls.length} docs`, "success");
    } else {
      addToast("No valid document links found", "info");
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const submitMarkChecked = async (item: EligibleItem, files: File[]) => {
    if (!token) {
      return;
    }
    const key = itemKey(item);
    setBusyMap((prev) => ({ ...prev, [key]: true }));
    try {
      const payloadFiles: UploadFilePayload[] = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type || "application/octet-stream",
          data: await readFileAsDataUrl(file)
        }))
      );

      await markChecked(token, item.orderId, item.segmentIndex, item.rowIndex, payloadFiles);
      const nextItems = await loadItems();
      const stillPending = nextItems
        ? nextItems.some((next) => itemKey(next) === key)
        : true;

      if (stillPending) {
        addToast("Unable to confirm update. Please retry.", "error");
      } else {
        addToast("Marked as checked", "success");
      }
    } catch (error: any) {
      addToast(error?.message || "Unable to update approval", "error");
    } finally {
      setBusyMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleMarkChecked = (item: EligibleItem) => {
    if (!fileInputRef.current) {
      addToast("File attachment is required", "error");
      return;
    }
    setPendingItem(item);
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const item = pendingItem;
    setPendingItem(null);

    if (!item) {
      return;
    }
    if (!files.length) {
      addToast("Attachment is required to mark checked", "error");
      return;
    }

    await submitMarkChecked(item, files);
  };

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <div className="min-h-screen bg-hero-gradient pb-16">
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))}
      />

      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-10 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-brand-700">NTW approvals</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink-900">Dashboard</h1>
        </div>
        <div className="ghost-panel flex flex-col gap-2 px-5 py-4 text-sm md:items-end">
          <span className="text-ink-500">Signed in as</span>
          <span className="font-semibold text-ink-900">{email || "Loading..."}</span>
          <Button variant="ghost" className="mt-2 w-full md:w-auto" onClick={logout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto mt-8 w-full max-w-6xl px-6">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />
        <section className="grid gap-6 md:grid-cols-[1.2fr_2fr]">
          <div className="glass-card p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Pending Cards</p>
            <h2 className="mt-3 text-4xl font-semibold text-ink-900">{pendingCount}</h2>
            <p className="mt-2 text-sm text-ink-600">
              Approvals waiting for your review across all active order segments.
            </p>
          </div>
          <div className="glass-card p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Search</p>
            <div className="mt-4">
              <input
                className="input-shell"
                placeholder="Filter by dealer, CRM, location, order ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="mt-10">
          {loading ? (
            <div className="glass-card flex items-center justify-center p-10">
              <Loader label="Loading pending approvals" />
            </div>
          ) : filteredItems.length ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {filteredItems.map((item) => (
                <ApprovalCard
                  key={itemKey(item)}
                  item={item}
                  busy={Boolean(busyMap[itemKey(item)])}
                  onOpenDocs={handleOpenDocs}
                  onMarkChecked={handleMarkChecked}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
              <h3 className="text-xl font-semibold text-ink-900">All caught up</h3>
              <p className="text-sm text-ink-600">
                There are no pending segments requiring your approval right now.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
