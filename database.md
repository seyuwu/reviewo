# Database Design — Universal Rating Platform

## 1. Цели базы данных

База данных должна поддерживать три ключевые вещи:

1. **Любую сущность можно создать и оценить очень быстро.**
2. **Одна и та же сущность должна собирать все оценки, отзывы и статистику в одном месте.**
3. **Архитектура должна оставаться удобной для модульного монолита и позднего перехода к микросервисам.**

База проектируется не как набор случайных таблиц, а как набор **чётко разделённых доменов**.

---

## 2. Общие принципы моделирования

### 2.1. Один универсальный объект

Внутри системы любой объект — это **сущность**. У сущности есть тип, родитель, дети, URL, название, изображения, оценки, отзывы и показатели доверия.

На уровне базы это означает:

- одна основная таблица для сущностей;
- отдельные таблицы для оценок, отзывов, тегов и метрик;
- связь через `entity_id`;
- отсутствие жёсткой привязки к конкретным категориям в одной таблице.

### 2.2. Разделение по доменам

Данные не должны быть «свалены» в одну огромную таблицу. Лучше разделить систему на домены:

- `auth` — пользователи, сессии, токены;
- `users` — профили и настройки;
- `entities` — сущности и дерево;
- `ratings` — оценки;
- `reviews` — отзывы;
- `trust` — расчёт доверия;
- `moderation` — жалобы, блокировки, проверки;
- `notifications` — уведомления;
- `recommendation` — рекомендации и сигналы интереса.

### 2.3. Готовность к микросервисам

Даже если физически всё хранится в одной PostgreSQL базе, логически каждый домен должен владеть своими таблицами.

Правило:

> один домен — один владелец данных.

Это позволит позже вынести домен в отдельный сервис без переписывания всей модели.

### 2.4. История важнее текущего состояния

Для таких продуктов недостаточно хранить только итоговую оценку.
Нужно отдельно хранить:

- сырые оценки;
- агрегаты;
- историю изменения рейтинга;
- историю доверия;
- изменения сущности;
- модерационные события.

Это позволит строить графики, находить накрутки и делать аналитические фичи.

---

## 3. Физическая стратегия хранения

### Рекомендуемый стек для MVP

- **PostgreSQL** — основная база;
- **Redis** — кэш, очереди, временные данные;
- **Object Storage (S3-совместимое)** — изображения и медиа;
- **Поиск внутри PostgreSQL** — на MVP достаточно full-text search и индексов;
- **OpenSearch/Elasticsearch** — только когда реально потребуется масштабный поиск.

### Почему именно так

На старте не нужно усложнять инфраструктуру. PostgreSQL способен закрыть:

- основное хранение;
- связи;
- агрегации;
- полнотекстовый поиск;
- транзакционную целостность.

Это снижает стоимость разработки и упрощает миграцию в будущем.

---

## 4. Схемы базы данных

Рекомендуется использовать отдельные схемы PostgreSQL для доменов.

Пример:

```text
public
auth
users
entities
ratings
reviews
trust
moderation
notifications
recommendation
```

Так проще поддерживать границы ответственности и в будущем переносить схемы в отдельные сервисы.

---

## 5. Основные таблицы

---

### 5.1. users

Хранит базовую информацию о пользователе.

**users**

- `id` UUID / ULID
- `email` unique nullable
- `username` unique nullable
- `display_name`
- `avatar_url` nullable
- `status` (`active`, `blocked`, `deleted`)
- `created_at`
- `updated_at`

**Назначение:**

Пользовательский аккаунт, авторизация, профиль, репутация.

---

### 5.2. user_auth_identities

Если нужна авторизация через разные провайдеры.

- `id`
- `user_id`
- `provider` (`google`, `github`, `telegram`, `email`)
- `provider_user_id`
- `created_at`

---

### 5.3. entities

Главная таблица платформы.

**entities**

- `id` UUID / ULID
- `parent_id` nullable
- `root_id` nullable
- `type` (строка или enum)
- `title`
- `slug` nullable
- `canonical_url` nullable
- `description` nullable
- `icon_url` nullable
- `cover_url` nullable
- `status` (`active`, `pending`, `blocked`, `deleted`)
- `created_by` nullable
- `created_at`
- `updated_at`

**Смысл полей:**

- `parent_id` — родительская сущность;
- `root_id` — корень дерева для быстрого обхода;
- `type` — тип объекта, например `website`, `video`, `product`, `course`;
- `canonical_url` — нормализованный URL без лишних параметров;
- `slug` — удобный человекочитаемый путь;
- `status` — жизненный цикл сущности.

---

### 5.4. entity_links

Одна сущность может иметь много ссылок.

