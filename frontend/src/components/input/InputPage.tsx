"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client";
import type { SessionUser } from "@/lib/auth";
import { ErrorState, PageHeader, Skel } from "../common";
import { DailyInput } from "./DailyInput";
import { SewingInput } from "./SewingInput";

export interface Meta {
  user: SessionUser; today: string; serverTime: string;
  departments: { id: string; code: string; name: string; kind: "line_block" | "daily" }[];
  lines: { id: string; code: string; name: string; departmentId: string }[];
  products: { id: string; code: string; name: string; unit: string; category: string | null; isDemo: boolean }[];
  operators: { id: string; fullName: string }[];
  shifts: { id: string; code: string; name: string }[];
  settings: { allowBulkInput: boolean; allowBackdateDays: number; dashboardRefreshSec: number; operatorCorrectionEnabled: boolean; operatorCorrectionWindowMin: number };
}

export function InputPage({ user }: { user: SessionUser }) {
  const { data: meta, error, mutate } = useSWR<Meta>("/api/meta", fetcher, { revalidateOnFocus: false });
  const [deptId, setDeptId] = useState<string | null>(user.departmentId);
  const [lineId, setLineId] = useState<string | null>(user.lineId);
  const isAdmin = user.role === "super_admin";

  useEffect(() => {
    if (meta && isAdmin && !deptId) setDeptId(meta.departments[0]?.id ?? null);
  }, [meta, isAdmin, deptId]);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!meta) return <div className="mx-auto max-w-md space-y-4"><Skel className="h-10 w-1/2" /><Skel className="h-16" /><Skel className="h-44" /><Skel className="h-40" /></div>;

  const dept = meta.departments.find((d) => d.id === deptId);
  const deptLines = meta.lines.filter((l) => l.departmentId === deptId);
  if (!dept) return <ErrorState message="Akun Anda belum ditugaskan ke departemen aktif. Hubungi Super Admin." />;

  return (
    <div className="mx-auto max-w-md lg:max-w-5xl">
      <PageHeader title={`Input ${dept.name}`} subtitle={<span>Halo, <b>{user.fullName}</b>. Waktu pencatatan memakai jam server (WIB).</span>} />
      {isAdmin && (
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-sm" data-testid="admin-input-selector">
          <div className="col-span-2 text-xs font-semibold text-amber-800">Mode Super Admin — pilih departemen/line yang dicatat</div>
          <select className="h-10 rounded-md border bg-white px-2" value={deptId ?? ""} onChange={(e) => { setDeptId(e.target.value); setLineId(null); }} data-testid="admin-dept-select">
            {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {dept.kind === "line_block" && (
            <select className="h-10 rounded-md border bg-white px-2" value={lineId ?? ""} onChange={(e) => setLineId(e.target.value)} data-testid="admin-line-select">
              <option value="">Pilih line…</option>
              {deptLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>
      )}
      {dept.kind === "line_block"
        ? lineId ? <SewingInput meta={meta} departmentId={dept.id} lineId={lineId} isAdmin={isAdmin} /> : <ErrorState message="Pilih line terlebih dahulu (atau minta admin menugaskan line ke akun Anda)." />
        : <DailyInput meta={meta} departmentId={dept.id} isAdmin={isAdmin} />}
    </div>
  );
}
