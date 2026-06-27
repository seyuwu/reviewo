CREATE TYPE "users"."user_role" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "users"."users"
ADD COLUMN "role" "users"."user_role" NOT NULL DEFAULT 'USER';

CREATE TYPE "entities"."entity_visibility" AS ENUM ('ACTIVE', 'HIDDEN');

ALTER TABLE "entities"."entities"
ADD COLUMN "visibility" "entities"."entity_visibility" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "entities_visibility_idx" ON "entities"."entities" ("visibility");

CREATE TYPE "reviews"."review_visibility" AS ENUM ('ACTIVE', 'HIDDEN');

ALTER TABLE "reviews"."reviews"
ADD COLUMN "visibility" "reviews"."review_visibility" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "reviews_visibility_idx" ON "reviews"."reviews" ("visibility");
