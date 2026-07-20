/*!
 * ZeyWin Partner Portal — однострочная интеграция для любой админки.
 *
 * Вариант А (HTML/PHP/шаблоны): просто вставьте iframe
 *   <iframe src="https://zey-win.github.io/" style="width:100%;height:100vh;border:0" allow="clipboard-write;autoplay;fullscreen"></iframe>
 *
 * Вариант Б (любой фреймворк / SPA, одна строка):
 *   <script src="https://zey-win.github.io/embed.js" data-target="#partner-container" data-height="100vh"></script>
 *
 * Если data-target не указан — iframe растягивается на весь экран (position:fixed).
 */
(function () {
  var s = document.currentScript || document.querySelector('script[src*="embed.js"]');
  var targetSel = (s && s.getAttribute('data-target')) || null;
  var height = (s && s.getAttribute('data-height')) || '100vh';
  var src = 'https://zey-win.github.io/';

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
