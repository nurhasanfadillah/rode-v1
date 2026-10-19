"use client";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, fetcher } from "@/lib/client";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { StatusPill, Skel } from "../common";
import type { TxRow } from "./HistoryPage";

type Detail = TxRow & { corrections: { id: string; action: string; oldQuantity: number; newQuantity: number | null; reason: string; createdAt: string; correctedByName: string }[] };

export function TxDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, mutate } = useSWR<Detail>(id ? `/api/transactions/${id}` : null, fetcher);
  const [mode, setMode] = useState<"correct" | "cancel" | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setMode(null); setQty(""); setReason(""); onClose(); };
  const submit = async () => {
    if (!data || !mode) return;
    setBusy(true);
    try {
      await api(`/api/transactions/${data.id}/${mode}`, { method: "POST", body: { reason, expectedVersion: data.version, ...(mode === "correct" ? { newQuantity: Number(qty) } : {}) } });
      toast.success(mode === "cancel" ? "Transaksi dibatalkan" : "Koreksi tersimpan", { description: "Semua total & laporan sudah diperbarui." });
      setMode(null); setQty(""); setReason("");
      await mutate(); onChanged();
    } catch (e) {
      toast.error("Gagal menyimpan", { description: e instanceof Error ? e.message : String(e) });
      if (e instanceof Error && /diubah pengguna lain/.test(e.message)) await mutate();
    } finally { setBusy(false); }
  };
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>;

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="tx-detail-dialog">
        <DialogHeader><DialogTitle>Detail transaksi</DialogTitle></DialogHeader>
        {!data ? <Skel className="h-48" /> : (
          <div>
            <div className="divide-y">
              {row("Produk", `${data.productName} (${data.productCode})`)}
              {row("Departemen / Line", `${data.departmentName}${data.lineName ? ` · ${data.lineName}` : ""}`)}
              {row("Tanggal kerja / Blok", `${fmtDate(data.workDate)}${data.blockNo ? ` · Blok ${data.blockNo}` : ""}`)}
              {row("Waktu pencatatan (server)", fmtDateTime(data.recordedAt))}
              {row("Operator", data.operatorName)}
              {row("Mode input", data.inputMode === "single" ? "+1 PCS" : data.inputMode === "bulk" ? "Input jumlah" : "Harian")}
              {row("Kuantitas", <span className="num text-lg" data-testid="tx-detail-quantity">{fmtNum(data.quantity)} <span className="text-xs text-slate-400">(awal {data.originalQuantity})</span></span>)}
              {row("Status", <StatusPill status={data.status} />)}
              {data.notes && row("Catatan", data.notes)}
            </div>
            <h4 className="mt-4 text-sm font-semibold">Jejak audit koreksi</h4>
            {data.corrections.length === 0 ? <p className="text-sm text-slate-500">Belum ada koreksi.</p> : (
              <ul className="mt-2 space-y-2" data-testid="tx-corrections-list">
                {data.corrections.map((c) => (
                  <li key={c.id} className="rounded-lg bg-slate-50 p-2.5 text-xs">
                    <div className="font-semibold">{c.action === "cancel" ? "Dibatalkan" : `Koreksi ${c.oldQuantity} → ${c.newQuantity}`} · {c.correctedByName}</div>
                    <div className="text-slate-600">Alasan: {c.reason}</div>
                    <div className="text-slate-400">{fmtDateTime(c.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
            {data.canCorrect && !mode && (
              <div className="mt-5 flex gap-2">
                <button onClick={() => { setMode("correct"); setQty(String(data.quantity)); }} className="h-11 flex-1 rounded-lg bg-navy font-semibold text-white" data-testid="tx-correct-button">Koreksi kuantitas</button>
                <button onClick={() => setMode("cancel")} className="h-11 flex-1 rounded-lg border border-red-300 font-semibold text-red-600" data-testid="tx-cancel-button">Batalkan</button>
              </div>
            )}
            {!data.canCorrect && data.status !== "cancelled" && <p className="mt-4 text-xs text-slate-500">Anda tidak memiliki izin koreksi untuk transaksi ini (aturan koreksi admin / batas waktu).</p>}
            {mode && (
              <div className={`mt-5 space-y-3 rounded-xl border p-4 ${mode === "cancel" ? "border-red-200 bg-red-50" : "border-slate-200"}`} data-testid="tx-amend-form">
                <div className="text-sm font-semibold">{mode === "cancel" ? "Konfirmasi pembatalan — transaksi tidak akan dihitung lagi" : "Koreksi kuantitas"}</div>
                {mode === "correct" && <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 w-full rounded-lg border px-3" data-testid="tx-new-quantity-input" />}
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (wajib, min. 5 karakter)" rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" data-testid="tx-reason-input" />
                <div className="flex gap-2">
                  <button onClick={() => setMode(null)} className="h-10 flex-1 rounded-lg border bg-white" data-testid="tx-amend-back">Batal</button>
                  <button disabled={busy || reason.trim().length < 5 || (mode === "correct" && !(Number(qty) >= 1))} onClick={submit}
                    className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg font-semibold text-white disabled:opacity-50 ${mode === "cancel" ? "bg-red-600" : "bg-navy"}`} data-testid="tx-amend-submit">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "cancel" ? "Ya, batalkan" : "Simpan koreksi"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
