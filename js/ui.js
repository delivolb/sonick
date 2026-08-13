/* ===================================================
   SONICK DELIVERY SYSTEM — UI Helpers
   navigation, sidebar, modals, toasts, utilities, CSV
   =================================================== */

// ===== UI VISIBILITY =====
function hideLoading() {
  document.getElementById('loading-screen').classList.add('hidden');
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  applyLang();
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  setupUI();
  navigate('home');
}

function setupUI() {
  if (!currentUserData) return;
  const name = currentUserData.displayName || currentUserData.email || '?';
  document.getElementById('user-display-name').textContent = name;
  document.getElementById('user-role-label').textContent = (ROLES[currentUserData.role] || { label: '—' }).label;
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-avatar').textContent = initials;

  // Show/hide nav items based on permissions
  const nd  = document.getElementById('nav-debts');
  const ng  = document.getElementById('nav-general');
  const nc  = document.getElementById('nav-companies');
  const ncn = document.getElementById('nav-contractors');
  const ndr = document.getElementById('nav-drivers');
  const nu  = document.getElementById('nav-users');
  const nb  = document.getElementById('nav-backup');
  const nf  = document.getElementById('nav-section-fin');
  const nm  = document.getElementById('nav-section-mgmt');
  const tnb = document.getElementById('topbar-new-ship');

  if (nd)  nd.style.display  = can('canViewDebts')       ? '' : 'none';
  if (ng)  ng.style.display  = can('canViewGeneral')     ? '' : 'none';
  if (nc)  nc.style.display  = can('canManageCompanies')   ? '' : 'none';
  if (ncn) ncn.style.display = can('canManageContractors') ? '' : 'none';
  if (ndr) ndr.style.display = can('canManageDrivers')   ? '' : 'none';
  if (nu)  nu.style.display  = can('canManageUsers')     ? '' : 'none';
  if (nb)  nb.style.display  = can('canManageBackup')    ? '' : 'none';
  if (tnb) tnb.style.display = can('canCreateShipments') ? '' : 'none';
  if (nf)  nf.style.display  = (can('canViewDebts')       || can('canViewGeneral'))    ? '' : 'none';
  if (nm)  nm.style.display  = (can('canManageCompanies') || can('canManageContractors') || can('canManageDrivers') || can('canManageUsers')) ? '' : 'none';

  applyLang();
  loadDollarRate();
}

function loadDollarRate() {
  const el    = document.getElementById('topbar-dollar');
  const ratEl = document.getElementById('topbar-dollar-rate');
  if (dollPrice > 0 && el && ratEl) {
    el.style.display = 'flex';
    ratEl.textContent = formatNum(dollPrice) + ' L.L.';
  }
}

// ===== NAVIGATION =====
function navigate(page) {
  currentPage = page;
  closeSidebar();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const titles = {
    home:           t('home'),
    dashboard:      t('dashboard'),    shipments: t('shipments'),
    archive:        t('archive'),
    debts:          t('debtsPayments'),general:   t('generalReport'),
    companies:      t('companies'),    contractors: t('contractors'),
    drivers:        t('drivers'),
    users:          t('users'),        settings:  t('settings'),
    backup:         t('backupRestore')
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const content = document.getElementById('page-content');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:60px;"><div class="spinner"></div></div>';

  const routes = {
    home:           renderHome,
    dashboard:      renderDashboard,
    shipments:      renderShipments,
    archive:        renderArchive,
    debts:          renderDebts,
    general:        renderGeneral,
    companies:      renderCompanies,
    contractors:    renderContractors,
    drivers:        renderDrivers,
    users:          renderUsers,
    settings:       renderSettings,
    backup:         renderBackup
  };

  setTimeout(() => {
    if (routes[page]) routes[page]();
    else content.innerHTML = '<div class="access-denied"><div class="ad-icon">🚧</div><h2>Page not found</h2></div>';
  }, 50);
}

// ===== SIDEBAR =====
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ===== MODALS =====
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function confirmAction(title, message, callback, onCancel) {
  document.getElementById('modal-confirm-title').textContent = title;
  document.getElementById('modal-confirm-body').innerHTML = message
    ? `<p style="color:var(--text-2);padding:8px 0;white-space:pre-line;">${esc(message)}</p>` : '';
  document.getElementById('modal-confirm-ok').onclick = () => {
    closeModal('modal-confirm');
    callback();
  };
  const cancelBtn = document.getElementById('modal-confirm-cancel');
  if (cancelBtn) cancelBtn.onclick = () => { closeModal('modal-confirm'); if (onCancel) onCancel(); };
  openModal('modal-confirm');
}

/** Show a one-time "here's the driver's portal login" modal right after creating or
 *  resetting portal access — this is the only moment the plaintext password is ever known,
 *  so it's shown here with a one-click "copy as message" button (handy for sending via
 *  WhatsApp/SMS) rather than being stored or shown again later. */
function showPortalCredentials({ name, username, password }) {
  const url = new URL('driver.html', window.location.href).href;
  const message = `${t('portalCredsMessageIntro')} ${name}\n${t('driverPortalLink')}: ${url}\n${t('loginUsernameLabel')}: ${username}\n${t('loginPasswordLabel')}: ${password}`;

  document.getElementById('portal-creds-title').textContent = t('portalCredsTitle');
  document.getElementById('portal-creds-body').innerHTML = `
    <p style="color:var(--text-2);font-size:0.929rem;margin-bottom:14px;">${esc(t('portalCredsDesc'))}</p>
    <div class="form-group">
      <label class="form-label">${t('driverPortalLink')}</label>
      <input class="form-input font-mono" readonly value="${esc(url)}" onclick="this.select()" style="font-size:0.8rem;">
    </div>
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">${t('loginUsernameLabel')}</label>
        <input class="form-input font-mono" readonly value="${esc(username)}" onclick="this.select()">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">${t('loginPasswordLabel')}</label>
        <input class="form-input font-mono" readonly value="${esc(password)}" onclick="this.select()">
      </div>
    </div>`;

  const copyBtn = document.getElementById('portal-creds-copy-btn');
  copyBtn.textContent = t('copyCredentialsBtn');
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(message); toast(t('copiedToClipboard'), 'success'); }
    catch (e) { toast(t('copyFailed'), 'error'); }
  };

  openModal('modal-portal-creds');
}

