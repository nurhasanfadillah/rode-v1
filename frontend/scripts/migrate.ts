import "dotenv/config";
import { runMigrations } from "../src/db/migrate";

(async () => {
  if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
  await runMigrations();
  console.log("Migrations applied");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
