"use client";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetcher } from "@/lib/client";
import { fmtNum, ROLE_LABEL } from "@/lib/format";
import { PageHeader } from "../common";
import type { Meta } from "../input/InputPage";
import { CrudTab, type Field } from "./CrudTab";

const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? "—");

export function MasterPage() {
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher);
  const { data: allDepts } = useSWR<{ items: { id: string; name: string; kind: string }[] }>("/api/admin/departments?pageSize=200", fetcher);
  const { data: allLines } = useSWR<{ items: { id: string; name: string; departmentId: string }[] }>("/api/admin/lines?pageSize=200", fetcher);
  const depts = allDepts?.items ?? meta?.departments ?? [];
  const lineDepts = depts.filter((d) => d.kind === "line_block");
  const deptName = (id: unknown) => depts.find((d) => d.id === id)?.name ?? "—";
  const active: Field = { key: "isActive", label: "Aktif", type: "switch" };

  return (
    <div>
      <PageHeader title="Master Data" subtitle="Departemen, line, produk, dan pengguna. Data tidak dihapus — gunakan status nonaktif." />
      <Tabs defaultValue="products">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0" data-testid="master-tabs">
          {[["products", "Produk"], ["lines", "Line Sewing"], ["users", "Pengguna"], ["departments", "Departemen"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-full border bg-white px-4 py-2 data-[state=active]:border-navy data-[state=active]:bg-navy data-[state=active]:text-white" data-testid={`master-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="products">
          <CrudTab entity="products" title="Produk" columns={[
            { label: "Kode", render: (r) => <span className="num">{s(r, "code")}</span> }, { label: "Nama", render: (r) => <b>{s(r, "name")}</b> },
            { label: "Kategori", render: (r) => s(r, "category") }, { label: "Satuan", render: (r) => s(r, "unit") },
            { label: "Target default", render: (r) => fmtNum(r.defaultTarget as number | null) },
          ]} fields={[
            { key: "code", label: "Kode produk (unik)", type: "text", required: true }, { key: "name", label: "Nama produk", type: "text", required: true },
            { key: "category", label: "Kategori", type: "text" }, { key: "unit", label: "Satuan", type: "text", hint: "Default PCS" },
            { key: "defaultTarget", label: "Target default (opsional)", type: "number" }, { key: "notes", label: "Catatan", type: "textarea" }, active,
          ]} />
        </TabsContent>
        <TabsContent value="lines">
          <CrudTab entity="lines" title="Line" columns={[
            { label: "Kode", render: (r) => <span className="num">{s(r, "code")}</span> }, { label: "Nama", render: (r) => <b>{s(r, "name")}</b> },
            { label: "Departemen", render: (r) => deptName(r.departmentId) }, { label: "Urutan", render: (r) => s(r, "sortOrder") },
          ]} fields={[
            { key: "code", label: "Kode line", type: "text", required: true }, { key: "name", label: "Nama line", type: "text", required: true },
            { key: "departmentId", label: "Departemen", type: "select", options: lineDepts.map((d) => ({ value: d.id, label: d.name })) },
            { key: "sortOrder", label: "Urutan tampil dashboard", type: "number" }, active,
          ]} />
          <p className="mt-3 text-xs text-slate-500">Target harian & target per blok tiap line diatur di menu <b>Target</b> (tersimpan berversi). Penugasan operator diatur di tab Pengguna.</p>
        </TabsContent>
        <TabsContent value="users">
          <CrudTab entity="users" title="Pengguna" columns={[
            { label: "Nama", render: (r) => <b>{s(r, "fullName")}</b> }, { label: "Username", render: (r) => <span className="num">{s(r, "username")}</span> },
            { label: "Role", render: (r) => ROLE_LABEL[String(r.role)] }, { label: "Departemen", render: (r) => s(r, "departmentName") }, { label: "Line", render: (r) => s(r, "lineName") },
          ]} fields={[
            { key: "fullName", label: "Nama lengkap", type: "text", required: true }, { key: "username", label: "Username", type: "text", required: true },
            { key: "role", label: "Role", type: "select", options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })) },
            { key: "departmentId", label: "Departemen", type: "select", options: [{ value: "", label: "— Tidak ada —" }, ...depts.map((d) => ({ value: d.id, label: d.name }))] },
            { key: "lineId", label: "Line (wajib untuk operator Sewing)", type: "select", options: [{ value: "", label: "— Tidak ada —" }, ...(allLines?.items ?? []).map((l) => ({ value: l.id, label: `${l.name} (${deptName(l.departmentId)})` }))] },
            { key: "password", label: "Password", type: "password", required: true, hint: "Min. 8 karakter. Kosongkan saat edit jika tidak diubah (mengubah password akan mengakhiri sesi pengguna)." }, active,
          ]} />
        </TabsContent>
        <TabsContent value="departments">
          <CrudTab entity="departments" title="Departemen" columns={[
            { label: "Kode", render: (r) => <span className="num">{s(r, "code")}</span> }, { label: "Nama", render: (r) => <b>{s(r, "name")}</b> },
            { label: "Tipe pencatatan", render: (r) => (r.kind === "line_block" ? "Per line & blok waktu" : "Harian per produk") }, { label: "Urutan", render: (r) => s(r, "sortOrder") },
          ]} fields={[
            { key: "code", label: "Kode", type: "text", required: true }, { key: "name", label: "Nama", type: "text", required: true },
            { key: "kind", label: "Tipe pencatatan", type: "select", options: [{ value: "daily", label: "Harian per produk" }, { value: "line_block", label: "Per line & blok waktu" }] },
            { key: "sortOrder", label: "Urutan", type: "number" }, active,
          ]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
