/*!
 * ZeyWin Partner Portal — однострочная интеграция для любой админки.
 *
 * Источник контента берётся из репозитория и настраивается через data-src,
 * чтобы партнёр не зависел от конкретного хостинга (GitHub Pages и т.п.).
 * Если data-src не указан — используется текущий origin (работает на любом хостинге).
 *
 * Вариант А (HTML/PHP/шаблоны): просто iframe на нужный источник
 *   <iframe src="https://your-repo.github.io/" style="width:100%;height:100vh;border:0" allow="clipboard-write;autoplay;fullscreen"></iframe>
 *
 * Вариант Б (любой фреймворк / SPA, одна строка):
 *   <script src="https://your-repo.github.io/embed.js" data-target="#partner-container"></script>
 *
 * data-src — любой URL, где развернут этот же репозиторий (свой форк, свой сервер и т.д.).
 * Если data-target не указан — iframe растягивается на весь экран (position:fixed).
 */
(function () {
  var s = document.currentScript || document.querySelector('script[src*="embed.js"]');
  var targetSel = (s && s.getAttribute('data-target')) || null;
  var height = (s && s.getAttribute('data-height')) || '100vh';
  // Источник — текущий origin по умолчанию (не зависит от GitHub Pages).
  // Партнёр может переопределить через data-src.
  var src = (s && s.getAttribute('data-src')) || (window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/'));

  function mount() {
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = 'ZeyWin Partner Portal';
    frame.setAttribute('allow', 'clipboard-write; autoplay; fullscreen');
    frame.style.border = '0';
    frame.style.width = '100%';
    frame.style.height = height;

    var host = targetSel ? document.querySelector(targetSel) : null;
    if (host) {
      host.appendChild(frame);
    } else {
      frame.style.position = 'fixed';
      frame.style.inset = '0';
      frame.style.zIndex = '2147483646';
      document.body.appendChild(frame);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
