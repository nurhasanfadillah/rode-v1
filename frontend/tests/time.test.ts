import { describe, expect, it } from "vitest";
import {
  blockAt, blockState, buildDayPlan, jakartaInstant, lineActivity, pickVersion, resolveWorkContext, type ScheduleConfig,
} from "@/lib/time";

const base: ScheduleConfig = {
  shiftId: "s1", shiftVersionId: "v1", shiftName: "Shift 1", effectiveFrom: "2024-01-01", startTime: "08:00", endTime: "16:00",
  blockMinutes: 45, workDays: [1, 2, 3, 4, 5, 6], breakMode: "exclude", outsidePolicy: "reject",
  breaks: [{ startTime: "12:00", endTime: "13:00", label: "Istirahat" }],
};
const MONDAY = "2026-10-19";
const at = (hm: string, date = MONDAY, ms = 0) => {
  const [h, m] = hm.split(":").map(Number);
  return new Date(jakartaInstant(date, h * 60 + m).getTime() + ms);
};
const ctx = (d: Date, cfg = base) => resolveWorkContext(d, () => [cfg]);

describe("block calculation (half-open intervals, Asia/Jakarta)", () => {
  it("08:00 exactly is Block 1", () => expect(ctx(at("08:00")).blockNo).toBe(1));
  it("08:44:59.999 is still Block 1", () => expect(ctx(at("08:44", MONDAY, 59_999)).blockNo).toBe(1));
  it("08:45 exactly is Block 2 (acceptance #2)", () => expect(ctx(at("08:45")).blockNo).toBe(2));
  it("09:30 is Block 3 and 10:15 is Block 4", () => {
    expect(ctx(at("09:30")).blockNo).toBe(3);
    expect(ctx(at("10:15")).blockNo).toBe(4);
  });
  it("before shift start and at shift end are rejected (end exclusive)", () => {
    expect(ctx(at("07:59", MONDAY, 59_999)).ok).toBe(false);
    expect(ctx(at("16:00")).ok).toBe(false);
    expect(ctx(at("15:59")).ok).toBe(true);
  });
  it("uses server instant, independent of host timezone (UTC 01:45 = 08:45 WIB)", () => {
    expect(ctx(new Date("2026-10-19T01:45:00.000Z")).blockNo).toBe(2);
  });
  it("break excluded: blocks pause during break", () => {
    const plan = buildDayPlan(base);
    expect(plan.productiveMinutes).toBe(420);
    expect(plan.blocks).toHaveLength(10);
    expect(plan.blocks[5].segments).toEqual([{ start: 705, end: 720 }, { start: 780, end: 810 }]);
    const inBreak = ctx(at("12:30"));
    expect(inBreak).toMatchObject({ blockNo: 6, inBreak: true });
    expect(ctx(at("13:30")).blockNo).toBe(7);
  });
  it("clock mode follows the formula floor((t - start)/duration) + 1", () => {
    const cfg = { ...base, breakMode: "clock" as const };
    expect(ctx(at("13:30"), cfg).blockNo).toBe(Math.floor(330 / 45) + 1);
    expect(blockAt(cfg, 12 * 60 + 10)).toMatchObject({ inBreak: true });
  });
  it("non-working day is rejected; clamp policy assigns nearest block", () => {
    expect(ctx(at("09:00", "2026-10-18")).ok).toBe(false);
    const clamp = { ...base, outsidePolicy: "clamp" as const };
    expect(ctx(at("07:00"), clamp)).toMatchObject({ ok: true, blockNo: 1, outside: true });
    expect(ctx(at("17:00"), clamp)).toMatchObject({ ok: true, blockNo: 10 });
  });
  it("overnight shift assigns work date of shift start", () => {
    const night = { ...base, startTime: "22:00", endTime: "06:00", breaks: [], workDays: [1, 2, 3, 4, 5, 6, 7] };
    const r = ctx(at("02:00", "2026-10-20"), night);
    expect(r.workDate).toBe("2026-10-19");
    expect(r.blockNo).toBe(Math.floor(240 / 45) + 1);
  });
  it("picks the schedule version effective on the work date (history preserved)", () => {
    const vs = [{ effectiveFrom: "2024-01-01", blockMinutes: 45 }, { effectiveFrom: "2026-11-01", blockMinutes: 60 }];
    expect(pickVersion(vs, "2026-10-19")?.blockMinutes).toBe(45);
    expect(pickVersion(vs, "2026-11-01")?.blockMinutes).toBe(60);
  });
});

describe("block status colours & line activity", () => {
  it("maps qty/target to states", () => {
    expect(blockState(0, 45, false)).toBe("upcoming");
    expect(blockState(0, 45, true)).toBe("empty");
    expect(blockState(30, 45, true)).toBe("partial");
    expect(blockState(45, 45, true)).toBe("met");
    expect(blockState(10, null, true)).toBe("neutral");
  });
  it("never flags idle during break or before schedule", () => {
    const o = { cfg: base, workDate: MONDAY, lastInputAt: null, idleThresholdMin: 15 };
    expect(lineActivity({ ...o, now: at("07:30") })).toBe("before");
    expect(lineActivity({ ...o, now: at("12:30") })).toBe("break");
    expect(lineActivity({ ...o, now: at("13:10") })).toBe("active");
    expect(lineActivity({ ...o, now: at("13:20") })).toBe("idle");
    expect(lineActivity({ ...o, now: at("09:00"), lastInputAt: at("08:50") })).toBe("active");
  });
});
