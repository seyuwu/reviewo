ALTER TABLE "reputation"."entity_confidence_profiles"
ADD COLUMN "data_reliability" DECIMAL(4, 3),
ADD COLUMN "manipulation_risk" DECIMAL(4, 3);

CREATE TABLE "reputation"."user_coordination_clusters" (
    "id" UUID NOT NULL,
    "member_count" INTEGER NOT NULL,
    "overlap_score" DECIMAL(4, 3) NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_coordination_clusters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reputation"."user_cluster_memberships" (
    "cluster_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cluster_memberships_pkey" PRIMARY KEY ("cluster_id", "user_id")
);

CREATE TABLE "reputation"."user_coordination_scores" (
    "user_id" UUID NOT NULL,
    "cluster_score" DECIMAL(4, 3) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_coordination_scores_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_cluster_memberships_user_id_idx"
ON "reputation"."user_cluster_memberships"("user_id");

ALTER TABLE "reputation"."user_cluster_memberships"
ADD CONSTRAINT "user_cluster_memberships_cluster_id_fkey"
FOREIGN KEY ("cluster_id") REFERENCES "reputation"."user_coordination_clusters"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
