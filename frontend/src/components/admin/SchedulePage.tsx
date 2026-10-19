"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildDayPlan, formatHM, todayJakarta, addDays, type ScheduleConfig } from "@/lib/time";
import { ErrorState, PageHeader, Skel } from "../common";

type Version = ScheduleConfig & { note: string | null; createdAt: string };
type Data = { shifts: { id: string; code: string; name: string; isActive: boolean }[]; versions: Version[] };
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function SchedulePage() {
  const { data, error, mutate } = useSWR<Data>("/api/admin/schedule", fetcher);
  const [shiftId, setShiftId] = useState<string | null>(null);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!data) return <Skel className="h-96" />;
  const sid = shiftId ?? data.shifts[0]?.id;
  const versions = data.versions.filter((v) => v.shiftId === sid);
  const today = todayJakarta();
  const current = versions.find((v) => v.effectiveFrom <= today);

  return (
    <div>
      <PageHeader title="Jadwal, Shift & Blok" subtitle="Setiap perubahan disimpan sebagai versi baru yang berlaku mulai tanggal tertentu — transaksi historis tetap memakai aturan lamanya." />
      <div className="mb-4 flex flex-wrap gap-2" data-testid="shift-list">
        {data.shifts.map((s) => (
          <button key={s.id} onClick={() => setShiftId(s.id)} data-testid={`shift-tab-${s.code}`}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${s.id === sid ? "border-navy bg-navy text-white" : "bg-white"} ${!s.isActive ? "opacity-50" : ""}`}>{s.name}{!s.isActive && " (nonaktif)"}</button>
        ))}
        <NewShift onDone={() => mutate()} />
      </div>
      {sid && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <section className="card-surface p-4">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Riwayat versi</h3>
                <ToggleShift shift={data.shifts.find((s) => s.id === sid)!} onDone={() => mutate()} /></div>
              <ul className="divide-y text-sm" data-testid="version-list">
                {versions.map((v) => (
                  <li key={v.shiftVersionId} className="py-2.5">
                    <div className="flex items-center justify-between"><b>Berlaku {fmtDate(v.effectiveFrom)}</b>{v === current && <span className="rounded-full bg-emerald-50 px-2 text-xs font-semibold text-emerald-700">Berlaku saat ini</span>}{v.effectiveFrom > today && <span className="rounded-full bg-sky-50 px-2 text-xs font-semibold text-sky-700">Terjadwal</span>}</div>
                    <div className="num text-xs text-slate-600">{v.startTime.replace(":", ".")}–{v.endTime.replace(":", ".")} · blok {v.blockMinutes} mnt · {v.workDays.map((d) => DAYS[d - 1]).join(", ")} · istirahat: {v.breaks.map((b) => `${b.startTime}-${b.endTime}`).join(", ") || "—"} ({v.breakMode === "exclude" ? "dikecualikan" : "ikut jam"}) · luar jam: {v.outsidePolicy === "reject" ? "tolak" : "masukkan ke blok terdekat"}</div>
                    <div className="text-[11px] text-slate-400">{v.note} · dibuat {fmtDateTime(v.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <VersionForm key={sid} shiftId={sid} base={current} onDone={() => mutate()} />
        </div>
      )}
    </div>
  );
}

function NewShift({ onDone }: { onDone: () => void }) {
  const add = async () => {
    const name = prompt("Nama shift baru (mis. Shift 2):");
    if (!name) return;
    const code = prompt("Kode shift (mis. S2):");
    if (!code) return;
    try { await api("/api/admin/schedule", { method: "POST", body: { action: "create_shift", name, code } }); toast.success("Shift dibuat — tambahkan versi jadwalnya"); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  return <button onClick={add} className="flex items-center gap-1 rounded-full border border-dashed px-4 py-2 text-sm" data-testid="add-shift-button"><Plus className="h-4 w-4" />Shift</button>;
}

function ToggleShift({ shift, onDone }: { shift: { id: string; isActive: boolean; name: string }; onDone: () => void }) {
  const t = async () => {
    if (!confirm(`${shift.isActive ? "Nonaktifkan" : "Aktifkan"} ${shift.name}?`)) return;
    await api("/api/admin/schedule", { method: "POST", body: { action: "toggle_shift", id: shift.id, isActive: !shift.isActive } }).catch((e) => toast.error(e.message));
    onDone();
  };
  return <button onClick={t} className="text-xs text-slate-500 underline" data-testid="toggle-shift-button">{shift.isActive ? "Nonaktifkan shift" : "Aktifkan shift"}</button>;
}

function VersionForm({ shiftId, base, onDone }: { shiftId: string; base?: Version; onDone: () => void }) {
  const [v, setV] = useState({
    effectiveFrom: addDays(todayJakarta(), 1), startTime: base?.startTime ?? "08:00", endTime: base?.endTime ?? "16:00", blockMinutes: base?.blockMinutes ?? 45,
    workDays: base?.workDays ?? [1, 2, 3, 4, 5, 6], breakMode: base?.breakMode ?? "exclude", outsidePolicy: base?.outsidePolicy ?? "reject",
    breaks: base?.breaks ?? [{ startTime: "12:00", endTime: "13:00", label: "Istirahat" }], note: "",
  });
  const preview = useMemo(() => {
    try { return buildDayPlan({ ...v, shiftId, shiftVersionId: "", shiftName: "" } as ScheduleConfig); } catch { return null; }
  }, [v, shiftId]);
  const save = async () => {
    if (!confirm(`Simpan versi jadwal baru berlaku mulai ${fmtDate(v.effectiveFrom)}? Data sebelum tanggal ini tidak berubah.`)) return;
    try { await api("/api/admin/schedule", { method: "POST", body: { action: "create_version", shiftId, ...v } }); toast.success("Versi jadwal tersimpan"); onDone(); }
    catch (e) { toast.error("Gagal menyimpan", { description: e instanceof Error ? e.message : String(e) }); }
  };
  const inp = "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm";
  return (
    <section className="card-surface space-y-3 p-4" data-testid="version-form">
      <h3 className="font-semibold">Buat versi jadwal baru</h3>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label-xs">Berlaku mulai</span><input type="date" min={todayJakarta()} className={inp} value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} data-testid="version-effective-from" /></label>
        <label><span className="label-xs">Durasi blok (menit)</span><input type="number" min={5} className={inp} value={v.blockMinutes} onChange={(e) => setV({ ...v, blockMinutes: Number(e.target.value) })} data-testid="version-block-minutes" /></label>
        <label><span className="label-xs">Jam mulai</span><input type="time" className={inp} value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} data-testid="version-start-time" /></label>
        <label><span className="label-xs">Jam selesai</span><input type="time" className={inp} value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} data-testid="version-end-time" /></label>
        <label><span className="label-xs">Perlakuan istirahat</span><select className={inp} value={v.breakMode} onChange={(e) => setV({ ...v, breakMode: e.target.value as "exclude" })} data-testid="version-break-mode"><option value="exclude">Dikecualikan dari perhitungan blok</option><option value="clock">Blok mengikuti jam (istirahat di dalam blok)</option></select></label>
        <label><span className="label-xs">Input di luar jam kerja</span><select className={inp} value={v.outsidePolicy} onChange={(e) => setV({ ...v, outsidePolicy: e.target.value as "reject" })} data-testid="version-outside-policy"><option value="reject">Tolak</option><option value="clamp">Masukkan ke blok pertama/terakhir</option></select></label>
      </div>
      <div><span className="label-xs">Hari kerja</span>
        <div className="mt-1 flex flex-wrap gap-1.5">{DAYS.map((d, i) => {
          const on = v.workDays.includes(i + 1);
          return <button key={d} type="button" onClick={() => setV({ ...v, workDays: on ? v.workDays.filter((x) => x !== i + 1) : [...v.workDays, i + 1].sort() })} className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-teal bg-teal text-white" : "bg-white"}`} data-testid={`version-day-${i + 1}`}>{d}</button>;
        })}</div></div>
      <div><span className="label-xs">Istirahat</span>
        {v.breaks.map((b, i) => (
          <div key={i} className="mt-1 flex gap-2">
            <input type="time" className={inp} value={b.startTime} onChange={(e) => setV({ ...v, breaks: v.breaks.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)) })} data-testid={`break-start-${i}`} />
            <input type="time" className={inp} value={b.endTime} onChange={(e) => setV({ ...v, breaks: v.breaks.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)) })} data-testid={`break-end-${i}`} />
            <input className={inp} value={b.label} onChange={(e) => setV({ ...v, breaks: v.breaks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <button type="button" onClick={() => setV({ ...v, breaks: v.breaks.filter((_, j) => j !== i) })} className="px-2 text-red-500" aria-label="Hapus istirahat"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setV({ ...v, breaks: [...v.breaks, { startTime: "15:00", endTime: "15:15", label: "Istirahat" }] })} className="mt-2 text-sm text-teal-600" data-testid="add-break-button">+ Tambah istirahat</button>
      </div>
      <label className="block"><span className="label-xs">Catatan perubahan</span><input className={inp} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} data-testid="version-note" /></label>
      <div className="rounded-lg bg-slate-50 p-3" data-testid="block-preview">
        <div className="label-xs mb-2">Pratinjau blok ({preview?.blocks.length ?? 0} blok · {preview?.productiveMinutes ?? 0} menit produktif)</div>
        <div className="flex flex-wrap gap-1.5">{preview?.blocks.map((b) => (
          <span key={b.no} className="num rounded bg-white px-2 py-1 text-xs shadow-sm"><b>B{b.no}</b> {b.segments.map((s) => `${formatHM(s.start)}–${formatHM(s.end)}`).join(" + ")}{b.breakOnly ? " (istirahat)" : ""}</span>
        ))}</div>
      </div>
      <button onClick={save} className="h-11 w-full rounded-lg bg-navy font-semibold text-white" data-testid="version-save-button">Simpan versi jadwal</button>
    </section>
  );
}
