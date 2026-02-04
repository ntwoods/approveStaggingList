import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { listEligible, markChecked, returnToManager, UploadFilePayload } from "../api";
import ApprovalCard from "../components/ApprovalCard";
import ApprovalTable from "../components/ApprovalTable";
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
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const [pendingItem, setPendingItem] = useState<EligibleItem | null>(null);
  const [docsModal, setDocsModal] = useState<{
    open: boolean;
    item: EligibleItem | null;
    urls: string[];
  }>({ open: false, item: null, urls: [] });
  const [returnModal, setReturnModal] = useState<{
    open: boolean;
    item: EligibleItem | null;
    remark: string;
    submitting: boolean;
  }>({
    open: false,
    item: null,
    remark: "",
    submitting: false
  });
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
    if (!urls.length) {
      addToast("No valid document links found", "info");
      return;
    }

    if (urls.length === 1) {
      window.open(urls[0], "_blank", "noopener,noreferrer");
      addToast("Opened pending doc", "success");
      return;
    }

    setDocsModal({ open: true, item, urls });
  };

  const closeDocsModal = () => {
    setDocsModal({ open: false, item: null, urls: [] });
  };

  const openDocsModalUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openDocsModalAll = () => {
    docsModal.urls.forEach((url) => openDocsModalUrl(url));
    addToast(`Opened ${docsModal.urls.length} docs`, "success");
  };

  const refreshWithRetries = useCallback(
    (key: string) => {
      const run = async (delayMs: number, finalAttempt = false) => {
        window.setTimeout(async () => {
          const nextItems = await loadItems();
          if (!nextItems) {
            if (finalAttempt) {
              addToast("Submitted. Unable to refresh list right now — tap Refresh.", "info");
            }
            return;
          }

          const stillPending = nextItems.some((next) => itemKey(next) === key);
          if (finalAttempt && stillPending) {
            addToast("Submitted but not confirmed yet. Tap Refresh in a few seconds.", "info");
          }
        }, delayMs);
      };

      void run(1500, false);
      void run(3000, true);
    },
    [addToast, itemKey, loadItems]
  );

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
      addToast("Submitted successfully", "success");
      setItems((prev) => prev.filter((x) => itemKey(x) !== key));
      refreshWithRetries(key);
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

  const openReturnModal = (item: EligibleItem) => {
    setReturnModal({ open: true, item, remark: "", submitting: false });
  };

  const closeReturnModal = () => {
    setReturnModal({ open: false, item: null, remark: "", submitting: false });
  };

  const submitReturnToManager = async () => {
    if (!token) return;
    if (!returnModal.item) return;

    const item = returnModal.item;
    const remark = returnModal.remark.trim();

    if (remark.length < 5) {
      addToast("Remark must be at least 5 characters", "error");
      return;
    }

    const key = itemKey(item);
    setReturnModal((prev) => ({ ...prev, submitting: true }));
    setBusyMap((prev) => ({ ...prev, [key]: true }));

    try {
      await returnToManager(token, item.orderId, item.segmentIndex, remark, item.rowIndex);
      addToast("Returned to manager", "success");
      setItems((prev) => prev.filter((x) => itemKey(x) !== key));
      closeReturnModal();
      refreshWithRetries(key);
    } catch (error: any) {
      addToast(error?.message || "Unable to return to manager", "error");
      setReturnModal((prev) => ({ ...prev, submitting: false }));
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

      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-brand-700">
              NTW approvals
            </p>
            <h1 className="text-lg font-semibold text-ink-900 sm:text-xl">Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-xs text-ink-700 shadow-glow md:text-sm">
            <span className="hidden sm:inline text-ink-500">Signed in:</span>
            <span className="max-w-[220px] truncate font-semibold text-ink-900">
              {email || "Loading..."}
            </span>
            <Button variant="ghost" size="sm" className="!px-2" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-between gap-3 md:justify-start">
              <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-900">
                Pending: {pendingCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="!px-3"
                onClick={() => loadItems()}
                disabled={loading}
              >
                Refresh
              </Button>
              <div className="hidden items-center rounded-full border border-white/70 bg-white/60 p-1 md:flex">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    viewMode === "table" ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-brand-100"
                  }`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    viewMode === "cards" ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-brand-100"
                  }`}
                >
                  Cards
                </button>
              </div>
            </div>

            <div className="flex w-full items-center gap-3 md:w-auto">
              <div className="w-full md:w-[420px]">
                <input
                  className="input-shell-sm"
                  placeholder="Search dealer, CRM, location, order ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <span className="hidden text-xs text-ink-500 md:inline">
                {filteredItems.length}/{items.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />

        <section className="mt-4">
          {loading ? (
            <div className="glass-card flex items-center justify-center p-10">
              <Loader label="Loading pending approvals" />
            </div>
          ) : filteredItems.length ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
                {filteredItems.map((item) => (
                  <ApprovalCard
                    key={itemKey(item)}
                    item={item}
                    busy={busyMap[itemKey(item)]}
                    onOpenDocs={handleOpenDocs}
                    onMarkChecked={handleMarkChecked}
                    onReturnToManager={openReturnModal}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                {viewMode === "table" ? (
                  <ApprovalTable
                    items={filteredItems}
                    busyMap={busyMap}
                    getKey={itemKey}
                    onOpenDocs={handleOpenDocs}
                    onMarkChecked={handleMarkChecked}
                    onReturnToManager={openReturnModal}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredItems.map((item) => (
                      <ApprovalCard
                        key={itemKey(item)}
                        item={item}
                        busy={busyMap[itemKey(item)]}
                        onOpenDocs={handleOpenDocs}
                        onMarkChecked={handleMarkChecked}
                        onReturnToManager={openReturnModal}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
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

      {returnModal.open && returnModal.item ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="glass-card w-full max-w-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Return to Manager</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink-900">
                  {returnModal.item.orderId} — {returnModal.item.segmentLabel}
                </h2>
                <p className="mt-2 text-sm text-ink-600">
                  Add a remark for the manager. This is required.
                </p>
              </div>
              <Button variant="ghost" onClick={closeReturnModal} disabled={returnModal.submitting}>
                Close
              </Button>
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                Remark (min 5 chars)
              </label>
              <textarea
                className="input-shell mt-2 min-h-[120px] resize-y"
                value={returnModal.remark}
                onChange={(e) =>
                  setReturnModal((prev) => ({ ...prev, remark: e.target.value }))
                }
                placeholder="Explain what needs to be revised..."
                disabled={returnModal.submitting}
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={closeReturnModal}
                disabled={returnModal.submitting}
              >
                Cancel
              </Button>
              <Button onClick={submitReturnToManager} disabled={returnModal.submitting}>
                {returnModal.submitting ? "Sending..." : "Send Back"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {docsModal.open && docsModal.item ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="glass-card w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Pending Docs</p>
                <h2 className="mt-2 text-xl font-semibold text-ink-900">
                  {docsModal.item.orderId} — {docsModal.item.segmentLabel}
                </h2>
                <p className="mt-2 text-sm text-ink-600">
                  Choose a document to open. URLs are hidden for a cleaner view.
                </p>
              </div>
              <Button variant="ghost" onClick={closeDocsModal}>
                Close
              </Button>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-ink-900">
                  {docsModal.urls.length} link{docsModal.urls.length === 1 ? "" : "s"}
                </span>
                <Button variant="secondary" size="sm" onClick={openDocsModalAll}>
                  Open All
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {docsModal.urls.map((url, index) => (
                  <Button
                    key={`${url}-${index}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => openDocsModalUrl(url)}
                    className="justify-start"
                  >
                    Open Doc {index + 1}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
