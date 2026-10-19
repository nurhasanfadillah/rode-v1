"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { fetcher, qs } from "@/lib/client";
import { fmtDate, fmtNum, fmtTime } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { DemoTag, EmptyState, ErrorState, PageHeader, Skel, StatusPill } from "../common";
import type { Meta } from "../input/InputPage";
import { TxDialog } from "./TxDialog";

export interface TxRow {
  id: string; workDate: string; recordedAt: string; quantity: number; originalQuantity: number; status: string; blockNo: number | null;
  inputMode: string; notes: string | null; version: number; isDemo: boolean; departmentName: string; lineName: string | null;
  productName: string; productCode: string; operatorName: string; canCorrect: boolean;
}

const KEYS = ["from", "to", "departmentId", "lineId", "productId", "operatorId", "status", "shiftId", "blockNo"] as const;
type F = Partial<Record<(typeof KEYS)[number], string>>;

export function HistoryPage({ user }: { user: SessionUser }) {
  const sp = useSearchParams();
  const initial: F = {};
  KEYS.forEach((k) => { const v = sp.get(k); if (v) initial[k] = v; });
  const [f, setF] = useState<F>(initial);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher, { revalidateOnFocus: false });
  const { data, error, mutate, isLoading } = useSWR<{ items: TxRow[]; total: number; pageSize: number }>(
    `/api/transactions${qs({ ...f, page, pageSize: 20 })}`, fetcher, { refreshInterval: 15000, keepPreviousData: true });
  const set = (k: keyof F, v: string) => { setF((p) => ({ ...p, [k]: v || undefined })); setPage(1); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const isOp = user.role === "operator";
  const sel = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

  return (
    <div>
      <PageHeader title="Riwayat Transaksi" subtitle={isOp ? "Riwayat input milik Anda." : "Telusuri transaksi sumber di balik setiap angka."} />
      <div className="card-surface mb-4 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="history-filters">
        <input type="date" className={sel} value={f.from ?? ""} onChange={(e) => set("from", e.target.value)} data-testid="filter-from" aria-label="Dari tanggal" />
        <input type="date" className={sel} value={f.to ?? ""} onChange={(e) => set("to", e.target.value)} data-testid="filter-to" aria-label="Sampai tanggal" />
        {!isOp && (
          <select className={sel} value={f.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value)} data-testid="filter-department">
            <option value="">Semua departemen</option>
            {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {!isOp && (
          <select className={sel} value={f.lineId ?? ""} onChange={(e) => set("lineId", e.target.value)} data-testid="filter-line">
            <option value="">Semua line</option>
            {meta?.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <select className={sel} value={f.productId ?? ""} onChange={(e) => set("productId", e.target.value)} data-testid="filter-product">
          <option value="">Semua produk</option>
          {meta?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!isOp && (
          <select className={sel} value={f.operatorId ?? ""} onChange={(e) => set("operatorId", e.target.value)} data-testid="filter-operator">
            <option value="">Semua operator</option>
            {meta?.operators.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
          </select>
        )}
        <select className={sel} value={f.status ?? ""} onChange={(e) => set("status", e.target.value)} data-testid="filter-status">
          <option value="">Semua status</option><option value="valid">Valid (aktif + dikoreksi)</option>
          <option value="active">Aktif</option><option value="corrected">Dikoreksi</option><option value="cancelled">Dibatalkan</option>
        </select>
      </div>
      {f.blockNo && <div className="mb-3 text-sm text-slate-600">Filter blok: <b>B{f.blockNo}</b> <button className="ml-2 text-teal-600 underline" onClick={() => set("blockNo", "")}>hapus</button></div>}

      {error && !data ? <ErrorState message={error.message} onRetry={() => mutate()} /> : !data || isLoading && !data ? <Skel className="h-64" /> : data.items.length === 0 ? (
        <EmptyState title="Tidak ada transaksi" hint="Ubah filter tanggal atau produk untuk melihat data lain." />
      ) : (
        <>
          <div className="space-y-2 md:hidden" data-testid="history-cards">
            {data.items.map((t) => (
              <button key={t.id} onClick={() => setOpenId(t.id)} className="card-surface flex w-full items-center justify-between p-3 text-left" data-testid={`history-card-${t.id}`}>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{t.productName}{t.isDemo && <DemoTag />}</div>
                  <div className="text-xs text-slate-500">{t.departmentName}{t.lineName ? ` · ${t.lineName}` : ""}{t.blockNo ? ` · B${t.blockNo}` : ""} · {fmtDate(t.workDate)} {fmtTime(t.recordedAt, false)}</div>
                </div>
                <div className="flex flex-col items-end gap-1"><span className="num text-lg font-bold">{fmtNum(t.quantity)}</span><StatusPill status={t.status} /></div>
              </button>
            ))}
          </div>
          <div className="card-surface hidden overflow-x-auto md:block">
            <table className="w-full text-sm" data-testid="history-table">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{["Waktu", "Tgl kerja", "Departemen", "Line/Blok", "Produk", "Operator", "Qty", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50" data-testid={`history-row-${t.id}`}>
                    <td className="num px-3 py-2">{fmtTime(t.recordedAt)}</td>
                    <td className="px-3 py-2">{fmtDate(t.workDate)}</td>
                    <td className="px-3 py-2">{t.departmentName}</td>
                    <td className="px-3 py-2">{t.lineName ? `${t.lineName} · B${t.blockNo}` : "—"}</td>
                    <td className="px-3 py-2 font-medium">{t.productName}{t.isDemo && <DemoTag />}</td>
                    <td className="px-3 py-2">{t.operatorName}</td>
                    <td className="num px-3 py-2 font-bold">{fmtNum(t.quantity)}{t.quantity !== t.originalQuantity && <span className="ml-1 text-xs text-slate-400 line-through">{t.originalQuantity}</span>}</td>
                    <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                    <td className="px-3 py-2"><button onClick={() => setOpenId(t.id)} className="rounded-md p-1.5 text-navy hover:bg-navy-50" data-testid={`history-detail-button-${t.id}`} aria-label="Detail"><Eye className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm" data-testid="history-pagination">
            <span className="text-slate-500">{fmtNum(data.total)} transaksi · hal. {page}/{pages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-white p-2 disabled:opacity-40" data-testid="history-prev-page"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-white p-2 disabled:opacity-40" data-testid="history-next-page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}
      <TxDialog id={openId} onClose={() => setOpenId(null)} onChanged={() => mutate()} />
    </div>
  );
}
