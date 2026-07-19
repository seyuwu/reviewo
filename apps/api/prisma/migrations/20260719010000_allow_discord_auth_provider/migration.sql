ALTER TABLE "auth"."user_auth_identities"
  DROP CONSTRAINT "user_auth_identities_provider_check";

ALTER TABLE "auth"."user_auth_identities"
  ADD CONSTRAINT "user_auth_identities_provider_check"
  CHECK ("provider" IN ('email', 'guest', 'discord'));
