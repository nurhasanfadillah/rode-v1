"use client";
import { useState } from "react";
import useSWR from "swr";
import { FileSpreadsheet, FileText, Printer, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { fetcher, qs } from "@/lib/client";
import { fmtNum, fmtPct } from "@/lib/format";
import { addDays, todayJakarta } from "@/lib/time";
import type { Report, Section } from "@/services/report";
import { EmptyState, ErrorState, PageHeader, Skel } from "../common";
import type { Meta } from "../input/InputPage";

type F = { from: string; to: string; departmentId?: string; lineId?: string; shiftId?: string; productId?: string };

export function ReportsPage() {
  const today = todayJakarta();
  const [f, setF] = useState<F>({ from: today, to: today });
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher, { revalidateOnFocus: false });
  const query = qs(f);
  const { data, error, mutate, isValidating } = useSWR<Report>(`/api/reports${query}`, fetcher, { keepPreviousData: true, revalidateOnFocus: false });
  const set = (k: keyof F, v: string) => setF((p) => ({ ...p, [k]: v || undefined }) as F);
  const resetFilters = () => setF({ from: today, to: today });
  const exportReport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      const response = await fetch(`/api/reports/export${qs({ ...f, format })}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Ekspor gagal (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `RODE_Laporan_${f.from}_${f.to}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Laporan ${format.toUpperCase()} berhasil diunduh`);
    } catch (err) {
      toast.error("Gagal mengekspor laporan", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setExporting(null);
    }
  };
  const activeFilters = [
    { key: "departmentId" as const, label: "Departemen", value: meta?.departments.find((x) => x.id === f.departmentId)?.name },
    { key: "lineId" as const, label: "Line", value: meta?.lines.find((x) => x.id === f.lineId)?.name },
    { key: "shiftId" as const, label: "Shift", value: meta?.shifts.find((x) => x.id === f.shiftId)?.name },
    { key: "productId" as const, label: "Produk", value: meta?.products.find((x) => x.id === f.productId)?.name },
  ].filter((x): x is typeof x & { value: string } => Boolean(x.value));
  const preset = (from: string, to = today) => setF((p) => ({ ...p, from, to }));
  const sel = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";
  const btn = "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold";

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Laporan" subtitle="Laporan harian (tanggal awal = akhir) atau rentang tanggal. Ekspor mengikuti filter yang dipilih."
          actions={<>
            <button type="button" onClick={() => exportReport("csv")} disabled={exporting !== null} aria-busy={exporting === "csv"} className={`${btn} border bg-white text-navy hover:bg-slate-50 disabled:opacity-60`} data-testid="export-csv-button"><FileText className="h-4 w-4" />{exporting === "csv" ? "Menyiapkan CSV…" : "CSV"}</button>
            <button type="button" onClick={() => exportReport("xlsx")} disabled={exporting !== null} aria-busy={exporting === "xlsx"} className={`${btn} bg-teal text-white hover:bg-teal-600 disabled:opacity-60`} data-testid="export-xlsx-button"><FileSpreadsheet className="h-4 w-4" />{exporting === "xlsx" ? "Menyiapkan Excel…" : "Excel"}</button>
            <button onClick={() => window.print()} disabled={!data} className={`${btn} bg-navy text-white hover:bg-navy-700 disabled:opacity-50`} data-testid="print-report-button"><Printer className="h-4 w-4" />Cetak / PDF</button>
          </>} />
        <div className="card-surface mb-5 space-y-3 p-3" data-testid="report-filters">
          <div className="flex flex-wrap gap-2 text-sm">
            {[["Hari ini", today, today], ["Kemarin", addDays(today, -1), addDays(today, -1)], ["7 hari", addDays(today, -6), today], ["30 hari", addDays(today, -29), today]].map(([l, a, b]) => (
              <button key={l} onClick={() => preset(a, b)} className={`rounded-full border px-3 py-1.5 ${f.from === a && f.to === b ? "border-navy bg-navy text-white" : "bg-white"}`} data-testid={`report-preset-${l.replace(" ", "-").toLowerCase()}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <input type="date" className={sel} value={f.from} max={f.to} onChange={(e) => set("from", e.target.value)} data-testid="report-filter-from" aria-label="Dari tanggal" />
            <input type="date" className={sel} value={f.to} min={f.from} max={today} onChange={(e) => set("to", e.target.value)} data-testid="report-filter-to" aria-label="Sampai tanggal" />
            <select className={sel} value={f.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value)} data-testid="report-filter-department">
              <option value="">Semua departemen</option>{meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={sel} value={f.lineId ?? ""} onChange={(e) => set("lineId", e.target.value)} data-testid="report-filter-line">
              <option value="">Semua line</option>{meta?.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select className={sel} value={f.shiftId ?? ""} onChange={(e) => set("shiftId", e.target.value)} data-testid="report-filter-shift">
              <option value="">Semua shift</option>{meta?.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={sel} value={f.productId ?? ""} onChange={(e) => set("productId", e.target.value)} data-testid="report-filter-product">
              <option value="">Semua produk</option>{meta?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {activeFilters.length > 0 && <div className="flex flex-wrap items-center gap-2" aria-label="Filter aktif">
            {activeFilters.map(({ key, label, value }) => <button key={key} type="button" onClick={() => set(key, "")} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-slate-100 px-3 text-xs text-slate-700 hover:bg-slate-200" aria-label={`Hapus filter ${label}: ${value}`}>
              {label}: {value}<X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>)}
            <button type="button" onClick={resetFilters} className="inline-flex min-h-9 items-center gap-1 px-2 text-xs font-semibold text-navy hover:underline"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reset filter</button>
          </div>}
        </div>
      </div>
      {error && !data ? <ErrorState message={error.message} onRetry={() => mutate()} /> : !data ? <Skel className="h-96" /> : (
        <div className={`space-y-5 transition-opacity ${isValidating ? "opacity-60" : ""}`} data-testid="report-document">
          {isValidating && <p className="sr-only" role="status" aria-live="polite">Memperbarui laporan…</p>}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Ringkasan laporan" data-testid="report-summary">
            <SummaryCard label={`Aktual ${data.summary.department}`} value={`${fmtNum(data.summary.actual)} pcs`} />
            <SummaryCard label={data.summary.productFiltered ? "Target harian (semua produk)" : `Target ${data.summary.department}`} value={data.summary.target == null ? "—" : `${fmtNum(data.summary.target)} pcs`} />
            <SummaryCard label="Capaian" value={data.summary.pct == null ? "Tidak ditampilkan" : fmtPct(data.summary.pct)} />
          </section>
          {data.summary.productFiltered && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Filter produk membatasi angka aktual, sedangkan target tetap target total harian. Persentase capaian disembunyikan agar perbandingannya tidak menyesatkan.</p>}
          <div className="card-surface p-5 print:border-0 print:p-0 print:shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label-xs">RODE · Redone Output Data Entry</div>
                <h2 className="mt-1 text-2xl font-bold text-navy" data-testid="report-title">{data.title}</h2>
              </div>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-teal font-display text-2xl font-black text-white" title="[LOGO PT REDONE BERKAH MANDIRI]">R</div>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="report-meta">
              {data.meta.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
          </div>
          <p className="text-xs text-slate-500">Total aktual lintas departemen menghitung tahapan proses yang berbeda; angka ini bukan jumlah produksi unik.</p>
          {data.sections.map((s) => <SectionTable key={s.key} s={s} />)}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="card-surface p-4 print:break-inside-avoid print:shadow-none"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-navy">{value}</p></div>;
}

function SectionTable({ s }: { s: Section }) {
  const isPct = (c: string) => c.includes("(%)");
  return (
    <section className="card-surface overflow-x-auto p-4 print:break-inside-auto print:border-0 print:p-0 print:shadow-none" data-testid={`report-section-${s.key}`}>
      <h3 className="mb-2 font-semibold text-slate-900">{s.title}</h3>
      {s.rows.length === 0 ? <EmptyState title="Tidak ada data untuk filter ini" testId={`report-empty-${s.key}`} /> : (
        <table className="w-full min-w-[520px] text-sm print:min-w-0 print:text-[11px]">
          <thead className="border-b text-left text-xs uppercase text-slate-500 print:table-header-group"><tr>{s.columns.map((c) => <th key={c} scope="col" className="px-2 py-2">{c}</th>)}</tr></thead>
          <tbody className="divide-y">
            {s.rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => (
                <td key={j} className={`px-2 py-1.5 ${typeof v === "number" ? "num text-right" : ""}`}>
                  {v == null ? "–" : typeof v === "number" ? (isPct(s.columns[j]) ? fmtPct(v) : fmtNum(v)) : v}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      )}
      {s.note && <p className="mt-2 text-xs text-slate-500">Catatan: {s.note}</p>}
    </section>
  );
}
