"use client";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, fetcher, qs } from "@/lib/client";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DemoTag, EmptyState, ErrorState, Skel } from "../common";

export type Field = { key: string; label: string; type: "text" | "number" | "select" | "switch" | "password" | "textarea"; options?: { value: string; label: string }[]; required?: boolean; hint?: string };
export type Column = { label: string; render: (r: Record<string, unknown>) => React.ReactNode };
type Row = Record<string, unknown> & { id: string; isActive?: boolean; isDemo?: boolean };

export function CrudTab({ entity, title, fields, columns, filters }: { entity: string; title: string; fields: Field[]; columns: Column[]; filters?: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const key = `/api/admin/${entity}${qs({ q, active, page, pageSize: 20 })}`;
  const { data, error, mutate } = useSWR<{ items: Row[]; total: number; pageSize: number }>(key, fetcher, { keepPreviousData: true });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div data-testid={`crud-${entity}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-lg border bg-white px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={`Cari ${title.toLowerCase()}…`} className="w-full bg-transparent text-sm outline-none" data-testid={`${entity}-search-input`} />
        </div>
        <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} className="h-10 rounded-lg border bg-white px-2 text-sm" data-testid={`${entity}-active-filter`}>
          <option value="">Semua status</option><option value="true">Aktif</option><option value="false">Nonaktif</option>
        </select>
        {filters}
        <button onClick={() => setEdit("new")} className="flex h-10 items-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-700" data-testid={`${entity}-add-button`}><Plus className="h-4 w-4" /> Tambah</button>
      </div>
      {error ? <ErrorState message={error.message} onRetry={() => mutate()} /> : !data ? <Skel className="h-48" /> : data.items.length === 0 ? <EmptyState title={`Belum ada ${title.toLowerCase()}`} hint="Klik Tambah untuk membuat data baru." /> : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid={`${entity}-table`}>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>{columns.map((c) => <th key={c.label} className="px-3 py-2.5">{c.label}</th>)}<th className="px-3 py-2.5">Status</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((r) => (
                <tr key={r.id} className={cn(!r.isActive && "bg-slate-50 text-slate-400")} data-testid={`${entity}-row-${r.id}`}>
                  {columns.map((c, i) => <td key={c.label} className="px-3 py-2">{c.render(r)}{i === 0 && r.isDemo ? <DemoTag /> : null}</td>)}
                  <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600")}>{r.isActive ? "Aktif" : "Nonaktif"}</span></td>
                  <td className="px-3 py-2 text-right"><button onClick={() => setEdit(r)} className="rounded-md p-1.5 text-navy hover:bg-navy-50" data-testid={`${entity}-edit-${r.id}`} aria-label="Edit"><Pencil className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <div className="mt-3 flex items-center justify-between text-sm"><span className="text-slate-500">{fmtNum(data.total)} data</span>
        <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border bg-white p-2 disabled:opacity-40" data-testid={`${entity}-prev`}><ChevronLeft className="h-4 w-4" /></button>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border bg-white p-2 disabled:opacity-40" data-testid={`${entity}-next`}><ChevronRight className="h-4 w-4" /></button></div></div>}
      {edit && <EntityForm entity={entity} title={title} fields={fields} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); mutate(); }} />}
    </div>
  );
}

function EntityForm({ entity, title, fields, row, onClose, onSaved }: { entity: string; title: string; fields: Field[]; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const init: Record<string, unknown> = {};
  fields.forEach((f) => { init[f.key] = row ? row[f.key] ?? (f.type === "switch" ? false : "") : f.type === "switch" ? true : f.options?.[0]?.value ?? ""; });
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = {};
    fields.forEach((f) => {
      const val = v[f.key];
      if (f.type === "password" && !val) return;
      if (!row && (f.type === "text" || f.type === "textarea") && !f.required && val === "") return;
      if (row && val === init[f.key] && f.type !== "password") return;
      body[f.key] = f.type === "number" ? (val === "" || val == null ? null : Number(val)) : f.type === "select" && val === "" ? null : val;
    });
    try {
      await api(row ? `/api/admin/${entity}/${row.id}` : `/api/admin/${entity}`, { method: row ? "PATCH" : "POST", body });
      toast.success(`${title} tersimpan`);
      onSaved();
    } catch (err) { toast.error("Gagal menyimpan", { description: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); }
  };
  const inp = "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid={`${entity}-form-dialog`}>
        <DialogHeader><DialogTitle>{row ? "Edit" : "Tambah"} {title}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="label-xs">{f.label}{f.required && " *"}</span>
              {f.type === "select" ? (
                <select className={inp} value={String(v[f.key] ?? "")} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} data-testid={`${entity}-field-${f.key}`}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "switch" ? (
                <div className="mt-1"><input type="checkbox" className="h-5 w-5 accent-teal" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} data-testid={`${entity}-field-${f.key}`} /></div>
              ) : f.type === "textarea" ? (
                <textarea className={cn(inp, "h-20 py-2")} value={String(v[f.key] ?? "")} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} data-testid={`${entity}-field-${f.key}`} />
              ) : (
                <input className={inp} type={f.type === "password" ? "password" : f.type} required={f.required && !(f.type === "password" && row)} value={String(v[f.key] ?? "")}
                  onChange={(e) => setV({ ...v, [f.key]: e.target.value })} data-testid={`${entity}-field-${f.key}`} autoComplete={f.type === "password" ? "new-password" : "off"} />
              )}
              {f.hint && <span className="text-[11px] text-slate-500">{f.hint}</span>}
            </label>
          ))}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-10 flex-1 rounded-lg border" data-testid={`${entity}-form-cancel`}>Batal</button>
            <button disabled={busy} className="h-10 flex-1 rounded-lg bg-navy font-semibold text-white disabled:opacity-60" data-testid={`${entity}-form-submit`}>{busy ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
