"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Lock, User } from "lucide-react";
import { api } from "@/lib/client";
import { Logo } from "./AppShell";

const schema = z.object({ username: z.string().min(1, "Username wajib diisi"), password: z.string().min(1, "Password wajib diisi") });
type Form = z.infer<typeof schema>;

export function LoginForm({ expired }: { expired: boolean }) {
  const [error, setError] = useState<string | null>(expired ? "Sesi Anda telah berakhir. Silakan login kembali." : null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      const r = await api<{ user: { role: string } }>("/api/auth/login", { method: "POST", body: v });
      window.location.href = r.user.role === "operator" ? "/input" : "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login gagal");
    }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-5" data-testid="login-form">
      <div className="lg:hidden"><Logo /></div>
      <div>
        <h1 className="text-3xl font-bold text-navy">Masuk</h1>
        <p className="mt-1 text-sm text-slate-500">Gunakan akun yang diberikan oleh Super Admin.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert" data-testid="login-error">{error}</div>}
      <label className="block">
        <span className="label-xs">Username</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
          <User className="h-4 w-4 text-slate-400" />
          <input {...register("username")} autoComplete="username" autoCapitalize="none" className="h-12 w-full bg-transparent text-base outline-none" data-testid="login-username-input" />
        </div>
        {formState.errors.username && <span className="text-xs text-red-600">{formState.errors.username.message}</span>}
      </label>
      <label className="block">
        <span className="label-xs">Password</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
          <Lock className="h-4 w-4 text-slate-400" />
          <input type="password" {...register("password")} autoComplete="current-password" className="h-12 w-full bg-transparent text-base outline-none" data-testid="login-password-input" />
        </div>
        {formState.errors.password && <span className="text-xs text-red-600">{formState.errors.password.message}</span>}
      </label>
      <button disabled={formState.isSubmitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-navy font-semibold text-white transition-colors hover:bg-navy-700 disabled:opacity-60" data-testid="login-submit-button">
        {formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Masuk
      </button>
      <p className="text-xs text-slate-500">Lupa password? Hubungi Super Admin untuk reset.</p>
    </form>
  );
}
