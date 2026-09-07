/* ===================================================
   SONICK ORDERS VIEWER — user.html logic
   Fully independent from the admin app (app.js/ui.js/pages.js)
   and from the driver portal (driver.js): its own Firebase
   init, its own tiny helpers, its own auth flow.

   Auth reuses the SAME sonick_users accounts as the main admin
   dashboard (real email + password created from Settings → Users) —
   any signed-in, active sonick_users account can open this portal,
   regardless of role. The page itself never writes anything to
   Firestore: it is Orders + Archive, read-only, with the same
   filtering power as the admin Shipments/Archive pages.
   =================================================== */

// ===== FIREBASE CONFIG (same project as the admin app) =====
const firebaseConfig = {
  apiKey: "AIzaSyDZXyidFBKqyKLuQP-zrRP-YBZ0ncr_tNc",
  authDomain: "sonick-1e7a9.firebaseapp.com",
  databaseURL: "https://sonick-1e7a9-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "sonick-1e7a9",
  storageBucket: "sonick-1e7a9.firebasestorage.app",
  messagingSenderId: "273325585946",
  appId: "1:273325585946:web:c986cfe80220f4bdd5c3a3"
};

let db, auth;
let currentViewer = null;   // { id, displayName, email, role, active }
let activeTab      = 'orders';
let allOrders       = [];   // live sonick_shipments (view-only copy)
let allArchive      = [];   // live sonick_archive   (view-only copy)
let companies_cache   = [];
let drivers_cache     = [];
let contractors_cache = [];

const MAX_RENDERED_CARDS = 150; // perf guard — matches results line ("Showing X of Y")

// Two independent filter states — one per tab — mirroring the admin
// Shipments/Archive pages, which also keep their filters separate.
function freshOrdersFilter()  { return { phone:'', statuses:[], company:'', driver:'', contractor:'', orderType:'', dateFrom:'', dateTo:'' }; }
function freshArchiveFilter() { return { phone:'', statuses:[], company:'', driver:'', contractor:'', dateFrom:'', dateTo:'', archFrom:'', archTo:'' }; }
let ordersFilter  = freshOrdersFilter();
let archiveFilter = freshArchiveFilter();

// ===== LOCAL STATUS / ORDER-TYPE CONFIG (kept independent, like driver.js) =====
const STATUS_CONFIG = {
  'Pending':         { key: 'statusPending',        cls: 'badge-plain',    icon: '—'  },
  'Delivered':       { key: 'statusDelivered',      cls: 'badge-green',    icon: '✓'  },
  'Cancelled':       { key: 'statusCancelled',      cls: 'badge-red',      icon: '✕'  },
  'Delayed':         { key: 'statusDelayed',        cls: 'badge-darkblue', icon: '🕐' },
  'Returned-Unpaid': { key: 'statusReturnedUnpaid', cls: 'badge-orange',   icon: '↩'  },
  'Returned-Paid':   { key: 'statusReturnedPaid',   cls: 'badge-yellow',   icon: '↩'  },
  'Withdrawn':       { key: 'statusWithdrawn',      cls: 'badge-purple',   icon: '↺'  },
};
const ALL_STATUSES = Object.keys(STATUS_CONFIG);

const ORDER_TYPE_CONFIG = {
  'Normal':   { key: 'orderTypeNormal',   cls: 'badge-gray', icon: '•' },
  'Exchange': { key: 'orderTypeExchange', cls: 'badge-blue', icon: '⇄' },
};
const ALL_ORDER_TYPES = Object.keys(ORDER_TYPE_CONFIG);

const ROLE_LABEL_KEYS = { admin: 'roleAdmin', manager: 'roleManager', operator: 'roleOperator', viewer: 'roleViewer', custom: 'roleCustom' };

const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

