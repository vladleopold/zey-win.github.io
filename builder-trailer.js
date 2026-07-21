// ===== VISITOR TRACKING =====
async function trackVisitor() {
  try {
    const apiBase = document.querySelector('meta[name="builder-api"]')?.content?.replace(/\/$/, '') || "https://zeywin-android-builder-api.vercel.app";
    await fetch(`${apiBase}/api/stats/visitor-counts`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    // Silently fail - tracking is optional
  }
}

// Track visitor on page load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  trackVisitor();
} else {
  document.addEventListener('DOMContentLoaded', trackVisitor);
}

// ===== MODE SWITCHING FIX =====
function updateModeUI() {
  const modeToggle = document.getElementById('mode-toggle');
  if (!modeToggle) return;
  
  const isAdmin = mode === 'admin';
  modeToggle.textContent = isAdmin ? 'Сайт' : 'Админка';
  modeToggle.setAttribute('aria-label', isAdmin ? 'Переключить на сайт' : 'Переключить на админку');
  
  // Update header indicator
  const modeIndicator = document.getElementById('mode-indicator');
  if (modeIndicator) {
    modeIndicator.textContent = isAdmin ? '🔧 АДМИНКА' : '🌐 САЙТ';
  }
  
  // Show/hide admin elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  
  document.querySelectorAll('.main-only').forEach(el => {
    el.style.display = isAdmin ? 'none' : '';
  });
  
  // Re-render configs for current mode
  renderSavedConfigs();
}

// Override mode toggle click handler
const originalModeToggle = document.getElementById('mode-toggle');
if (originalModeToggle) {
  originalModeToggle.addEventListener('click', () => {
    mode = mode === 'admin' ? 'main' : 'admin';
    localStorage.setItem('builder_mode', mode);
    updateModeUI();
    location.reload();
  });
}

// Initialize mode on load
if (!mode || mode === 'undefined') {
  mode = localStorage.getItem('builder_mode') || 'main';
}
updateModeUI();

// ===== STATISTICS PAGE LINK =====
// Add users link to header if it exists
const header = document.querySelector('header');
if (header && !document.getElementById('users-link')) {
  const usersLink = document.createElement('a');
  usersLink.id = 'users-link';
  usersLink.href = 'https://zey-win.github.io/users';
  usersLink.textContent = '📊 Статистика';
  usersLink.style.cssText = 'margin-left: 12px; padding: 6px 12px; background: rgba(88,166,255,0.15); border-radius: 8px; color: #58a6ff; text-decoration: none; font-size: 13px;';
  header.appendChild(usersLink);
}
