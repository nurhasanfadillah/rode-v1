"use client";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtDate, fmtNum } from "@/lib/format";

const LINE_COLORS = ["#0A2463", "#3CAEA3", "#F59E0B", "#6366F1", "#EC4899", "#10B981", "#EF4444", "#0EA5E9"];
const DEPT: Record<string, string> = { PRINTING: "#3CAEA3", SEWING: "#0A2463", PACKING: "#F59E0B" };
const tip = { formatter: (v: unknown) => fmtNum(Number(v)), contentStyle: { borderRadius: 8, fontSize: 12 } };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />;

function Wrap({ children, testId, dark }: { children: React.ReactElement; testId: string; dark?: boolean }) {
  return <div className={dark ? "h-full w-full" : "h-64 w-full"} data-testid={testId}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

export function BlockChart({ data, lines, dark }: { data: Record<string, string | number>[]; lines: string[]; dark?: boolean }) {
  const ax = dark ? "#94A3B8" : "#64748B";
  return (
    <Wrap testId="chart-blocks" dark={dark}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1E293B" : "#E2E8F0"} vertical={false} />
        <XAxis dataKey="block" stroke={ax} tickLine={false} /><YAxis stroke={ax} tickLine={false} width={36} />
        <Tooltip {...tip} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.time ?? ""}`} />
        <Legend wrapperStyle={{ fontSize: 12, color: ax }} />
        {lines.map((l, i) => <Bar key={l} dataKey={l} fill={dark ? ["#3CAEA3", "#60A5FA", "#FBBF24", "#A78BFA", "#F472B6"][i % 5] : LINE_COLORS[i % LINE_COLORS.length]} radius={[3, 3, 0, 0]} isAnimationActive={!dark} />)}
      </BarChart>
    </Wrap>
  );
}

export function HourlyChart({ data, depts }: { data: Record<string, string | number>[]; depts: { code: string; name: string }[] }) {
  return (
    <Wrap testId="chart-hourly">
      <BarChart data={data}>{grid}<XAxis dataKey="hour" tickLine={false} /><YAxis tickLine={false} width={40} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {depts.map((d) => <Bar key={d.code} dataKey={d.code} name={d.name} fill={DEPT[d.code] ?? "#6366F1"} radius={[3, 3, 0, 0]} />)}
      </BarChart>
    </Wrap>
  );
}

export function DeptChart({ data }: { data: { name: string; actual: number; target: number | null }[] }) {
  return (
    <Wrap testId="chart-departments">
      <BarChart data={data.map((d) => ({ ...d, target: d.target ?? 0 }))}>{grid}<XAxis dataKey="name" tickLine={false} /><YAxis tickLine={false} width={44} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="target" name="Target" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
        <Bar dataKey="actual" name="Aktual" fill="#0A2463" radius={[3, 3, 0, 0]} />
      </BarChart>
    </Wrap>
  );
}

export function LineChart({ data }: { data: { name: string; actual: number; target: number | null }[] }) {
  return (
    <Wrap testId="chart-lines">
      <BarChart data={data.map((d) => ({ ...d, target: d.target ?? 0 }))} layout="vertical">{grid}<XAxis type="number" tickLine={false} /><YAxis type="category" dataKey="name" width={64} tickLine={false} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="target" name="Target" fill="#CBD5E1" radius={[0, 3, 3, 0]} />
        <Bar dataKey="actual" name="Aktual" fill="#3CAEA3" radius={[0, 3, 3, 0]} />
      </BarChart>
    </Wrap>
  );
}

export function DailyTrend({ data, depts }: { data: Record<string, string | number>[]; depts: { code: string; name: string }[] }) {
  return (
    <Wrap testId="chart-daily">
      <RLineChart data={data}>{grid}<XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, { day: "2-digit", month: "short" })} tickLine={false} /><YAxis tickLine={false} width={44} />
        <Tooltip {...tip} labelFormatter={(d) => fmtDate(String(d))} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {depts.map((d) => <Line key={d.code} dataKey={d.code} name={d.name} stroke={DEPT[d.code] ?? "#6366F1"} strokeWidth={2.5} dot={{ r: 3 }} />)}
      </RLineChart>
    </Wrap>
  );
}
