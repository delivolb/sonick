/* ===================================================
   SONICK DRIVER PORTAL — driver.html logic
   Fully independent from the admin app (app.js/ui.js/pages.js):
   its own Firebase init, its own tiny helpers, its own auth flow.
   A driver account has NO access to companies, payments, other
   drivers, or users — only the orders assigned to them (enforced
   both here and, more importantly, by firestore.rules).
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
let currentDriver = null;   // { id, name, phones, active, ... }
let activeTab     = 'orders';
let myOrders       = [];
let myArchiveItems = [];
// currentLang is already declared by i18n.js (loaded before this file) — reused as-is.

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
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

const STATUS_CONFIG = {
  'Pending':         { key: 'statusPending',        cls: 'badge-plain',    icon: '—'  },
  'Delivered':       { key: 'statusDelivered',       cls: 'badge-green',    icon: '✓'  },
  'Cancelled':       { key: 'statusCancelled',       cls: 'badge-red',      icon: '✕'  },
  'Delayed':         { key: 'statusDelayed',         cls: 'badge-darkblue', icon: '🕐' },
  'Returned-Unpaid': { key: 'statusReturnedUnpaid',  cls: 'badge-orange',   icon: '↩'  },
  'Returned-Paid':   { key: 'statusReturnedPaid',    cls: 'badge-yellow',   icon: '↩'  },
};
function statusBadge(status) {
  const cfg = STATUS_CONFIG[status];
  if (cfg) return `<span class="badge ${cfg.cls}">${cfg.icon} ${esc(t(cfg.key))}</span>`;
  return `<span class="badge badge-gray">• ${esc(status || '—')}</span>`;
}

function usernameToEmail(username) {
  const clean = (username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return `${clean}@drivers.sonick.local`;
}

// ===== INIT =====
function initDriverFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    db   = firebase.firestore();
    auth = firebase.auth();
    auth.onAuthStateChanged(async (user) => {
      document.getElementById('loading-screen').classList.add('hidden');
      if (user) await loadDriverProfile(user);
      else showDriverLogin();
    });
  } catch (e) {
    document.getElementById('loading-screen').classList.add('hidden');
    showDriverLogin();
  }
}

function showDriverLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('driver-app').classList.add('hidden');
}
function showDriverApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('driver-app').classList.remove('hidden');
}

/** Reset the login form back to a retryable state and show an error — used for every
 *  failure path after Firebase Auth itself has already succeeded (missing/disabled driver
 *  profile, Firestore permission errors, network issues, etc.), so the "Signing in…" button
 *  never gets stuck with no way to retry. */
function resetDriverLoginForm(message) {
  showDriverLogin();
  const btn   = document.getElementById('driver-login-btn');
  const errEl = document.getElementById('login-error');
  if (btn) { btn.textContent = t('driverSignIn'); btn.disabled = false; }
  if (errEl && message) { errEl.textContent = message; errEl.classList.remove('hidden'); }
}

async function loadDriverProfile(user) {
  try {
    const doc = await db.collection('sonick_drivers').doc(user.uid).get();
    if (!doc.exists) {
      await auth.signOut();
      resetDriverLoginForm(t('driverLoginFailed'));
      return;
    }
    const data = doc.data();
    if (data.active === false) {
      await auth.signOut();
      resetDriverLoginForm(t('driverAccountDisabled'));
      return;
    }
    currentDriver = { id: user.uid, ...data };
    document.getElementById('driver-name-label').textContent  = currentDriver.name || '—';
    document.getElementById('driver-phone-label').textContent = currentDriver.phones || '';
    showDriverApp();
    applyDriverLang();
    subscribeMyData();
  } catch (e) {
    try { await auth.signOut(); } catch (_) { /* ignore */ }
    resetDriverLoginForm(t('error') + e.message);
  }
}

// ===== AUTH =====
async function handleDriverLogin(e) {
  e.preventDefault();
  const username = document.getElementById('driver-username').value.trim();
  const password = document.getElementById('driver-password').value;
  const btn      = document.getElementById('driver-login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.classList.add('hidden');
  btn.textContent = t('driverSigningIn');
  btn.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
  } catch (err) {
    errEl.textContent = t('driverLoginFailed');
    errEl.classList.remove('hidden');
    btn.textContent = t('driverSignIn');
    btn.disabled = false;
  }
}

async function handleDriverLogout() {
  try { unsubscribeMyData(); await auth.signOut(); currentDriver = null; showDriverLogin(); }
  catch (e) { toast(t('error') + e.message, 'error'); }
}

// ===== DATA (live-synced with the admin dashboard) =====
let _myOrdersUnsub = null, _myArchiveUnsub = null;

/** Subscribe to this driver's own shipments + archive in real time, so any change made on
 *  either side — admin editing a price/status/driver assignment, or the driver updating
 *  their own status/note below — shows up instantly on the other side without a manual
 *  refresh or re-login. Replaces any previous subscription first (e.g. re-login). */
function subscribeMyData() {
  if (!db || !currentDriver) return;
  if (_myOrdersUnsub)  { _myOrdersUnsub();  _myOrdersUnsub  = null; }
  if (_myArchiveUnsub) { _myArchiveUnsub(); _myArchiveUnsub = null; }

  _myOrdersUnsub = db.collection('sonick_shipments').where('driverId', '==', currentDriver.id)
    .onSnapshot(snap => {
      myOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      myOrders.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const countEl = document.getElementById('tab-orders-count');
      if (countEl) countEl.textContent = myOrders.length;
      renderDriverContent();
    }, e => toast(t('error') + e.message, 'error'));

  _myArchiveUnsub = db.collection('sonick_archive').where('driverId', '==', currentDriver.id)
    .onSnapshot(snap => {
      myArchiveItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      myArchiveItems.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const countEl = document.getElementById('tab-archive-count');
      if (countEl) countEl.textContent = myArchiveItems.length;
      renderDriverContent();
    }, e => toast(t('error') + e.message, 'error'));
}