// ===== PROMPT MODAL (styled replacement for window.prompt) =====
let _promptCancelHandler = null;

/**
 * Show a styled modal with a single labeled input, in place of window.prompt().
 * opts: { title, message, defaultValue, type ('text'|'number'|'date'), step, placeholder }
 * onConfirm(value) fires with the input's string value on OK / Enter.
 * onCancel() fires (if provided) on Cancel / ✕ / backdrop / Escape instead.
 */
function promptInput(opts, onConfirm, onCancel) {
  const { title = '', message = '', defaultValue = '', type = 'text', step, placeholder = '' } = opts || {};

  document.getElementById('modal-prompt-title').textContent = title;
  const msgEl = document.getElementById('modal-prompt-message');
  msgEl.textContent   = message;
  msgEl.style.display = message ? 'block' : 'none';

  const input = document.getElementById('modal-prompt-input');
  input.type = type;
  if (step) input.setAttribute('step', step); else input.removeAttribute('step');
  input.placeholder = placeholder;
  input.value = defaultValue;

  _promptCancelHandler = onCancel || null;

  const confirm = () => {
    _promptCancelHandler = null;
    closeModal('modal-prompt');
    onConfirm(input.value);
  };

  document.getElementById('modal-prompt-ok').onclick = confirm;
  input.onkeydown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelPromptModal(); }
  };

  openModal('modal-prompt');
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

/** Close the prompt modal via Cancel/✕/backdrop/Escape, firing its onCancel callback if any. */
function cancelPromptModal() {
  closeModal('modal-prompt');
  const cb = _promptCancelHandler;
  _promptCancelHandler = null;
  if (cb) cb();
}

let _withdrawDetailsCancelHandler = null;

/** Show a small form modal to capture the refunded amount ($ and L.L.) whenever an order's
 *  status is set to Withdrawn — a customer-initiated cancellation/return of the order itself.
 *  This is unrelated to the Returned-Unpaid/Returned-Paid statuses, which track a failed
 *  delivery being brought back and whether the driver's return trip has been paid for.
 *  Used by the inline status editor and the bulk-status bar. */
function promptWithdrawAmount(defaults = {}, onConfirm, onCancel) {
  document.getElementById('modal-return-title').textContent   = t('withdrawOrderTitle');
  document.getElementById('modal-return-message').textContent = t('withdrawOrderMsg');
  document.getElementById('modal-return-usd-label').textContent = t('withdrawnAmountUSD');
  document.getElementById('modal-return-lbp-label').textContent = t('withdrawnAmountLL');

  const usdInput = document.getElementById('ret-amount-usd');
  const lbpInput = document.getElementById('ret-amount-lbp');

  usdInput.value = defaults.withdrawnAmountDollar || defaults.priceDollar || '';
  lbpInput.value = defaults.withdrawnAmountLeb    || defaults.priceLeb    || '';

  _withdrawDetailsCancelHandler = onCancel || null;

  const confirm = () => {
    _withdrawDetailsCancelHandler = null;
    closeModal('modal-return-details');
    onConfirm({
      withdrawnAmountDollar: parseFloat(usdInput.value) || 0,
      withdrawnAmountLeb:    parseFloat(lbpInput.value) || 0,
    });
  };
  document.getElementById('modal-return-ok').onclick = confirm;

  const handleKey = e => {
    if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelWithdrawDetailsModal(); }
  };
  usdInput.onkeydown = handleKey;
  lbpInput.onkeydown = handleKey;

  openModal('modal-return-details');
  setTimeout(() => { usdInput.focus(); usdInput.select(); }, 50);
}

