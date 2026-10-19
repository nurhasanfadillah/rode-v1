import path from "node:path";
import { getDb, isPglite } from "./index";

export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const db = getDb();
  if (isPglite()) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder });
  }
}
