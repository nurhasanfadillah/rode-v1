"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Info, RefreshCw } from "lucide-react";
import { fetcher, qs } from "@/lib/client";
import { fmtDate, fmtNum, fmtPct, fmtTime } from "@/lib/format";
import type { Dashboard } from "@/services/aggregate";
import { BlockGrid } from "../BlockGrid";
import { ActivityBadge, DemoTag, EmptyState, ErrorState, KpiCard, PageHeader, Progress, Skel } from "../common";
import type { Meta } from "../input/InputPage";
import { BlockChart, DailyTrend, DeptChart, HourlyChart, LineChart } from "./Charts";

type F = { from?: string; to?: string; departmentId?: string; lineId?: string; shiftId?: string; productId?: string; operatorId?: string };
const DEPT_COLOR: Record<string, string> = { PRINTING: "#3CAEA3", SEWING: "#0A2463", PACKING: "#F59E0B" };
export const deptColor = (code: string, i = 0) => DEPT_COLOR[code] ?? ["#6366F1", "#EC4899", "#14B8A6"][i % 3];

export function DashboardPage() {
  const router = useRouter();
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher, { revalidateOnFocus: false });
  const [f, setF] = useState<F>({});
  const refresh = (meta?.settings.dashboardRefreshSec ?? 10) * 1000;
  const { data, error, mutate, isValidating } = useSWR<Dashboard>(`/api/dashboard${qs(f)}`, fetcher, { refreshInterval: refresh, keepPreviousData: true });
  const set = (k: keyof F, v: string) => setF((p) => ({ ...p, [k]: v || undefined }));
  const drill = (extra: Record<string, string | undefined> = {}) => {
    const range = data ? { from: data.filters.from, to: data.filters.to } : {};
    router.push(`/history${qs({ ...range, ...f, ...extra, status: "valid" })}`);
  };
  const sel = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Dashboard Produksi"
        subtitle={data ? <span data-testid="dashboard-range">{data.filters.from === data.filters.to ? fmtDate(data.filters.to) : `${fmtDate(data.filters.from)} – ${fmtDate(data.filters.to)}`} · WIB</span> : "Memuat…"}
        actions={
          <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs text-slate-600" data-testid="dashboard-last-update">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "bg-emerald-500"} ${isValidating ? "animate-pulse" : ""}`} />
            {error ? "Koneksi terganggu — mencoba ulang" : data ? <>Data server {fmtTime(data.serverTime)} · transaksi terakhir {data.lastUpdated ? fmtTime(data.lastUpdated) : "—"}</> : "…"}
            <button onClick={() => mutate()} aria-label="Muat ulang" data-testid="dashboard-refresh-button"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
        }
      />
      <div className="card-surface mb-5 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="dashboard-filters">
        <input type="date" className={sel} value={f.from ?? ""} onChange={(e) => set("from", e.target.value)} data-testid="dash-filter-from" aria-label="Dari" />
        <input type="date" className={sel} value={f.to ?? ""} onChange={(e) => set("to", e.target.value)} data-testid="dash-filter-to" aria-label="Sampai" />
        <select className={sel} value={f.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value)} data-testid="dash-filter-department">
          <option value="">Semua departemen</option>{meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className={sel} value={f.lineId ?? ""} onChange={(e) => set("lineId", e.target.value)} data-testid="dash-filter-line">
          <option value="">Semua line</option>{meta?.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className={sel} value={f.shiftId ?? ""} onChange={(e) => set("shiftId", e.target.value)} data-testid="dash-filter-shift">
          <option value="">Semua shift</option>{meta?.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={sel} value={f.productId ?? ""} onChange={(e) => set("productId", e.target.value)} data-testid="dash-filter-product">
          <option value="">Semua produk</option>{meta?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={sel} value={f.operatorId ?? ""} onChange={(e) => set("operatorId", e.target.value)} data-testid="dash-filter-operator">
          <option value="">Semua operator</option>{meta?.operators.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
        </select>
      </div>
      {error && !data ? <ErrorState message={error.message} onRetry={() => mutate()} /> : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skel key={i} className="h-28" />)}</div>
      ) : <DashboardBody d={data} drill={drill} />}
    </div>
  );
}

