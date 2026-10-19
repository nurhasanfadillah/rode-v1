import "dotenv/config";
import { purgeDemo } from "../src/services/seed";

(async () => {
  if (process.argv[2] !== "--confirm") {
    console.log("Jalankan dengan --confirm untuk menghapus SELURUH data demo (is_demo=true dan transaksi akun demo).");
    process.exit(1);
  }
  const r = await purgeDemo();
  console.log("Demo data purged:", r);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
