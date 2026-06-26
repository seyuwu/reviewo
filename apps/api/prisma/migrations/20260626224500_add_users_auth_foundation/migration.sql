CREATE TABLE "users"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "username" TEXT,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'blocked', 'deleted'))
);

CREATE UNIQUE INDEX "users_email_key" ON "users"."users" ("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"."users" ("username") WHERE "username" IS NOT NULL;

CREATE TABLE "auth"."user_auth_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_auth_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_auth_identities_provider_check" CHECK ("provider" IN ('email')),
    CONSTRAINT "user_auth_identities_email_password_hash_check" CHECK (
        "provider" <> 'email' OR "password_hash" IS NOT NULL
    ),
    CONSTRAINT "user_auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_auth_identities_provider_provider_user_id_key"
    ON "auth"."user_auth_identities" ("provider", "provider_user_id");

CREATE INDEX "user_auth_identities_user_id_idx" ON "auth"."user_auth_identities" ("user_id");
