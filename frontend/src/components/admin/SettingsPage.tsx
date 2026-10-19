"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Copy, MonitorPlay } from "lucide-react";
import { api, fetcher } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { AppSettings } from "@/services/settings";
import { ErrorState, PageHeader, Skel } from "../common";
import type { Meta } from "../input/InputPage";

const MODE_LABEL: Record<string, string> = { all: "Semua departemen", sewing: "Sewing saja", print_pack: "Printing & Packing", line: "Satu line Sewing", rotate: "Rotasi panel" };

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Pengaturan & Smart TV" subtitle="Setiap perubahan tercatat di audit log (nilai sebelum & sesudah)." />
      <div className="grid gap-5 lg:grid-cols-2"><GeneralSettings /><Displays /></div>
    </div>
  );
}

function GeneralSettings() {
  const { data, error, mutate } = useSWR<AppSettings>("/api/admin/settings", fetcher);
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher);
  const [v, setV] = useState<AppSettings | null>(null);
  useEffect(() => { if (data) setV(data); }, [data]);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!v) return <Skel className="h-96" />;
  const num = (k: keyof AppSettings, label: string, hint?: string) => (
    <label className="block"><span className="label-xs">{label}</span>
      <input type="number" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" value={Number(v[k])} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} data-testid={`setting-${k}`} />
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}</label>
  );
  const bool = (k: keyof AppSettings, label: string) => (
    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm"><span>{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-teal" checked={Boolean(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.checked })} data-testid={`setting-${k}`} /></label>
  );
  const save = async () => {
    try { await api("/api/admin/settings", { method: "PUT", body: v }); toast.success("Pengaturan tersimpan"); mutate(); }
    catch (e) { toast.error("Gagal", { description: e instanceof Error ? e.message : String(e) }); }
  };
  return (
    <section className="card-surface space-y-3 p-4" data-testid="general-settings">
      <h3 className="font-semibold">Aturan input & koreksi</h3>
      {bool("allowBulkInput", "Izinkan operator Sewing input jumlah (beberapa pcs sekaligus)")}
      {bool("operatorCorrectionEnabled", "Operator boleh mengoreksi/membatalkan input sendiri")}
      {num("operatorCorrectionWindowMin", "Batas waktu koreksi operator (menit)")}
      {bool("managerCanCorrect", "Manajer boleh mengoreksi/membatalkan transaksi")}
      {num("allowBackdateDays", "Printing/Packing: maks. hari ke belakang untuk tanggal kerja")}
      <h3 className="pt-2 font-semibold">Monitoring</h3>
      {num("dashboardRefreshSec", "Interval pembaruan dashboard (detik)", "Polling otomatis berhenti saat tab tidak aktif.")}
      {num("displayRefreshSec", "Interval pembaruan Smart TV (detik)")}
      {num("idleThresholdMin", "Ambang 'line tanpa input' (menit)", "Tidak berlaku saat istirahat atau di luar jadwal.")}
      <label className="block"><span className="label-xs">Departemen acuan capaian target utama</span>
        <select className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" value={v.targetMetricDepartmentCode} onChange={(e) => setV({ ...v, targetMetricDepartmentCode: e.target.value })} data-testid="setting-targetMetricDepartmentCode">
          {meta?.departments.map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}
        </select></label>
      <button onClick={save} className="h-11 w-full rounded-lg bg-navy font-semibold text-white" data-testid="settings-save-button">Simpan pengaturan</button>
    </section>
  );
}

type Disp = { id: string; name: string; tokenPrefix: string; mode: string; lineName: string | null; rotateSeconds: number; isActive: boolean; lastSeenAt: string | null; createdAt: string };

function Displays() {
  const { data, mutate } = useSWR<{ items: Disp[] }>("/api/admin/displays", fetcher);
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher);
  const [form, setForm] = useState({ name: "TV Lantai Produksi", mode: "all", lineId: "", rotateSeconds: 20 });
  const [created, setCreated] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await api<{ token: string }>("/api/admin/displays", { method: "POST", body: { ...form, lineId: form.lineId || null } });
      setCreated(`${window.location.origin}/display/production?token=${r.token}`); mutate();
    } catch (e) { toast.error("Gagal", { description: e instanceof Error ? e.message : String(e) }); }
  };
  const revoke = async (d: Disp) => {
    if (!confirm(`${d.isActive ? "Cabut" : "Aktifkan kembali"} akses display "${d.name}"?`)) return;
    await api(`/api/admin/displays/${d.id}`, { method: "PATCH", body: { isActive: !d.isActive } }).catch((e) => toast.error(e.message));
    mutate();
  };
  const inp = "mt-1 h-10 w-full rounded-lg border px-3 text-sm";
  return (
    <section className="card-surface space-y-3 p-4" data-testid="display-settings">
      <h3 className="flex items-center gap-2 font-semibold"><MonitorPlay className="h-4 w-4" /> Akses Smart TV (baca-saja)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2"><span className="label-xs">Nama layar</span><input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="display-name-input" /></label>
        <label><span className="label-xs">Mode</span><select className={inp} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} data-testid="display-mode-select">{Object.entries(MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {form.mode === "line" ? (
          <label><span className="label-xs">Line</span><select className={inp} value={form.lineId} onChange={(e) => setForm({ ...form, lineId: e.target.value })} data-testid="display-line-select"><option value="">Pilih…</option>{meta?.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        ) : (
          <label><span className="label-xs">Rotasi (detik)</span><input type="number" min={5} className={inp} value={form.rotateSeconds} onChange={(e) => setForm({ ...form, rotateSeconds: Number(e.target.value) })} data-testid="display-rotate-input" /></label>
        )}
      </div>
      <button onClick={create} className="h-10 w-full rounded-lg bg-teal font-semibold text-white" data-testid="display-create-button">Buat link display</button>
      {created && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs" data-testid="display-created-link">
          <div className="mb-1 font-semibold text-amber-900">Salin link ini sekarang — token hanya ditampilkan sekali.</div>
          <div className="flex items-center gap-2"><code className="flex-1 break-all rounded bg-white p-2">{created}</code>
            <button onClick={() => { navigator.clipboard?.writeText(created); toast.success("Link disalin"); }} className="rounded-md bg-navy p-2 text-white" data-testid="display-copy-button" aria-label="Salin"><Copy className="h-4 w-4" /></button></div>
        </div>
      )}
      <ul className="divide-y text-sm" data-testid="display-list">
        {data?.items.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
            <div><div className="font-semibold">{d.name} <span className="num text-xs text-slate-400">{d.tokenPrefix}…</span></div>
              <div className="text-xs text-slate-500">{MODE_LABEL[d.mode]}{d.lineName ? ` · ${d.lineName}` : ""} · terakhir terhubung {d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "belum pernah"}</div></div>
            <button onClick={() => revoke(d)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${d.isActive ? "border border-red-300 text-red-600" : "bg-slate-200 text-slate-700"}`} data-testid={`display-toggle-${d.id}`}>{d.isActive ? "Cabut" : "Dicabut · aktifkan"}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
