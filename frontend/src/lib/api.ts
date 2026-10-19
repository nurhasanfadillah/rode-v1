import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const forbidden = (msg = "Anda tidak memiliki akses untuk tindakan ini.") => new ApiError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Data tidak ditemukan.") => new ApiError(404, msg, "NOT_FOUND");

function checkOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { /* invalid */ }
  if (!host || originHost !== host) throw new ApiError(403, "Permintaan lintas situs ditolak.", "CSRF");
}

type Ctx = { params: Promise<Record<string, string>> };

export function handler(fn: (req: NextRequest, ctx: Ctx) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      checkOrigin(req);
      const r = await fn(req, ctx);
      if (r instanceof Response) return r;
      return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (e instanceof ZodError) {
        const first = e.issues[0];
        const msg = first ? `${first.path.join(".") || "input"}: ${first.message}` : "Input tidak valid.";
        return NextResponse.json({ error: msg, code: "VALIDATION", issues: e.issues }, { status: 400 });
      }
      console.error("[api]", req.method, req.nextUrl.pathname, e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Terjadi kesalahan server. Coba lagi beberapa saat." }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, "Body JSON tidak valid.", "BAD_JSON"); }
  return schema.parse(raw);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { if (v !== "") obj[k] = v; });
  return schema.parse(obj);
}

export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
