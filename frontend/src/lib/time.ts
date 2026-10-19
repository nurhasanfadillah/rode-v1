// Single source of truth for work-date, shift and block calculations (Asia/Jakarta, UTC+7, no DST).
export const TZ = "Asia/Jakarta";
export const OFFSET_MIN = 420;
const DAY_MS = 86_400_000;

export type BreakMode = "exclude" | "clock";
export type OutsidePolicy = "reject" | "clamp";

export interface ScheduleConfig {
  shiftId: string;
  shiftVersionId: string;
  shiftName: string;
  effectiveFrom: string;
  startTime: string;
  endTime: string;
  blockMinutes: number;
  workDays: number[];
  breakMode: BreakMode;
  outsidePolicy: OutsidePolicy;
  breaks: { startTime: string; endTime: string; label: string }[];
}

export interface Segment { start: number; end: number }
export interface Block {
  no: number;
  start: number;
  end: number;
  segments: Segment[];
  productiveMinutes: number;
  breakOnly: boolean;
}
export interface BreakWindow extends Segment { label: string }
export interface DayPlan {
  start: number;
  end: number;
  blocks: Block[];
  breaks: BreakWindow[];
  productiveMinutes: number;
}

export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) throw new Error(`Format jam tidak valid: ${hm}`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) throw new Error(`Format jam tidak valid: ${hm}`);
  return h * 60 + mi;
}

