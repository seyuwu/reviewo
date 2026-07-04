CREATE SCHEMA IF NOT EXISTS growth;

CREATE TABLE growth.battle_votes (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pair_key" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "voter_key" TEXT NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battle_votes_pair_key_voter_key_key" ON growth.battle_votes("pair_key", "voter_key");
CREATE INDEX "battle_votes_pair_key_idx" ON growth.battle_votes("pair_key");
