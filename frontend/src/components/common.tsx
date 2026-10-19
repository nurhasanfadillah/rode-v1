"use client";
import { AlertTriangle, CheckCircle2, Clock, Coffee, Inbox, Minus, RefreshCw, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-navy sm:text-3xl" data-testid="page-title">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({ label, value, sub, accent, testId, onClick, icon }: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: string; testId: string; onClick?: () => void; icon?: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} data-testid={testId}
      className={cn("card-surface group relative overflow-hidden p-4 text-left transition-[transform,box-shadow] sm:p-5", onClick && "hover:-translate-y-0.5 hover:shadow-md")}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent ?? "#0A2463" }} />
      <div className="flex items-center justify-between"><span className="label-xs">{label}</span>{icon}</div>
      <div className="num mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl" data-testid={`${testId}-value`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </button>
  );
}

export function EmptyState({ title, hint, testId = "empty-state" }: { title: string; hint?: string; testId?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center" data-testid={testId}>
      <Inbox className="h-8 w-8 text-slate-400" />
      <div className="font-semibold text-slate-700">{title}</div>
      {hint && <div className="max-w-sm text-sm text-slate-500">{hint}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert" data-testid="error-state">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Gagal memuat data</div>
      <div>{message}</div>
      <div className="text-xs text-red-700">Periksa koneksi internet Anda. Jika masalah berlanjut, hubungi admin.</div>
      {onRetry && <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-white" data-testid="error-retry-button"><RefreshCw className="h-3.5 w-3.5" /> Coba lagi</button>}
    </div>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

export const STATE_META = {
  upcoming: { label: "Belum dimulai", icon: Clock, light: "bg-slate-100 text-slate-600 border-slate-200", tv: "bg-slate-800 text-slate-300 border-slate-700" },
  empty: { label: "Kosong", icon: AlertTriangle, light: "bg-red-500 text-white border-red-600", tv: "bg-red-600 text-white border-red-500" },
  partial: { label: "Di bawah target", icon: TrendingDown, light: "bg-amber-400 text-slate-900 border-amber-500", tv: "bg-amber-500 text-amber-950 border-amber-400" },
  met: { label: "Target tercapai", icon: CheckCircle2, light: "bg-emerald-500 text-white border-emerald-600", tv: "bg-emerald-500 text-white border-emerald-400" },
  neutral: { label: "Ada hasil (tanpa target)", icon: Minus, light: "bg-sky-100 text-sky-800 border-sky-200", tv: "bg-sky-900 text-sky-100 border-sky-700" },
} as const;

export const ACTIVITY_META: Record<string, { label: string; cls: string; tv: string }> = {
  active: { label: "Aktif", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", tv: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  idle: { label: "Tanpa input", cls: "bg-red-50 text-red-700 border-red-200", tv: "bg-red-500/20 text-red-300 border-red-500/50" },
  break: { label: "Istirahat", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", tv: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40" },
  before: { label: "Belum mulai", cls: "bg-slate-100 text-slate-600 border-slate-200", tv: "bg-slate-700/40 text-slate-300 border-slate-600" },
  done: { label: "Shift selesai", cls: "bg-slate-100 text-slate-600 border-slate-200", tv: "bg-slate-700/40 text-slate-300 border-slate-600" },
  off: { label: "Libur / di luar jadwal", cls: "bg-slate-100 text-slate-600 border-slate-200", tv: "bg-slate-700/40 text-slate-300 border-slate-600" },
};

export function ActivityBadge({ activity, tv = false, testId }: { activity: string | null; tv?: boolean; testId?: string }) {
  if (!activity) return null;
  const m = ACTIVITY_META[activity] ?? ACTIVITY_META.off;
  const Icon = activity === "break" ? Coffee : activity === "idle" ? AlertTriangle : activity === "active" ? CheckCircle2 : Clock;
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", tv ? m.tv : m.cls)}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const cls = status === "cancelled" ? "bg-red-50 text-red-700 border-red-200 line-through" : status === "corrected" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const label = status === "cancelled" ? "Dibatalkan" : status === "corrected" ? "Dikoreksi" : "Aktif";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)} data-testid="tx-status-pill">{label}</span>;
}

export function DemoTag() {
  return <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800" title="Data demo — hapus sebelum go-live">Demo</span>;
}

export function Progress({ value, tv = false }: { value: number | null; tv?: boolean }) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  const color = value == null ? "bg-slate-400" : v >= 100 ? "bg-emerald-500" : v >= 70 ? "bg-teal" : "bg-amber-500";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full", tv ? "bg-slate-800" : "bg-slate-100")}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export const n = fmtNum;
