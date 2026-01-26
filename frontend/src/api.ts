export type JsonpResponse = {
  ok: boolean;
  error?: string;
  email?: string;
  items?: unknown[];
  updatedApprovals?: string;
};

export type UploadFilePayload = {
  name: string;
  type: string;
  data: string;
};

const API_URL = import.meta.env.VITE_GAS_WEBAPP_URL as string | undefined;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Missing VITE_GAS_WEBAPP_URL");
  }
  return API_URL;
}

export function jsonp(
  url: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = 15000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = `__jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query.append(key, String(value));
      }
    });
    query.append("callback", callbackName);

    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}${query.toString()}`;

    let done = false;
    const cleanup = () => {
      if (done) {
        return;
      }
      done = true;
      delete (window as any)[callbackName];
      script.remove();
      clearTimeout(timeout);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP request timed out"));
    }, timeoutMs);

    (window as any)[callbackName] = (data: any) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    document.body.appendChild(script);
  });
}

export async function listEligible(idToken: string) {
  const url = ensureApiUrl();
  const result = (await jsonp(url, {
    action: "listEligible",
    id_token: idToken
  })) as JsonpResponse;

  if (!result?.ok) {
    throw new Error(result?.error || "Failed to load eligible approvals");
  }
  return result;
}

export async function markChecked(
  idToken: string,
  orderId: string,
  segmentIndex: number,
  rowIndex?: number,
  files: UploadFilePayload[] = []
) {
  const url = ensureApiUrl();
  const payload = {
    action: "markChecked",
    id_token: idToken,
    orderId,
    segmentIndex,
    rowIndex,
    files
  };

  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify(payload)
  });

  return { ok: true };
}
