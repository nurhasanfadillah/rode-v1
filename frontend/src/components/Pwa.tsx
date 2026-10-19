"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const listeners = new Set<() => void>();

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const h = (e: Event) => { e.preventDefault(); deferred = e as BIP; listeners.forEach((l) => l()); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return null;
}

export function InstallButton() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!deferred) return <p className="text-xs text-slate-500" data-testid="install-hint">Untuk memasang aplikasi, gunakan menu browser &rarr; &quot;Tambahkan ke layar utama&quot;.</p>;
  return (
    <button
      data-testid="install-app-button"
      onClick={async () => { await deferred?.prompt(); deferred = null; force((n) => n + 1); }}
      className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600"
    >
      <Download className="h-4 w-4" /> Pasang Aplikasi RODE
    </button>
  );
}
