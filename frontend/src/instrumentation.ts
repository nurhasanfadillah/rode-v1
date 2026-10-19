export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTO_MIGRATE !== "true") return;
  const { runMigrations } = await import("./db/migrate");
  const { ensureBaseData, seedDemo } = await import("./services/seed");
  await runMigrations();
  await ensureBaseData();
  if (process.env.DEMO_SEED === "true" && process.env.APP_ENV !== "production") await seedDemo();
  console.log("[rode] database ready");
}
