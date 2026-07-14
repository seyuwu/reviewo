-- CreateEnum
CREATE TYPE "social"."game_party_kind" AS ENUM ('TEAM', 'PARTY');

-- AlterTable
ALTER TABLE "social"."game_parties"
ADD COLUMN "kind" "social"."game_party_kind" NOT NULL DEFAULT 'TEAM',
ADD COLUMN "expires_at" TIMESTAMPTZ(6);

CREATE INDEX "game_parties_vertical_kind_expires_at_idx"
ON "social"."game_parties"("vertical", "kind", "expires_at");

-- CreateTable
CREATE TABLE "social"."game_party_chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_party_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "game_party_chat_messages_party_id_created_at_idx"
ON "social"."game_party_chat_messages"("party_id", "created_at" DESC);

ALTER TABLE "social"."game_party_chat_messages"
ADD CONSTRAINT "game_party_chat_messages_party_id_fkey"
FOREIGN KEY ("party_id") REFERENCES "social"."game_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social"."game_party_chat_messages"
ADD CONSTRAINT "game_party_chat_messages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
