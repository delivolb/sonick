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
  hideDemoBanner();
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

/** Same breakdown as statusBreakdownCell(), but as one plain-text line — for exports
 *  (Excel cells / PDF table cells) where the badge markup doesn't apply. */
function statusBreakdownText(counts) {
  const parts = ALL_STATUSES
    .filter(s => counts[s] > 0)
    .map(s => `${t(STATUS_CONFIG[s].key)}: ${counts[s]}`);
  return parts.join('  •  ') || '—';
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
  { key: 'driverDeliveryCost',    label: 'Driver Cost',      width: 13, format: 'dollar', total: true },
  { key: 'contractorDeliveryCost',label: 'Contractor Cost',  width: 15, format: 'dollar', total: true },
  { key: 'withdrawnAmountDollar', label: 'Withdrawn ($)',    width: 13, format: 'dollar', total: true },
  { key: 'withdrawnAmountLeb',    label: 'Withdrawn (L.L.)', width: 14, format: 'leb',    total: true },
  { key: 'date',                  label: 'Date',             width: 14, format: 'date'   },
  { key: 'description',           label: 'Description',      width: 28, format: 'text'   },
  { key: 'deliveryProfit',        label: 'Profit ($)',       width: 12, format: 'dollar', total: true, profitOnly: true },
];

/** Sums one export column across a set of shipments for the totals row, applying the same
 *  status-based rules the on-screen Shipments summary bar uses (see isProfitEligible() and
 *  shipTotalDollar()/shipTotalLeb() above) instead of blindly summing the raw field —
 *  otherwise the totals row counts Cancelled/Delayed orders that never actually collected
 *  money or paid a driver/contractor, and disagrees with the page it's exported from.
 *  priceDollar/priceLeb: only what shipTotalDollar()/shipTotalLeb() count as actually
 *  collected (Delivered/Returned-Paid/Withdrawn), not the raw order price.
 *  driverDeliveryCost/contractorDeliveryCost/deliveryProfit: only rows where a delivery
 *  action actually happened (isProfitEligible), same as the driver/contractor/company
 *  profit figures shown on screen. */
function exportColumnTotal(col, ships) {
  switch (col.key) {
    case 'priceDollar': return ships.reduce((t, s) => t + shipTotalDollar(s), 0);
    case 'priceLeb':    return ships.reduce((t, s) => t + shipTotalLeb(s), 0);
    case 'driverDeliveryCost':
    case 'contractorDeliveryCost':
    case 'deliveryProfit':
      return ships.reduce((t, s) => t + (isProfitEligible(s.status) ? (Number(s[col.key]) || 0) : 0), 0);
    default:
      return ships.reduce((t, s) => t + (Number(s[col.key]) || 0), 0);
  }
}

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

