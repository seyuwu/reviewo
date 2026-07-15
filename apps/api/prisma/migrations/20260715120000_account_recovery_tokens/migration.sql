-- Guest account recovery tokens (hashed; plaintext shown once).
CREATE TABLE "auth"."account_recovery_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_recovery_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_recovery_tokens_token_hash_key" ON "auth"."account_recovery_tokens"("token_hash");
CREATE INDEX "account_recovery_tokens_user_id_idx" ON "auth"."account_recovery_tokens"("user_id");

ALTER TABLE "auth"."account_recovery_tokens"
  ADD CONSTRAINT "account_recovery_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
