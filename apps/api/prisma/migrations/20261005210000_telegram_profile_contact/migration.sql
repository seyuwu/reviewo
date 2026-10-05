ALTER TABLE "users"."users"
ADD COLUMN "telegram_contact_visible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "auth"."user_auth_identities"
ADD COLUMN "telegram_username" TEXT;
