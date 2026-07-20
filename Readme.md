# ZeyWin Build System

Система сборки Android-приложений с веб-интерфейсом для администрирования и мониторинга сборок.

## Однострочная интеграция в любую админку

Страница подключается к любой админ-панели одной строкой кода без iframe или скриптов:

### Вариант A — iframe (универсально)

```html
<iframe src="https://zey-win.github.io/" style="width:100%;height:100vh;border:0" allow="clipboard-write;autoplay;fullscreen"></iframe>
```

### Вариант B — embed.js (контролируемый элемент)

```html
<script src="https://zey-win.github.io/embed.js" data-target="#partner-container"></script>
```

- `data-target` — CSS-селектор контейнера, куда вставить iframe
- `data-src` — альтернативный URL страницы (по умолчанию `https://zey-win.github.io/`)
- `data-height` — высота iframe (по умолчанию `100vh`)

Пример с кастомным источником:
```html
<script src="https://zey-win.github.io/embed.js" data-target="#portal" data-src="https://your-fork.github.io/"></script>
```

## Конфигурация API

Страница подключается к любому экземпляру android-builder-api через meta-теги:

```html
<meta name="builder-api" content="https://your-api.vercel.app">
<meta name="builder-key" content="your-api-key">
```

По умолчанию: `builder-api=https://zeywin-android-builder-api.vercel.app`.

## Разработка

1. Клонировать репозиторий
2. Открыть `index.html` в браузере или развернуть на GitHub Pages / любом статическом хостинге
3. Для своей API — указать свой `builder-api` и `builder-key`
