# Марина: изображения и промпты

Дата: 14 октября 2026. Режим: встроенный `imagegen`, без CLI/API fallback. Все три изображения скопированы в проект; прозрачность не запрашивалась. Подписи и фразы рисуются ботом отдельно, поэтому их можно переименовать без повторной генерации.

| Экран | Ресурс проекта | Образ |
| --- | --- | --- |
| Приветствие, баланс, история | `apps/dota-bot/bot/assets/rewards/marina-home.png` | Марина приветствует с зелёными листьями |
| Задания, заработок, проверки | `apps/dota-bot/bot/assets/rewards/marina-earn.png` | Марина с мешочком монет и зелёными жетонами |
| Розыгрыш, покупка, билеты | `apps/dota-bot/bot/assets/rewards/marina-raffle.png` | Радостная Марина с сокровищницей |

Первое изображение создано с нуля. Два остальных — правки первого изображения с сохранением лица, волос, одежды и художественного стиля. Идентификаторы Telegram file_id сохраняются отдельно от финансовых данных. При замене PNG изменяется контрольная сумма, прежний кэш не используется.

## Приветствие: исходный промпт

Use case: illustration-story. Create a polished original 2D anime mascot illustration for a Russian Dota party-finding Telegram bot, landscape 3:2 composition about 1200x800. One clearly adult woman age 24 called Marina, warm beautiful expressive face, emerald-green eyes, shoulder-length dark auburn hair, a small green leaf hair clip, cream and forest-green practical fantasy adventurer jacket, tasteful modest clothing, waist-up three-quarter pose, friendly welcome with one hand waving, holding a small glowing Tango-inspired bundle of green leaves in the other. Original character, clean confident hand-drawn anime linework, crisp cel shading, subtle textured painterly detail, avoid glossy 3D plastic AI appearance. Dark softly painted forest/tavern background with a little worn wooden desk and distant soft green light. Mascot prominent, centered, recognizable silhouette, no busy scene, no text, no logos, no lettering, no other people. This is the welcome screen art for a rewards section; green leaf currency theme. Her face and outfit must support consistent follow-up variants.

## Заработок: промпт правки

Edit the referenced Marina mascot welcome illustration into the earning-tasks screen illustration. Preserve exactly the same recognizable adult woman, face, auburn hair, green eyes, leaf hairclip, cream and green adventurer outfit, original hand-drawn 2D anime linework and warm forest-tavern scene, landscape 3:2. Change pose: she stands behind the same wooden table, cheerful confident smile, holding a small cloth pouch of gold coins in one hand and presenting glowing green Tango leaf tokens in the other, a small orderly pile of coins and leaf tokens on the table. Coins are in-game tokens only. No text, lettering, logos, no other characters. Crisp 2D cel-shaded art, not glossy 3D.

## Розыгрыш: промпт правки

Edit the referenced Marina mascot welcome illustration into the giveaway raffle screen illustration. Preserve exactly the same recognizable adult woman, face, auburn hair, green eyes, leaf hairclip, cream and forest-green adventurer outfit, warm forest-tavern setting and original hand-drawn 2D anime linework, landscape 3:2. Change pose and expression: Marina is delighted, open joyful smile, excited eyes, showing an open small worn fantasy treasure chest filled with softly glowing green leaf tokens and a few gold sparkles on the same wooden table; one hand celebrating with a small raised fist. A tasteful few floating leaf confetti. Keep composition uncluttered, character dominant, realistic crisp cel shading, not plastic 3D. No text, no logos, no other people.

## Как менять дальше

Сохранить текущие PNG перед заменой; редактировать выбранное изображение через `imagegen` как reference, удерживая лицо/одежду. По отдельности можно изменить причёску, фон, стиль, выражение или предметы. Имя персонажа и фразы меняются в админке; они не зашиты в изображениях.
