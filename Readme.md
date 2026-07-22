# ZeyWin Build System

Система сборки Android-приложений с веб-интерфейсом для администрирования и мониторинга сборок.

## Repository-first интеграция (не зависит от GitHub Pages)

Этот репозиторий можно развернуть на любом статическом хостинге (GitHub Pages, Vercel, Netlify, собственный сервер) и подключить к любой админ-панели одной строкой.

### Вариант A — iframe (универсально)

```html
<iframe src="/path/to/repo/" style="width:100%;height:100vh;border:0" allow="clipboard-write;autoplay;fullscreen"></iframe>
```

Или с абсолютным URL вашего хостинга:

```html
<iframe src="https://your-hosting.example.com/" style="width:100%;height:100vh;border:0" allow="clipboard-write;autoplay;fullscreen"></iframe>
```

### Вариант B — embed.js (контролируемый элемент)

```html
<script src="/path/to/repo/embed.js" data-target="#partner-container"></script>
```

- `data-target` — CSS-селектор контейнера, куда вставить iframe
- `data-src` — URL развернутого репозитория (по умолчанию — текущий origin, не зависит от GitHub Pages)
- `data-height` — высота iframe (по умолчанию `100vh`)

Пример с кастомным источником:

```html
<script src="https://your-hosting.example.com/embed.js" data-target="#portal" data-src="https://your-hosting.example.com/"></script>
```

### Вариант C — прямые ссылки на страницы репозитория

Каждая страница репозитория работает автономно и может быть открыта напрямую:

| Страница | Назначение |
|----------|-----------|
| `index.html` | Главная панель сборок |
| `users.html` | Статистика посетителей |
| `icon/index.html` | Анализатор иконок сборки |
| `icons/index.html` | Галерея лаунчер-иконок |

### Конфигурация API

Любая страница подключается к любому экземпляру `android-builder-api` через meta-теги в `<head>`:

```html
<meta name="builder-api" content="https://your-api.example.com">
<meta name="builder-key" content="your-api-key">
```

По умолчанию конфигурация берется из meta-тегов. Если теги не указаны — используются безопасные значения по умолчанию.

### Ключевые принципы

- **Не зависит от GitHub Pages**: `embed.js` определяет источник из текущего origin, а не из хардкода
- **Одна строка кода**: любая админка получает полный функционал сборок через iframe или embed.js
- **Все страницы поддерживают интеграцию**: каждая страница репозитория может быть открыта напрямую или в iframe
- **Self-hosted**: при部署 на свой сердер форк, конфиг API меняется один раз в meta-тегах

### Разработка

1. Клонировать репозиторий
2. Открыть нужную страницу (`index.html`, `users.html` и т.д.) в браузере или развернуть на любом статическом хостинге
3. Для своей API — указать свои `builder-api` и `builder-key` в meta-тегах `<head>`
4. Для встраивания — использовать `embed.js` с `data-src` на ваш хостинг
