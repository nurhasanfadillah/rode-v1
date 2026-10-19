import { DisplayBoard } from "@/components/display/DisplayBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "RODE — Live Production Board", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <DisplayBoard token={token ?? ""} />;
}
