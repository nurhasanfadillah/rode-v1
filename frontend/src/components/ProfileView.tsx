"use client";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { InstallButton } from "./Pwa";
import { PageHeader } from "./common";

export function ProfileView({ user, department, line }: { user: SessionUser; department: string | null; line: string | null }) {
  const rows: [string, string][] = [
    ["Nama", user.fullName], ["Username", user.username], ["Role", ROLE_LABEL[user.role]],
    ["Departemen", department ?? "—"], ["Line", line ?? "—"],
  ];
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Profil" subtitle="Informasi akun dan penugasan Anda." />
      <div className="card-surface divide-y" data-testid="profile-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-5 py-3.5 text-sm">
            <span className="text-slate-500">{k}</span><span className="font-semibold text-slate-900" data-testid={`profile-${k.toLowerCase()}`}>{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-4">
        <InstallButton />
        <button
          data-testid="profile-logout-button"
          onClick={async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => undefined); window.location.href = "/login"; }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white font-semibold text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" /> Keluar
        </button>
        <p className="text-xs text-slate-500">Sesi otomatis berakhir setelah beberapa jam. Untuk mengganti password, hubungi Super Admin.</p>
      </div>
    </div>
  );
}
