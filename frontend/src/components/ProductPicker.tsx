"use client";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DemoTag } from "./common";

export interface ProductOpt { id: string; code: string; name: string; category?: string | null; isDemo?: boolean }

export function ProductPicker({ products, value, onChange, testId = "product-picker" }: {
  products: ProductOpt[]; value: string | null; onChange: (id: string) => void; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = products.find((p) => p.id === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)) : products;
  }, [q, products]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid={`${testId}-trigger`}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-teal">
        <div className="min-w-0">
          <div className="label-xs">Produk</div>
          <div className={cn("truncate text-base font-semibold", sel ? "text-slate-900" : "text-slate-400")} data-testid={`${testId}-selected`}>
            {sel ? sel.name : "Pilih produk yang dikerjakan"}{sel?.isDemo && <DemoTag />}
          </div>
          {sel && <div className="num text-xs text-slate-500">{sel.code}</div>}
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0" data-testid={`${testId}-dialog`}>
          <DialogHeader className="px-5 pt-5"><DialogTitle>Pilih produk</DialogTitle></DialogHeader>
          <div className="px-5">
            <div className="flex items-center gap-2 rounded-lg border px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau kode…" className="h-11 w-full bg-transparent outline-none" data-testid={`${testId}-search`} />
            </div>
          </div>
          <div className="max-h-[55vh] overflow-y-auto px-2 pb-3">
            {list.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Produk tidak ditemukan. Minta admin menambahkan produk di Master Data.</div>}
            {list.map((p) => (
              <button key={p.id} type="button" data-testid={`${testId}-option-${p.code}`}
                onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                className={cn("flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-slate-50", p.id === value && "bg-teal-50")}>
                <div><div className="font-semibold">{p.name}{p.isDemo && <DemoTag />}</div><div className="num text-xs text-slate-500">{p.code}{p.category ? ` · ${p.category}` : ""}</div></div>
                {p.id === value && <Check className="h-4 w-4 text-teal-600" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
