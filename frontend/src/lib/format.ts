const nf = new Intl.NumberFormat("id-ID");
const pf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

export const fmtNum = (n: number | null | undefined) => (n == null ? "–" : nf.format(n));
export const fmtPct = (n: number | null | undefined) => (n == null ? "–" : `${pf.format(n)}%`);

export function pct(actual: number, target: number | null | undefined): number | null {
  if (!target) return null;
  return Math.round((actual / target) * 1000) / 10;
}

export function fmtDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00+07:00` : d) : d;
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...opts }).format(date);
}

export function fmtDateTime(d: string | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(d)) + " WIB";
}

export function fmtTime(d: string | Date, seconds = true) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}),
  }).format(new Date(d));
}

export const ROLE_LABEL: Record<string, string> = { operator: "Operator", manager: "Manajer", super_admin: "Super Admin" };
export const STATUS_LABEL: Record<string, string> = { active: "Aktif", corrected: "Dikoreksi", cancelled: "Dibatalkan" };
