UPDATE contributions.contribution_policies
SET tier = 'MODERATION'
WHERE type IN (
    'UPDATE_NAME',
    'UPDATE_URL',
    'UPDATE_DESCRIPTION',
    'UPDATE_LOGO',
    'UPDATE_TYPE',
    'MERGE_ENTITY'
);

UPDATE contributions.entity_contributions
SET tier = 'MODERATION'
WHERE status = 'PENDING';
