CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE "chat"."entity_chat_messages" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_chat_messages_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"."entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entity_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entity_chat_messages_entity_id_created_at_idx" ON "chat"."entity_chat_messages"("entity_id", "created_at");
CREATE INDEX "entity_chat_messages_created_at_idx" ON "chat"."entity_chat_messages"("created_at");
