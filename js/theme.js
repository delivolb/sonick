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
    btn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
    btn.title      = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

/* ===================================================
   Logo lockup swap (English <-> Arabic full logo art)
   Shared by index.html and driver.html. The full lockup
   (shield + wordmark) is a single flattened image per
   language — swap its src on the loading/login screens
   whenever the active language changes.
   ================================================== */
function syncLogoImages(lang) {
  const src = lang === 'ar' ? 'assets/logo-full-ar.png' : 'assets/logo-full.png';
  document.querySelectorAll('.logo-full-img').forEach(function (img) {
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  });
}

/* ── Immediately restore saved theme before first paint (no flicker) ── */
(function () {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  /* Sync button + logo lockup after DOM is ready */
  document.addEventListener('DOMContentLoaded', function () {
    _syncThemeBtn(saved);
    syncLogoImages(localStorage.getItem('sonick_lang') || 'en');
  });
})();
