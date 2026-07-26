CREATE TYPE "public"."ledger_status" AS ENUM('RESERVED_DISABLED', 'ACTIVE', 'CLOSED');--> statement-breakpoint
ALTER TABLE "ledgers" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ledgers" ALTER COLUMN "status" SET DATA TYPE "public"."ledger_status" USING "status"::"public"."ledger_status";--> statement-breakpoint
ALTER TABLE "ledgers" ALTER COLUMN "status" SET DEFAULT 'RESERVED_DISABLED'::"public"."ledger_status";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entry_amount_positive" CHECK ("ledger_entries"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "cash_ledgers_cannot_be_active" CHECK ("ledgers"."ledger_type" = 'PLAY_COIN' OR "ledgers"."status" <> 'ACTIVE');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_ledger_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger history is append-only' USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_ledger_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_append_only"
BEFORE UPDATE OR DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION "reject_ledger_history_mutation"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_balanced_ledger_transaction"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  net_amount numeric;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN "direction" = 'DEBIT' THEN "amount_minor"
      ELSE -"amount_minor"
    END
  ), 0)
  INTO net_amount
  FROM "ledger_entries"
  WHERE "transaction_id" = NEW."transaction_id";

  IF net_amount <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is not balanced', NEW."transaction_id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ledger_transaction_must_balance"
AFTER INSERT ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_balanced_ledger_transaction"();
