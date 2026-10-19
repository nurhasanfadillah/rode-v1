"use client";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, fetcher } from "@/lib/client";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { ErrorState, PageHeader, Skel } from "../common";

type T = { dailyTarget: number | null; blockTarget: number | null; effectiveFrom: string } | null;
type Row = { key: string; departmentId: string; lineId: string | null; label: string; kind: string; current: T };
type Data = { today: string; rows: Row[]; scheduled: (NonNullable<T> & { departmentId: string; lineId: string | null })[]; history: (NonNullable<T> & { id: string; departmentId: string; lineId: string | null; createdAt: string; createdByName: string | null })[] };

export function TargetsPage() {
  const { data, error, mutate } = useSWR<Data>("/api/admin/targets", fetcher);
  const [edit, setEdit] = useState<Row | null>(null);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!data) return <Skel className="h-96" />;
  const label = (d: string, l: string | null) => data.rows.find((r) => r.departmentId === d && r.lineId === l)?.label ?? "—";
  return (
    <div>
      <PageHeader title="Target Produksi" subtitle="Target berversi per tanggal berlaku. Target departemen kosong = jumlah target line. Target blok kosong = target harian ÷ jumlah blok produktif." />
      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm" data-testid="targets-table">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2.5">Departemen / Line</th><th className="px-3 py-2.5 text-right">Target harian</th><th className="px-3 py-2.5 text-right">Target per blok</th><th className="px-3 py-2.5">Berlaku sejak</th><th /></tr></thead>
          <tbody className="divide-y">
            {data.rows.map((r) => (
              <tr key={r.key} className={r.kind === "department" ? "bg-navy-50/40 font-semibold" : ""} data-testid={`target-row-${r.key}`}>
                <td className="px-3 py-2">{r.label}</td>
                <td className="num px-3 py-2 text-right">{fmtNum(r.current?.dailyTarget)}</td>
                <td className="num px-3 py-2 text-right">{r.kind === "line" ? fmtNum(r.current?.blockTarget) : "—"}</td>
                <td className="px-3 py-2">{r.current ? fmtDate(r.current.effectiveFrom) : "—"}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => setEdit(r)} className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white" data-testid={`target-edit-${r.key}`}>Ubah</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.scheduled.length > 0 && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Target terjadwal: {data.scheduled.map((s, i) => <span key={i} className="mr-3">{label(s.departmentId, s.lineId)} → {fmtNum(s.dailyTarget)} mulai {fmtDate(s.effectiveFrom)}</span>)}</div>}
      <section className="card-surface mt-5 p-4">
        <h3 className="mb-2 font-semibold">Histori perubahan target</h3>
        <ul className="divide-y text-sm" data-testid="target-history">
          {data.history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{label(h.departmentId, h.lineId)}: harian <b className="num">{fmtNum(h.dailyTarget)}</b>{h.lineId && <> · blok <b className="num">{fmtNum(h.blockTarget)}</b></>} mulai {fmtDate(h.effectiveFrom)}</span><span className="text-xs text-slate-500">{h.createdByName ?? "Sistem"} · {fmtDateTime(h.createdAt)}</span></li>)}
        </ul>
      </section>
      {edit && <TargetDialog row={edit} today={data.today} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); mutate(); }} />}
    </div>
  );
}

function TargetDialog({ row, today, onClose, onSaved }: { row: Row; today: string; onClose: () => void; onSaved: () => void }) {
  const [daily, setDaily] = useState(String(row.current?.dailyTarget ?? ""));
  const [block, setBlock] = useState(String(row.current?.blockTarget ?? ""));
  const [from, setFrom] = useState(today);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/admin/targets", { method: "POST", body: { departmentId: row.departmentId, lineId: row.lineId, effectiveFrom: from, dailyTarget: daily === "" ? null : Number(daily), blockTarget: block === "" ? null : Number(block) } });
      toast.success("Target tersimpan"); onSaved();
    } catch (err) { toast.error("Gagal", { description: err instanceof Error ? err.message : String(err) }); }
  };
  const inp = "mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="target-dialog">
        <DialogHeader><DialogTitle>Target — {row.label}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <label className="block"><span className="label-xs">Target harian (pcs)</span><input type="number" min={0} className={inp} value={daily} onChange={(e) => setDaily(e.target.value)} data-testid="target-daily-input" /></label>
          {row.kind === "line" && <label className="block"><span className="label-xs">Target per blok (pcs)</span><input type="number" min={0} className={inp} value={block} onChange={(e) => setBlock(e.target.value)} data-testid="target-block-input" /></label>}
          <label className="block"><span className="label-xs">Berlaku mulai</span><input type="date" min={today} className={inp} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="target-from-input" /></label>
          <button className="h-10 w-full rounded-lg bg-navy font-semibold text-white" data-testid="target-save-button">Simpan</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
