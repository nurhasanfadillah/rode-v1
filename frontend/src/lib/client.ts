"use client";
import { useEffect, useState } from "react";

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/display") && !url.startsWith("/api/auth/login")) {
    window.location.href = "/login?expired=1";
  }
  if (!r.ok) throw new ApiClientError(data.error ?? `Permintaan gagal (${r.status})`, r.status, data.code);
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

/** Retries network/5xx failures with the SAME body (idempotency key) so duplicates never double-count. */
export async function postWithRetry<T>(url: string, body: unknown, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await api<T>(url, { method: "POST", body });
    } catch (e) {
      lastErr = e;
      const retriable = !(e instanceof ApiClientError) || e.status >= 500;
      if (!retriable || i === retries) throw e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw lastErr;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function qs(obj: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "" && v !== "all") p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : "";
}