// ===== TINY STANDALONE HELPERS (kept separate from ui.js on purpose) =====
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatNum(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-US');
}
function fmtDate(d) {
  if (!d) return '—';
  if (d?.seconds) d = new Date(d.seconds * 1000);
  if (typeof d === 'string') d = new Date(d);
  if (isNaN(d?.getTime())) return String(d);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
/** Normalize archivedAt (Firestore Timestamp, Date, or ISO string) into 'YYYY-MM-DD'
 *  so it can be compared against <input type="date"> values — mirrors pages.js. */
function archivedDateStr(s) {
  let d = s.archivedAt;
  if (!d) return '';
  if (d.seconds) d = new Date(d.seconds * 1000);
  else if (typeof d === 'string') d = new Date(d);
  else if (!(d instanceof Date)) return '';
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function statusBadge(status) {
  const cfg = STATUS_CONFIG[status];
  if (cfg) return `<span class="badge ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}</span>`;
  return `<span class="badge badge-gray">• ${esc(status || '—')}</span>`;
}
function orderTypeBadge(orderType) {
  const cfg = ORDER_TYPE_CONFIG[orderType];
  if (cfg) return `<span class="badge ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}</span>`;
  return `<span class="badge badge-gray">—</span>`;
}

// ===== INIT =====
// A NAMED (non-default) Firebase app instance, on purpose: Firebase Auth persists its
// signed-in session keyed by app name, not by page. If this used the default app name
// (like index.html and driver.html do), all three pages on the same domain would share
// one login — signing into any of them would sign into all of them, and signing out of
// one would sign out the others too. A distinct name gives user.html its own separate
// session while still talking to the exact same Firebase project/data.
const USER_PORTAL_APP_NAME = 'sonickUserPortal';

function initUserFirebase() {
  try {
    const app = firebase.initializeApp(firebaseConfig, USER_PORTAL_APP_NAME);
    db   = app.firestore();
    auth = app.auth();
    auth.onAuthStateChanged(async (user) => {
      document.getElementById('loading-screen').classList.add('hidden');
      if (user) await loadViewerProfile(user);
      else showUserLogin();
    });
  } catch (e) {
    document.getElementById('loading-screen').classList.add('hidden');
    showUserLogin();
  }
}

function showUserLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('user-app').classList.add('hidden');
}
function showUserApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('user-app').classList.remove('hidden');
}

/** Reset the login form back to a retryable state and show an error — mirrors
 *  driver.js's resetDriverLoginForm() so a failure after Auth already succeeded
 *  never leaves the "Signing in…" button stuck with no way to retry. */
function resetUserLoginForm(message) {
  showUserLogin();
  const btn   = document.getElementById('user-login-btn');
  const errEl = document.getElementById('login-error');
  if (btn) { btn.textContent = t('signIn'); btn.disabled = false; }
  if (errEl && message) { errEl.textContent = message; errEl.classList.remove('hidden'); }
}

async function loadViewerProfile(user) {
  try {
    const doc = await db.collection('sonick_users').doc(user.uid).get();
    if (!doc.exists) {
      await auth.signOut();
      resetUserLoginForm(t('userNotFound'));
      return;
    }
    const data = doc.data();
    if (data.active === false) {
      await auth.signOut();
      resetUserLoginForm(t('accountDisabled'));
      return;
    }
    currentViewer = { id: user.uid, ...data };
    document.getElementById('user-name-label').textContent = currentViewer.displayName || currentViewer.email || '—';
    const roleKey = ROLE_LABEL_KEYS[currentViewer.role] || 'roleViewer';
    document.getElementById('user-role-badge').textContent = t(roleKey);
    showUserApp();
    applyUserLang();
    await loadReferenceCaches();
    subscribeOrders();
    await initArchivePaging();
    registerViewerServiceWorker();
  } catch (e) {
    try { await auth.signOut(); } catch (_) { /* ignore */ }
    resetUserLoginForm(t('error') + e.message);
  }
}

// ===== AUTH =====
async function handleUserLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value;
  const btn      = document.getElementById('user-login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.classList.add('hidden');
  btn.textContent = t('signingIn');
  btn.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    let msg = t('loginFailed');
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
      msg = t('invalidCreds');
    if (err.code === 'auth/too-many-requests')
      msg = t('tooManyAttempts');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    btn.textContent = t('signIn');
    btn.disabled = false;
  }
}

async function handleUserLogout() {
  try {
    unsubscribeAll();
    await auth.signOut();
    currentViewer = null;
    showUserLogin();
  } catch (e) {
    toast(t('error') + e.message, 'error');
  }
}

