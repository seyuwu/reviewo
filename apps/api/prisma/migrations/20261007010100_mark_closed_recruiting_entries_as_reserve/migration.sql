UPDATE social.dota_tournaments AS tournament
SET status = 'REGISTRATION_CLOSED',
    registration_closes_at = CASE
      WHEN tournament.registration_closes_at IS NULL
        OR tournament.registration_closes_at > now()
      THEN now()
      ELSE tournament.registration_closes_at
    END
WHERE tournament.status = 'REGISTRATION_OPEN'
  AND (
    tournament.registration_closes_at <= now()
    OR (
      tournament.max_teams IS NOT NULL
      AND (
        SELECT count(*)
        FROM social.dota_tournament_entries AS registered
        WHERE registered.tournament_id = tournament.id
          AND registered.status = 'REGISTERED'
      ) >= tournament.max_teams
    )
  );

UPDATE social.dota_tournament_entries AS entry
SET status = 'RESERVE'
FROM social.dota_tournaments AS tournament
WHERE entry.tournament_id = tournament.id
  AND entry.status = 'RECRUITING'
  AND tournament.status IN ('REGISTRATION_CLOSED', 'IN_PROGRESS');
