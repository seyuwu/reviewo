UPDATE social.dota_tournament_entries AS entry
SET status = 'RECRUITING'
WHERE entry.status = 'REGISTERED'
  AND EXISTS (
    SELECT 1
    FROM social.dota_tournaments AS tournament
    WHERE tournament.id = entry.tournament_id
      AND tournament.status IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED')
  )
  AND (
    (
      SELECT COUNT(*)
      FROM social.dota_tournament_entry_members AS member
      WHERE member.entry_id = entry.id
        AND member.is_active = TRUE
    ) <> 5
    OR (
      SELECT COUNT(DISTINCT member.position_role)
      FROM social.dota_tournament_entry_members AS member
      WHERE member.entry_id = entry.id
        AND member.is_active = TRUE
        AND member.position_role IS NOT NULL
    ) <> 5
  );
