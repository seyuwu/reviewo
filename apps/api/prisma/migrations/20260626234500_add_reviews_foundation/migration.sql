CREATE TABLE "reviews"."reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_text_not_blank_check" CHECK (length(btrim("text")) > 0),
    CONSTRAINT "reviews_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"."entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reviews_author_id_entity_id_key" ON "reviews"."reviews" ("author_id", "entity_id");
CREATE INDEX "reviews_entity_id_idx" ON "reviews"."reviews" ("entity_id");
CREATE INDEX "reviews_author_id_idx" ON "reviews"."reviews" ("author_id");

CREATE TABLE "reviews"."review_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"."reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "review_votes_review_id_user_id_key" ON "reviews"."review_votes" ("review_id", "user_id");
CREATE INDEX "review_votes_review_id_idx" ON "reviews"."review_votes" ("review_id");
CREATE INDEX "review_votes_user_id_idx" ON "reviews"."review_votes" ("user_id");
