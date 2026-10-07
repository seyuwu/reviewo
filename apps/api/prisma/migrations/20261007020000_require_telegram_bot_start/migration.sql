CREATE TABLE "auth"."telegram_bot_starts" (
    "telegram_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_bot_starts_pkey" PRIMARY KEY ("telegram_user_id")
);

-- Existing linked Telegram accounts were linked through a bot interaction.
-- Preserve their current tournament access when the explicit start check is introduced.
INSERT INTO "auth"."telegram_bot_starts" ("telegram_user_id", "started_at")
SELECT "provider_user_id", CURRENT_TIMESTAMP
FROM "auth"."user_auth_identities"
WHERE "provider" = 'telegram'
ON CONFLICT ("telegram_user_id") DO NOTHING;
