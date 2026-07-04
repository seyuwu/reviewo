# reviewo / Opinia

Universal rating platform — [opinia.ru](https://opinia.ru)

## Production

| | |
| --- | --- |
| Сайт | https://opinia.ru |
| API | https://api.opinia.ru |
| Расширение | Chrome Web Store (Opinia) |

## Разработка

Локально → push на [GitHub](https://github.com/seyuwu/reviewo) → деплой и проверка на VPS.

```bash
make dev   # API, web, Postgres, Redis — Docker
```

Подробнее: [docs/development-workflow.md](docs/development-workflow.md)

## Документация

- [docs/](docs/) — deployment, testing, RFC
- [project-management/](project-management/) — текущее состояние и roadmap
- [extention.md](extention.md) — архитектура расширения
