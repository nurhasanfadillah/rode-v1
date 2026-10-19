import "dotenv/config";
import { and, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { db } from "../src/db";
import {
  displaySettings, productionTargets, productionTransactions as T, products, sessions, transactionCorrections, users,
} from "../src/db/schema";

// Removes records created by QA runs: TEST_ products/users, display tokens, and transactions recorded on/after --since date.
(async () => {
  const since = process.argv[2];
  if (!since) { console.log("Usage: tsx scripts/cleanup-test-data.ts YYYY-MM-DD"); process.exit(1); }
  const testUsers = (await db.select({ id: users.id }).from(users).where(or(ilike(users.username, "test%"), ilike(users.fullName, "TEST%")))).map((u) => u.id);
  const testProducts = (await db.select({ id: products.id }).from(products).where(ilike(products.code, "TEST%"))).map((p) => p.id);
  const txIds = (await db.select({ id: T.id }).from(T).where(or(
    and(gte(T.workDate, since), eq(T.isDemo, false)),
    testProducts.length ? inArray(T.productId, testProducts) : undefined,
    testUsers.length ? inArray(T.operatorId, testUsers) : undefined,
  ))).map((t) => t.id);
  if (txIds.length) {
    await db.delete(transactionCorrections).where(inArray(transactionCorrections.transactionId, txIds));
    await db.delete(T).where(inArray(T.id, txIds));
  }
  if (testUsers.length) {
    await db.delete(sessions).where(inArray(sessions.userId, testUsers));
    await db.delete(users).where(inArray(users.id, testUsers));
  }
  if (testProducts.length) await db.delete(products).where(inArray(products.id, testProducts));
  await db.delete(productionTargets).where(and(gte(productionTargets.createdAt, new Date(`${since}T00:00:00+07:00`)), gte(productionTargets.effectiveFrom, since)));
  await db.delete(displaySettings);
  console.log({ transactions: txIds.length, users: testUsers.length, products: testProducts.length });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