**entity_links**

- `id`
- `entity_id`
- `url`
- `normalized_url`
- `source` (`manual`, `extension`, `import`, `admin`)
- `created_at`

**Зачем:**

Чтобы разные ссылки на один и тот же объект не создавали дубликаты.

---

### 5.5. entity_relations

Если одной таблицы `parent_id` недостаточно и понадобится более сложный граф.

**entity_relations**

- `id`
- `parent_entity_id`
- `child_entity_id`
- `relation_type` (`parent`, `contains`, `version_of`, `same_as`, `part_of`)
- `created_at`

Для MVP можно ограничиться `parent_id`, а эту таблицу использовать позже.

---

### 5.6. entity_images

**entity_images**

- `id`
- `entity_id`
- `url`
- `type` (`icon`, `cover`, `gallery`)
- `sort_order`
- `created_at`

---

### 5.7. ratings

Хранит **сырые оценки** пользователей.

**ratings**

- `id`
- `entity_id`
- `user_id`
- `score` numeric(2,1) или smallint
- `source` (`web`, `extension`, `mobile`, `api`)
- `created_at`
- `updated_at`
- `deleted_at` nullable

**Ограничения:**

- один пользователь — одна активная оценка на одну сущность;
- можно хранить историю через soft delete или отдельную history table.

---

### 5.8. rating_aggregates

Чтобы не считать рейтинг на лету постоянно.

**rating_aggregates**

- `entity_id` primary key
- `avg_score`
- `votes_count`
- `distribution_1`
- `distribution_2`
- `distribution_3`
- `distribution_4`
- `distribution_5`
- `updated_at`

Если шкала станет гибче, распределение лучше хранить в отдельной таблице, но для MVP этого достаточно.

---

### 5.9. reviews

Отзывы пользователей.

**reviews**

- `id`
- `entity_id`
- `user_id`
- `title` nullable
- `body`
- `status` (`visible`, `hidden`, `deleted`, `pending`)
- `created_at`
- `updated_at`
- `deleted_at` nullable

---

### 5.10. review_votes

Лайки и дизлайки отзывов.

**review_votes**

- `id`
- `review_id`
- `user_id`
- `vote` (`up`, `down`)
- `created_at`

---

### 5.11. review_tags

Метки сообщества или сигнальные теги.

**review_tags**

- `id`
- `review_id`
- `tag`
- `created_at`

Примеры тегов:

- `много рекламы`
- `есть спойлеры`
- `подозрение на накрутку`
- `проверенная информация`

---

### 5.12. entity_tags

Метки, относящиеся к сущности в целом.

**entity_tags**

- `id`
- `entity_id`
- `tag`
- `source` (`user`, `system`, `moderation`)
- `created_at`

---

### 5.13. trust_scores

Текущий показатель доверия.

**trust_scores**

- `entity_id` primary key
- `trust_score` numeric(5,2)
- `confidence_score` numeric(5,2)
- `calculated_at`
- `version`

**Важно:**

Можно хранить два разных показателя:

- `trust_score` — насколько можно доверять рейтингу;
- `confidence_score` — насколько система уверена в текущем значении.

---

### 5.14. trust_score_history

История доверия.

**trust_score_history**

- `id`
- `entity_id`
- `trust_score`
- `confidence_score`
- `reason`
- `calculated_at`

---

### 5.15. entity_stats_daily

Агрегаты по дням для графиков и аналитики.

**entity_stats_daily**

- `id`
- `entity_id`
- `day`
- `views_count`
- `ratings_count`
- `reviews_count`
- `unique_users_count`
- `created_at`

---

### 5.16. entity_views

Просмотры сущностей.

**entity_views**

- `id`
- `entity_id`
- `user_id` nullable
- `session_id` nullable
- `source` (`web`, `extension`, `mobile`)
- `created_at`

Для MVP можно хранить только агрегаты, а затем добавить сырые просмотры.

---

### 5.17. moderation_flags

Жалобы и проверки.

**moderation_flags**

- `id`
- `entity_id` nullable
- `review_id` nullable
- `created_by`
- `reason`
- `status` (`open`, `reviewed`, `dismissed`, `action_taken`)
- `created_at`
- `updated_at`

---

### 5.18. moderation_actions

Действия модераторов.

**moderation_actions**

- `id`
- `target_type`
- `target_id`
- `action_type`
- `moderator_id`
- `reason`
- `created_at`

---

### 5.19. notifications

Уведомления пользователя.

**notifications**

- `id`
- `user_id`
- `type`
- `title`
- `body`
- `read_at` nullable
- `created_at`

---

## 6. Связи между таблицами

### Основные связи