/** Close the withdraw-amount modal via Cancel/✕/backdrop/Escape, firing its onCancel callback. */
function cancelWithdrawDetailsModal() {
  closeModal('modal-return-details');
  const cb = _withdrawDetailsCancelHandler;
  _withdrawDetailsCancelHandler = null;
  if (cb) cb();
}

// Close modals by clicking the backdrop
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target !== overlay) return;
    if (overlay.id === 'modal-prompt') cancelPromptModal();
    else if (overlay.id === 'modal-return-details') cancelWithdrawDetailsModal();
    else if (overlay.id === 'modal-export-options') cancelExportOptionsModal();
    else overlay.classList.remove('open');
  });
});

// ===== TOAST =====
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el    = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ===== UTILITY HELPERS =====
function renderAccessDenied() {
  document.getElementById('page-content').innerHTML = `
  <div class="access-denied">
    <div class="ad-icon">🔒</div>
    <h2>Access Restricted</h2>
    <p>You don't have permission to view this section.<br>Contact your administrator.</p>
  </div>`;
}

/**
 * Show the persistent "demo mode" warning banner — used when Firestore reads
 * fail (e.g. permission errors) and the app has silently fallen back to
 * built-in sample data, so the person doesn't mistake it for real data.
 */
function showDemoBanner(message) {
  const el = document.getElementById('demo-mode-banner');
  if (!el) return;
  if (message) {
    const textEl = document.getElementById('demo-banner-text');
    if (textEl) textEl.textContent = message;
  }
  el.classList.remove('hidden');
}
function hideDemoBanner() {
  document.getElementById('demo-mode-banner')?.classList.add('hidden');
}

/**
 * Build a consistent page header: big title + "Home › Section › Page" breadcrumb,
 * with optional action buttons aligned to the end (e.g. an export or create button).
 * @param {string} title      - current page title (already translated)
 * @param {string[]} trail    - extra breadcrumb labels between Home and the current page
 * @param {string} actionsHTML - optional HTML for right-aligned header actions
 */
function pageHeader(title, trail = [], actionsHTML = '') {
  const crumbs = [
    `<span class="crumb" onclick="navigate('dashboard')">${t('home')}</span>`,
    ...trail.map(label => `<span class="crumb" onclick="navigate('dashboard')">${esc(label)}</span>`),
    `<span class="crumb-current">${esc(title)}</span>`
  ].join('<span class="breadcrumb-sep">›</span>');

  return `
  <div class="page-header">
    <div class="page-header-title-row">
      <div class="page-header-title">${esc(title)}</div>
      <div class="breadcrumb">${crumbs}</div>
    </div>
    ${actionsHTML ? `<div class="page-header-actions">${actionsHTML}</div>` : ''}
  </div>`;
}

