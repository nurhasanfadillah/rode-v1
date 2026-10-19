CREATE TYPE "public"."break_mode" AS ENUM('exclude', 'clock');--> statement-breakpoint
CREATE TYPE "public"."correction_action" AS ENUM('correct', 'cancel');--> statement-breakpoint
CREATE TYPE "public"."department_kind" AS ENUM('line_block', 'daily');--> statement-breakpoint
CREATE TYPE "public"."display_mode" AS ENUM('all', 'sewing', 'print_pack', 'line', 'rotate');--> statement-breakpoint
CREATE TYPE "public"."input_mode" AS ENUM('single', 'bulk', 'daily');--> statement-breakpoint
CREATE TYPE "public"."outside_hours_policy" AS ENUM('reject', 'clamp');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('operator', 'manager', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('active', 'corrected', 'cancelled');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "department_kind" DEFAULT 'daily' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "display_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"mode" "display_mode" DEFAULT 'all' NOT NULL,
	"line_id" uuid,
	"rotate_seconds" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "display_settings_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"identifier" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_lines_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "production_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"line_id" uuid,
	"effective_from" date NOT NULL,
	"daily_target" integer,
	"block_target" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"line_id" uuid,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"original_quantity" integer NOT NULL,
	"operator_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"shift_id" uuid,
	"shift_version_id" uuid,
	"block_no" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "transaction_status" DEFAULT 'active' NOT NULL,
	"input_mode" "input_mode" NOT NULL,
	"notes" text,
	"idempotency_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tx_quantity_positive_chk" CHECK ("production_transactions"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'PCS' NOT NULL,
	"default_target" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shift_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_version_id" uuid NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"label" text DEFAULT 'Istirahat' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"block_minutes" integer NOT NULL,
	"work_days" jsonb NOT NULL,
	"break_mode" "break_mode" DEFAULT 'exclude' NOT NULL,
	"outside_policy" "outside_hours_policy" DEFAULT 'reject' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_versions_block_chk" CHECK ("shift_versions"."block_minutes" >= 5 AND "shift_versions"."block_minutes" <= 480)
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "transaction_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"action" "correction_action" NOT NULL,
	"old_quantity" integer NOT NULL,
	"new_quantity" integer,
	"old_status" "transaction_status" NOT NULL,
	"new_status" "transaction_status" NOT NULL,
	"reason" text NOT NULL,
	"corrected_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"department_id" uuid,
	"line_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_settings" ADD CONSTRAINT "display_settings_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_settings" ADD CONSTRAINT "display_settings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_targets" ADD CONSTRAINT "production_targets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_targets" ADD CONSTRAINT "production_targets_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_targets" ADD CONSTRAINT "production_targets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transactions" ADD CONSTRAINT "production_transactions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transactions" ADD CONSTRAINT "production_transactions_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transactions" ADD CONSTRAINT "production_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transactions" ADD CONSTRAINT "production_transactions_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transactions" ADD CONSTRAINT "production_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transactions" ADD CONSTRAINT "production_transactions_shift_version_id_shift_versions_id_fk" FOREIGN KEY ("shift_version_id") REFERENCES "public"."shift_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shift_version_id_shift_versions_id_fk" FOREIGN KEY ("shift_version_id") REFERENCES "public"."shift_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_versions" ADD CONSTRAINT "shift_versions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_versions" ADD CONSTRAINT "shift_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_transaction_id_production_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."production_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity");--> statement-breakpoint
CREATE INDEX "targets_lookup_idx" ON "production_targets" USING btree ("department_id","line_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "tx_idempotency_uq" ON "production_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "tx_work_date_dept_idx" ON "production_transactions" USING btree ("work_date","department_id");--> statement-breakpoint
CREATE INDEX "tx_line_date_idx" ON "production_transactions" USING btree ("line_id","work_date");--> statement-breakpoint
CREATE INDEX "tx_product_date_idx" ON "production_transactions" USING btree ("product_id","work_date");--> statement-breakpoint
CREATE INDEX "tx_operator_date_idx" ON "production_transactions" USING btree ("operator_id","work_date");--> statement-breakpoint
CREATE INDEX "tx_recorded_at_idx" ON "production_transactions" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "tx_updated_at_idx" ON "production_transactions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_versions_shift_from_uq" ON "shift_versions" USING btree ("shift_id","effective_from");--> statement-breakpoint
CREATE INDEX "corrections_tx_idx" ON "transaction_corrections" USING btree ("transaction_id");