async function exportExcel(defaultName, shipsOverride) {
  // Defaults to window._filteredShips — the exact rows the Shipments page's search/status/
  // company/driver/date filters are currently showing (kept in sync by filterShipments() in
  // js/pages.js) — not window._allShips, which is every shipment regardless of filters.
  // shipsOverride lets callers (e.g. exportArchiveExcel) supply their own already-filtered set.
  const ships = shipsOverride || window._filteredShips || window._allShips || [];
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
    const sum = exportColumnTotal(c, sorted);
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
async function exportPDF(defaultName, shipsOverride) {
  if (!window.jspdf || !window.html2canvas) { toast(t('pdfLibMissing'), 'error'); return; }
  // Same filtered-by-default behavior as exportExcel() above — see comment there.
  const ships = shipsOverride || window._filteredShips || window._allShips || [];
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
      const sum = exportColumnTotal(c, sorted);
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
  // window._filteredArchShips is the Archive page's own filtered set (kept in sync by
  // filterArchive() in js/pages.js). Passed explicitly as an override so this always
  // reflects the Archive page's filters, not window._filteredShips from the Shipments page.
  await exportExcel(`sonick-archive-${new Date().toISOString().slice(0, 10)}`, window._filteredArchShips || window._allArchShips || []);
}

async function exportArchivePDF() {
  await exportPDF(`sonick-archive-${new Date().toISOString().slice(0, 10)}`, window._filteredArchShips || window._allArchShips || []);
}

// ===== GENERAL REPORT EXPORT (Excel + PDF) =====
// Unlike the Shipments/Archive exports (which dump raw per-order rows with configurable
// columns), the General Report export mirrors the on-screen page itself: a KPI summary
// plus the By Driver / By Contractor / By Company breakdown tables, styled to match each
// section's on-screen accent color. Reads the data renderGeneral() stashes on
// window._generalReportData (see js/pages.js) — the export can't recompute it itself since
// it doesn't have direct DB access from here.

const GENERAL_REPORT_COLORS = {
  brand: 'FF4F6EF5', brandDark: 'FF3A54D6', blue: 'FF3DA9FC', amber: 'FFFFB020',
  purple: 'FFB368FF', green: 'FF2ED47A', ink: 'FF1F2937', paleGray: 'FFF1F2F6',
  rowAlt: 'FFF6F8FF',
};

/** Simple "just the filename" version of askExportOptions() — the General Report has no
 *  configurable column set, so there's nothing to pick beyond a name. */
function promptExportFilename(defaultName) {
  return new Promise(resolve => {
    promptInput(
      { title: t('exportOptionsTitle'), message: t('exportOptionsFilenameLabel'), defaultValue: defaultName, placeholder: defaultName },
      (val) => resolve(sanitizeFilename(val) || defaultName),
      () => resolve(null)
    );
  });
}

/** One breakdown table's column plan — shared between the Excel sheet builder and the PDF
 *  table builder so both stay in sync. `get` pulls the cell's raw value off an [name, v]
 *  entry (or the pre-computed totals object); `fmt` drives number formatting in both exports. */
function generalReportColumnDefs(opts) {
  const { entityLabel, incomeLabel, profitLabel, totalLabel, totalLebLabel, showProfit, hasLeb } = opts;
  const cols = [
    { label: entityLabel,           fmt: 'text',   get: (name, v) => name },
    { label: t('count'),            fmt: 'number', get: (name, v) => v.count },
    { label: t('statusBreakdownCol'), fmt: 'text',  get: (name, v) => statusBreakdownText(v.statusCounts) },
    { label: incomeLabel,           fmt: 'dollar', get: (name, v) => v.dol },
  ];
  // Per-entity rows carry their profit/cost figure under `.cost` (driver/contractor) or
  // `.profit` (company). The totals row instead comes from sumRows() (js/pages.js), which
  // aggregates that same figure under `.second` — so it must be checked first, or the
  // totals row silently falls back to 0 since it has neither `.cost` nor `.profit`.
  if (showProfit) {
    cols.push(
      { label: profitLabel,         fmt: 'dollar', get: (name, v) => (v.second !== undefined ? v.second : (v.cost !== undefined ? v.cost : v.profit)) || 0 },
      { label: totalLabel,          fmt: 'dollar', get: (name, v) => v.dol - ((v.second !== undefined ? v.second : (v.cost !== undefined ? v.cost : v.profit)) || 0) },
    );
  }
  if (hasLeb) cols.push({ label: totalLebLabel, fmt: 'leb', get: (name, v) => v.leb || 0 });
  return cols;
}

async function exportGeneralReportExcel() {
  const data = window._generalReportData;
  if (!data) { toast(t('noDataToExport'), 'info'); return; }

  const suggested = `sonick-general-report-${new Date().toISOString().slice(0, 10)}`;
  const filename = await promptExportFilename(suggested);
  if (!filename) return; // cancelled

  const {
    totalShipments, showProfit,
    byDriver, byContractor, byCompany,
    driverHasLeb, contractorHasLeb, companyHasLeb,
    driverSum, contractorSum, companySum,
    incomeDol, incomeLeb, outcomeDol, outcomeLeb, netProfit,
    mergedEntries, mergedTotalNet, mergedTotalProfit,
  } = data;
  const C = GENERAL_REPORT_COLORS;
  const isRTL = document.documentElement.dir === 'rtl';
  const exportedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sonick Delivery System';
  workbook.created = new Date();

  // ---- Summary sheet: title band + a colored KPI card per stat ----
  const summary = workbook.addWorksheet('Summary', { views: [{ rightToLeft: isRTL }] });
  summary.mergeCells(1, 1, 1, 4);
  const title = summary.getCell(1, 1);
  title.value = '🚚  Sonick Delivery System — General Report';
  title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brand } };
  summary.getRow(1).height = 30;

  summary.mergeCells(2, 1, 2, 4);
  const sub = summary.getCell(2, 1);
  sub.value = `Exported ${exportedOn}  •  ${totalShipments} shipment${totalShipments === 1 ? '' : 's'}`;
  sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7280' } };
  sub.alignment = { vertical: 'middle', horizontal: 'center' };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paleGray } };
  summary.getRow(2).height = 18;

  const kpis = [
    { label: t('totalShipments'), value: totalShipments, color: C.brand, fmt: 'number' },
    { label: t('incomeDollar'),   value: incomeDol,       color: C.blue,  fmt: 'dollar' },
    { label: t('incomeLeb'),      value: incomeLeb,       color: C.amber, fmt: 'leb' },
  ];
  if (showProfit) {
    kpis.push(
      { label: t('outcomeDriversContractors'),    value: outcomeDol, color: C.purple, fmt: 'dollar' },
      { label: t('outcomeDriversContractorsLeb'), value: outcomeLeb, color: C.purple, fmt: 'leb' },
      { label: t('netProfit'),                    value: netProfit,  color: C.green,  fmt: 'dollar' },
    );
  }

  let r = 4;
  kpis.forEach(k => {
    const labelCell = summary.getCell(r, 1);
    summary.mergeCells(r, 2, r, 4);
    const valueCell = summary.getCell(r, 2);
    labelCell.value = k.label;
    labelCell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    labelCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.color } };
    labelCell.alignment = { vertical: 'middle', horizontal: isRTL ? 'right' : 'left', indent: 1 };
    valueCell.value = k.value;
    valueCell.numFmt = k.fmt === 'dollar' ? '"$"#,##0.00' : (k.fmt === 'leb' ? '#,##0 "L.L."' : '#,##0');
    valueCell.font = { bold: true, size: 13, color: { argb: C.ink } };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paleGray } };
    valueCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summary.getRow(r).height = 24;
    r++;
  });
  summary.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }];

  // ---- One sheet per breakdown table ----
  const buildSheet = (name, entries, sum, opts) => {
    const cols = generalReportColumnDefs({ ...opts, showProfit });
    const colCount = cols.length;
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3, rightToLeft: isRTL }] });

    sheet.mergeCells(1, 1, 1, colCount);
    const t1 = sheet.getCell(1, 1);
    t1.value = `🚚  Sonick Delivery System — ${name}`;
    t1.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    t1.alignment = { vertical: 'middle', horizontal: 'center' };
    t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.accentColor } };
    sheet.getRow(1).height = 28;

    sheet.mergeCells(2, 1, 2, colCount);
    const t2 = sheet.getCell(2, 1);
    t2.value = `Exported ${exportedOn}  •  ${entries.length} row${entries.length === 1 ? '' : 's'}`;
    t2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7280' } };
    t2.alignment = { vertical: 'middle', horizontal: 'center' };
    t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paleGray } };
    sheet.getRow(2).height = 18;

    const headerRow = sheet.getRow(3);
    cols.forEach((c, i) => { headerRow.getCell(i + 1).value = c.label; });
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandDark } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF2A3FA0' } }, bottom: { style: 'thin', color: { argb: 'FF2A3FA0' } },
        left: { style: 'thin', color: { argb: 'FF2A3FA0' } }, right: { style: 'thin', color: { argb: 'FF2A3FA0' } },
      };
    });
    headerRow.height = 22;
    sheet.columns = cols.map((c, i) => ({ width: i === 0 ? 22 : (c.fmt === 'text' ? 40 : 15) }));

    entries.forEach(([name, v], idx) => {
      const rowArray = cols.map(c => c.get(name, v));
      const row = sheet.addRow(rowArray);
      const bandColor = idx % 2 === 0 ? 'FFFFFFFF' : C.rowAlt;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const c = cols[colNum - 1];
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bandColor } };
        cell.alignment = { horizontal: c.fmt === 'text' ? (isRTL ? 'right' : 'left') : 'center', vertical: 'middle', wrapText: c.fmt === 'text' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE4E8F5' } }, bottom: { style: 'thin', color: { argb: 'FFE4E8F5' } },
          left: { style: 'thin', color: { argb: 'FFE4E8F5' } }, right: { style: 'thin', color: { argb: 'FFE4E8F5' } },
        };
        if (c.fmt === 'dollar') cell.numFmt = '"$"#,##0.00';
        if (c.fmt === 'leb')    cell.numFmt = '#,##0';
        if (colNum === 1)       cell.font = { bold: true };
      });
    });

    const totalRow = sheet.addRow(cols.map((c, i) => i === 0 ? `${t('total')} (${entries.length})` : c.get('', sum)));
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const c = cols[colNum - 1];
      cell.font = { bold: true, color: { argb: C.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EDFF' } };
      cell.alignment = { horizontal: c.fmt === 'text' ? (isRTL ? 'right' : 'left') : 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: opts.accentColor } }, bottom: { style: 'thin', color: { argb: opts.accentColor } },
        left: { style: 'thin', color: { argb: opts.accentColor } }, right: { style: 'thin', color: { argb: opts.accentColor } },
      };
      if (c.fmt === 'dollar') cell.numFmt = '"$"#,##0.00';
      if (c.fmt === 'leb')    cell.numFmt = '#,##0';
    });
    totalRow.height = 20;
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };
  };

  buildSheet('By Driver',
    Object.entries(byDriver).filter(([k]) => k !== '—').sort((a, b) => b[1].count - a[1].count), driverSum,
    { entityLabel: t('driver'), incomeLabel: t('driverIncomeCol'), profitLabel: t('driverProfitCol'), totalLabel: t('driverTotalCol'), totalLebLabel: t('driverTotalColLeb'), hasLeb: driverHasLeb, accentColor: C.blue });
  buildSheet('By Contractor',
    Object.entries(byContractor).filter(([k]) => k !== '—').sort((a, b) => b[1].count - a[1].count), contractorSum,
    { entityLabel: t('contractor'), incomeLabel: t('contractorIncomeCol'), profitLabel: t('contractorProfitCol'), totalLabel: t('contractorTotalCol'), totalLebLabel: t('contractorTotalColLeb'), hasLeb: contractorHasLeb, accentColor: C.purple });
  buildSheet('By Company',
    Object.entries(byCompany).sort((a, b) => b[1].dol - a[1].dol), companySum,
    { entityLabel: t('company'), incomeLabel: t('companyOutcomeCol'), profitLabel: t('companyProfitCol'), totalLabel: t('companyTotalCol'), totalLebLabel: t('companyTotalColLeb'), hasLeb: companyHasLeb, accentColor: C.green });

  // ---- Merged Company/Contractor reconciliation sheet (institutes that are both) ----
  if (mergedEntries && mergedEntries.length) {
    const mSheet = workbook.addWorksheet('Merged', { views: [{ state: 'frozen', ySplit: 3, rightToLeft: isRTL }] });
    const mCols = [
      { label: t('mergedTitle'),                     fmt: 'text' },
      { label: `${t('mergedAsCompany')} — ${t('mergedOrders')}`,    fmt: 'number' },
      { label: `${t('mergedAsCompany')} — ${t('mergedRevenue')}`,   fmt: 'dollar' },
      { label: `${t('mergedAsCompany')} — ${t('mergedOurProfit')}`, fmt: 'dollar' },
      { label: `${t('mergedAsCompany')} — ${t('mergedWeOwe')}`,     fmt: 'dollar' },
      { label: `${t('mergedAsContractor')} — ${t('mergedOrders')}`,   fmt: 'number' },
      { label: `${t('mergedAsContractor')} — ${t('mergedRevenue')}`,  fmt: 'dollar' },
      { label: `${t('mergedAsContractor')} — ${t('mergedTheirFee')}`, fmt: 'dollar' },
      { label: `${t('mergedAsContractor')} — ${t('mergedTheyOwe')}`,  fmt: 'dollar' },
      { label: t('mergedNetSettlement') || 'Net Settlement ($)', fmt: 'dollar' },
      { label: t('mergedSummaryProfit'), fmt: 'dollar' },
    ];
    const mColCount = mCols.length;

    mSheet.mergeCells(1, 1, 1, mColCount);
    const mt1 = mSheet.getCell(1, 1);
    mt1.value = `🔗  Sonick Delivery System — ${t('mergedTitle')}`;
    mt1.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    mt1.alignment = { vertical: 'middle', horizontal: 'center' };
    mt1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB368FF' } };
    mSheet.getRow(1).height = 28;

    mSheet.mergeCells(2, 1, 2, mColCount);
    const mt2 = mSheet.getCell(2, 1);
    mt2.value = `Exported ${exportedOn}  •  ${mergedEntries.length} institute${mergedEntries.length === 1 ? '' : 's'}`;
    mt2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7280' } };
    mt2.alignment = { vertical: 'middle', horizontal: 'center' };
    mt2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paleGray } };
    mSheet.getRow(2).height = 18;

    const mHeaderRow = mSheet.getRow(3);
    mCols.forEach((c, i) => { mHeaderRow.getCell(i + 1).value = c.label; });
    mHeaderRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A3FE0' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF6A2BB0' } }, bottom: { style: 'thin', color: { argb: 'FF6A2BB0' } },
        left: { style: 'thin', color: { argb: 'FF6A2BB0' } }, right: { style: 'thin', color: { argb: 'FF6A2BB0' } },
      };
    });
    mHeaderRow.height = 32;
    mSheet.columns = mCols.map((c, i) => ({ width: i === 0 ? 22 : 17 }));

    mergedEntries.forEach((e, idx) => {
      const row = mSheet.addRow([
        e.name, e.companyCount, e.companyRevenue, e.companyProfit, e.companyDue,
        e.contractorCount, e.contractorRevenue, e.contractorFee, e.contractorDue,
        e.netSettlement, e.netProfit,
      ]);
      const bandColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF3EBFF';
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const c = mCols[colNum - 1];
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bandColor } };
        cell.alignment = { horizontal: c.fmt === 'text' ? (isRTL ? 'right' : 'left') : 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE4E8F5' } }, bottom: { style: 'thin', color: { argb: 'FFE4E8F5' } },
          left: { style: 'thin', color: { argb: 'FFE4E8F5' } }, right: { style: 'thin', color: { argb: 'FFE4E8F5' } },
        };
        if (c.fmt === 'dollar') cell.numFmt = '"$"#,##0.00';
        if (colNum === 1) cell.font = { bold: true };
        if (colNum === mColCount - 1) cell.font = { ...(cell.font || {}), color: { argb: e.netSettlement > 0.005 ? 'FFD42C4E' : (e.netSettlement < -0.005 ? 'FF1A8F52' : 'FF6B7280') }, bold: true };
        if (colNum === mColCount)     cell.font = { ...(cell.font || {}), color: { argb: 'FF1A8F52' }, bold: true };
      });
    });

    const mTotalRow = mSheet.addRow([
      `${t('total')} (${mergedEntries.length})`, '', '', '', '', '', '', '', '',
      mergedTotalNet, mergedTotalProfit,
    ]);
    mTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const c = mCols[colNum - 1];
      cell.font = { bold: true, color: { argb: C.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE4FF' } };
      cell.alignment = { horizontal: c.fmt === 'text' ? (isRTL ? 'right' : 'left') : 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFB368FF' } }, bottom: { style: 'thin', color: { argb: 'FFB368FF' } },
        left: { style: 'thin', color: { argb: 'FFB368FF' } }, right: { style: 'thin', color: { argb: 'FFB368FF' } },
      };
      if (c.fmt === 'dollar') cell.numFmt = '"$"#,##0.00';
    });
    mTotalRow.height = 20;
    mSheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: mColCount } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
  toast(t('excelExported'), 'success');
}

