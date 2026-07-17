-- CreateTable
CREATE TABLE "social"."games_launch_dev_note_likes" (
    "id" UUID NOT NULL,
    "voter_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_launch_dev_note_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_launch_dev_note_likes_voter_key_key" ON "social"."games_launch_dev_note_likes"("voter_key");
