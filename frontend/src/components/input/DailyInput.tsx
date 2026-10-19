"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { addDays } from "@/lib/time";
import { postWithRetry, useOnline, uuid } from "@/lib/client";
import { fmtDate, fmtNum, fmtPct, fmtTime } from "@/lib/format";
import { ProductPicker } from "../ProductPicker";
import { EmptyState, ErrorState, Progress, Skel } from "../common";
import type { Meta } from "./InputPage";
import { MineList, useSummary } from "./SewingInput";

export function DailyInput({ meta, departmentId, isAdmin }: { meta: Meta; departmentId: string; isAdmin: boolean }) {
  const online = useOnline();
  const [date, setDate] = useState(meta.today);
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const { data, error, mutate } = useSummary({ date, ...(isAdmin ? { departmentId } : {}) }, meta.settings.dashboardRefreshSec);
  const minDate = isAdmin ? undefined : addDays(meta.today, -meta.settings.allowBackdateDays);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = Number(qty);
    if (!productId || !(quantity >= 1) || pending) return;
    setPending(true);
    try {
      await postWithRetry("/api/transactions", { productId, quantity, workDate: date, notes: notes || null, idempotencyKey: uuid(), ...(isAdmin ? { departmentId } : {}) });
      toast.success(`Tersimpan di server: ${fmtNum(quantity)} pcs`, { description: `Tanggal kerja ${fmtDate(date)}` });
      setQty(""); setNotes("");
      await mutate();
    } catch (err) {
      toast.error("Gagal menyimpan — data TIDAK tercatat", { description: err instanceof Error ? err.message : String(err) });
    } finally { setPending(false); }
  };

  const total = data?.departmentTotal;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={submit} className="space-y-4" data-testid="daily-input-form">
        <label className="block">
          <span className="label-xs">Tanggal kerja</span>
          <input type="date" value={date} max={meta.today} min={minDate} onChange={(e) => setDate(e.target.value)} required
            className="mt-1 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-base outline-none focus:border-teal" data-testid="daily-date-input" />
        </label>
        <ProductPicker products={meta.products} value={productId} onChange={setProductId} />
        <label className="block">
          <span className="label-xs">Kuantitas (pcs)</span>
          <input type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required placeholder="0"
            className="num mt-1 h-16 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-3xl font-bold outline-none focus:border-teal" data-testid="daily-quantity-input" />
        </label>
        <label className="block">
          <span className="label-xs">Catatan (opsional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
            className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal" data-testid="daily-notes-input" />
        </label>
        <button disabled={!online || pending || !productId || !(Number(qty) >= 1)} data-testid="daily-submit-button"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-navy text-lg font-bold text-white transition-[transform,background-color] hover:bg-navy-700 active:scale-[0.98] disabled:bg-slate-400">
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} {online ? "Simpan hasil" : "Offline — tidak dapat menyimpan"}
        </button>
      </form>
      <div className="space-y-4">
        {error && !data ? <ErrorState message={error.message} onRetry={() => mutate()} /> : !data ? <Skel className="h-40" /> : (
          <>
            <div className="card-surface p-5" data-testid="department-total-card">
              <div className="label-xs">Total {data.department.name} · {fmtDate(date)}</div>
              <div className="num mt-1 text-5xl font-extrabold text-navy" data-testid="department-total-value">{fmtNum(total?.actual ?? 0)}</div>
              <div className="mt-1 text-xs text-slate-500">Target {fmtNum(total?.target)} · Capaian {fmtPct(total?.pct)} · update {fmtTime(data.serverTime)}</div>
              <div className="mt-3"><Progress value={total?.pct ?? null} /></div>
            </div>
            <section className="card-surface p-4">
              <h3 className="mb-2 font-semibold">Total per produk</h3>
              {data.products.length ? (
                <ul className="divide-y text-sm" data-testid="daily-product-summary">
                  {data.products.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.name} <span className="num text-xs text-slate-400">{p.code}</span></span><span className="num font-bold">{fmtNum(p.qty)} pcs</span></li>)}
                </ul>
              ) : <EmptyState title="Belum ada hasil pada tanggal ini" />}
            </section>
            <MineList items={data.mine} />
          </>
        )}
      </div>
    </div>
  );
}