// ===== REFERENCE DATA (for filter dropdowns — read-only) =====
async function loadReferenceCaches() {
  try {
    const [compSnap, drvSnap, contrSnap] = await Promise.all([
      db.collection('sonick_companies').orderBy('name').get(),
      db.collection('sonick_drivers').orderBy('name').get(),
      db.collection('sonick_contractors').orderBy('name').get(),
    ]);
    companies_cache   = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    drivers_cache     = drvSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    contractors_cache = contrSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Reference cache load failed (filters will just show "All ..."):', e.message);
  }
}

// ===== DATA (live-synced — read only, never written to from this page) =====
let _ordersUnsub  = null;

/** Any shipment/archive doc saved before Order Type existed has no orderType value —
 *  default it to 'Normal' for DISPLAY ONLY. Unlike the admin app, this page never
 *  writes that default back to Firestore (view-only portal, by design). */
function normalizeOrderType(rows) {
  rows.forEach(r => { if (!ALL_ORDER_TYPES.includes(r.orderType)) r.orderType = 'Normal'; });
  return rows;
}

function subscribeOrders() {
  if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
  _ordersUnsub = db.collection('sonick_shipments').orderBy('createdAt', 'desc').limit(500)
    .onSnapshot(snap => {
      allOrders = normalizeOrderType(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      const countEl = document.getElementById('tab-orders-count');
      if (countEl) countEl.textContent = allOrders.length;
      if (activeTab === 'orders') applyUserFilters();
    }, e => toast(t('error') + e.message, 'error'));
}

// ===== ARCHIVE PAGINATION =====
// The archive can hold thousands of orders, far beyond what's sensible to hold in one live
// snapshot. Instead of a single onSnapshot(...).limit(500) (which silently capped the whole
// tab at 500 regardless of true size), this loads one real Firestore page at a time — same
// approach as the admin Archive page (ARCH_PAGE_SIZE + startAfter cursors + admin-only Show
// All escape hatch). Orders (sonick_shipments) stays a live subscription above, since
// active-order counts rarely approach the old cap.
const ARCH_PAGE_SIZE = 100;
let _archMode             = 'paged'; // 'paged' (real Firestore pages) or 'all' (admin-only, whole collection loaded)
let _archPageCache        = {};
let _archPageStartCursors = {};
let _archCurrentPage      = 1;
let _archLastKnownPage    = null; // set once a page comes back short/empty — ground truth for Next
let _archTotalCount       = null; // true total, read from the same counter doc the admin app maintains

/** Reads the maintained sonick_meta/counters doc for the true archive size (1 read) — this
 *  portal never writes to it, only reads (firestore.rules: sonick_meta read: isStaff()).
 *  Used only for the tab badge and the "Page X of Y" label; Next/Prev availability always
 *  comes from an actual page fetch (_archLastKnownPage), never from this estimate. */
async function archFetchTotalCount() {
  _archTotalCount = null;
  if (!db) return;
  try {
    const doc = await db.collection('sonick_meta').doc('counters').get();
    if (doc.exists && typeof doc.data().archivedCount === 'number') {
      _archTotalCount = Math.max(0, doc.data().archivedCount);
    }
  } catch (e) { /* badge just omits the "/ total" part */ }
  const countEl = document.getElementById('tab-archive-count');
  if (countEl) countEl.textContent = _archTotalCount != null ? _archTotalCount : (allArchive.length || 0);
}

/** Loads one page directly from Firestore (or from cache if already visited this session). */
async function archLoadPage(page) {
  if (page < 1) return;
  if (_archLastKnownPage != null && page > _archLastKnownPage) return; // proven not to exist
  if (_archPageCache[page]) {
    allArchive = _archPageCache[page];
    if (allArchive.length < ARCH_PAGE_SIZE) _archLastKnownPage = page;
    _archCurrentPage = page;
    applyUserFilters();
    renderArchPaginationBar();
    return;
  }
  if (!db) return;
  const bar = document.getElementById('user-pagination');
  if (bar) bar.style.opacity = '0.6';
  try {
    let q = db.collection('sonick_archive').orderBy('archivedAt', 'desc').limit(ARCH_PAGE_SIZE);
    const startCursor = _archPageStartCursors[page];
    if (startCursor) q = q.startAfter(startCursor);
    const snap = await q.get();

    if (!snap.docs.length && page > 1) {
      // Overshot: previous page looked full but was actually the last one. Stay put.
      _archLastKnownPage = page - 1;
      toast(t('noMoreArchivedOrders'), 'info');
      renderArchPaginationBar();
      return;
    }

    const rows = normalizeOrderType(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _archPageCache[page] = rows;
    if (rows.length < ARCH_PAGE_SIZE) _archLastKnownPage = page;
    if (snap.docs.length) _archPageStartCursors[page + 1] = snap.docs[snap.docs.length - 1];
    allArchive       = rows;
    _archCurrentPage = page;
    applyUserFilters();
    renderArchPaginationBar();
  } catch (e) { toast(t('error') + e.message, 'error'); }
  finally { if (bar) bar.style.opacity = '1'; }
}

function goToUserArchPage(page) { archLoadPage(page); }

/** Prev/Next + page label + admin-only Show All control, shown only while the Archive tab
 *  is active. In 'all' mode there's nothing to page through (the whole collection is already
 *  loaded and results are simply capped/searched client-side), so this just offers a way back
 *  to efficient paged reads. */
function renderArchPaginationBar() {
  const bar = document.getElementById('user-pagination');
  if (!bar) return;
  if (activeTab !== 'archive') { bar.innerHTML = ''; return; }

  const showAllControl = (currentViewer && currentViewer.role === 'admin')
    ? (_archMode === 'all'
        ? `<button class="btn btn-secondary btn-sm" onclick="exitUserArchShowAllMode()">↩️ ${t('backToPagedBtn')}</button>`
        : `<button class="btn btn-secondary btn-sm" onclick="showAllUserArchive()">📋 ${t('showAllBtn')}</button>`)
    : '';

  if (_archMode === 'all') {
    bar.innerHTML = showAllControl;
    return;
  }

  const page = _archCurrentPage || 1;
  const totalPages = _archLastKnownPage ?? (_archTotalCount != null ? Math.ceil(_archTotalCount / ARCH_PAGE_SIZE) : null);
  const isLastPage = _archLastKnownPage != null && page >= _archLastKnownPage;
  const pageLabel = totalPages != null
    ? t('pageOfLabel').replace('{page}', page).replace('{total}', totalPages)
    : t('pageLabel').replace('{page}', page);
  bar.innerHTML = `
    <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="goToUserArchPage(${page - 1})">▶ ${t('prevPageBtn')}</button>
    <span>${pageLabel}</span>
    <button class="btn btn-secondary btn-sm" ${isLastPage ? 'disabled' : ''} onclick="goToUserArchPage(${page + 1})">◀ ${t('nextPageBtn')}</button>
    ${showAllControl}
  `;
}

/** Resets all paging state and loads page 1 — called on login (and re-armed on logout) so a
 *  fresh session, or a different account on a shared browser, never sees stale pages. */
async function initArchivePaging() {
  _archMode             = 'paged';
  _archPageCache        = {};
  _archPageStartCursors = {};
  _archCurrentPage      = 1;
  _archLastKnownPage    = null;
  await archFetchTotalCount();
  await archLoadPage(1);
}

/** Admin-only escape hatch (mirrors the admin Archive page's Show All): loads the entire
 *  sonick_archive collection at once for the rare case someone genuinely needs to search
 *  across everything in one go. Costs one read per archived order, so it's gated to the
 *  admin role and asks for confirmation first — this portal is read-only either way. */
async function showAllUserArchive() {
  if (!currentViewer || currentViewer.role !== 'admin') return;
  if (!confirm(`${t('showAllConfirmTitle')}\n\n${t('showAllConfirmMsg')}`)) return;
  const bar = document.getElementById('user-pagination');
  if (bar) bar.style.opacity = '0.6';
  try {
    if (db) {
      const snap = await db.collection('sonick_archive').orderBy('archivedAt', 'desc').get();
      allArchive = normalizeOrderType(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      _archTotalCount = allArchive.length;
      const countEl = document.getElementById('tab-archive-count');
      if (countEl) countEl.textContent = _archTotalCount;
    }
    _archMode        = 'all';
    _archCurrentPage = 1;
    applyUserFilters();
    renderArchPaginationBar();
  } catch (e) { toast(t('error') + e.message, 'error'); }
  finally { if (bar) bar.style.opacity = '1'; }
}

/** Leave Show-All mode and go back to efficient per-page Firestore reads. */
async function exitUserArchShowAllMode() { await initArchivePaging(); }

function unsubscribeAll() {
  if (_ordersUnsub)  { _ordersUnsub();  _ordersUnsub  = null; }
  _archMode             = 'paged';
  _archPageCache        = {};
  _archPageStartCursors = {};
  _archCurrentPage      = 1;
  _archLastKnownPage    = null;
  _archTotalCount       = null;
  allArchive = [];
}

// ===== TABS =====
function switchUserTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.user-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  const searchEl = document.getElementById('user-search');
  if (searchEl) searchEl.placeholder = tab === 'orders' ? t('searchShipments') : t('searchArchive');
  applyUserFilters();
  renderArchPaginationBar();
}

// ===== FILTER SHEET =====
function currentFilter() { return activeTab === 'orders' ? ordersFilter : archiveFilter; }

function openFiltersSheet() {
  document.getElementById('modal-filters-title').textContent = t('filtersBtn');
  document.getElementById('modal-filters-body').innerHTML    = filterSheetHTML(currentFilter());
  openModal('modal-filters');
}

function filterSheetHTML(f) {
  const companyNames    = companies_cache.map(c => c.name).filter(Boolean).sort();
  const driverNames     = drivers_cache.map(d => d.name).filter(Boolean).sort();
  const contractorNames = contractors_cache.map(c => c.name).filter(Boolean).sort();

  return `
  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('status')}</div>
    <div class="filter-chip-row">
      ${ALL_STATUSES.map(s => `<span class="filter-chip ${f.statuses.includes(s) ? 'active' : ''}" data-status="${s}" onclick="toggleFilterChip(this)">${esc(t(STATUS_CONFIG[s].key))}</span>`).join('')}
    </div>
  </div>

  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('company')} · ${t('driver')} · ${t('contractor')}</div>
    <div class="filter-sheet-row">
      <select class="form-select" id="fs-company">
        <option value="">${t('allCompanies')}</option>
        ${companyNames.map(n => `<option ${f.company === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
      <select class="form-select" id="fs-driver" onchange="if(this.value){document.getElementById('fs-contractor').value='';}">
        <option value="">${t('allDrivers')}</option>
        ${driverNames.map(n => `<option ${f.driver === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
      <select class="form-select" id="fs-contractor" onchange="if(this.value){document.getElementById('fs-driver').value='';}">
        <option value="">${t('allContractors')}</option>
        ${contractorNames.map(n => `<option ${f.contractor === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
    </div>
  </div>

  ${activeTab === 'orders' ? `
  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('orderTypeLabel')}</div>
    <div class="filter-chip-row">
      ${ALL_ORDER_TYPES.map(ot => `<span class="filter-chip ${f.orderType === ot ? 'active' : ''}" data-ordertype="${ot}" onclick="toggleOrderTypeChip(this)">${esc(t(ORDER_TYPE_CONFIG[ot].key))}</span>`).join('')}
    </div>
  </div>
  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('date')}</div>
    <div class="filter-sheet-daterange">
      <input type="date" class="filter-date" id="fs-date-from" value="${f.dateFrom || ''}">
      <span>–</span>
      <input type="date" class="filter-date" id="fs-date-to" value="${f.dateTo || ''}">
    </div>
  </div>` : `
  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('orderDateLabel')}</div>
    <div class="filter-sheet-daterange">
      <input type="date" class="filter-date" id="fs-date-from" value="${f.dateFrom || ''}">
      <span>–</span>
      <input type="date" class="filter-date" id="fs-date-to" value="${f.dateTo || ''}">
    </div>
  </div>
  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('archivedDateLabel')}</div>
    <div class="filter-sheet-daterange">
      <input type="date" class="filter-date" id="fs-arch-from" value="${f.archFrom || ''}">
      <span>–</span>
      <input type="date" class="filter-date" id="fs-arch-to" value="${f.archTo || ''}">
    </div>
  </div>`}

  <div class="filter-sheet-group">
    <div class="filter-sheet-label">${t('phone')}</div>
    <input type="text" class="form-input" id="fs-phone" placeholder="${t('searchByPhone')}" value="${esc(f.phone || '')}">
  </div>`;
}

/** Multi-select status chip. */
function toggleFilterChip(el) { el.classList.toggle('active'); }

/** Single-select order-type chip — clicking the already-active chip clears it back to "All Types". */
function toggleOrderTypeChip(el) {
  const wasActive = el.classList.contains('active');
  el.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (!wasActive) el.classList.add('active');
}

/** Read every control in the open filter sheet into the current tab's filter object, then apply. */
function commitFiltersFromSheet() {
  const f = currentFilter();
  f.statuses    = [...document.querySelectorAll('.filter-chip[data-status].active')].map(el => el.dataset.status);
  f.company     = document.getElementById('fs-company')?.value    || '';
  f.driver      = document.getElementById('fs-driver')?.value     || '';
  f.contractor  = document.getElementById('fs-contractor')?.value || '';
  f.phone       = document.getElementById('fs-phone')?.value.trim() || '';
  f.dateFrom    = document.getElementById('fs-date-from')?.value  || '';
  f.dateTo      = document.getElementById('fs-date-to')?.value    || '';
  if (activeTab === 'orders') {
    const activeOt = document.querySelector('.filter-chip[data-ordertype].active');
    f.orderType = activeOt ? activeOt.dataset.ordertype : '';
  } else {
    f.archFrom = document.getElementById('fs-arch-from')?.value || '';
    f.archTo   = document.getElementById('fs-arch-to')?.value   || '';
  }
  closeModal('modal-filters');
  applyUserFilters();
}

/** Clear every filter (search box included) for the current tab only — mirrors
 *  resetShipmentFilters()/resetArchiveFilters() on the admin app. */
function resetUserFilters() {
  if (activeTab === 'orders') ordersFilter = freshOrdersFilter();
  else                        archiveFilter = freshArchiveFilter();
  const searchEl = document.getElementById('user-search');
  if (searchEl) searchEl.value = '';
  closeModal('modal-filters');
  applyUserFilters();
}

function isFilterActive(f) {
  return !!(f.phone || f.statuses.length || f.company || f.driver || f.contractor ||
            f.orderType || f.dateFrom || f.dateTo || f.archFrom || f.archTo);
}
function updateFiltersDot() {
  const active = isFilterActive(currentFilter());
  document.getElementById('filters-btn-dot')?.classList.toggle('hidden', !active);
  document.getElementById('filters-btn')?.classList.toggle('has-active', active);
}

// ===== APPLY FILTERS + RENDER =====
function applyUserFilters() {
  const f          = currentFilter();
  const source     = activeTab === 'orders' ? allOrders : allArchive;
  const searchRaw  = (document.getElementById('user-search')?.value || '').trim();
  const searchNums = searchRaw.includes(',')
    ? [...new Set(searchRaw.split(',').map(v => v.trim()).filter(Boolean))]
    : null;
  const search = searchRaw.toLowerCase();

  const rows = source.filter(s => {
    if (searchNums) {
      if (!searchNums.includes(String(s.shipNumber).trim())) return false;
    } else if (search && !(
      (s.shipNumber + '').includes(search) ||
      (s.customerName    || '').toLowerCase().includes(search) ||
      (s.companyName      || '').toLowerCase().includes(search) ||
      (s.driverName        || '').toLowerCase().includes(search) ||
      (s.customerAddress  || '').toLowerCase().includes(search)
    )) return false;
    if (f.phone && !(s.customerPhone || '').includes(f.phone)) return false;
    if (f.statuses.length && !f.statuses.includes(s.status)) return false;
    if (f.company     && s.companyName    !== f.company)     return false;
    if (f.driver      && s.driverName     !== f.driver)      return false;
    if (f.contractor  && s.contractorName !== f.contractor)  return false;
    if (activeTab === 'orders') {
      if (f.orderType && (s.orderType || 'Normal') !== f.orderType) return false;
      if (f.dateFrom && s.date < f.dateFrom) return false;
      if (f.dateTo   && s.date > f.dateTo)   return false;
    } else {
      if (f.dateFrom && s.date < f.dateFrom) return false;
      if (f.dateTo   && s.date > f.dateTo)   return false;
      if (f.archFrom || f.archTo) {
        const ad = archivedDateStr(s);
        if (f.archFrom && (!ad || ad < f.archFrom)) return false;
        if (f.archTo   && (!ad || ad > f.archTo))   return false;
      }
    }
    return true;
  });

  renderResultsLine(rows.length, source.length);
  renderCards(rows);
  updateFiltersDot();
}

function renderResultsLine(shown, total) {
  const el = document.getElementById('user-results-line');
  if (!el) return;
  const label = activeTab === 'orders' ? t('shipments') : t('archivedShipments');
  el.textContent = shown === total ? `${shown} ${label}` : `${t('showing')} ${shown} ${t('of')} ${total} ${label}`;
}

function viewCardHTML(s, isArchive) {
  const orderType = ALL_ORDER_TYPES.includes(s.orderType) ? s.orderType : 'Normal';
  const id = s.id;
  return `
  <div class="view-card" data-id="${id}">
    <div class="view-card-top">
      <div class="view-card-num">#${esc(s.shipNumber || id.slice(-4))}</div>
      <div class="view-card-badges">${statusBadge(s.status)}</div>
    </div>
    <div class="view-card-main">
      <div class="view-card-row"><span class="row-icon">${ICONS.user}</span><span class="row-text">${esc(s.customerName || '—')}</span></div>
      ${s.customerPhone ? `<div class="view-card-row"><span class="row-icon">${ICONS.phone}</span><a href="tel:${esc(s.customerPhone)}">${phoneWithFlagHTML(s.customerPhone)}</a></div>` : ''}
      <div class="view-card-row"><span class="row-icon">${ICONS.building}</span><span class="row-text">${esc(s.companyName || '—')}</span></div>
      <div class="view-card-row" style="justify-content:space-between;">
        <span style="display:flex;align-items:center;gap:8px;"><span class="row-icon">${ICONS.dollarSign}</span><span class="view-card-price">$${formatNum(s.priceDollar || 0)}</span></span>
        <span style="color:var(--text-3);font-size:0.8rem;">${fmtDate(s.date || s.createdAt)}</span>
      </div>
    </div>
    <button class="view-card-toggle" onclick="toggleCardMore('${id}', this)">
      <span>${esc(t('view'))}</span>${CHEVRON_SVG}
    </button>
    <div class="view-card-more" id="more-${id}">
      <div class="view-card-more-item full"><div class="view-card-more-label">${t('address')}</div><div class="view-card-more-value">${esc(s.customerAddress || '—')}</div></div>
      <div class="view-card-more-item"><div class="view-card-more-label">${t('driver')}</div><div class="view-card-more-value">${esc(s.driverName || '—')}</div></div>
      <div class="view-card-more-item"><div class="view-card-more-label">${t('contractor')}</div><div class="view-card-more-value">${esc(s.contractorName || '—')}</div></div>
      <div class="view-card-more-item"><div class="view-card-more-label">${t('orderTypeLabel')}</div><div class="view-card-more-value">${orderTypeBadge(orderType)}</div></div>
      <div class="view-card-more-item"><div class="view-card-more-label">${t('priceLL')}</div><div class="view-card-more-value font-mono">${formatNum(s.priceLeb || 0)}</div></div>
      ${isArchive ? `<div class="view-card-more-item"><div class="view-card-more-label">${t('archivedDateLabel')}</div><div class="view-card-more-value">${fmtDate(s.archivedAt)}</div></div>` : ''}
      ${s.status === 'Withdrawn' ? `<div class="view-card-more-item"><div class="view-card-more-label">${t('withdrawnAmountUSD')}</div><div class="view-card-more-value font-mono">$${formatNum(s.withdrawnAmountDollar || 0)}</div></div>` : ''}
      ${s.description ? `<div class="view-card-more-item full"><div class="view-card-more-label">${t('descriptionNotesLabel')}</div><div class="view-card-more-value">${esc(s.description)}</div></div>` : ''}
    </div>
  </div>`;
}

function toggleCardMore(id, btn) {
  const more = document.getElementById(`more-${id}`);
  if (!more) return;
  const isOpen = more.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
}

function renderCards(rows) {
  const content = document.getElementById('user-content');
  if (!content) return;
  if (!rows.length) {
    const icon = activeTab === 'orders' ? ICONS.package : ICONS.archive;
    const msg  = activeTab === 'orders' ? t('noOrdersMatchFilters') : t('noArchiveMatchFilters');
    content.innerHTML = `<div class="viewer-empty"><div class="empty-icon-wrap">${icon}</div><p>${esc(msg)}</p></div>`;
    return;
  }
  const isArchive = activeTab === 'archive';
  content.innerHTML = rows.slice(0, MAX_RENDERED_CARDS).map(s => viewCardHTML(s, isArchive)).join('');
}

// ===== LANGUAGE (self-contained — does not reuse the admin app's toggleLang/applyLang) =====
function toggleUserLang() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('sonick_lang', currentLang);
  applyUserLang();
  applyUserFilters();
  if (document.getElementById('modal-filters')?.classList.contains('open')) openFiltersSheet();
}

function applyUserLang() {
  const lang = TRANSLATIONS[currentLang];
  document.documentElement.setAttribute('dir', lang.dir);
  document.documentElement.setAttribute('lang', currentLang);
  syncLogoImages(currentLang);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('user-login-title',    t('userPortalTitle'));
  set('user-login-subtitle', t('userLoginSubtitle'));
  set('user-label-email',    t('emailLabel'));
  set('user-label-password', t('passwordLabel'));
  const loginBtn = document.getElementById('user-login-btn');
  if (loginBtn && !loginBtn.disabled) loginBtn.textContent = t('signIn');

  const langBtn1 = document.getElementById('user-lang-btn');
  const langBtn2 = document.getElementById('user-lang-btn-app');
  if (langBtn1) langBtn1.textContent = lang.langBtn;
  if (langBtn2) langBtn2.textContent = lang.langBtn;

  if (currentViewer) {
    const roleKey = ROLE_LABEL_KEYS[currentViewer.role] || 'roleViewer';
    set('user-role-badge', t(roleKey));
  }

  set('tab-orders-label',   t('ordersTabLabel'));
  set('tab-archive-label',  t('archive'));
  set('filters-btn-label',  t('filtersBtn'));
  set('modal-filters-title',t('filtersBtn'));
  set('filters-reset-btn',  t('resetFilters'));
  set('filters-apply-btn',  t('applyFiltersBtn'));
  set('install-banner-text',t('installBannerText'));
  set('install-banner-btn', t('installBtnShort'));

  const searchEl = document.getElementById('user-search');
  if (searchEl) searchEl.placeholder = activeTab === 'orders' ? t('searchShipments') : t('searchArchive');
}

// ===== PWA INSTALL PROMPT =====
// Listeners are registered immediately below (script-load time), NOT after login —
// Chrome can fire 'beforeinstallprompt' as soon as the page loads, well before the
// person signs in, and it is never re-dispatched if missed. showInstallUI() only
// touches elements inside #user-app, which stays hidden until login succeeds
// regardless, so unhiding them early is harmless — they simply appear the moment
// the app becomes visible.
const INSTALL_DISMISS_KEY = 'sonick_user_install_dismissed';
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
let deferredInstallPrompt = null;

function registerViewerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw-user.js').catch(() => { /* offline shell is a nice-to-have, never block on it */ });
  }
}

if (!IS_STANDALONE) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallUI();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.removeItem(INSTALL_DISMISS_KEY);
    hideInstallUI();
  });

  if (IS_IOS) showInstallUI(); // no native prompt event on iOS — offer the manual instructions instead
}

function showInstallUI() {
  document.getElementById('install-header-btn')?.classList.remove('hidden');
  const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === 'true';
  if (!dismissed) document.getElementById('install-banner')?.classList.remove('hidden');
}
function hideInstallUI() {
  document.getElementById('install-header-btn')?.classList.add('hidden');
  document.getElementById('install-banner')?.classList.add('hidden');
}
function dismissInstallBanner() {
  document.getElementById('install-banner')?.classList.add('hidden');
  localStorage.setItem(INSTALL_DISMISS_KEY, 'true');
}

async function handleInstallClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === 'accepted') hideInstallUI();
    return;
  }
  toast(IS_IOS ? t('iosInstallHint') : t('genericInstallHint'), 'info');
}

applyUserLang();
initUserFirebase();