/** Toggle a small action dropdown menu open/closed (e.g. export or create options) */
function toggleDropdown(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const willOpen = !el.classList.contains('open');
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  if (willOpen) el.classList.add('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

/* ── Status config: internal key → { label-key, badge class, icon }
   Colors match the reference UI:
   Pending       → plain dash (no color)
   Delivered     → green
   Cancelled     → red
   Delayed       → orange
   Returned-Unpaid → yellow
   Returned-Paid   → lime green
── */
const STATUS_CONFIG = {
  'Pending':         { key: 'statusPending',        cls: 'badge-plain',    icon: '—'  },
  'Delivered':       { key: 'statusDelivered',      cls: 'badge-green',    icon: '✓'  },
  'Cancelled':       { key: 'statusCancelled',      cls: 'badge-red',      icon: '✕'  },
  'Delayed':         { key: 'statusDelayed',        cls: 'badge-darkblue', icon: '🕐' },
  'Returned-Unpaid': { key: 'statusReturnedUnpaid', cls: 'badge-orange',   icon: '↩'  },
  'Returned-Paid':   { key: 'statusReturnedPaid',   cls: 'badge-yellow',   icon: '↩'  },
  'Withdrawn':       { key: 'statusWithdrawn',       cls: 'badge-purple',   icon: '↺'  },
};

/** All status keys in order — used for <select> dropdowns */
const ALL_STATUSES = Object.keys(STATUS_CONFIG);

/* ── Order Type (عادي / تبديل) ──
   Normal = a regular delivery order. Exchange = a swap/replacement order
   (e.g. exchanging a previously delivered item). Admin picks this when
   adding/editing a shipment; it's shown on the shipment detail view too. */
const ORDER_TYPE_CONFIG = {
  'Normal':   { key: 'orderTypeNormal',   cls: 'badge-gray',  icon: '•' },
  'Exchange': { key: 'orderTypeExchange', cls: 'badge-blue',  icon: '⇄' },
};

/** All order type keys in order — used for <select> dropdowns */
const ALL_ORDER_TYPES = Object.keys(ORDER_TYPE_CONFIG);

function orderTypeBadge(orderType) {
  const cfg = ORDER_TYPE_CONFIG[orderType];
  if (cfg) {
    return `<span class="badge ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}</span>`;
  }
  return `<span class="badge badge-gray">—</span>`;
}

/* ── Financial rules shared by Orders and General Report ──
   A shipment counts toward delivery-profit totals only if a delivery action
   actually happened (delivered, or returned — paid or unpaid — or withdrawn).
   Plain Cancelled / Delayed / Pending orders never generated a delivery run,
   so they contribute nothing to profit or to totals. */
const PROFIT_ELIGIBLE_STATUSES = ['Delivered', 'Returned-Paid', 'Returned-Unpaid', 'Withdrawn'];

function isProfitEligible(status) {
  return PROFIT_ELIGIBLE_STATUSES.includes(status);
}

/** Gross $ collected for a shipment:
 *  Delivered → full order value collected from the customer.
 *  Returned-Paid → only the return/delivery fee that was collected (returnedDeliveryCost).
 *  Returned-Unpaid → nothing was collected.
 *  Withdrawn → the withdrawn amount is subtracted back out.
 *  Cancelled / Delayed / Pending → nothing collected (no delivery happened). */
function shipTotalDollar(s) {
  switch (s.status) {
    case 'Delivered':     return s.priceDollar || 0;
    case 'Returned-Paid': return s.returnedDeliveryCost || 0;
    case 'Withdrawn':     return -(s.withdrawnAmountDollar || s.priceDollar || 0);
    default:              return 0;
  }
}
/** Same rule, in Lebanese Lira (no LL equivalent is tracked for returnedDeliveryCost). */
function shipTotalLeb(s) {
  switch (s.status) {
    case 'Delivered': return s.priceLeb || 0;
    case 'Withdrawn':  return -(s.withdrawnAmountLeb || s.priceLeb || 0);
    default:           return 0;
  }
}


function statusBadge(status) {
  const cfg = STATUS_CONFIG[status];
  if (cfg) {
    return `<span class="badge ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}</span>`;
  }
  /* Fallback for any legacy / unknown status */
  return `<span class="badge badge-gray">• ${esc(status || '—')}</span>`;
}

/** Compact row of mini status-count badges, e.g. for report tables.
 *  counts: { 'Delivered': 5, 'Pending': 2, ... } — zero/missing statuses are skipped. */
function statusBreakdownCell(counts) {
  const parts = ALL_STATUSES
    .filter(s => counts[s] > 0)
    .map(s => {
      const cfg = STATUS_CONFIG[s];
      return `<span class="badge badge-mini ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}: ${counts[s]}</span>`;
    });
  return `<div class="status-breakdown-cell">${parts.join('') || '<span style="color:var(--text-3);">—</span>'}</div>`;
}

function mobileShipCard(s) {
  return `
  <div class="mobile-card">
    <div class="mobile-card-header">
      <span class="mobile-card-num">#${s.shipNumber || s.id?.slice(-4) || '—'}</span>
      ${statusBadge(s.status)}
    </div>
    <div class="mobile-card-body">
      <div><div class="mobile-card-label">${t('customer')}</div><div class="mobile-card-value">${esc(s.customerName || '—')}</div></div>
      <div><div class="mobile-card-label">${t('company')}</div><div class="mobile-card-value">${esc(s.companyName || '—')}</div></div>
      <div><div class="mobile-card-label">${t('priceUSD')}</div><div class="mobile-card-value font-mono">$${formatNum(s.priceDollar || 0)}</div></div>
      <div><div class="mobile-card-label">${t('date')}</div><div class="mobile-card-value">${fmtDate(s.date || s.createdAt)}</div></div>
    </div>
    <div class="mobile-card-footer">
      <button class="btn btn-ghost btn-sm" onclick="viewShipment('${s.id}')">👁 ${t('view')}</button>
      ${can('canEditShipments') ? `<button class="btn btn-ghost btn-sm" onclick="editShipment('${s.id}')">✏️ Edit</button>` : ''}
    </div>
  </div>`;
}

/** Escape HTML special characters */
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a number with locale thousands separators */
function formatNum(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-US');
}

/** Return today's date as YYYY-MM-DD */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** Format a Firestore timestamp or date string to human-readable */
function fmtDate(d) {
  if (!d) return '—';
  if (d?.seconds) d = new Date(d.seconds * 1000);
  if (typeof d === 'string') d = new Date(d);
  if (isNaN(d?.getTime())) return String(d);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ===== STYLED EXCEL EXPORT =====

/** Fill/font colors used to tint each exported row by its shipment status (light,
 *  print-friendly tones — distinct from the dark-theme badge colors used on-screen). */
const EXPORT_STATUS_STYLE = {
  'Pending':          { fill: 'FFF1F2F6', font: 'FF6B7280' },
  'Delivered':        { fill: 'FFE3F9EE', font: 'FF1A8F52' },
  'Cancelled':        { fill: 'FFFDEAEC', font: 'FFD42C4E' },
  'Delayed':          { fill: 'FFE9EDFF', font: 'FF4F6EF5' },
  'Returned-Unpaid':  { fill: 'FFFFF1E0', font: 'FFB85C00' },
  'Returned-Paid':    { fill: 'FFF1FBD9', font: 'FF6B8E00' },
  'Withdrawn':        { fill: 'FFF3EBFF', font: 'FF8B3DFF' },
};

/** Best-effort JS Date out of a shipment's date/createdAt field (string or Firestore
 *  timestamp), for sorting the export — mirrors the parsing fmtDate() already does. */
function shipmentSortDate(s) {
  let d = s.date || s.createdAt;
  if (d?.seconds) d = new Date(d.seconds * 1000);
  else if (typeof d === 'string') d = new Date(d);
  return isNaN(d?.getTime?.()) ? null : d;
}

/** EXPORT_STATUS_STYLE's colors are 8-char ARGB (Excel format, e.g. 'FF1A8F52') — valid for
 *  ExcelJS but NOT valid CSS as-is. This strips the alpha pair and adds '#' for use in HTML/CSS
 *  (e.g. the PDF export), so status colors don't silently fail and fall back to inherited text. */
function argbToCss(argb) { return '#' + String(argb || '000000').slice(-6); }

/** Strip characters that are illegal in file names on Windows/macOS/Linux, and cap length. */
function sanitizeFilename(name) {
  return String(name || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 100);
}

let _exportOptionsCancelHandler = null;

/** Ask the user for both the export file name AND which saved column preset (report) to
 *  export with — the "Default Columns" option plus every report in exportReports_cache.
 *  Resolves to { filename, reportId } (reportId is '' for Default), or null if cancelled. */
function askExportOptions(defaultName) {
  return new Promise(resolve => {
    document.getElementById('modal-export-title').textContent   = t('exportOptionsTitle');
    document.getElementById('modal-export-message').textContent = t('exportOptionsMsg');
    document.getElementById('modal-export-filename-label').textContent = t('exportOptionsFilenameLabel');
    document.getElementById('modal-export-report-label').textContent   = t('exportOptionsReportLabel');

    const nameInput = document.getElementById('export-opt-filename');
    nameInput.value = defaultName;
    nameInput.placeholder = defaultName;

    const select  = document.getElementById('export-opt-report');
    const reports = exportReports_cache || [];
    select.innerHTML = `<option value="">${esc(t('defaultColumnsOption'))}</option>` +
      reports.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    select.value = '';

    _exportOptionsCancelHandler = () => resolve(null);

    const confirm = () => {
      _exportOptionsCancelHandler = null;
      closeModal('modal-export-options');
      resolve({ filename: sanitizeFilename(nameInput.value) || defaultName, reportId: select.value || '' });
    };
    document.getElementById('export-opt-ok').onclick = confirm;
    nameInput.onkeydown = e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelExportOptionsModal(); }
    };

    openModal('modal-export-options');
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
  });
}

/** Close the export-options modal via Cancel/✕/backdrop/Escape, firing its cancel resolve. */
function cancelExportOptionsModal() {
  closeModal('modal-export-options');
  const cb = _exportOptionsCancelHandler;
  _exportOptionsCancelHandler = null;
  if (cb) cb();
}

/** Master registry of every column the shipments export (Excel + PDF) can include, in its
 *  default order. Settings → Export Columns lets an admin hide/show and reorder these; this
 *  array is the fallback whenever nothing has been saved yet, and the source of the label/
 *  width/format for every saved column key.
 *  format governs value formatting in BOTH exports — 'dollar' → "$" + 2-decimal; 'leb' → plain
 *  thousands-grouped number; 'status' / 'date' are derived, not read straight off the record.
 *  total: true columns get summed into the export's totals row. profitOnly columns are only
 *  ever included for users with canViewProfit, regardless of the saved visibility flag. */
const EXPORT_COLUMN_DEFS = [
  { key: 'shipNumber',            label: 'Ship #',           width: 10, format: 'text'   },
  { key: 'customerName',          label: 'Customer',         width: 20, format: 'text'   },
  { key: 'customerPhone',         label: 'Phone',            width: 14, format: 'text'   },
  { key: 'customerAddress',       label: 'Address',          width: 24, format: 'text'   },
  { key: 'companyName',           label: 'Company',          width: 16, format: 'text'   },
  { key: 'driverName',            label: 'Driver',           width: 16, format: 'text'   },
  { key: 'contractorName',        label: 'Contractor',       width: 16, format: 'text'   },
  { key: 'statusLabel',           label: 'Status',           width: 18, format: 'status' },
  { key: 'orderTypeLabel',        label: 'Order Type',       width: 14, format: 'orderType' },
  { key: 'priceDollar',           label: 'Price ($)',        width: 12, format: 'dollar', total: true },
  { key: 'priceLeb',              label: 'Price (L.L.)',     width: 14, format: 'leb',    total: true },
  { key: 'deliveryCost',          label: 'Delivery Cost',    width: 14, format: 'dollar' },
  { key: 'driverDeliveryCost',    label: 'Driver Cost',      width: 13, format: 'dollar' },
  { key: 'contractorDeliveryCost',label: 'Contractor Cost',  width: 15, format: 'dollar' },
  { key: 'withdrawnAmountDollar', label: 'Withdrawn ($)',    width: 13, format: 'dollar', total: true },
  { key: 'withdrawnAmountLeb',    label: 'Withdrawn (L.L.)', width: 14, format: 'leb',    total: true },
  { key: 'date',                  label: 'Date',             width: 14, format: 'date'   },
  { key: 'description',           label: 'Description',      width: 28, format: 'text'   },
  { key: 'deliveryProfit',        label: 'Profit ($)',       width: 12, format: 'dollar', total: true, profitOnly: true },
];

/** Merge EXPORT_COLUMN_DEFS with a saved order/visibility list — keeping EVERY column,
 *  including hidden ones, so a picker UI can still show and re-enable them. Any column added
 *  to EXPORT_COLUMN_DEFS after the config was saved is appended (visible) so new columns don't
 *  get silently lost. Falls back to the full default set, in registry order, if config is
 *  empty/missing. Shared by the default column config and every saved named report. */
function resolveColumnsFromConfig(config) {
  const byKey = new Map(EXPORT_COLUMN_DEFS.map(c => [c.key, c]));
  if (Array.isArray(config) && config.length) {
    const merged = config
      .filter(s => byKey.has(s.key))
      .map(s => ({ ...byKey.get(s.key), visible: s.visible !== false }));
    const known = new Set(merged.map(c => c.key));
    EXPORT_COLUMN_DEFS.forEach(c => { if (!known.has(c.key)) merged.push({ ...c, visible: true }); });
    return merged;
  }
  return EXPORT_COLUMN_DEFS.map(c => ({ ...c, visible: true }));
}

/** Resolves the default column config (exportColumnsConfig, loaded in loadCaches() and
 *  refreshed whenever Settings is opened) against EXPORT_COLUMN_DEFS. */
function resolveExportColumnsFull() {
  return resolveColumnsFromConfig(exportColumnsConfig);
}

/** The ordered, filtered column list an export should actually use right now. Pass a saved
 *  report's id to use that named preset's columns instead of the default config; omit it (or
 *  pass a falsy/unknown id) to fall back to the default. Always drops the profit column for
 *  users without canViewProfit, regardless of the saved flag. */
function getActiveExportColumns(reportId) {
  const showProfit = can('canViewProfit');
  let config = exportColumnsConfig;
  if (reportId) {
    const report = (exportReports_cache || []).find(r => r.id === reportId);
    if (report) config = report.columns;
  }
  return resolveColumnsFromConfig(config).filter(c => c.visible && (!c.profitOnly || showProfit));
}

async function exportExcel(defaultName) {
  const ships = window._allShips || [];
  if (!ships.length) { toast(t('noDataToExport'), 'info'); return; }

  const suggested = defaultName || `sonick-shipments-${new Date().toISOString().slice(0, 10)}`;
  const opts = await askExportOptions(suggested);
  if (!opts) return; // cancelled

  const filename = opts.filename;
  const columns  = getActiveExportColumns(opts.reportId);
  if (!columns.length) { toast(t('noExportColumnsEnabled'), 'error'); return; }

  const sorted = [...ships].sort((a, b) => {
    const da = shipmentSortDate(a), db = shipmentSortDate(b);
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    return (b.shipNumber || 0) - (a.shipNumber || 0);
  });

  const colCount = columns.length;

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'Sonick Delivery System';
  workbook.created = new Date();
  const isRTL = document.documentElement.dir === 'rtl';
  const sheet = workbook.addWorksheet('Shipments', {
    views: [{ state: 'frozen', ySplit: 3, rightToLeft: isRTL }],
  });

  // ---- Title band ----
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = '🚚  Sonick Delivery System — Shipments Report';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F6EF5' } };
  sheet.getRow(1).height = 28;

  // ---- Subtitle band ----
  sheet.mergeCells(2, 1, 2, colCount);
  const subCell = sheet.getCell(2, 1);
  const exportedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  subCell.value = `Exported ${exportedOn}  •  ${sorted.length} shipment${sorted.length === 1 ? '' : 's'}`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7280' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F2F6' } };
  sheet.getRow(2).height = 18;

  // ---- Header row ----
  const headerRowIdx = 3;
  const headerRow = sheet.getRow(headerRowIdx);
  columns.forEach((c, i) => { headerRow.getCell(i + 1).value = c.label; sheet.getColumn(i + 1).width = c.width; });
  headerRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A54D6' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2A3FA0' } }, bottom: { style: 'thin', color: { argb: 'FF2A3FA0' } },
      left: { style: 'thin', color: { argb: 'FF2A3FA0' } }, right: { style: 'thin', color: { argb: 'FF2A3FA0' } },
    };
  });
  headerRow.height = 22;

  // ---- Data rows, tinted by status ----
  sorted.forEach(s => {
    const style = EXPORT_STATUS_STYLE[s.status] || EXPORT_STATUS_STYLE['Pending'];
    const rowArray = columns.map(c => {
      if (c.format === 'status') return t(STATUS_CONFIG[s.status]?.key) || s.status || '—';
      if (c.format === 'orderType') return t(ORDER_TYPE_CONFIG[s.orderType]?.key) || t('orderTypeNormal');
      if (c.format === 'date')   return fmtDate(s.date || s.createdAt);
      return s[c.key] ?? ((c.format === 'dollar' || c.format === 'leb') ? 0 : '');
    });
    const row = sheet.addRow(rowArray);
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB8C2D9' } }, bottom: { style: 'thin', color: { argb: 'FFB8C2D9' } },
        left: { style: 'thin', color: { argb: 'FFB8C2D9' } }, right: { style: 'thin', color: { argb: 'FFB8C2D9' } },
      };
      const col = columns[colNum - 1];
      if (col?.format === 'dollar' || col?.format === 'leb') {
        cell.numFmt = col.format === 'leb' ? '#,##0' : '#,##0.00';
      }
      if (col?.format === 'status') {
        cell.font = { bold: true, color: { argb: style.font } };
      }
    });
  });

  // ---- Totals row ---- (robust to any saved column order/visibility: sums every column
  // flagged `total` in EXPORT_COLUMN_DEFS at its current position, and puts the label in
  // the first non-summed column so a reordered "Price ($)" column can never collide with it)
  const totalsRowIdx = sheet.rowCount + 1;
  const totalsRow = sheet.getRow(totalsRowIdx);
  const labelColIdx = (columns.findIndex(c => !c.total) + 1) || 1;
  totalsRow.getCell(labelColIdx).value = `TOTAL (${sorted.length} shipments)`;
  columns.forEach((c, i) => {
    if (!c.total) return;
    const sum = sorted.reduce((total, s) => total + (Number(s[c.key]) || 0), 0);
    const cell = totalsRow.getCell(i + 1);
    cell.value  = sum;
    cell.numFmt = c.format === 'leb' ? '#,##0' : '#,##0.00';
  });
  totalsRow.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EDFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF4F6EF5' } }, bottom: { style: 'thin', color: { argb: 'FF4F6EF5' } },
      left: { style: 'thin', color: { argb: 'FF4F6EF5' } }, right: { style: 'thin', color: { argb: 'FF4F6EF5' } },
    };
  });
  totalsRow.height = 20;

  // ---- Filter + polish ----
  sheet.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: colCount } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
  toast(t('excelExported'), 'success');
}

