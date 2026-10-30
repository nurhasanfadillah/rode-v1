import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { departments, productionLines, products, shifts } from "@/db/schema";
import { fmtDate, fmtDateTime, pct } from "@/lib/format";
import { getDashboard, type DashFilters } from "./aggregate";

export type Cell = string | number | null;
export interface Section { key: string; title: string; columns: string[]; rows: Cell[][]; note?: string }
export interface Report { title: string; meta: [string, string][]; sections: Section[]; summary: { department: string; actual: number; target: number | null; pct: number | null; productFiltered: boolean } }

const STATE_LABEL: Record<string, string> = {
  upcoming: "Belum dimulai", empty: "Kosong", partial: "Di bawah target", met: "Target tercapai", neutral: "Tanpa target",
};

async function filterLabels(f: DashFilters) {
  const one = async <T extends { id: string; name: string }>(rows: Promise<T[]>) => (await rows)[0]?.name ?? "-";
  return {
    departmentId: f.departmentId ? await one(db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, [f.departmentId]))) : "Semua",
    lineId: f.lineId ? await one(db.select({ id: productionLines.id, name: productionLines.name }).from(productionLines).where(inArray(productionLines.id, [f.lineId]))) : "Semua",
    shiftId: f.shiftId ? await one(db.select({ id: shifts.id, name: shifts.name }).from(shifts).where(inArray(shifts.id, [f.shiftId]))) : "Semua",
    productId: f.productId ? await one(db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, [f.productId]))) : "Semua",
  };
}

