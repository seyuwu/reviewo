-- Collapse duplicate directed friendship edges (A→B and B→A) keeping the newest ACCEPTED when present.
DELETE FROM "social"."user_friendships" AS uf
USING "social"."user_friendships" AS keep
WHERE uf.requester_id = keep.addressee_id
  AND uf.addressee_id = keep.requester_id
  AND uf.id <> keep.id
  AND uf.requester_id > uf.addressee_id
  AND (
    keep.status = 'ACCEPTED'
    OR (uf.status <> 'ACCEPTED' AND keep.updated_at >= uf.updated_at)
  );

DELETE FROM "social"."user_friendships" AS uf
USING "social"."user_friendships" AS keep
WHERE uf.requester_id = keep.addressee_id
  AND uf.addressee_id = keep.requester_id
  AND uf.id <> keep.id
  AND uf.requester_id < uf.addressee_id;

-- Enforce one friendship row per unordered pair.
CREATE UNIQUE INDEX "user_friendships_unordered_pair_key"
ON "social"."user_friendships" (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));
