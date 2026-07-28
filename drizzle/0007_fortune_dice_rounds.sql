CREATE TABLE "fortune_dice_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'COMMITTED' NOT NULL,
	"server_seed_ciphertext" text NOT NULL,
	"seed_commitment" varchar(64) NOT NULL,
	"client_seed" varchar(128),
	"nonce" bigint NOT NULL,
	"choice" varchar(16),
	"wager_minor" bigint,
	"die_one" integer,
	"die_two" integer,
	"payout_minor" bigint,
	"ledger_transaction_id" uuid,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fortune_dice_status_allowed" CHECK ("fortune_dice_rounds"."status" IN ('COMMITTED', 'SETTLED', 'VOID')),
	CONSTRAINT "fortune_dice_choice_allowed" CHECK ("fortune_dice_rounds"."choice" IS NULL OR "fortune_dice_rounds"."choice" IN ('under', 'seven', 'over')),
	CONSTRAINT "fortune_dice_values_allowed" CHECK (("fortune_dice_rounds"."die_one" IS NULL AND "fortune_dice_rounds"."die_two" IS NULL) OR ("fortune_dice_rounds"."die_one" BETWEEN 1 AND 6 AND "fortune_dice_rounds"."die_two" BETWEEN 1 AND 6))
);
--> statement-breakpoint
ALTER TABLE "fortune_dice_rounds" ADD CONSTRAINT "fortune_dice_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fortune_dice_rounds" ADD CONSTRAINT "fortune_dice_rounds_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fortune_dice_commitment_unique" ON "fortune_dice_rounds" USING btree ("seed_commitment");
--> statement-breakpoint
CREATE UNIQUE INDEX "fortune_dice_user_nonce_unique" ON "fortune_dice_rounds" USING btree ("user_id","nonce");
--> statement-breakpoint
CREATE INDEX "fortune_dice_user_created_idx" ON "fortune_dice_rounds" USING btree ("user_id","created_at");
