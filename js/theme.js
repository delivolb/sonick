/* ===================================================
   SONICK DELIVERY SYSTEM — Theme Manager
   Handles dark / light mode switching + persistence
   ================================================== */

const THEME_KEY = 'sonick_theme';

/** Apply a theme: sets data-theme on <html>, saves to localStorage, updates button */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  _syncThemeBtn(theme);
}

/** Toggle between dark ↔ light */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/** Update icon + tooltip on the toggle button */
function _syncThemeBtn(theme) {
  const isDark = theme === 'dark';
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title       = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

/* ── Immediately restore saved theme before first paint (no flicker) ── */
(function () {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  /* Sync button after DOM is ready */
  document.addEventListener('DOMContentLoaded', function () {
    _syncThemeBtn(saved);
  });
})();
