"use client";
import { useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetcher, qs } from "@/lib/client";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Skel } from "../common";

type Item = { id: string; action: string; entity: string; entityId: string | null; details: unknown; ip: string | null; createdAt: string; userName: string | null; username: string | null };

export function AuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, mutate } = useSWR<{ items: Item[]; total: number; pageSize: number }>(`/api/admin/audit${qs({ action, page })}`, fetcher, { keepPreviousData: true });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Login, koreksi, pembatalan, dan perubahan konfigurasi." />
      <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="mb-3 h-10 rounded-lg border bg-white px-2 text-sm" data-testid="audit-action-filter">
        <option value="">Semua aksi</option>
        {["auth.", "transaction.", "settings.", "schedule.", "target.", "users.", "products.", "lines.", "departments.", "display."].map((a) => <option key={a} value={a}>{a.replace(".", "")}</option>)}
      </select>
      {error ? <ErrorState message={error.message} onRetry={() => mutate()} /> : !data ? <Skel className="h-64" /> : data.items.length === 0 ? <EmptyState title="Belum ada log" /> : (
        <div className="card-surface divide-y" data-testid="audit-list">
          {data.items.map((i) => (
            <div key={i.id} className="px-4 py-2.5 text-sm">
              <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === i.id ? null : i.id)} data-testid={`audit-item-${i.id}`}>
                <span><span className="num rounded bg-navy-50 px-1.5 py-0.5 text-xs font-semibold text-navy">{i.action}</span> <span className="ml-1">{i.userName ?? "—"}</span> <span className="text-xs text-slate-400">{i.entity}</span></span>
                <span className="num text-xs text-slate-500">{fmtDateTime(i.createdAt)} · {i.ip ?? "-"}</span>
              </button>
              {open === i.id && <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify(i.details, null, 2)}</pre>}
            </div>
          ))}
        </div>
      )}
      {data && <div className="mt-3 flex items-center justify-between text-sm"><span className="text-slate-500">{fmtNum(data.total)} entri</span>
        <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border bg-white p-2 disabled:opacity-40" data-testid="audit-prev"><ChevronLeft className="h-4 w-4" /></button>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border bg-white p-2 disabled:opacity-40" data-testid="audit-next"><ChevronRight className="h-4 w-4" /></button></div></div>}
    </div>
  );
}