export function formatHM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}.${String(m % 60).padStart(2, "0")}`;
}

export function jakartaParts(d: Date) {
  const shifted = d.getTime() + OFFSET_MIN * 60_000;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  const date = new Date(dayStart).toISOString().slice(0, 10);
  return { date, minutes: (shifted - dayStart) / 60_000 };
}

export function todayJakarta(now = new Date()): string {
  return jakartaParts(now).date;
}

export function addDays(dateStr: string, n: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function isoDow(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Epoch instant for minutes offset from 00:00 WIB of dateStr (minutes may exceed 1440). */
export function jakartaInstant(dateStr: string, minutes: number): Date {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - OFFSET_MIN * 60_000 + minutes * 60_000);
}

/** Minutes since 00:00 WIB of workDate for an instant. */
export function minutesOnWorkDate(workDate: string, d: Date): number {
  return (d.getTime() - jakartaInstant(workDate, 0).getTime()) / 60_000;
}

export function pickVersion<T extends { effectiveFrom: string }>(versions: T[], date: string): T | undefined {
  return versions
    .filter((v) => v.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}

function normalizeBreaks(cfg: ScheduleConfig, start: number, end: number): BreakWindow[] {
  const out: BreakWindow[] = [];
  for (const b of cfg.breaks) {
    let bs = parseHM(b.startTime);
    let be = parseHM(b.endTime);
    if (bs < start) bs += 1440;
    if (be <= bs) be += 1440;
    bs = Math.max(bs, start);
    be = Math.min(be, end);
    if (be > bs) out.push({ start: bs, end: be, label: b.label });
  }
  out.sort((a, b) => a.start - b.start);
  const merged: BreakWindow[] = [];
  for (const b of out) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }
  return merged;
}

function productiveSegments(start: number, end: number, breaks: BreakWindow[]): Segment[] {
  const segs: Segment[] = [];
  let cur = start;
  for (const b of breaks) {
    if (b.start > cur) segs.push({ start: cur, end: b.start });
    cur = Math.max(cur, b.end);
  }
  if (end > cur) segs.push({ start: cur, end });
  return segs;
}

function overlap(a: Segment, b: Segment) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function buildDayPlan(cfg: ScheduleConfig): DayPlan {
  const start = parseHM(cfg.startTime);
  let end = parseHM(cfg.endTime);
  if (end <= start) end += 1440;
  const breaks = normalizeBreaks(cfg, start, end);
  const segs = productiveSegments(start, end, breaks);
  const productiveMinutes = segs.reduce((s, x) => s + x.end - x.start, 0);
  const dur = cfg.blockMinutes;
  const blocks: Block[] = [];

  if (cfg.breakMode === "exclude") {
    let no = 1;
    let acc = 0;
    let current: Segment[] = [];
    for (const seg of segs) {
      let s = seg.start;
      while (s < seg.end) {
        const take = Math.min(dur - acc, seg.end - s);
        current.push({ start: s, end: s + take });
        acc += take;
        s += take;
        if (acc === dur) {
          blocks.push(mkBlock(no++, current));
          current = [];
          acc = 0;
        }
      }
    }
    if (current.length) blocks.push(mkBlock(no, current));
  } else {
    for (let s = start, no = 1; s < end; s += dur, no++) {
      const seg = { start: s, end: Math.min(end, s + dur) };
      const breakMin = breaks.reduce((t, b) => t + overlap(seg, b), 0);
      const prod = seg.end - seg.start - breakMin;
      blocks.push({ no, start: seg.start, end: seg.end, segments: [seg], productiveMinutes: prod, breakOnly: prod <= 0 });
    }
  }
  return { start, end, blocks, breaks, productiveMinutes };
}

function mkBlock(no: number, segments: Segment[]): Block {
  const productiveMinutes = segments.reduce((s, x) => s + x.end - x.start, 0);
  return { no, start: segments[0].start, end: segments[segments.length - 1].end, segments, productiveMinutes, breakOnly: false };
}

export interface BlockPosition { blockNo: number; inBreak: boolean }

/** Half-open intervals: [start, end). `m` = minutes since 00:00 WIB of the work date. */
export function blockAt(cfg: ScheduleConfig, m: number, plan = buildDayPlan(cfg)): BlockPosition | null {
  if (m < plan.start || m >= plan.end) return null;
  const inBreak = plan.breaks.some((b) => m >= b.start && m < b.end);
  const dur = cfg.blockMinutes;
  if (cfg.breakMode === "clock") {
    return { blockNo: Math.floor((m - plan.start) / dur) + 1, inBreak };
  }
  let elapsed = m - plan.start;
  for (const b of plan.breaks) elapsed -= overlap({ start: plan.start, end: m }, b);
  const no = Math.min(Math.floor(elapsed / dur) + 1, plan.blocks.length);
  return { blockNo: no, inBreak };
}

export interface WorkContext {
  ok: boolean;
  workDate: string;
  config: ScheduleConfig | null;
  blockNo: number | null;
  inBreak: boolean;
  outside: boolean;
  reason?: string;
}

export function isWorkDay(cfg: ScheduleConfig, date: string) {
  return cfg.workDays.includes(isoDow(date));
}

/** Resolve work date, shift and block for an instant using the configs effective on each candidate date. */
export function resolveWorkContext(now: Date, configsFor: (date: string) => ScheduleConfig[]): WorkContext {
  const { date, minutes } = jakartaParts(now);
  const candidates: [string, number][] = [[date, minutes], [addDays(date, -1), minutes + 1440]];
  for (const [d, m] of candidates) {
    for (const cfg of configsFor(d)) {
      if (!isWorkDay(cfg, d)) continue;
      const pos = blockAt(cfg, m);
      if (pos) return { ok: true, workDate: d, config: cfg, blockNo: pos.blockNo, inBreak: pos.inBreak, outside: false };
    }
  }
  const cfg = configsFor(date)[0] ?? null;
  if (cfg && cfg.outsidePolicy === "clamp") {
    const plan = buildDayPlan(cfg);
    const blockNo = minutes < plan.start ? 1 : plan.blocks.length;
    return { ok: true, workDate: date, config: cfg, blockNo, inBreak: false, outside: true };
  }
  return {
    ok: false, workDate: date, config: cfg, blockNo: null, inBreak: false, outside: true,
    reason: cfg ? "Di luar jam kerja. Pencatatan tidak diizinkan saat ini." : "Jadwal shift belum dikonfigurasi.",
  };
}

export type BlockState = "upcoming" | "empty" | "partial" | "met" | "neutral";

export function blockTargetFor(block: Block, blockTarget: number | null, blockMinutes: number): number | null {
  if (blockTarget == null || block.breakOnly) return null;
  return Math.max(1, Math.round((blockTarget * block.productiveMinutes) / blockMinutes));
}

export function blockState(qty: number, target: number | null, started: boolean): BlockState {
  if (!started && qty === 0) return "upcoming";
  if (qty === 0) return "empty";
  if (target == null) return "neutral";
  return qty >= target ? "met" : "partial";
}

export type Activity = "off" | "before" | "break" | "active" | "idle" | "done";

/** Never flags idle during breaks or outside the scheduled window. */
export function lineActivity(opts: {
  cfg: ScheduleConfig | null; workDate: string; now: Date; lastInputAt: Date | null; idleThresholdMin: number;
}): Activity {
  const { cfg, workDate, now, lastInputAt, idleThresholdMin } = opts;
  if (!cfg || !isWorkDay(cfg, workDate)) return "off";
  const plan = buildDayPlan(cfg);
  const m = minutesOnWorkDate(workDate, now);
  if (m < plan.start) return "before";
  if (m >= plan.end) return "done";
  if (plan.breaks.some((b) => m >= b.start && m < b.end)) return "break";
  const lastBreakEnd = plan.breaks.filter((b) => b.end <= m).map((b) => b.end);
  const refs = [plan.start, ...lastBreakEnd];
  if (lastInputAt) refs.push(minutesOnWorkDate(workDate, lastInputAt));
  return m - Math.max(...refs) > idleThresholdMin ? "idle" : "active";
}
