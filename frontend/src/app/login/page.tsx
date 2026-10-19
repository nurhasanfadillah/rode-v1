import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const u = await getSessionUser();
  if (u) redirect(u.role === "operator" ? "/input" : "/dashboard");
  const sp = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border-[48px] border-teal/20" />
        <div className="absolute bottom-10 right-10 grid grid-cols-5 gap-1.5 opacity-80">
          {["bg-emerald-500", "bg-emerald-500", "bg-amber-400", "bg-red-500", "bg-slate-600", "bg-emerald-500", "bg-amber-400", "bg-emerald-500", "bg-slate-600", "bg-slate-600"].map((c, i) => (
            <div key={i} className={`h-10 w-14 rounded-md ${c}`} />
          ))}
        </div>
        <Logo dark />
        <div className="relative max-w-md">
          <div className="label-xs !text-teal">Redone Output Data Entry</div>
          <h2 className="mt-3 font-display text-5xl font-bold leading-[1.05]">Setiap pcs tercatat. Setiap blok terpantau.</h2>
          <p className="mt-5 text-slate-300">Pencatatan Printing, Sewing per line & blok waktu, dan Packing — langsung tampil di dashboard manajer dan layar produksi.</p>
        </div>
        <div className="text-xs text-slate-400">PT REDONE BERKAH MANDIRI · Zona waktu WIB (Asia/Jakarta)</div>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <LoginForm expired={sp.expired === "1"} />
      </div>
    </div>
  );
}
