# Backend Architecture

## Цель

Backend является единственным местом хранения бизнес-логики платформы.

Frontend никогда не реализует бизнес-правила самостоятельно.

Backend отвечает за:

- проверки;
- расчеты;
- авторизацию;
- рейтинги;
- рекомендации;
- доверие;
- модерацию.

---

# Архитектурный стиль

Backend строится как модульный монолит.

Каждый модуль представляет отдельный домен.

---

# Структура

apps/api/src/modules/

auth/

users/

entities/

ratings/

reviews/

trust/

search/

notifications/

recommendation/

moderation/

---

Каждый модуль имеет одинаковую структуру.

ratings/

controllers/

services/

repositories/

entities/

dto/

interfaces/

events/

tests/

ratings.module.ts

---

# Controllers

Только принимают запрос.

Никакой бизнес-логики.

---

# Services

Вся бизнес-логика.

---

# Repository

Только работа с базой данных.

Никаких вычислений.

---

# DTO

Все входящие и исходящие данные.

---

# Interfaces

Публичные интерфейсы.

Через них общаются модули.

---

# Events

События модуля.

Например

RatingCreated

ReviewCreated

EntityCreated

Позже легко перейти на Event Bus.

---

# Взаимодействие модулей

Нельзя

RatingRepository

↓

EntityRepository

↓

ReviewRepository

Нужно

RatingModule

↓

Entity Interface

↓

Entity Module

---

# Принцип зависимости

Модуль знает только публичный интерфейс другого модуля.

Не знает:

Repository

Service

Database

---

# API

Каждый модуль предоставляет собственный API.

Например

/entities

/ratings

/reviews

/trust

/search

Это позволит потом вынести модуль в отдельный сервис.

---

# База данных

Repository ничего не знает о других Repository.

Все связи происходят через Service.

---

# Транзакции

Только внутри одного домена.

Между доменами — события.

---

# События

Любое важное действие должно публиковать событие.

Например

EntityCreated

↓

ReviewModule

NotificationModule

RecommendationModule

Analytics

---

# Масштабирование

Любой модуль должен иметь возможность стать отдельным сервисом.

Например

Search

↓

OpenSearch

Notifications

↓

RabbitMQ

Recommendation

↓

ML Service

Backend этого не заметит.

# Жизненный цикл новой функциональности

Любая новая возможность платформы должна проходить одинаковый жизненный цикл разработки.

Это позволяет сохранять единообразие архитектуры, упрощает поддержку проекта и делает процесс разработки предсказуемым.

Стандартный жизненный цикл новой функциональности:

```text
Идея

↓

RFC

↓

Backend Module

↓

API

↓

Frontend Feature

↓

Browser Extension

↓

Тестирование

↓

Релиз
```

Например, если появляется идея добавить закладки:

```text
Bookmarks RFC

↓

Bookmarks Module

↓

Bookmarks API

↓

Bookmarks Frontend Feature

↓

Extension Integration

↓

Тестирование

↓

Релиз
```

Ни одна новая функция не должна сразу появляться в коде без предварительного проектирования.

Любая значительная функциональность сначала оформляется в виде RFC-документа, затем реализуется в backend, после чего становится доступной через API и только потом используется frontend и расширением.

---

# Запрещается

Repository вызывает Repository.

Controller вызывает Repository.

Controller содержит бизнес-логику.

Модуль знает внутреннее устройство другого модуля.

Дублирование логики.

Глобические helper-файлы на тысячи строк.