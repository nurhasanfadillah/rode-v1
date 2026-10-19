"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { CheckCircle2, Coffee, Loader2, Plus, Timer, WifiOff } from "lucide-react";
import { BlockGrid, type GridBlock } from "../BlockGrid";
import { ProductPicker } from "../ProductPicker";
import { ActivityBadge, EmptyState, ErrorState, Progress, Skel, StatusPill } from "../common";
import { fetcher, postWithRetry, qs, useOnline, uuid } from "@/lib/client";
import { fmtNum, fmtPct, fmtTime } from "@/lib/format";
import type { Meta } from "./InputPage";

export interface Summary {
  department: { id: string; name: string; kind: string };
  context: { ok: boolean; workDate: string; blockNo: number | null; inBreak: boolean; outside: boolean; reason: string | null; shiftName: string | null };
  date: string; serverTime: string; lastUpdated: string | null;
  line: null | { id: string; name: string; actual: number; target: number | null; pct: number | null; blockTarget: number | null; blocks: GridBlock[]; activity: string | null; products: { id: string; name: string; qty: number }[]; lastBlock: { no: number; qty: number } | null };
  departmentTotal: { actual: number; target: number | null; pct: number | null } | null;
  products: { id: string; name: string; code: string; qty: number }[];
  schedule: { breaks?: { start: string; end: string; label: string }[]; start?: string; end?: string; status: string };
  mine: { id: string; quantity: number; status: string; blockNo: number | null; recordedAt: string; productName: string }[];
}

type TxResp = { transaction: { blockNo: number | null; quantity: number; recordedAt: string }; duplicate: boolean };

export function useSummary(params: Record<string, string | undefined>, refreshSec: number) {
  return useSWR<Summary>(`/api/operator/summary${qs(params)}`, fetcher, { refreshInterval: refreshSec * 1000, keepPreviousData: true });
}