async function exportGeneralReportPDF() {
  if (!window.jspdf || !window.html2canvas) { toast(t('pdfLibMissing'), 'error'); return; }
  const data = window._generalReportData;
  if (!data) { toast(t('noDataToExport'), 'info'); return; }

  const suggested = `sonick-general-report-${new Date().toISOString().slice(0, 10)}`;
  const filename = await promptExportFilename(suggested);
  if (!filename) return; // cancelled

  toast(t('generatingPdf'), 'info');

  const {
    totalShipments, showProfit,
    byDriver, byContractor, byCompany,
    driverHasLeb, contractorHasLeb, companyHasLeb,
    driverSum, contractorSum, companySum,
    incomeDol, incomeLeb, outcomeDol, outcomeLeb, netProfit,
    mergedEntries, mergedTotalNet, mergedTotalProfit,
  } = data;
  const exportedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const isRTL = document.documentElement.dir === 'rtl';

  // html2canvas cannot be trusted to rasterize Arabic text correctly — it drops/garbles
  // letters (most visibly "ال" sequences) no matter what Unicode control characters or CSS
  // direction hints are added, because the corruption happens in html2canvas's own custom
  // text-shaping code, not in anything we control. The reliable fix is to never let
  // html2canvas draw Arabic text at all: every Arabic-bearing label below is instead
  // pre-rendered to a small PNG using the browser's own (correct) canvas 2D text engine,
  // then embedded as a plain <img> — which html2canvas only has to copy pixel-for-pixel,
  // no text shaping involved. Latin/numeric text (amounts, "$", dates) is unaffected by the
  // bug and stays as normal HTML text.
  const textImgCache = new Map();
  function textImg(text, { fontSize = 12, weight = 400, color = '#1F2937', maxWidth = null, align = 'center' } = {}) {
    const str = String(text ?? '').trim() || '\u00A0';
    const cacheKey = `${str}|${fontSize}|${weight}|${color}|${maxWidth}|${align}`;
    if (textImgCache.has(cacheKey)) return textImgCache.get(cacheKey);

    const scale = 3;
    const fontFamily = "'Segoe UI', Tahoma, Arial, sans-serif";
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${weight} ${fontSize}px ${fontFamily}`;

    // Greedy word-wrap against maxWidth (only meaningful for RTL/Arabic strings here,
    // which wrap on spaces same as any other script).
    let lines = [str];
    if (maxWidth) {
      const words = str.split(' ');
      lines = [];
      let cur = '';
      words.forEach(w => {
        const attempt = cur ? cur + ' ' + w : w;
        if (cur && measure.measureText(attempt).width > maxWidth) { lines.push(cur); cur = w; }
        else cur = attempt;
      });
      if (cur) lines.push(cur);
      if (!lines.length) lines = [str];
    }

    const lineHeight = Math.ceil(fontSize * 1.4);
    const contentWidth  = maxWidth || Math.max(1, ...lines.map(l => measure.measureText(l).width));
    const width  = Math.ceil(contentWidth) + 6;
    const height = lineHeight * lines.length + 4;

    const canvas = document.createElement('canvas');
    canvas.width  = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.direction = isRTL ? 'rtl' : 'ltr';
    ctx.textAlign = align;
    const xPos = align === 'center' ? width / 2 : (align === 'right' ? width - 3 : 3);
    lines.forEach((line, i) => ctx.fillText(line, xPos, lineHeight * (i + 0.5) + 2));

    const result = { html: `<img src="${canvas.toDataURL('image/png')}" style="display:inline-block;width:${width}px;height:${height}px;vertical-align:middle;">`, width, height };
    textImgCache.set(cacheKey, result);
    return result;
  }
  // Arabic-labeled text (headers, titles, entity names, status text) always goes through
  // textImg(); plain numeric/currency text stays as regular HTML since it isn't affected.
  const arabicHTML = (text, opts) => textImg(text, opts).html;

  let logoDataUrl = '';
  try { logoDataUrl = await imageToDataURL('assets/logo-mark.png'); } catch (e) { /* logo optional */ }

  const kpiCardHTML = (label, value, color, fmt) => `
    <div style="flex:1;min-width:130px;background:${color};border-radius:10px;padding:12px 14px;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.12);">
      <div style="margin-bottom:4px;">${arabicHTML(label, { fontSize: 10, weight: 600, color: '#ffffff', align: 'center' })}</div>
      <div style="font-size:18px;font-weight:800;">${fmt === 'dollar' ? '$' + formatNum(value) : (fmt === 'leb' ? arabicHTML(formatLebStat(value), { fontSize: 15, weight: 800, color: '#ffffff', align: 'center' }) : formatNum(value))}</div>
    </div>`;

  const kpis = [
    kpiCardHTML(t('totalShipments'), totalShipments, '#4F6EF5', 'number'),
    kpiCardHTML(t('incomeDollar'), incomeDol, '#3DA9FC', 'dollar'),
    kpiCardHTML(t('incomeLeb'), incomeLeb, '#FFB020', 'leb'),
  ];
  if (showProfit) {
    kpis.push(
      kpiCardHTML(t('outcomeDriversContractors'), outcomeDol, '#B368FF', 'dollar'),
      kpiCardHTML(t('outcomeDriversContractorsLeb'), outcomeLeb, '#B368FF', 'leb'),
      kpiCardHTML(t('netProfit'), netProfit, '#2ED47A', 'dollar'),
    );
  }

  // Usable pixel width per column, used to size each header/cell text image's word-wrap —
  // computed once the actual column percentages are known (see tableHTML below).
  const REPORT_WIDTH = 1500, REPORT_PAD = 34 * 2;

  const tableHTML = (title, entries, sum, opts) => {
    const cols = generalReportColumnDefs({ ...opts, showProfit });
    // Column widths as percentages: entity name and status breakdown get generous room
    // for the (often long) Arabic phrases, remaining width split evenly across the
    // numeric $/L.L. columns.
    const fixedPct = { text0: 15, count: 7, status: 28 };
    const numericCols = cols.length - 3;
    const numericPct = numericCols > 0 ? (100 - fixedPct.text0 - fixedPct.count - fixedPct.status) / numericCols : 0;
    const colWidths = cols.map((c, i) => i === 0 ? fixedPct.text0 : i === 1 ? fixedPct.count : i === 2 ? fixedPct.status : numericPct);
    const colgroup = `<colgroup>${colWidths.map(w => `<col style="width:${w}%;">`).join('')}</colgroup>`;
    const usableWidth = REPORT_WIDTH - REPORT_PAD;
    const colPxWidth = colWidths.map(w => Math.floor(usableWidth * (w / 100)) - 16); // minus cell padding/border
    const cellStyle = (fmt, extra) => `padding:6px 5px;border:1px solid #B8C2D9;text-align:${fmt === 'text' ? (isRTL ? 'right' : 'left') : 'center'};color:#1F2937;${extra || ''}`;

    const rows = entries.map(([name, v], idx) => {
      const cells = cols.map((c, i) => {
        const val = c.get(name, v);
        const disp = c.fmt === 'dollar' ? '$' + formatNum(val)
                   : c.fmt === 'leb'    ? formatNum(val)
                   : arabicHTML(val, { fontSize: 10.5, weight: i === 0 ? 700 : 400, color: '#1F2937', maxWidth: colPxWidth[i], align: isRTL ? 'right' : 'left' });
        return `<td style="${cellStyle(c.fmt)}">${disp}</td>`;
      }).join('');
      return `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#F6F8FF'};">${cells}</tr>`;
    }).join('');
    const totalCells = cols.map((c, i) => {
      const val = i === 0 ? `${t('total')} (${entries.length})` : c.get('', sum);
      const disp = i === 0 ? arabicHTML(val, { fontSize: 10.5, weight: 700, color: '#1F2937', maxWidth: colPxWidth[i], align: isRTL ? 'right' : 'left' })
                 : c.fmt === 'dollar' ? '$' + formatNum(val)
                 : c.fmt === 'leb'    ? formatNum(val)
                 : arabicHTML(val, { fontSize: 10.5, weight: 700, color: '#1F2937', maxWidth: colPxWidth[i], align: isRTL ? 'right' : 'left' });
      return `<td style="${cellStyle(c.fmt, `border-color:${opts.accentColor};font-weight:700;`)}">${disp}</td>`;
    }).join('');
    return `
    <div style="margin-top:18px;" dir="${isRTL ? 'rtl' : 'ltr'}">
      <div style="background:${opts.accentColor};padding:8px 12px;border-radius:8px 8px 0 0;">${arabicHTML(title, { fontSize: 13, weight: 700, color: '#ffffff', align: 'center' })}</div>
      <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;" dir="${isRTL ? 'rtl' : 'ltr'}">
        ${colgroup}
        <thead><tr style="background:#3A54D6;">${cols.map((c, i) => `<th style="padding:7px 4px;border:1px solid #2A3FA0;text-align:center;">${arabicHTML(c.label, { fontSize: 10.5, weight: 700, color: '#ffffff', maxWidth: colPxWidth[i], align: 'center' })}</th>`).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length}" style="padding:14px;text-align:center;color:#9CA3AF;">No data</td></tr>`}</tbody>
        <tfoot><tr style="background:#E9EDFF;">${totalCells}</tr></tfoot>
      </table>
    </div>`;
  };

  // ---- Merged Company/Contractor reconciliation table (institutes that are both) ----
  const mergedHTML = (mergedEntries && mergedEntries.length) ? (() => {
    const headLabels = [
      t('mergedTitle'),
      `${t('mergedAsCompany')} · ${t('mergedOrders')}`, `${t('mergedAsCompany')} · ${t('mergedRevenue')}`,
      `${t('mergedAsCompany')} · ${t('mergedOurProfit')}`, `${t('mergedAsCompany')} · ${t('mergedWeOwe')}`,
      `${t('mergedAsContractor')} · ${t('mergedOrders')}`, `${t('mergedAsContractor')} · ${t('mergedRevenue')}`,
      `${t('mergedAsContractor')} · ${t('mergedTheirFee')}`, `${t('mergedAsContractor')} · ${t('mergedTheyOwe')}`,
      t('mergedNetSettlement'), t('mergedSummaryProfit'),
    ];
    const colPct = [16, 7.5, 8.5, 8.5, 8.5, 7.5, 8.5, 8.5, 8.5, 9, 9];
    const usableWidth = REPORT_WIDTH - REPORT_PAD;
    const colPx = colPct.map(w => Math.floor(usableWidth * (w / 100)) - 14);
    const cellStyle = (isText, extra) => `padding:6px 4px;border:1px solid #E0C7FF;text-align:${isText ? (isRTL ? 'right' : 'left') : 'center'};color:#1F2937;${extra || ''}`;

    const rows = mergedEntries.map((e, idx) => {
      const netColor = e.netSettlement > 0.005 ? '#D42C4E' : (e.netSettlement < -0.005 ? '#1A8F52' : '#6B7280');
      const cells = [
        arabicHTML(e.name, { fontSize: 10.5, weight: 700, color: '#1F2937', maxWidth: colPx[0], align: isRTL ? 'right' : 'left' }),
        formatNum(e.companyCount), '$' + formatNum(e.companyRevenue), '$' + formatNum(e.companyProfit), '$' + formatNum(e.companyDue),
        formatNum(e.contractorCount), '$' + formatNum(e.contractorRevenue), '$' + formatNum(e.contractorFee), '$' + formatNum(e.contractorDue),
        `<span style="color:${netColor};font-weight:800;">$${formatNum(Math.abs(e.netSettlement))}</span>`,
        `<span style="color:#1A8F52;font-weight:800;">$${formatNum(e.netProfit)}</span>`,
      ];
      return `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#F8F1FF'};">${cells.map((c, i) => `<td style="${cellStyle(i === 0)}">${c}</td>`).join('')}</tr>`;
    }).join('');

    const totalCells = [
      arabicHTML(`${t('total')} (${mergedEntries.length})`, { fontSize: 10.5, weight: 700, color: '#1F2937', maxWidth: colPx[0], align: isRTL ? 'right' : 'left' }),
      '', '', '', '', '', '', '', '',
      `<span style="color:${mergedTotalNet > 0.005 ? '#D42C4E' : (mergedTotalNet < -0.005 ? '#1A8F52' : '#6B7280')};font-weight:800;">$${formatNum(Math.abs(mergedTotalNet))}</span>`,
      `<span style="color:#1A8F52;font-weight:800;">$${formatNum(mergedTotalProfit)}</span>`,
    ];

    return `
    <div style="margin-top:18px;" dir="${isRTL ? 'rtl' : 'ltr'}">
      <div style="background:linear-gradient(135deg,#8A3FE0,#B368FF);padding:8px 12px;border-radius:8px 8px 0 0;">${arabicHTML(`🔗 ${t('mergedTitle')}`, { fontSize: 13, weight: 700, color: '#ffffff', align: 'center' })}</div>
      <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:9.5px;" dir="${isRTL ? 'rtl' : 'ltr'}">
        <colgroup>${colPct.map(w => `<col style="width:${w}%;">`).join('')}</colgroup>
        <thead><tr style="background:#8A3FE0;">${headLabels.map((l, i) => `<th style="padding:7px 4px;border:1px solid #6A2BB0;text-align:center;">${arabicHTML(l, { fontSize: 9.5, weight: 700, color: '#ffffff', maxWidth: colPx[i], align: 'center' })}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#EFE4FF;">${totalCells.map((c, i) => `<td style="${cellStyle(i === 0, 'border-color:#B368FF;font-weight:700;')}">${c}</td>`).join('')}</tr></tfoot>
      </table>
    </div>`;
  })() : '';

  const reportHTML = `
    <div id="pdf-general-report-root" dir="${isRTL ? 'rtl' : 'ltr'}" style="direction:${isRTL ? 'rtl' : 'ltr'};width:${REPORT_WIDTH}px;background:#ffffff;font-family:'Calibri','Segoe UI',Arial,sans-serif;color:#1F2937;padding:30px 34px;">
      <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #4F6EF5;padding-bottom:16px;margin-bottom:16px;">
        ${logoDataUrl ? `<img src="${logoDataUrl}" style="width:52px;height:52px;object-fit:contain;">` : ''}
        <div>
          <div style="font-size:23px;font-weight:800;color:#1F2937;">Sonick Delivery System</div>
          <div>${arabicHTML(t('generalReport'), { fontSize: 13, weight: 400, color: '#6B7280', align: isRTL ? 'right' : 'left' })}</div>
        </div>
        <div style="margin-${isRTL ? 'right' : 'left'}:auto;text-align:${isRTL ? 'left' : 'right'};line-height:1.8;">
          <div>${arabicHTML(`${t('pdfExportedOn')} ${exportedOn}`, { fontSize: 12, weight: 400, color: '#6B7280', align: isRTL ? 'left' : 'right' })}</div>
          <div>${arabicHTML(`${totalShipments} ${t('shipments')}`, { fontSize: 12, weight: 400, color: '#6B7280', align: isRTL ? 'left' : 'right' })}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">${kpis.join('')}</div>
      ${mergedHTML}
      ${tableHTML(t('byDriver'), Object.entries(byDriver).filter(([k]) => k !== '—').sort((a, b) => b[1].count - a[1].count), driverSum,
        { entityLabel: t('driver'), incomeLabel: t('driverIncomeCol'), profitLabel: t('driverProfitCol'), totalLabel: t('driverTotalCol'), totalLebLabel: t('driverTotalColLeb'), hasLeb: driverHasLeb, accentColor: '#3DA9FC' })}
      ${tableHTML(t('byContractor'), Object.entries(byContractor).filter(([k]) => k !== '—').sort((a, b) => b[1].count - a[1].count), contractorSum,
        { entityLabel: t('contractor'), incomeLabel: t('contractorIncomeCol'), profitLabel: t('contractorProfitCol'), totalLabel: t('contractorTotalCol'), totalLebLabel: t('contractorTotalColLeb'), hasLeb: contractorHasLeb, accentColor: '#B368FF' })}
      ${tableHTML(t('byCompany'), Object.entries(byCompany).sort((a, b) => b[1].dol - a[1].dol), companySum,
        { entityLabel: t('company'), incomeLabel: t('companyOutcomeCol'), profitLabel: t('companyProfitCol'), totalLabel: t('companyTotalCol'), totalLebLabel: t('companyTotalColLeb'), hasLeb: companyHasLeb, accentColor: '#2ED47A' })}
    </div>`;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;';
  container.innerHTML = reportHTML;
  document.body.appendChild(container);

  try {
    const target = container.querySelector('#pdf-general-report-root');
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

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
  }
});