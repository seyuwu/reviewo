-- Add OFFICER (sub-captain) to party membership roles.
ALTER TYPE "social"."game_party_member_role" ADD VALUE IF NOT EXISTS 'OFFICER';
