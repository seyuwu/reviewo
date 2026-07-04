# In Progress

## Current Stage

No active implementation stage.

Entity Live Chat MVP is completed.

## Goal

None — awaiting next approved post-MVP stage/RFC.

## Tasks

None.

## Current Progress

Entity Live Chat is available on extension popup, extension rating card, and web entity page sidebar. Locale-scoped rooms (`ru`/`en`), incremental DOM updates, and simplified scroll behavior are in place. v1 polish (2026-07-04/05) fixed locale-switch races, web older-message scroll, extension popup auth import, and Next.js route 404 after Docker web restart.

## Blockers

None.

## Remaining Work

Deferred v1 chat items: reactions, replies, attachments, edits/deletes, AI moderation/summary, personal messages, dedicated cron package (cleanup currently runs in-process interval).
