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
  navigate('dashboard');
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
  const ndr = document.getElementById('nav-drivers');
  const nu  = document.getElementById('nav-users');
  const nb  = document.getElementById('nav-backup');
  const nf  = document.getElementById('nav-section-fin');
  const nm  = document.getElementById('nav-section-mgmt');
  const tnb = document.getElementById('topbar-new-ship');

  if (nd)  nd.style.display  = can('canViewDebts')       ? '' : 'none';
  if (ng)  ng.style.display  = can('canViewGeneral')     ? '' : 'none';
  if (nc)  nc.style.display  = can('canManageCompanies') ? '' : 'none';
  if (ndr) ndr.style.display = can('canManageDrivers')   ? '' : 'none';
  if (nu)  nu.style.display  = can('canManageUsers')     ? '' : 'none';
  if (nb)  nb.style.display  = can('canManageBackup')    ? '' : 'none';
  if (tnb) tnb.style.display = can('canCreateShipments') ? '' : 'none';
  if (nf)  nf.style.display  = (can('canViewDebts')       || can('canViewGeneral'))    ? '' : 'none';
  if (nm)  nm.style.display  = (can('canManageCompanies') || can('canManageDrivers') || can('canManageUsers')) ? '' : 'none';

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
    dashboard:      t('dashboard'),    shipments: t('shipments'),
    archive:        t('archive'),
    debts:          t('debtsPayments'),general:   t('generalReport'),
    companies:      t('companies'),    drivers:   t('drivers'),
    users:          t('users'),        settings:  t('settings'),
    backup:         t('backupRestore')
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const content = document.getElementById('page-content');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:60px;"><div class="spinner"></div></div>';

  const routes = {
    dashboard:      renderDashboard,
    shipments:      renderShipments,
    archive:        renderArchive,
    debts:          renderDebts,
    general:        renderGeneral,
    companies:      renderCompanies,
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

function confirmAction(title, message, callback) {
  document.getElementById('modal-confirm-title').textContent = title;
  document.getElementById('modal-confirm-body').innerHTML = message
    ? `<p style="color:var(--text-2);padding:8px 0;white-space:pre-line;">${esc(message)}</p>` : '';
  document.getElementById('modal-confirm-ok').onclick = () => {
    closeModal('modal-confirm');
    callback();
  };
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

// Close modals by clicking the backdrop
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target !== overlay) return;
    if (overlay.id === 'modal-prompt') cancelPromptModal();
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
};

/** All status keys in order — used for <select> dropdowns */
const ALL_STATUSES = Object.keys(STATUS_CONFIG);

