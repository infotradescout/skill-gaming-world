CREATE TABLE "rate_limit_buckets" (
	"bucket_key" varchar(192) PRIMARY KEY NOT NULL,
	"request_count" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_buckets_count_positive" CHECK ("rate_limit_buckets"."request_count" > 0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_reset_idx" ON "rate_limit_buckets" USING btree ("resets_at");