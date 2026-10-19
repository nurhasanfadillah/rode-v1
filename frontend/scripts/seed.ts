import "dotenv/config";
import { ensureBaseData, seedDemo } from "../src/services/seed";

(async () => {
  await ensureBaseData();
  console.log("Base data ensured (departments, default shift, settings, super admin from ADMIN_USERNAME/ADMIN_PASSWORD)");
  if (process.env.DEMO_SEED === "true") {
    if (process.env.APP_ENV === "production") throw new Error("DEMO_SEED tidak boleh dijalankan saat APP_ENV=production");
    await seedDemo();
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
