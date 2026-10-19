"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, CalendarClock, ClipboardList, Factory, History, LogOut, Menu, MonitorPlay, PlusSquare, ScrollText, Settings, Target, User, X, WifiOff,
} from "lucide-react";
import { api, useOnline } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

type Item = { href: string; label: string; icon: typeof User; roles: string[] };
const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["manager", "super_admin"] },
  { href: "/input", label: "Input", icon: PlusSquare, roles: ["operator", "super_admin"] },
  { href: "/history", label: "Riwayat", icon: History, roles: ["operator", "manager", "super_admin"] },
  { href: "/admin/master", label: "Master Data", icon: Factory, roles: ["super_admin"] },
  { href: "/admin/schedule", label: "Jadwal & Blok", icon: CalendarClock, roles: ["super_admin"] },
  { href: "/admin/targets", label: "Target", icon: Target, roles: ["super_admin"] },
  { href: "/admin/settings", label: "Pengaturan & TV", icon: Settings, roles: ["super_admin"] },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText, roles: ["super_admin"] },
  { href: "/profile", label: "Profil", icon: User, roles: ["operator", "manager", "super_admin"] },
];

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="app-logo">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal font-display text-lg font-black text-white">R</div>
      <div className="leading-tight">
        <div className={cn("font-display text-base font-bold", dark ? "text-white" : "text-navy")}>RODE</div>
        <div className={cn("text-[10px] font-medium uppercase tracking-wider", dark ? "text-slate-400" : "text-slate-500")}>PT Redone Berkah Mandiri</div>
      </div>
    </div>
  );
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.href = "/login";
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const path = usePathname();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const items = ITEMS.filter((i) => i.roles.includes(user.role));
  const bottom = user.role === "operator" ? items : items.slice(0, 3);
  const active = (h: string) => path === h || path.startsWith(`${h}/`);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy p-5 text-white lg:flex" data-testid="sidebar">
        <Logo dark />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {items.map((i) => (
            <Link key={i.href} href={i.href} data-testid={`nav-${i.href.replaceAll("/", "-").slice(1)}`}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active(i.href) ? "bg-white/10 text-white shadow-[inset_3px_0_0_#3CAEA3]" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
              <i.icon className="h-4 w-4" /> {i.label}
            </Link>
          ))}
        </nav>
        <div className="rounded-lg bg-white/5 p-3 text-sm">
          <div className="font-semibold" data-testid="sidebar-user-name">{user.fullName}</div>
          <div className="text-xs text-slate-400">{ROLE_LABEL[user.role]}</div>
          <button onClick={logout} data-testid="sidebar-logout-button" className="mt-3 flex items-center gap-2 text-xs text-slate-300 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Keluar
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy" data-testid="header-role-badge">{ROLE_LABEL[user.role]}</span>
            {user.role !== "operator" && (
              <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100" data-testid="mobile-menu-button" aria-label="Menu"><Menu className="h-5 w-5" /></button>
            )}
          </div>
        </header>
        {!online && (
          <div className="flex items-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white" data-testid="offline-banner" role="alert">
            <WifiOff className="h-4 w-4" /> Perangkat offline. Data TIDAK tersimpan ke server sampai koneksi pulih.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length}, 1fr)` }} data-testid="bottom-nav">
          {bottom.map((i) => (
            <Link key={i.href} href={i.href} data-testid={`bottom-nav-${i.label.toLowerCase().split(" ")[0]}`}
              className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", active(i.href) ? "text-navy" : "text-slate-500")}>
              <span className={cn("rounded-full px-4 py-1 transition-colors", active(i.href) && "bg-teal-50 text-teal-600")}><i.icon className="h-5 w-5" /></span>
              {i.label}
            </Link>
          ))}
        </nav>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 right-0 w-72 bg-white p-5" onClick={(e) => e.stopPropagation()} data-testid="mobile-menu">
            <div className="mb-6 flex items-center justify-between"><Logo /><button onClick={() => setOpen(false)} data-testid="mobile-menu-close"><X className="h-5 w-5" /></button></div>
            {items.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} data-testid={`mobile-nav-${i.href.replaceAll("/", "-").slice(1)}`}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium", active(i.href) ? "bg-navy-50 text-navy" : "text-slate-700")}>
                <i.icon className="h-4 w-4" /> {i.label}
              </Link>
            ))}
            <button onClick={logout} className="mt-4 flex items-center gap-3 px-3 py-3 text-sm text-red-600" data-testid="mobile-logout-button"><LogOut className="h-4 w-4" /> Keluar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { ClipboardList, MonitorPlay };
