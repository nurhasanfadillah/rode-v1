"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Maximize, Trophy, Wifi, WifiOff } from "lucide-react";
import { fetcher } from "@/lib/client";
import { fmtDate, fmtNum, fmtPct, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BlockGrid, type GridBlock } from "../BlockGrid";
import { ActivityBadge, Progress } from "../common";
import { BlockChart } from "../dashboard/Charts";

type Line = { id: string; code: string; name: string; actual: number; target: number | null; pct: number | null; blockTarget: number | null; blocks: GridBlock[]; lastBlock: { no: number; qty: number } | null; activity: string | null; currentProduct: string | null };
type Dept = { id: string; code: string; name: string; kind: string; actual: number; target: number | null; pct: number | null; topProduct: { name: string; qty: number } | null };
type Board = {
  display: { name: string; mode: string; rotateSeconds: number }; serverTime: string; lastUpdated: string | null; refreshSec: number;
  departments: Dept[]; metric: { name: string; actual: number; target: number | null; pct: number | null } | null; topProduct: { name: string; qty: number; departmentName: string } | null;
  schedule: { status: string; shiftName?: string; start?: string; end?: string; currentBlock?: number | null; breaks?: { start: string; end: string; label: string }[] };
  lines: Line[]; blockSeries: Record<string, string | number>[]; linesProducing: number; linesTotal: number;
};
const STATUS: Record<string, [string, string]> = {
  running: ["PRODUKSI BERJALAN", "bg-emerald-500"], break: ["ISTIRAHAT", "bg-indigo-500"], before: ["BELUM MULAI", "bg-slate-500"],
  done: ["SHIFT SELESAI", "bg-slate-500"], off: ["HARI LIBUR / DI LUAR JADWAL", "bg-slate-600"], history: ["DATA HISTORIS", "bg-slate-600"],
};

