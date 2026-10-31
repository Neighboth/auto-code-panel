"use client";

/**
 * Browser-side upload helper with real progress and cancellation.
 *
 * `fetch()` still cannot report upload progress in a portable way (the duplex
 * streams API is not available everywhere), so the settings screen uses
 * `XMLHttpRequest`: it exposes `upload.onprogress`, which is what turns the
 * "yükleniyor" label into a percentage.
 *
 * Cancelling aborts the request; the server never keeps a half-written file
 * because it writes to a staging directory first (see `lib/media.ts`).
 */

export type UploadProgress = { percent: number; loaded: number; total: number };

export type UploadResponse = {
  ok: boolean;
  path?: string;
  bytes?: number;
  originalBytes?: number;
  saved?: number;
  reason?: string;
  aborted?: boolean;
};

export function uploadWithProgress(
  file: File,
  options: {
    kind: "image" | "font";
    /** `logo` / `favicon` decide the maximum pixel size on the server. */
    variant?: "logo" | "favicon" | "image";
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
  },
): Promise<UploadResponse> {
  const form = new FormData();
  form.set("kind", options.kind);
  if (options.variant) form.set("variant", options.variant);
  form.set("file", file, file.name);

  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/store/upload");
    request.responseType = "json";

    const abort = () => request.abort();
    options.signal?.addEventListener("abort", abort, { once: true });

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.({
        percent: Math.min(99, Math.round((event.loaded / event.total) * 100)),
        loaded: event.loaded,
        total: event.total,
      });
    };

    request.onload = () => {
      options.signal?.removeEventListener("abort", abort);
      const payload = (request.response ?? {}) as UploadResponse;
      if (request.status >= 200 && request.status < 300 && payload.ok) {
        options.onProgress?.({ percent: 100, loaded: file.size, total: file.size });
        resolve({ ...payload, ok: true });
        return;
      }
      resolve({ ok: false, reason: payload.reason ?? "failed" });
    };

    request.onerror = () => {
      options.signal?.removeEventListener("abort", abort);
      resolve({ ok: false, reason: "network" });
    };

    request.onabort = () => {
      options.signal?.removeEventListener("abort", abort);
      resolve({ ok: false, reason: "aborted", aborted: true });
    };

    request.send(form);
  });
}

/**
 * Deletes an upload the owner did not save.
 *
 * `keepalive` lets the request survive a page navigation, which is exactly the
 * case this exists for (the user closes the settings tab mid-form).
 */
export function discardUpload(path: string): void {
  if (!path.startsWith("/media/")) return;
  try {
    void fetch(`/api/store/upload?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
      keepalive: true,
    });
  } catch {
    /* best effort */
  }
}

/** "3,4 MB → 41 KB" style summary for the upload toast. */
export function sizeLabel(bytes: number, locale = "tr"): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
