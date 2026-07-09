UPDATE contributions.contribution_policies
SET
    tier = 'AUTO',
    base_approve_weight = 2.0,
    base_reject_weight = 2.0,
    activity_scale = false,
    min_unique_voters = 2
WHERE type IN ('MERGE_ENTITY', 'UPDATE_LOGO', 'UPDATE_TYPE');

UPDATE contributions.entity_contributions
SET tier = 'AUTO'
WHERE tier = 'MODERATION'
  AND status = 'PENDING';
