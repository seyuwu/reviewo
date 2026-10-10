CREATE TABLE "social"."telegram_party_chat_rooms" (
 "id" UUID PRIMARY KEY, "chat_id" VARCHAR(32) NOT NULL UNIQUE,
 "bot_id" VARCHAR(32) NOT NULL, "title" VARCHAR(128) NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "remove_when_free" BOOLEAN NOT NULL DEFAULT false,
 "state" VARCHAR(24) NOT NULL DEFAULT 'FREE', "party_id" UUID UNIQUE,
 "generation" INTEGER NOT NULL DEFAULT 1, "data" JSONB NOT NULL DEFAULT '{}',
 "lease_token" UUID, "lease_until" TIMESTAMPTZ(6), "retry_at" TIMESTAMPTZ(6),
 "assigned_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "telegram_party_room_state" CHECK ("state" IN ('FREE','PREPARING','ACTIVE','ROTATING','CLOSING','REVIEW'))
);
CREATE INDEX "telegram_party_chat_rooms_bot_id_state_retry_at_idx"
 ON "social"."telegram_party_chat_rooms"("bot_id","state","retry_at");
CREATE TABLE "social"."telegram_party_chat_pool" (
 "id" VARCHAR(32) PRIMARY KEY DEFAULT 'default', "capacity" INTEGER NOT NULL DEFAULT 10,
 CONSTRAINT "telegram_party_pool_capacity" CHECK ("capacity" BETWEEN 0 AND 500)
);
INSERT INTO "social"."telegram_party_chat_pool"("id","capacity") VALUES ('default',10);
CREATE TABLE "social"."telegram_party_chat_workers" (
 "bot_id" VARCHAR(32) PRIMARY KEY, "heartbeat_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE "social"."telegram_party_chat_messages" (
 "room_id" UUID NOT NULL REFERENCES "social"."telegram_party_chat_rooms"("id") ON DELETE CASCADE,
 "message_id" INTEGER NOT NULL, "sent_at" TIMESTAMPTZ(6) NOT NULL,
 "sender_id" VARCHAR(32),
 "generation" INTEGER NOT NULL, "deleted_at" TIMESTAMPTZ(6),
 PRIMARY KEY("room_id","message_id")
);
CREATE INDEX "telegram_party_chat_messages_room_id_deleted_at_sent_at_idx"
 ON "social"."telegram_party_chat_messages"("room_id","deleted_at","sent_at");
CREATE INDEX "telegram_party_chat_messages_room_id_sender_id_deleted_at_idx"
 ON "social"."telegram_party_chat_messages"("room_id","sender_id","deleted_at");