- `users` → `ratings`
- `users` → `reviews`
- `users` → `moderation_flags`
- `entities` → `ratings`
- `entities` → `reviews`
- `entities` → `entity_images`
- `entities` → `entity_links`
- `entities` → `trust_scores`
- `reviews` → `review_votes`
- `reviews` → `review_tags`
- `entities` → `entity_tags`

### Главный принцип

Сущность — центральный объект. Все остальное привязывается к ней.

---

## 7. Индексы и ограничения

### Обязательные уникальности

- `users.email` unique
- `users.username` unique
- `ratings(entity_id, user_id)` unique where deleted_at is null
- `entity_links.normalized_url` unique или частично unique для активных записей
- `entity_relations(parent_entity_id, child_entity_id, relation_type)` unique

### Обязательные индексы

- `entities(type)`
- `entities(parent_id)`
- `entities(root_id)`
- `entities(canonical_url)`
- `ratings(entity_id)`
- `ratings(user_id)`
- `reviews(entity_id)`
- `reviews(user_id)`
- `trust_scores(entity_id)`
- `entity_links(normalized_url)`

### Поисковые индексы

Для PostgreSQL:

- `GIN` по `title`, `description`, `body`
- `tsvector` для поиска по названию и описанию

---

## 8. Канонизация URL

Одна из важнейших частей системы.

Нужно хранить не просто URL, а **нормализованный URL**.

### Что делать при нормализации

- убирать UTM-параметры;
- убирать лишние query-параметры, если они не меняют сущность;
- приводить домен к единому виду;
- нормализовать `http/https`;
- учитывать `www`;
- выделять видео/товар/пост как отдельную каноническую сущность.

### Практика

Например:

- `youtube.com/watch?v=abc&utm_source=x`
- `youtu.be/abc`
- `youtube.com/watch?v=abc&t=12s`

могут вести к одному объекту или к одному базовому объекту с уточнением уровня вложенности.

---

## 9. Версионирование и история

Для критичных сущностей полезно хранить историю изменений.

### Что можно версионировать

- название;
- описание;
- родителя;
- тип;
- URL;
- изображения;
- рейтинг;
- trust score;
- модерационные статусы.

Для этого можно сделать таблицы:

- `entity_history`
- `rating_history`
- `review_history`
- `trust_score_history`

---

## 10. Подход к рейтингу

Рейтинг должен храниться в двух формах:

1. **Сырые данные** — отдельные оценки пользователей.
2. **Агрегаты** — средний рейтинг, распределение и количество голосов.

Это важно, потому что:

- сырые данные нужны для модерации и аналитики;
- агрегаты нужны для быстрого отображения на сайте и в расширении.

Нельзя каждый раз пересчитывать рейтинг запросом к миллиону строк.

---

## 11. Расчёт доверия

`trust_score` не должен храниться как «магическое число» без объяснения.

Лучше хранить еще и сигналы, из которых он собирается.

### Пример будущей таблицы сигналов

**trust_signals**

- `id`
- `entity_id`
- `signal_type`
- `signal_value`
- `weight`
- `created_at`

Примеры сигналов:

- малое число оценок;
- резкий всплеск активности;
- подозрительные аккаунты;
- согласованность мнений;
- возраст сущности;
- число уникальных пользователей.

Так доверие станет объяснимым.

---

## 12. Минимальная схема для MVP

Для старта достаточно такого ядра:

- `users`
- `user_auth_identities`
- `entities`
- `entity_links`
- `entity_images`
- `ratings`
- `rating_aggregates`
- `reviews`
- `review_votes`
- `trust_scores`
- `entity_stats_daily`
- `moderation_flags`

Этого достаточно, чтобы запустить MVP, расширение и сайт.

---

## 13. Что лучше не добавлять в MVP

Чтобы не раздувать схему слишком рано, в MVP не нужны:

- сложный event sourcing;
- отдельный search-cluster;
- графовая база;
- микросервисная БД для каждого домена;
- слишком сложная система тегов;
- перегруженная аналитика;
- сложные рекомендательные модели.

Эти вещи можно добавить позже, когда появится нагрузка и реальные паттерны использования.

---

## 14. Итоговая архитектурная мысль

База данных должна быть простой для MVP, но с чёткими границами, чтобы потом не пришлось всё переделывать.

Лучший подход для этого проекта:

- одна PostgreSQL база;
- отдельные схемы по доменам;
- одна главная таблица сущностей;
- отдельные таблицы для оценок, отзывов, доверия и модерации;
- нормализация URL;
- история изменений;
- агрегаты отдельно от сырых данных;
- строгая изоляция доменов.

Это даст быстрое начало и сохранит путь к масштабированию.
