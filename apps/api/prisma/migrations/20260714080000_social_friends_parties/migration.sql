-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "social";

-- CreateEnum
CREATE TYPE "social"."friendship_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
CREATE TYPE "social"."game_party_visibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "social"."game_party_member_role" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "social"."game_party_invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "social"."user_friendships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "addressee_id" UUID NOT NULL,
    "status" "social"."friendship_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_friendships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_friendships_requester_addressee_distinct" CHECK ("requester_id" <> "addressee_id")
);

CREATE UNIQUE INDEX "user_friendships_requester_id_addressee_id_key" ON "social"."user_friendships"("requester_id", "addressee_id");
CREATE INDEX "user_friendships_requester_id_status_idx" ON "social"."user_friendships"("requester_id", "status");
CREATE INDEX "user_friendships_addressee_id_status_idx" ON "social"."user_friendships"("addressee_id", "status");

ALTER TABLE "social"."user_friendships"
ADD CONSTRAINT "user_friendships_requester_id_fkey"
FOREIGN KEY ("requester_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social"."user_friendships"
ADD CONSTRAINT "user_friendships_addressee_id_fkey"
FOREIGN KEY ("addressee_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "social"."game_parties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vertical" VARCHAR(32) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "visibility" "social"."game_party_visibility" NOT NULL DEFAULT 'PUBLIC',
    "max_members" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_parties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_parties_vertical_slug_key" ON "social"."game_parties"("vertical", "slug");
CREATE INDEX "game_parties_owner_user_id_idx" ON "social"."game_parties"("owner_user_id");
CREATE INDEX "game_parties_vertical_created_at_idx" ON "social"."game_parties"("vertical", "created_at" DESC);

ALTER TABLE "social"."game_parties"
ADD CONSTRAINT "game_parties_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "social"."game_party_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "social"."game_party_member_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_party_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_party_members_party_id_user_id_key" ON "social"."game_party_members"("party_id", "user_id");
CREATE INDEX "game_party_members_user_id_idx" ON "social"."game_party_members"("user_id");

ALTER TABLE "social"."game_party_members"
ADD CONSTRAINT "game_party_members_party_id_fkey"
FOREIGN KEY ("party_id") REFERENCES "social"."game_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social"."game_party_members"
ADD CONSTRAINT "game_party_members_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "social"."game_party_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "inviter_user_id" UUID NOT NULL,
    "invitee_user_id" UUID NOT NULL,
    "status" "social"."game_party_invite_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_party_invites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "game_party_invites_party_id_status_idx" ON "social"."game_party_invites"("party_id", "status");
CREATE INDEX "game_party_invites_invitee_user_id_status_idx" ON "social"."game_party_invites"("invitee_user_id", "status");
CREATE INDEX "game_party_invites_inviter_user_id_idx" ON "social"."game_party_invites"("inviter_user_id");
CREATE UNIQUE INDEX "game_party_invites_pending_unique"
ON "social"."game_party_invites"("party_id", "invitee_user_id")
WHERE "status" = 'PENDING';

ALTER TABLE "social"."game_party_invites"
ADD CONSTRAINT "game_party_invites_party_id_fkey"
FOREIGN KEY ("party_id") REFERENCES "social"."game_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social"."game_party_invites"
ADD CONSTRAINT "game_party_invites_inviter_user_id_fkey"
FOREIGN KEY ("inviter_user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social"."game_party_invites"
ADD CONSTRAINT "game_party_invites_invitee_user_id_fkey"
FOREIGN KEY ("invitee_user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