/** Fetch a same-origin image and return it as a base64 data URL, for embedding in the PDF logo. */
function imageToDataURL(url) {
  return fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

// ===== STYLED PDF EXPORT =====
/** Build the report as real HTML off-screen (so Arabic text shapes/joins and RTL reads
 *  correctly, which jsPDF's own text drawing cannot do), rasterize it with html2canvas,
 *  then slice that image across as many A4 pages as needed. */
async function exportPDF(defaultName) {
  if (!window.jspdf || !window.html2canvas) { toast(t('pdfLibMissing'), 'error'); return; }
  const ships = window._allShips || [];
  if (!ships.length) { toast(t('noDataToExport'), 'info'); return; }

  const suggested = defaultName || `sonick-shipments-${new Date().toISOString().slice(0, 10)}`;
  const opts = await askExportOptions(suggested);
  if (!opts) return; // cancelled

  const filename = opts.filename;
  const cols     = getActiveExportColumns(opts.reportId);
  if (!cols.length) { toast(t('noExportColumnsEnabled'), 'error'); return; }

  toast(t('generatingPdf'), 'info');

  const sorted = [...ships].sort((a, b) => {
    const da = shipmentSortDate(a), db = shipmentSortDate(b);
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    return (b.shipNumber || 0) - (a.shipNumber || 0);
  });

  const exportedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let logoDataUrl = '';
  try { logoDataUrl = await imageToDataURL('assets/logo-mark.png'); } catch (e) { /* logo optional */ }

  const rowsHtml = sorted.map(s => {
    const style = EXPORT_STATUS_STYLE[s.status] || EXPORT_STATUS_STYLE['Pending'];
    const cells = cols.map(c => {
      let val;
      if      (c.format === 'status') val = esc(t(STATUS_CONFIG[s.status]?.key) || s.status || '—');
      else if (c.format === 'orderType') val = esc(t(ORDER_TYPE_CONFIG[s.orderType]?.key) || t('orderTypeNormal'));
      else if (c.format === 'date')   val = esc(fmtDate(s.date || s.createdAt));
      else if (c.format === 'dollar') val = '$' + formatNum(s[c.key] || 0);
      else if (c.format === 'leb')    val = formatNum(s[c.key] || 0);
      else                             val = esc(s[c.key] || '—');
      const textColor = c.format === 'status' ? argbToCss(style.font) : '#1F2937';
      const fontWeight = c.format === 'status' ? '700' : '400';
      return `<td style="padding:6px 5px;border:1px solid #B8C2D9;text-align:center;color:${textColor};font-weight:${fontWeight};">${val}</td>`;
    }).join('');
    return `<tr style="background:${argbToCss(style.fill)};">${cells}</tr>`;
  }).join('');

  const totalsLabelIdx = Math.max(cols.findIndex(c => !c.total), 0);
  const totalsHtml = cols.map((c, i) => {
    let val = i === totalsLabelIdx ? t('pdfTotalLabel').replace('{n}', sorted.length) : '';
    if (c.total) {
      const sum = sorted.reduce((total, s) => total + (Number(s[c.key]) || 0), 0);
      val = (c.format === 'dollar' ? '$' : '') + formatNum(sum);
    }
    return `<td style="padding:7px 5px;border:1px solid #4F6EF5;text-align:center;color:#1F2937;font-weight:700;">${val}</td>`;
  }).join('');

  const reportHTML = `
    <div id="pdf-report-root" style="width:1120px;background:#ffffff;font-family:'Calibri','Segoe UI',Arial,sans-serif;color:#1F2937;padding:30px 34px;">
      <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #4F6EF5;padding-bottom:16px;margin-bottom:14px;">
        ${logoDataUrl ? `<img src="${logoDataUrl}" style="width:52px;height:52px;object-fit:contain;">` : ''}
        <div>
          <div style="font-size:23px;font-weight:800;color:#1F2937;">Sonick Delivery System</div>
          <div style="font-size:13px;color:#6B7280;">Shipments Report</div>
        </div>
        <div style="margin-left:auto;text-align:right;font-size:12px;color:#6B7280;line-height:1.6;">
          <div>${t('pdfExportedOn')} ${exportedOn}</div>
          <div>${sorted.length} ${t('shipments')}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#3A54D6;color:#ffffff;">
            ${cols.map(c => `<th style="padding:8px 5px;border:1px solid #2A3FA0;text-align:center;color:#ffffff;font-weight:700;text-transform:none;">${esc(c.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#E9EDFF;font-weight:700;">${totalsHtml}</tr>
        </tfoot>
      </table>
    </div>`;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;';
  container.innerHTML = reportHTML;
  document.body.appendChild(container);

  try {
    const target = container.querySelector('#pdf-report-root');
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth  = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth   = pageWidth;
    const imgHeight  = canvas.height * (imgWidth / canvas.width);
    const imgData    = canvas.toDataURL('image/png');

    let heightLeft = imgHeight, position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`${i} / ${totalPages}`, pageWidth - 50, pageHeight - 14);
    }

    pdf.save(`${filename}.pdf`);
    toast(t('pdfExported'), 'success');
  } finally {
    document.body.removeChild(container);
  }
}

async function exportArchiveExcel() {
  const saved      = window._allShips;
  window._allShips = window._allArchShips || [];
  await exportExcel(`sonick-archive-${new Date().toISOString().slice(0, 10)}`);
  window._allShips = saved;
}

async function exportArchivePDF() {
  const saved      = window._allShips;
  window._allShips = window._allArchShips || [];
  await exportPDF(`sonick-archive-${new Date().toISOString().slice(0, 10)}`);
  window._allShips = saved;
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
  }
});