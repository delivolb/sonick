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
  const ns  = document.getElementById('nav-new-ship');
  const nd  = document.getElementById('nav-debts');
  const ng  = document.getElementById('nav-general');
  const nc  = document.getElementById('nav-companies');
  const ndr = document.getElementById('nav-drivers');
  const nu  = document.getElementById('nav-users');
  const nf  = document.getElementById('nav-section-fin');
  const nm  = document.getElementById('nav-section-mgmt');
  const tnb = document.getElementById('topbar-new-ship');

  if (ns)  ns.style.display  = can('canCreateShipments') ? '' : 'none';
  if (nd)  nd.style.display  = can('canViewDebts')       ? '' : 'none';
  if (ng)  ng.style.display  = can('canViewGeneral')     ? '' : 'none';
  if (nc)  nc.style.display  = can('canManageCompanies') ? '' : 'none';
  if (ndr) ndr.style.display = can('canManageDrivers')   ? '' : 'none';
  if (nu)  nu.style.display  = can('canManageUsers')     ? '' : 'none';
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
    'new-shipment': t('newShipment'),  archive:   t('archive'),
    debts:          t('debtsPayments'),general:   t('generalReport'),
    companies:      t('companies'),    drivers:   t('drivers'),
    users:          t('users'),        settings:  t('settings')
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const content = document.getElementById('page-content');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:60px;"><div class="spinner"></div></div>';

  const routes = {
    dashboard:      renderDashboard,
    shipments:      renderShipments,
    'new-shipment': renderNewShipment,
    archive:        renderArchive,
    debts:          renderDebts,
    general:        renderGeneral,
    companies:      renderCompanies,
    drivers:        renderDrivers,
    users:          renderUsers,
    settings:       renderSettings
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
    ? `<p style="color:var(--text-2);padding:8px 0;">${esc(message)}</p>` : '';
  document.getElementById('modal-confirm-ok').onclick = () => {
    closeModal('modal-confirm');
    callback();
  };
  openModal('modal-confirm');
}

// Close modals by clicking the backdrop
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
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

function statusBadge(status) {
  const map = {
    'Delivered': 'badge-green', 'delivered': 'badge-green',
    'Pending':   'badge-amber', 'pending':   'badge-amber',
    'Returned':  'badge-red',   'returned':  'badge-red',
    'Cancelled': 'badge-gray',  'cancelled': 'badge-gray',
    'In Transit':'badge-blue',
    'Processing':'badge-purple',
  };
  const tDelivered = t('statusDelivered');
  const tPending   = t('statusPending');
  const tReturned  = t('statusReturned');
  const tCancelled = t('statusCancelled');

  let cls = map[status] || 'badge-gray';
  if (status === tDelivered) cls = 'badge-green';
  if (status === tPending)   cls = 'badge-amber';
  if (status === tReturned)  cls = 'badge-red';
  if (status === tCancelled) cls = 'badge-gray';

  const icons      = { 'Delivered': '✓', 'Pending': '⏳', 'Returned': '↩', 'Cancelled': '✕', 'In Transit': '🚗', 'Processing': '⚙' };
  const icon       = icons[status] || '•';
  const displayMap = {
    'Delivered':  t('statusDelivered'), 'Pending':    t('statusPending'),
    'Returned':   t('statusReturned'),  'Cancelled':  t('statusCancelled'),
    'In Transit': t('statusInTransit'), 'Processing': t('statusProcessing'),
  };
  return `<span class="badge ${cls}">${icon} ${esc(displayMap[status] || status || '—')}</span>`;
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

// ===== CSV EXPORT =====
function exportCSV() {
  const ships      = window._allShips || [];
  const showProfit = can('canViewProfit');
  const cols = ['Ship#', 'Customer', 'Phone', 'Address', 'Company', 'Driver', 'Contractor',
                 'Status', 'Price($)', 'Price(LL)', 'DeliveryCost', 'DriverCost', 'ContractorCost', 'Date', 'Description'];
  if (showProfit) cols.push('Profit($)');

  const rows = ships.map(s => [
    s.shipNumber, s.customerName, s.customerPhone, s.customerAddress,
    s.companyName, s.driverName, s.contractorName, s.status,
    s.priceDollar, s.priceLeb, s.deliveryCost, s.driverDeliveryCost, s.contractorDeliveryCost,
    s.date, s.description,
    ...(showProfit ? [s.deliveryProfit] : [])
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`));

  const csv  = [cols.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'sonick-shipments.csv'; a.click();
  URL.revokeObjectURL(url);
  toast(t('csvExported'), 'success');
}

function exportArchiveCSV() {
  const saved     = window._allShips;
  window._allShips = window._archShips || [];
  exportCSV();
  window._allShips = saved;
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
  }
});
