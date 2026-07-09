ALTER TYPE contributions.contribution_type ADD VALUE IF NOT EXISTS 'UNLINK_ENTITY';

INSERT INTO contributions.contribution_policies (type, tier, base_approve_weight, base_reject_weight, activity_scale, min_unique_voters, cooldown_hours)
VALUES ('UNLINK_ENTITY', 'MODERATION', 1.0, 2.0, false, 1, 0)
ON CONFLICT (type) DO NOTHING;