function DashboardBody({ d, drill }: { d: Dashboard; drill: (x?: Record<string, string | undefined>) => void }) {
  const single = d.filters.from === d.filters.to;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.departments.map((dp, i) => (
          <KpiCard key={dp.id} testId={`kpi-${dp.code.toLowerCase()}`} label={`${dp.name}${single ? " hari ini" : ""}`} value={fmtNum(dp.actual)} accent={deptColor(dp.code, i)}
            sub={<>Target {fmtNum(dp.target)} · <b>{fmtPct(dp.pct)}</b></>} onClick={() => drill({ departmentId: dp.id })} />
        ))}
        <KpiCard testId="kpi-achievement" label={`Capaian target (${d.metric?.name ?? "-"})`} value={fmtPct(d.metric?.pct)} accent="#10B981"
          sub={<>{fmtNum(d.metric?.actual)} / {fmtNum(d.metric?.target)} pcs</>} />
        <KpiCard testId="kpi-target" label="Target produksi" value={fmtNum(d.metric?.target)} sub={`Metrik: ${d.metric?.name ?? "-"} (barang jadi)`} />
        <KpiCard testId="kpi-active-lines" label="Line aktif / berproduksi" value={`${d.linesProducing}/${d.linesTotal}`} sub={d.idleLines.length ? `${d.idleLines.length} line tanpa input` : "Semua line normal"} accent="#3CAEA3" />
        <KpiCard testId="kpi-top-product" label="Produk tertinggi" value={<span className="font-display text-xl sm:text-2xl">{d.topProduct?.name ?? "—"}</span>}
          sub={d.topProduct ? `${fmtNum(d.topProduct.qty)} pcs · ${d.topProduct.departmentName}` : "Belum ada data"} />
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900" data-testid="metric-definition">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Output tiap departemen adalah tahap proses berbeda dan <b>tidak dijumlahkan</b> sebagai produksi unik (produk yang sama dapat terhitung di beberapa tahap). Capaian target utama memakai departemen <b>{d.metric?.name}</b> (dapat diubah di Pengaturan). Transaksi dibatalkan tidak dihitung. Filter produk/operator tidak mengubah target.</span>
      </div>
      {d.idleLines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="idle-lines-alert">
          <AlertTriangle className="h-4 w-4" /><b>Line tanpa input &gt; {d.settings.idleThresholdMin} menit:</b>
          {d.idleLines.map((l) => <span key={l.id} className="rounded-full bg-white px-2 py-0.5 font-semibold">{l.name}</span>)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-4"><h3 className="mb-3 font-semibold">Produksi Sewing per {single ? "blok" : "jam"}</h3>{single && d.blockSeries.length ? <BlockChart data={d.blockSeries} lines={d.lines.filter((l) => l.blocks.length).map((l) => l.code)} /> : <HourlyChart data={d.hourly} depts={d.departments.filter((x) => x.kind === "line_block")} />}</section>
        <section className="card-surface p-4"><h3 className="mb-3 font-semibold">Target vs aktual per departemen</h3><DeptChart data={d.departments} /></section>
        <section className="card-surface p-4"><h3 className="mb-3 font-semibold">Perbandingan line Sewing</h3>{d.lines.length ? <LineChart data={d.lines} /> : <EmptyState title="Tidak ada line" />}</section>
        <section className="card-surface p-4"><h3 className="mb-3 font-semibold">Tren produksi harian</h3><DailyTrend data={d.daily} depts={d.departments} /></section>
      </div>
      <LineTable d={d} drill={drill} />
      <ProductTable d={d} drill={drill} />
    </div>
  );
}

function LineTable({ d, drill }: { d: Dashboard; drill: (x?: Record<string, string | undefined>) => void }) {
  if (!d.lines.length) return null;
  const ranked = [...d.lines].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  return (
    <section className="card-surface p-4" data-testid="line-ranking">
      <div className="mb-3 flex items-end justify-between"><h3 className="font-semibold">Line Sewing — peringkat capaian target</h3><span className="text-xs text-slate-500">Bandingkan dengan konteks target, jadwal & produk.</span></div>
      <div className="space-y-3">
        {ranked.map((l, i) => (
          <div key={l.id} className="rounded-lg border p-3" data-testid={`line-row-${l.code}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="flex items-center gap-2 font-semibold text-navy hover:underline" onClick={() => drill({ lineId: l.id })}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs text-white ${i === 0 ? "bg-emerald-500" : i === ranked.length - 1 && ranked.length > 1 ? "bg-red-500" : "bg-slate-400"}`}>{i + 1}</span>{l.name}
              </button>
              <div className="flex items-center gap-3 text-sm">
                <ActivityBadge activity={l.activity} />
                <span className="num font-bold">{fmtNum(l.actual)}</span><span className="text-slate-500">/ {fmtNum(l.target)}</span><b className="num">{fmtPct(l.pct)}</b>
              </div>
            </div>
            <div className="my-2"><Progress value={l.pct} /></div>
            <div className="text-xs text-slate-500">Produk: {l.products.map((p) => `${p.name} (${fmtNum(p.qty)})`).join(", ") || "—"}</div>
            {l.blocks.length > 0 && <div className="mt-2"><BlockGrid blocks={l.blocks} compact testId={`dash-grid-${l.code}`} /></div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductTable({ d, drill }: { d: Dashboard; drill: (x?: Record<string, string | undefined>) => void }) {
  return (
    <section className="card-surface overflow-x-auto p-4">
      <h3 className="mb-3 font-semibold">Hasil per produk</h3>
      {d.products.length === 0 ? <EmptyState title="Belum ada hasil produksi" hint="Data akan muncul otomatis setelah operator mencatat." /> : (
        <table className="w-full min-w-[520px] text-sm" data-testid="product-table">
          <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Produk</th>{d.departments.map((x) => <th key={x.id} className="py-2 text-right">{x.name}</th>)}</tr></thead>
          <tbody className="divide-y">
            {d.products.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => drill({ productId: p.id })} data-testid={`product-row-${p.code}`}>
                <td className="py-2 font-medium">{p.name}{p.isDemo && <DemoTag />} <span className="num text-xs text-slate-400">{p.code}</span></td>
                {d.departments.map((x) => <td key={x.id} className="num py-2 text-right">{fmtNum(p.byDept[x.id] ?? 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
