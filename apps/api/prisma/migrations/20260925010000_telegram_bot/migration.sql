CREATE TABLE "auth"."telegram_link_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_link_codes_code_hash_key" ON "auth"."telegram_link_codes"("code_hash");
CREATE INDEX "telegram_link_codes_user_id_expires_at_idx" ON "auth"."telegram_link_codes"("user_id", "expires_at");

ALTER TABLE "auth"."telegram_link_codes"
  ADD CONSTRAINT "telegram_link_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "social"."telegram_bot_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" VARCHAR(32) NOT NULL,
    "event_key" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_bot_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_bot_notifications_telegram_user_id_event_key_key"
  ON "social"."telegram_bot_notifications"("telegram_user_id", "event_key");
CREATE INDEX "telegram_bot_notifications_telegram_user_id_delivered_at_next_attempt_at_idx"
  ON "social"."telegram_bot_notifications"("telegram_user_id", "delivered_at", "next_attempt_at");
