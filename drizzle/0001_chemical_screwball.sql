ALTER TABLE "ledger_accounts" DROP CONSTRAINT "ledger_accounts_ledger_id_ledgers_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_ledger_id_ledgers_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "ledger_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "ledger_type" "ledger_type" NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_id_type_unique" ON "ledgers" USING btree ("id","ledger_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_identity_unique" ON "ledger_accounts" USING btree ("id","ledger_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_identity_unique" ON "ledger_transactions" USING btree ("id","ledger_id","ledger_type");--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_ledger_type_fk" FOREIGN KEY ("ledger_id","currency") REFERENCES "public"."ledgers"("id","ledger_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_identity_fk" FOREIGN KEY ("transaction_id","ledger_id","currency") REFERENCES "public"."ledger_transactions"("id","ledger_id","ledger_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_identity_fk" FOREIGN KEY ("account_id","ledger_id","currency") REFERENCES "public"."ledger_accounts"("id","ledger_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_ledger_type_fk" FOREIGN KEY ("ledger_id","ledger_type") REFERENCES "public"."ledgers"("id","ledger_type") ON DELETE restrict ON UPDATE no action;
