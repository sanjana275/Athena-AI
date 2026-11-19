export const PRODUCTION_API = "https://athena-ai-q7cf.onrender.com";

export const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? PRODUCTION_API
    : (process.env.NODE_ENV === "production" ? PRODUCTION_API : "/api"));

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("athena_token");
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("athena_token", token);
  } else {
    localStorage.removeItem("athena_token");
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail) && j.detail[0]?.msg) {
      const field = j.detail[0].loc?.slice(-1)[0];
      return `${field ? field + ": " : ""}${j.detail[0].msg}`;
    }
  } catch {}
  return res.status >= 500 ? "Server error. Try again in a moment." : res.statusText || "Request failed";
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = getAuthToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  let res: Response;
  try {
    res = await fetch(API + path, {
      credentials: "include",
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...authHeaders,
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(
      0,
      "Can't reach the server. The free backend may be waking up (takes ~30s), please wait a moment and try again."
    );
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Upload with progress (fetch can't report upload progress). */
export function uploadFile<T>(path: string, file: File, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = getAuthToken();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API + path);
    xhr.withCredentials = true;
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new ApiError(0, "Upload failed. Check your connection."));
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, typeof body?.detail === "string" ? body.detail : "Upload failed."));
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
