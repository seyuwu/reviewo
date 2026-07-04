ALTER TABLE "chat"."entity_chat_messages"
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ru';

CREATE INDEX "entity_chat_messages_entity_id_locale_created_at_idx"
ON "chat"."entity_chat_messages"("entity_id", "locale", "created_at");