function unsubscribeMyData() {
  if (_myOrdersUnsub)  { _myOrdersUnsub();  _myOrdersUnsub  = null; }
  if (_myArchiveUnsub) { _myArchiveUnsub(); _myArchiveUnsub = null; }
}

function switchDriverTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.driver-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  renderDriverContent();
}

// ===== RENDER =====
function orderCardHTML(s, { editable }) {
  const statusOptions = Object.keys(STATUS_CONFIG).map(k =>
    `<option value="${k}" ${s.status === k ? 'selected' : ''}>${esc(t(STATUS_CONFIG[k].key))}</option>`
  ).join('');

  return `
  <div class="order-card" data-id="${s.id}">
    <div class="order-card-top">
      <div>
        <div class="order-card-num">#${esc(s.shipNumber || s.id.slice(-4))}</div>
        <div class="order-card-date">${t('assignedOn')} ${fmtDate(s.date || s.createdAt)}</div>
      </div>
      ${statusBadge(s.status)}
    </div>
    <div class="order-card-body">
      <div class="order-card-row"><span class="row-icon">${ICONS.user}</span> ${esc(s.customerName || '—')}</div>
      ${s.customerPhone ? `<div class="order-card-row"><span class="row-icon">${ICONS.phone}</span> <a href="tel:${esc(s.customerPhone)}">${esc(s.customerPhone)}</a></div>` : ''}
      ${s.customerAddress ? `<div class="order-card-row"><span class="row-icon">${ICONS.mapPin}</span> ${esc(s.customerAddress)}</div>` : ''}
      <div class="order-card-row"><span class="row-icon">${ICONS.dollarSign}</span> <span class="order-card-price">$${formatNum(s.priceDollar || 0)}</span></div>
      ${s.description ? `<div class="order-card-row"><span class="row-icon">${ICONS.note}</span> ${esc(s.description)}</div>` : ''}
    </div>
    ${editable ? `
    <div class="order-card-footer">
      <select class="form-select" id="status-${s.id}">${statusOptions}</select>
      <button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${s.id}')">${t('updateStatusLabel')}</button>
    </div>
    <div class="order-note-box">
      <textarea id="note-${s.id}" placeholder="${t('driverNotePlaceholder')}">${esc(s.driverNote || '')}</textarea>
      <button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="saveOrderNote('${s.id}')">${t('saveNoteBtn')}</button>
    </div>` : ''}
  </div>`;
}

function emptyStateHTML(iconSvg, title, sub) {
  return `
  <div class="driver-empty">
    <div class="empty-icon-wrap">${iconSvg}</div>
    <p>${esc(title)}</p>
    <div class="empty-sub">${esc(sub)}</div>
  </div>`;
}

function renderDriverContent() {
  const content = document.getElementById('driver-content');
  if (activeTab === 'orders') {
    content.innerHTML = myOrders.length
      ? myOrders.map(s => orderCardHTML(s, { editable: true })).join('')
      : emptyStateHTML(ICONS.package, t('noActiveOrders'), t('noActiveOrdersDesc'));
  } else {
    content.innerHTML = myArchiveItems.length
      ? myArchiveItems.map(s => orderCardHTML(s, { editable: false })).join('')
      : emptyStateHTML(ICONS.archive, t('noArchivedOrders'), t('noArchivedOrdersDesc'));
  }
}

// ===== ACTIONS =====
async function updateOrderStatus(shipId) {
  const sel = document.getElementById(`status-${shipId}`);
  const newStatus = sel?.value;
  if (!newStatus) return;
  try {
    await db.collection('sonick_shipments').doc(shipId).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(t('statusUpdated'), 'success');
  } catch (e) {
    toast(t('statusUpdateFailed') + e.message, 'error');
  }
}

async function saveOrderNote(shipId) {
  const el = document.getElementById(`note-${shipId}`);
  const note = el?.value || '';
  try {
    await db.collection('sonick_shipments').doc(shipId).update({
      driverNote: note,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(t('noteSaved'), 'success');
  } catch (e) {
    toast(t('statusUpdateFailed') + e.message, 'error');
  }
}

// ===== LANGUAGE (self-contained — does not reuse the admin app's toggleLang/applyLang) =====
function toggleDriverLang() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('sonick_lang', currentLang);
  applyDriverLang();
  renderDriverContent();
}

function applyDriverLang() {
  const lang = TRANSLATIONS[currentLang];
  document.documentElement.setAttribute('dir', lang.dir);
  document.documentElement.setAttribute('lang', currentLang);

  document.getElementById('driver-login-title').textContent    = t('driverPortalTitle');
  document.getElementById('driver-login-subtitle').textContent = t('driverLoginSubtitle');
  document.getElementById('driver-label-username').textContent = t('loginUsernameLabel');
  document.getElementById('driver-label-password').textContent = t('loginPasswordLabel');
  const loginBtn = document.getElementById('driver-login-btn');
  if (loginBtn && !loginBtn.disabled) loginBtn.textContent = t('driverSignIn');

  const langBtn1 = document.getElementById('driver-lang-btn');
  const langBtn2 = document.getElementById('driver-lang-btn-app');
  if (langBtn1) langBtn1.textContent = lang.langBtn;
  if (langBtn2) langBtn2.textContent = lang.langBtn;

  document.getElementById('tab-orders-label').textContent  = t('myOrdersTab');
  document.getElementById('tab-archive-label').textContent = t('myArchiveTab');
}

applyDriverLang();
initDriverFirebase();