export function DisplayBoard({ token }: { token: string }) {
  const [refresh, setRefresh] = useState(10);
  const { data, error } = useSWR<Board>(token ? `/api/display?token=${encodeURIComponent(token)}` : null, fetcher, {
    refreshInterval: refresh * 1000, refreshWhenHidden: true, errorRetryInterval: 5000, errorRetryCount: Infinity as unknown as number, keepPreviousData: true,
  });
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState<Date | null>(null);
  const [panel, setPanel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (data) { setRefresh(data.refreshSec); setOffset(new Date(data.serverTime).getTime() - Date.now()); } }, [data]);
  useEffect(() => { const t = setInterval(() => setNow(new Date(Date.now() + offset)), 1000); return () => clearInterval(t); }, [offset]);
  const mode = data?.display.mode ?? "all";
  useEffect(() => {
    if (mode !== "rotate") return;
    const t = setInterval(() => setPanel((p) => (p + 1) % 2), (data?.display.rotateSeconds ?? 20) * 1000);
    return () => clearInterval(t);
  }, [mode, data?.display.rotateSeconds]);

  if (!token) return <Fatal msg="Token display tidak ada. Minta Super Admin membuat link Smart TV di menu Pengaturan." />;
  if (error && !data) return <Fatal msg={`${error.message} Layar akan mencoba tersambung ulang otomatis.`} />;
  if (!data) return <div className="grid h-screen place-items-center bg-tv-bg text-2xl text-slate-400">Menghubungkan ke server…</div>;

  const online = !error;
  const [stLabel, stColor] = STATUS[data.schedule.status] ?? STATUS.off;
  const showSewing = mode === "all" || mode === "sewing" || mode === "line" || (mode === "rotate" && panel === 0);
  const showPP = mode === "all" || mode === "print_pack" || (mode === "rotate" && panel === 1);
  const kpiDepts = mode === "sewing" || mode === "line" ? data.departments.filter((d) => d.kind === "line_block") : mode === "print_pack" ? data.departments.filter((d) => d.kind !== "line_block") : data.departments;

  return (
    <div ref={ref} className="flex h-screen flex-col gap-4 overflow-hidden bg-tv-bg p-5 text-white cursor-default" data-testid="display-board">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-teal font-display text-3xl font-black" data-testid="display-logo" title="[LOGO PT REDONE BERKAH MANDIRI]">R</div>
          <div><div className="font-display text-2xl font-bold">RODE · Live Production Board</div><div className="text-sm text-slate-400">PT REDONE BERKAH MANDIRI · {data.display.name}</div></div>
        </div>
        <div className="flex items-center gap-4">
          <span className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold", stColor)} data-testid="display-op-status"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />{stLabel}{data.schedule.currentBlock ? ` · BLOK ${data.schedule.currentBlock}` : ""}</span>
          <span className={cn("flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold", online ? "border-emerald-500/50 text-emerald-300" : "border-red-500 bg-red-600/30 text-red-200")} data-testid="display-connection">
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? "TERHUBUNG" : "TERPUTUS · menyambung ulang"}
          </span>
          <div className="text-right"><div className="num text-4xl font-black tracking-tight" data-testid="display-clock">{now ? fmtTime(now) : "--.--.--"}</div><div className="text-sm text-slate-400">{now ? fmtDate(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""} · WIB</div></div>
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())} className="rounded-lg border border-slate-700 p-3 hover:bg-slate-800" data-testid="display-fullscreen-button" aria-label="Layar penuh"><Maximize className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${kpiDepts.length + 1}, minmax(0, 1fr))` }}>
        {kpiDepts.map((d) => (
          <div key={d.id} className="rounded-2xl border border-tv-line bg-tv-card p-4" data-testid={`display-kpi-${d.code.toLowerCase()}`}>
            <div className="text-sm font-bold uppercase tracking-widest text-slate-400">{d.name} hari ini</div>
            <div className="num text-6xl font-black tracking-tighter xl:text-7xl" data-testid={`display-kpi-${d.code.toLowerCase()}-value`}>{fmtNum(d.actual)}</div>
            <div className="mt-1 flex justify-between text-sm text-slate-400"><span>Target {fmtNum(d.target)}</span><b className="num text-white">{fmtPct(d.pct)}</b></div>
            <div className="mt-2"><Progress value={d.pct} tv /></div>
          </div>
        ))}
        <div className="rounded-2xl border border-teal/40 bg-teal/10 p-4" data-testid="display-kpi-achievement">
          <div className="text-sm font-bold uppercase tracking-widest text-teal">Capaian target ({data.metric?.name})</div>
          <div className="num text-6xl font-black tracking-tighter text-teal xl:text-7xl">{fmtPct(data.metric?.pct)}</div>
          <div className="mt-1 text-sm text-slate-300">{fmtNum(data.metric?.actual)} / {fmtNum(data.metric?.target)} pcs</div>
        </div>
      </div>

      <main className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: showSewing && showPP ? "1.7fr 1fr" : "1fr" }}>
        {showSewing && <SewingPanel d={data} single={mode === "line"} />}
        {showPP && <PrintPackPanel d={data} />}
      </main>

      <footer className="flex items-center justify-between rounded-xl border border-tv-line bg-tv-card px-5 py-3 text-sm">
        <span className="flex items-center gap-2" data-testid="display-top-product"><Trophy className="h-5 w-5 text-amber-400" /> Produk tertinggi: <b className="text-lg">{data.topProduct?.name ?? "—"}</b> {data.topProduct && <span className="num text-slate-400">{fmtNum(data.topProduct.qty)} pcs · {data.topProduct.departmentName}</span>}</span>
        <span className="text-slate-400">Line berproduksi <b className="num text-white">{data.linesProducing}/{data.linesTotal}</b></span>
        <span className="num text-slate-400" data-testid="display-last-update">Data server {fmtTime(data.serverTime)} · transaksi terakhir {data.lastUpdated ? fmtTime(data.lastUpdated) : "—"}</span>
      </footer>
    </div>
  );
}

function SewingPanel({ d, single }: { d: Board; single: boolean }) {
  const cols = single ? 1 : d.lines.length <= 2 ? d.lines.length || 1 : d.lines.length <= 4 ? 2 : 3;
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {d.lines.map((l) => (
          <div key={l.id} className="flex min-h-0 flex-col rounded-2xl border border-tv-line bg-tv-card p-4" data-testid={`display-line-${l.code}`}>
            <div className="flex items-center justify-between"><div className="font-display text-2xl font-bold">{l.name}</div><ActivityBadge activity={l.activity} tv testId={`display-line-activity-${l.code}`} /></div>
            <div className="truncate text-sm text-slate-400">Produk: <span className="text-slate-200">{l.currentProduct ?? "—"}</span></div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div><div className="text-xs uppercase text-slate-400">Total</div><div className="num text-5xl font-black leading-none" data-testid={`display-line-total-${l.code}`}>{fmtNum(l.actual)}</div></div>
              <div><div className="text-xs uppercase text-slate-400">Blok {l.lastBlock?.no ?? "–"}</div><div className="num text-4xl font-black leading-none">{fmtNum(l.lastBlock?.qty ?? 0)}<span className="text-base text-slate-500">/{fmtNum(l.blockTarget)}</span></div></div>
              <div><div className="text-xs uppercase text-slate-400">Target {fmtNum(l.target)}</div><div className="num text-4xl font-black leading-none text-teal">{fmtPct(l.pct)}</div></div>
            </div>
            <div className="my-2"><Progress value={l.pct} tv /></div>
            <div className="min-h-0 overflow-hidden"><BlockGrid blocks={l.blocks} tv compact={!single} testId={`display-grid-${l.code}`} breaks={single ? d.schedule.breaks : []} /></div>
          </div>
        ))}
      </div>
      {!single && d.blockSeries.length > 0 && (
        <div className="h-48 shrink-0 rounded-2xl border border-tv-line bg-tv-card p-3"><BlockChart data={d.blockSeries} lines={d.lines.map((l) => l.code)} dark /></div>
      )}
    </section>
  );
}

function PrintPackPanel({ d }: { d: Board }) {
  const depts = d.departments.filter((x) => x.kind !== "line_block");
  return (
    <section className="flex min-h-0 flex-col gap-3">
      {depts.map((dp) => {
        const rows = (d as unknown as { products: { id: string; name: string; byDept: Record<string, number> }[] }).products
          .map((p) => ({ name: p.name, qty: p.byDept[dp.id] ?? 0 })).filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5);
        return (
          <div key={dp.id} className="flex min-h-0 flex-1 flex-col rounded-2xl border border-tv-line bg-tv-card p-4" data-testid={`display-panel-${dp.code.toLowerCase()}`}>
            <div className="flex items-end justify-between"><div className="font-display text-2xl font-bold">{dp.name}</div><div className="num text-4xl font-black">{fmtNum(dp.actual)}<span className="text-base text-slate-500"> / {fmtNum(dp.target)}</span></div></div>
            <div className="my-2"><Progress value={dp.pct} tv /></div>
            <ul className="space-y-1.5 overflow-hidden text-lg">
              {rows.length ? rows.map((r) => <li key={r.name} className="flex justify-between border-b border-tv-line pb-1"><span className="truncate">{r.name}</span><b className="num">{fmtNum(r.qty)}</b></li>) : <li className="text-slate-500">Belum ada hasil hari ini</li>}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Fatal({ msg }: { msg: string }) {
  return <div className="grid h-screen place-items-center bg-tv-bg p-10 text-center text-2xl text-red-300" data-testid="display-error"><div><WifiOff className="mx-auto mb-4 h-12 w-12" />{msg}</div></div>;
}
