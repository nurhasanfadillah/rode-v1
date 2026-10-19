import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("user_role", ["operator", "manager", "super_admin"]);
export const deptKindEnum = pgEnum("department_kind", ["line_block", "daily"]);
export const txStatusEnum = pgEnum("transaction_status", ["active", "corrected", "cancelled"]);
export const inputModeEnum = pgEnum("input_mode", ["single", "bulk", "daily"]);
export const breakModeEnum = pgEnum("break_mode", ["exclude", "clock"]);
export const outsidePolicyEnum = pgEnum("outside_hours_policy", ["reject", "clamp"]);
export const correctionActionEnum = pgEnum("correction_action", ["correct", "cancel"]);
export const displayModeEnum = pgEnum("display_mode", ["all", "sewing", "print_pack", "line", "rotate"]);

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tsz("created_at").notNull().defaultNow();
const updatedAt = () => tsz("updated_at").notNull().defaultNow();

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: deptKindEnum("kind").notNull().default("daily"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const productionLines = pgTable("production_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id").notNull().references(() => departments.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("PCS"),
  defaultTarget: integer("default_target"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("products_name_idx").on(t.name)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  lineId: uuid("line_id").references(() => productionLines.id),
  isActive: boolean("is_active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  lastLoginAt: tsz("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: tsz("expires_at").notNull(),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const loginAttempts = pgTable("login_attempts", {
  identifier: text("identifier").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: tsz("locked_until"),
  updatedAt: updatedAt(),
});

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const shiftVersions = pgTable("shift_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  blockMinutes: integer("block_minutes").notNull(),
  workDays: jsonb("work_days").$type<number[]>().notNull(),
  breakMode: breakModeEnum("break_mode").notNull().default("exclude"),
  outsidePolicy: outsidePolicyEnum("outside_policy").notNull().default("reject"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("shift_versions_shift_from_uq").on(t.shiftId, t.effectiveFrom),
  check("shift_versions_block_chk", sql`${t.blockMinutes} >= 5 AND ${t.blockMinutes} <= 480`),
]);

export const shiftBreaks = pgTable("shift_breaks", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftVersionId: uuid("shift_version_id").notNull().references(() => shiftVersions.id, { onDelete: "cascade" }),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  label: text("label").notNull().default("Istirahat"),
});

export const productionTargets = pgTable("production_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id").notNull().references(() => departments.id),
  lineId: uuid("line_id").references(() => productionLines.id),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  dailyTarget: integer("daily_target"),
  blockTarget: integer("block_target"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("targets_lookup_idx").on(t.departmentId, t.lineId, t.effectiveFrom)]);

export const productionTransactions = pgTable("production_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id").notNull().references(() => departments.id),
  lineId: uuid("line_id").references(() => productionLines.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  originalQuantity: integer("original_quantity").notNull(),
  operatorId: uuid("operator_id").notNull().references(() => users.id),
  workDate: date("work_date", { mode: "string" }).notNull(),
  shiftId: uuid("shift_id").references(() => shifts.id),
  shiftVersionId: uuid("shift_version_id").references(() => shiftVersions.id),
  blockNo: integer("block_no"),
  recordedAt: tsz("recorded_at").notNull().defaultNow(),
  status: txStatusEnum("status").notNull().default("active"),
  inputMode: inputModeEnum("input_mode").notNull(),
  notes: text("notes"),
  idempotencyKey: text("idempotency_key").notNull(),
  version: integer("version").notNull().default(1),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("tx_idempotency_uq").on(t.idempotencyKey),
  index("tx_work_date_dept_idx").on(t.workDate, t.departmentId),
  index("tx_line_date_idx").on(t.lineId, t.workDate),
  index("tx_product_date_idx").on(t.productId, t.workDate),
  index("tx_operator_date_idx").on(t.operatorId, t.workDate),
  index("tx_recorded_at_idx").on(t.recordedAt),
  index("tx_updated_at_idx").on(t.updatedAt),
  check("tx_quantity_positive_chk", sql`${t.quantity} > 0`),
]);

export const transactionCorrections = pgTable("transaction_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => productionTransactions.id),
  action: correctionActionEnum("action").notNull(),
  oldQuantity: integer("old_quantity").notNull(),
  newQuantity: integer("new_quantity"),
  oldStatus: txStatusEnum("old_status").notNull(),
  newStatus: txStatusEnum("new_status").notNull(),
  reason: text("reason").notNull(),
  correctedBy: uuid("corrected_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("corrections_tx_idx").on(t.transactionId)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entity)]);

export const displaySettings = pgTable("display_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  mode: displayModeEnum("mode").notNull().default("all"),
  lineId: uuid("line_id").references(() => productionLines.id),
  rotateSeconds: integer("rotate_seconds").notNull().default(20),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: tsz("last_seen_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  revokedAt: tsz("revoked_at"),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export type Role = (typeof roleEnum.enumValues)[number];
export type TxStatus = (typeof txStatusEnum.enumValues)[number];
