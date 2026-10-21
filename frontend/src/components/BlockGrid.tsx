"use client";
import { Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATE_META } from "./common";

export interface GridBlock { no: number; start: string; end: string; qty: number; target: number | null; state: keyof typeof STATE_META; current: boolean; breakOnly: boolean }

export function BlockGrid({ blocks, breaks = [], tv = false, compact = false, cols, legend = true, testId = "block-grid" }: {
  blocks: GridBlock[]; breaks?: { start: string; end: string; label: string }[]; tv?: boolean; compact?: boolean; cols?: string; legend?: boolean; testId?: string;
}) {
  if (!blocks.length) return null;
  return (
    <div data-testid={testId}>
      <div className={cn("grid gap-1.5", cols ?? (compact ? "grid-cols-5 sm:grid-cols-10" : "grid-cols-3 sm:grid-cols-5"))}>
        {blocks.map((b) => {
          const m = STATE_META[b.state];
          const Icon = m.icon;
          return (
            <div key={b.no} data-testid={`${testId}-block-${b.no}`} data-state={b.state} title={`Blok ${b.no} · ${b.start}–${b.end} · ${m.label}`}
              className={cn("relative rounded-lg border p-2 transition-colors", tv ? m.tv : m.light, b.current && (tv ? "ring-2 ring-white" : "ring-2 ring-navy ring-offset-1"))}>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase opacity-90">
                <span>B{b.no}</span><Icon className="h-3 w-3" aria-label={m.label} />
              </div>
              <div className={cn("num truncate font-extrabold leading-tight", compact ? "text-base" : "text-xl")}>
                {b.qty}{b.target != null && !compact && <span className="text-[11px] font-semibold opacity-75">/{b.target}</span>}
              </div>
              {compact && b.target != null && <div className="num truncate text-[10px] font-semibold leading-none opacity-75">/{b.target}</div>}
              {!compact && <div className="num text-[10px] opacity-80">{b.start}–{b.end}</div>}
              {!compact && <div className="sr-only">{m.label}</div>}
            </div>
          );
        })}
      </div>
      {legend && <div className={cn("mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]", tv ? "text-slate-400" : "text-slate-500")}>
        {(Object.keys(STATE_META) as (keyof typeof STATE_META)[]).map((k) => {
          const Icon = STATE_META[k].icon;
          return <span key={k} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{STATE_META[k].label}</span>;
        })}
        {breaks.map((b) => (
          <span key={b.start} className={cn("inline-flex items-center gap-1 rounded px-1.5", tv ? "bg-indigo-950 text-indigo-300" : "bg-indigo-50 text-indigo-700")} data-testid="break-marker">
            <Coffee className="h-3 w-3" /> {b.label} {b.start}–{b.end} (tidak dihitung)
          </span>
        ))}
      </div>}
    </div>
  );
}