export function SewingInput({ meta, departmentId, lineId, isAdmin }: { meta: Meta; departmentId: string; lineId: string; isAdmin: boolean }) {
  const online = useOnline();
  const storeKey = `rode:last-product:${lineId}`;
  const [productId, setProductId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [bump, setBump] = useState(0);
  const [bulk, setBulk] = useState("");
  const lock = useRef(false);
  const { data, error, mutate } = useSummary(isAdmin ? { departmentId, lineId } : {}, meta.settings.dashboardRefreshSec);

  useEffect(() => {
    const saved = localStorage.getItem(storeKey);
    if (saved && meta.products.some((p) => p.id === saved)) setProductId(saved);
  }, [storeKey, meta.products]);

  const pick = (id: string) => { setProductId(id); localStorage.setItem(storeKey, id); };

  const submit = async (quantity: number) => {
    if (lock.current || !productId) return;
    lock.current = true;
    setPending(true);
    const body = { productId, quantity, idempotencyKey: uuid(), ...(isAdmin ? { departmentId, lineId } : {}) };
    try {
      const r = await postWithRetry<TxResp>("/api/transactions", body);
      navigator.vibrate?.(30);
      setBump((b) => b + 1);
      toast.success(`Tersimpan di server: ${r.transaction.quantity} pcs · Blok ${r.transaction.blockNo}`, { description: `Waktu server ${fmtTime(r.transaction.recordedAt)} WIB`, duration: 1800 });
      setBulk("");
      await mutate();
    } catch (e) {
      toast.error("Gagal menyimpan — data TIDAK tercatat", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setTimeout(() => { lock.current = false; setPending(false); }, 250);
    }
  };

  if (error && !data) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!data) return <div className="space-y-4"><Skel className="h-16" /><Skel className="h-44" /><Skel className="h-40" /></div>;
  const ctx = data.context;
  const line = data.line;
  const canInput = online && ctx.ok && !!productId;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-navy px-4 py-3 text-white" data-testid="sewing-context">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-300">{line?.name} · {ctx.shiftName ?? "—"}</div>
            <div className="font-display text-xl font-bold" data-testid="current-block-label">
              {ctx.ok ? `Blok ${ctx.blockNo}` : "Di luar jam kerja"}
            </div>
          </div>
          <div className="text-right">
            {ctx.inBreak && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/30 px-2 py-0.5 text-xs"><Coffee className="h-3 w-3" />Istirahat</span>}
            <div className="num text-xs text-slate-300">Update {fmtTime(data.serverTime)}</div>
          </div>
        </div>
        {!ctx.ok && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="outside-hours-alert"><Timer className="mr-1 inline h-4 w-4" />{ctx.reason}</div>}
        <ProductPicker products={meta.products} value={productId} onChange={pick} />
        <button type="button" onClick={() => submit(1)} disabled={!canInput || pending} data-testid="plus-one-button"
          className="relative flex h-40 w-full touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-blue-400/30 bg-navy text-white shadow-xl shadow-navy/20 transition-[transform,background-color] hover:bg-navy-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-400 sm:h-44">
          {pending ? <Loader2 className="h-10 w-10 animate-spin" /> : !online ? <WifiOff className="h-10 w-10" /> : <Plus className="h-12 w-12" strokeWidth={3} />}
          <span className="font-display text-3xl font-black tracking-tight">+1 PCS</span>
          <span className="text-xs text-slate-200">{!online ? "Offline — tidak dapat menyimpan" : !productId ? "Pilih produk dulu" : "Tekan setiap 1 pcs selesai"}</span>
        </button>
        {meta.settings.allowBulkInput && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const q = Number(bulk); if (q >= 1) submit(q); }} data-testid="bulk-input-form">
            <input type="number" min={1} inputMode="numeric" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Input jumlah (pcs)"
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-200 px-3 text-base outline-none focus:border-teal" data-testid="bulk-quantity-input" />
            <button disabled={!canInput || pending || !(Number(bulk) >= 1)} className="h-12 rounded-xl bg-teal px-4 font-semibold text-white disabled:opacity-50" data-testid="bulk-submit-button">Simpan</button>
          </form>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="card-surface p-4" data-testid="line-total-card">
            <div className="label-xs">Total line hari ini</div>
            <div key={bump} className="num mt-1 animate-pop text-4xl font-extrabold text-navy" data-testid="line-total-value">{fmtNum(line?.actual ?? 0)}</div>
            <div className="text-xs text-slate-500">Target {fmtNum(line?.target)} · {fmtPct(line?.pct)}</div>
            <div className="mt-2"><Progress value={line?.pct ?? null} /></div>
          </div>
          <div className="card-surface p-4" data-testid="current-block-card">
            <div className="label-xs">Blok berjalan</div>
            <div className="num mt-1 text-4xl font-extrabold text-slate-900" data-testid="current-block-qty">{fmtNum(line?.lastBlock?.qty ?? 0)}</div>
            <div className="text-xs text-slate-500">Target blok {fmtNum(line?.blockTarget)}</div>
            <div className="mt-2"><ActivityBadge activity={line?.activity ?? null} testId="line-activity-badge" /></div>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <section className="card-surface p-4">
          <h3 className="mb-3 font-semibold text-slate-900">Status blok — {line?.name}</h3>
          {line?.blocks.length ? <BlockGrid blocks={line.blocks} breaks={data.schedule.breaks} /> : <EmptyState title="Jadwal tidak tersedia" hint="Hari ini bukan hari kerja atau jadwal belum dikonfigurasi." />}
        </section>
        <section className="card-surface p-4">
          <h3 className="mb-2 font-semibold text-slate-900">Ringkasan produk (line)</h3>
          {line?.products.length ? (
            <ul className="divide-y text-sm" data-testid="line-product-summary">
              {line.products.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.name}</span><span className="num font-bold">{fmtNum(p.qty)} pcs</span></li>)}
            </ul>
          ) : <EmptyState title="Belum ada hasil hari ini" hint="Pilih produk lalu tekan +1 PCS." />}
        </section>
        <MineList items={data.mine} />
      </div>
    </div>
  );
}

export function MineList({ items }: { items: Summary["mine"] }) {
  return (
    <section className="card-surface p-4">
      <h3 className="mb-2 font-semibold text-slate-900">Input terakhir saya</h3>
      {items.length ? (
        <ul className="divide-y text-sm" data-testid="my-recent-list">
          {items.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{m.productName}{m.blockNo ? <span className="text-xs text-slate-500">· B{m.blockNo}</span> : null}</span>
              <span className="flex items-center gap-2"><span className="num font-bold">{m.quantity}</span><span className="num text-xs text-slate-500">{fmtTime(m.recordedAt, false)}</span><StatusPill status={m.status} /></span>
            </li>
          ))}
        </ul>
      ) : <div className="text-sm text-slate-500">Belum ada input.</div>}
    </section>
  );
}