function statusBadge(status) {
  const cfg = STATUS_CONFIG[status];
  if (cfg) {
    return `<span class="badge ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}</span>`;
  }
  /* Fallback for any legacy / unknown status */
  return `<span class="badge badge-gray">• ${esc(status || '—')}</span>`;
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

/** Ask the user (via the styled promptInput modal) what to name an export file, pre-filled
 *  with a sensible default. Resolves to the sanitized name, or null if the user cancelled. */
function askExportFilename(defaultName) {
  return new Promise(resolve => {
    promptInput(
      { title: t('exportFilenameTitle'), message: t('exportFilenamePrompt'), defaultValue: defaultName, type: 'text', placeholder: defaultName },
      (val) => resolve(sanitizeFilename(val) || defaultName),
      () => resolve(null)
    );
  });
}

async function exportExcel(defaultName) {
  const ships      = window._allShips || [];
  const showProfit = can('canViewProfit');
  if (!ships.length) { toast(t('noDataToExport'), 'info'); return; }

  const suggested = defaultName || `sonick-shipments-${new Date().toISOString().slice(0, 10)}`;
  const filename  = await askExportFilename(suggested);
  if (!filename) return; // cancelled

  const sorted = [...ships].sort((a, b) => {
    const da = shipmentSortDate(a), db = shipmentSortDate(b);
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    return (b.shipNumber || 0) - (a.shipNumber || 0);
  });

  const columns = [
    { header: 'Ship #',          key: 'shipNumber',    width: 10 },
    { header: 'Customer',        key: 'customerName',  width: 20 },
    { header: 'Phone',           key: 'customerPhone', width: 14 },
    { header: 'Address',         key: 'customerAddress', width: 24 },
    { header: 'Company',         key: 'companyName',   width: 16 },
    { header: 'Driver',          key: 'driverName',    width: 16 },
    { header: 'Contractor',      key: 'contractorName',width: 16 },
    { header: 'Status',          key: 'statusLabel',   width: 18 },
    { header: 'Price ($)',       key: 'priceDollar',   width: 12 },
    { header: 'Price (L.L.)',    key: 'priceLeb',      width: 14 },
    { header: 'Delivery Cost',   key: 'deliveryCost',  width: 14 },
    { header: 'Driver Cost',     key: 'driverDeliveryCost', width: 13 },
    { header: 'Contractor Cost', key: 'contractorDeliveryCost', width: 15 },
    { header: 'Date',            key: 'date',          width: 14 },
    { header: 'Description',     key: 'description',   width: 28 },
  ];
  if (showProfit) columns.push({ header: 'Profit ($)', key: 'deliveryProfit', width: 12 });
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
  columns.forEach((c, i) => { headerRow.getCell(i + 1).value = c.header; sheet.getColumn(i + 1).width = c.width; });
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
  const priceCols = new Set(['priceDollar', 'deliveryCost', 'driverDeliveryCost', 'contractorDeliveryCost', 'deliveryProfit']);
  sorted.forEach(s => {
    const style = EXPORT_STATUS_STYLE[s.status] || EXPORT_STATUS_STYLE['Pending'];
    const rowArray = columns.map(c => {
      if (c.key === 'statusLabel') return t(STATUS_CONFIG[s.status]?.key) || s.status || '—';
      if (c.key === 'date')        return fmtDate(s.date || s.createdAt);
      return s[c.key] ?? (priceCols.has(c.key) ? 0 : '');
    });
    const row = sheet.addRow(rowArray);
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB8C2D9' } }, bottom: { style: 'thin', color: { argb: 'FFB8C2D9' } },
        left: { style: 'thin', color: { argb: 'FFB8C2D9' } }, right: { style: 'thin', color: { argb: 'FFB8C2D9' } },
      };
      const key = columns[colNum - 1]?.key;
      if (priceCols.has(key)) {
        cell.numFmt = key === 'priceLeb' ? '#,##0' : '#,##0.00';
      }
      if (key === 'statusLabel') {
        cell.font = { bold: true, color: { argb: style.font } };
      }
    });
  });

  // ---- Totals row ----
  const totalsRowIdx = sheet.rowCount + 1;
  const totalsRow = sheet.getRow(totalsRowIdx);
  sheet.mergeCells(totalsRowIdx, 1, totalsRowIdx, 7);
  const totalsLabel = totalsRow.getCell(1);
  totalsLabel.value = `TOTAL (${sorted.length} shipments)`;
  totalsLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  const priceDollarColIdx = columns.findIndex(c => c.key === 'priceDollar') + 1;
  const priceLebColIdx    = columns.findIndex(c => c.key === 'priceLeb') + 1;
  const profitColIdx      = showProfit ? columns.findIndex(c => c.key === 'deliveryProfit') + 1 : 0;
  totalsRow.getCell(priceDollarColIdx).value = sorted.reduce((sum, s) => sum + (Number(s.priceDollar) || 0), 0);
  totalsRow.getCell(priceLebColIdx).value    = sorted.reduce((sum, s) => sum + (Number(s.priceLeb) || 0), 0);
  if (profitColIdx > 0) {
    totalsRow.getCell(profitColIdx).value = sorted.reduce((sum, s) => sum + (Number(s.deliveryProfit) || 0), 0);
  }
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
  [priceDollarColIdx, priceLebColIdx, profitColIdx].forEach(idx => {
    if (idx > 0) {
      const c = totalsRow.getCell(idx);
      c.numFmt = idx === priceLebColIdx ? '#,##0' : '#,##0.00';
    }
  });

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
  const ships      = window._allShips || [];
  const showProfit = can('canViewProfit');
  if (!ships.length) { toast(t('noDataToExport'), 'info'); return; }

  const suggested = defaultName || `sonick-shipments-${new Date().toISOString().slice(0, 10)}`;
  const filename  = await askExportFilename(suggested);
  if (!filename) return; // cancelled

  toast(t('generatingPdf'), 'info');

  const sorted = [...ships].sort((a, b) => {
    const da = shipmentSortDate(a), db = shipmentSortDate(b);
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    return (b.shipNumber || 0) - (a.shipNumber || 0);
  });

  const cols = [
    { label: 'Ship #',     key: 'shipNumber' },
    { label: 'Customer',   key: 'customerName' },
    { label: 'Phone',      key: 'customerPhone' },
    { label: 'Company',    key: 'companyName' },
    { label: 'Driver',     key: 'driverName' },
    { label: 'Contractor', key: 'contractorName' },
    { label: 'Status',     key: 'statusLabel' },
    { label: 'Price ($)',  key: 'priceDollar' },
    { label: 'Price (L.L.)', key: 'priceLeb' },
    { label: 'Date',       key: 'date' },
  ];
  if (showProfit) cols.push({ label: 'Profit ($)', key: 'deliveryProfit' });

  const totalDollar = sorted.reduce((sum, s) => sum + (Number(s.priceDollar) || 0), 0);
  const totalLeb    = sorted.reduce((sum, s) => sum + (Number(s.priceLeb) || 0), 0);
  const totalProfit = sorted.reduce((sum, s) => sum + (Number(s.deliveryProfit) || 0), 0);
  const exportedOn  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let logoDataUrl = '';
  try { logoDataUrl = await imageToDataURL('assets/logo-mark.png'); } catch (e) { /* logo optional */ }

  const rowsHtml = sorted.map(s => {
    const style = EXPORT_STATUS_STYLE[s.status] || EXPORT_STATUS_STYLE['Pending'];
    const cells = cols.map(c => {
      let val;
      if      (c.key === 'statusLabel')   val = esc(t(STATUS_CONFIG[s.status]?.key) || s.status || '—');
      else if (c.key === 'date')          val = esc(fmtDate(s.date || s.createdAt));
      else if (c.key === 'priceDollar')   val = '$' + formatNum(s.priceDollar || 0);
      else if (c.key === 'priceLeb')      val = formatNum(s.priceLeb || 0);
      else if (c.key === 'deliveryProfit')val = '$' + formatNum(s.deliveryProfit || 0);
      else                                 val = esc(s[c.key] || '—');
      const textColor = c.key === 'statusLabel' ? argbToCss(style.font) : '#1F2937';
      const fontWeight = c.key === 'statusLabel' ? '700' : '400';
      return `<td style="padding:6px 5px;border:1px solid #B8C2D9;text-align:center;color:${textColor};font-weight:${fontWeight};">${val}</td>`;
    }).join('');
    return `<tr style="background:${argbToCss(style.fill)};">${cells}</tr>`;
  }).join('');

  const totalsHtml = cols.map((c, i) => {
    let val = '';
    if (i === 0) val = t('pdfTotalLabel').replace('{n}', sorted.length);
    else if (c.key === 'priceDollar')    val = '$' + formatNum(totalDollar);
    else if (c.key === 'priceLeb')       val = formatNum(totalLeb);
    else if (c.key === 'deliveryProfit') val = '$' + formatNum(totalProfit);
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

async function exportArchiveCSV() {
  const saved     = window._allShips;
  window._allShips = window._archShips || [];
  await exportExcel(`sonick-archive-${new Date().toISOString().slice(0, 10)}`);
  window._allShips = saved;
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
  }
});