/** Daily (from = to) or range report. Built from the same aggregation service as dashboard & Smart TV. */
export async function buildReport(f: DashFilters, now = new Date()): Promise<Report> {
  const d = await getDashboard({ ...f, operatorId: undefined }, now);
  const { from, to } = d.filters;
  const single = from === to;
  const labels = await filterLabels(f);
  const metric = d.metric;
  const period = single ? fmtDate(from, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${fmtDate(from)} s.d. ${fmtDate(to)}`;

  const sections: Section[] = [
    {
      key: "departments", title: "Total per departemen", columns: ["Departemen", "Aktual (pcs)", f.productId ? "Target harian (semua produk)" : "Target (pcs)", "Capaian (%)"],
      rows: d.departments.map((x) => [x.name, x.actual, x.target, f.productId ? null : x.pct]),
      note: "Output tiap departemen adalah tahap proses berbeda dan tidak dijumlahkan sebagai produksi unik.",
    },
    {
      key: "products", title: "Total per produk", columns: ["Kode", "Produk", ...d.departments.map((x) => `${x.name} (pcs)`)],
      rows: d.products.map((p) => [p.code, p.name, ...d.departments.map((x) => p.byDept[x.id] ?? 0)]),
    },
  ];
  if (d.lines.length) {
    sections.push({
      key: "lines", title: "Total per line Sewing",
      columns: ["Line", "Aktual (pcs)", f.productId ? "Target harian (semua produk)" : "Target (pcs)", "Capaian (%)", f.productId ? "Target per blok (semua produk)" : "Target per blok", "Produk dikerjakan"],
      rows: d.lines.map((l) => [l.name, l.actual, l.target, f.productId ? null : l.pct, l.blockTarget, l.products.map((p) => `${p.name} (${p.qty})`).join(", ")]),
      note: "Bandingkan line dengan konteks target, jadwal, dan produk — total pcs saja tidak menunjukkan efisiensi.",
    });
  }
  if (single && d.lines.some((l) => l.blocks.length)) {
    sections.push({
      key: "blocks", title: "Detail per blok Sewing", columns: ["Line", "Blok", "Jam", "Aktual (pcs)", f.productId ? "Target blok (semua produk)" : "Target blok", "Capaian (%)", "Status"],
      rows: d.lines.flatMap((l) => l.blocks.map((b) => [l.name, b.no, `${b.start}–${b.end}`, b.qty, b.target, f.productId ? null : pct(b.qty, b.target), f.productId ? "Tidak dibandingkan" : STATE_LABEL[b.state]])),
    });
  }
  if (!single) {
    sections.push({
      key: "daily", title: "Tren harian", columns: ["Tanggal", ...d.departments.map((x) => `${x.name} (pcs)`)],
      rows: d.daily.map((r) => [fmtDate(String(r.date), { weekday: "short", day: "2-digit", month: "short", year: "numeric" }), ...d.departments.map((x) => Number(r[x.code] ?? 0))]),
    });
  }

  return {
    title: single ? "Laporan Produksi Harian" : "Laporan Produksi Rentang Tanggal",
    meta: [
      ["Perusahaan", "PT REDONE BERKAH MANDIRI"], ["Periode", period], ["Departemen", labels.departmentId], ["Line", labels.lineId],
      ["Shift", labels.shiftId], ["Produk", labels.productId], ["Status dihitung", "Aktif + dikoreksi (dibatalkan dikecualikan)"],
      ["Dibuat pada", fmtDateTime(now)], ["Transaksi terakhir", d.lastUpdated ? fmtDateTime(d.lastUpdated) : "-"],
    ],
    sections,
    summary: { department: metric?.name ?? "-", actual: metric?.actual ?? 0, target: metric?.target ?? null, pct: f.productId ? null : metric?.pct ?? null, productFiltered: Boolean(f.productId) },
  };
}

/** Neutralise spreadsheet formula injection. */
export function safeCell(v: Cell): Cell {
  if (typeof v === "string" && (/^[=+@\t\r]/.test(v) || /^-./.test(v))) return `'${v}`;
  return v;
}

const csvNum = (n: number) => String(n).replace(".", ",");

export function toCsv(r: Report): string {
  const esc = (v: Cell) => {
    if (v == null) return "";
    const s = typeof v === "number" ? csvNum(v) : String(safeCell(v));
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [esc(r.title), ...r.meta.map(([k, v]) => `${esc(k)};${esc(v)}`), "", esc("Ringkasan"), `${esc(`Aktual ${r.summary.department}`)};${esc(r.summary.actual)}`, `${esc(r.summary.productFiltered ? "Target harian (semua produk)" : `Target ${r.summary.department}`)};${esc(r.summary.target)}`, `${esc("Capaian")};${esc(r.summary.pct == null ? "Tidak ditampilkan" : `${r.summary.pct}%`)}`, ""];
  for (const s of r.sections) {
    lines.push(esc(s.title), s.columns.map(esc).join(";"), ...s.rows.map((row) => row.map(esc).join(";")));
    if (s.note) lines.push(esc(`Catatan: ${s.note}`));
    lines.push("");
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export async function toXlsx(r: Report): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "RODE";
  wb.created = new Date();
  const info = wb.addWorksheet("Info");
  info.addRow([safeCell(r.title)]).font = { bold: true, size: 14 };
  r.meta.forEach(([k, v]) => info.addRow([safeCell(k), safeCell(v)]));
  info.addRow([]);
  info.addRow(["Ringkasan", "Nilai"]).font = { bold: true };
  info.addRow([safeCell(`Aktual ${r.summary.department}`), r.summary.actual]);
  info.addRow([safeCell(r.summary.productFiltered ? "Target harian (semua produk)" : `Target ${r.summary.department}`), r.summary.target]);
  info.addRow(["Capaian", r.summary.pct == null ? "Tidak ditampilkan" : `${r.summary.pct}%`]);
  info.getColumn(1).width = 22;
  info.getColumn(2).width = 60;
  for (const s of r.sections) {
    const ws = wb.addWorksheet(s.title.slice(0, 31));
    ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const head = ws.addRow(s.columns.map(safeCell));
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2463" } };
    s.rows.forEach((row) => ws.addRow(row.map(safeCell)));
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(50, Math.max(12, c.length + 4));
      if (/\(%\)/.test(c)) col.numFmt = "0.0";
      else if (/pcs|blok$/i.test(c)) col.numFmt = "#,##0";
    });
    if (s.note) { ws.addRow([]); ws.addRow([safeCell(`Catatan: ${s.note}`)]).font = { italic: true }; }
    ws.pageSetup.printTitlesRow = "1:1";
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
