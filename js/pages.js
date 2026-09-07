/* ===================================================
   SONICK DELIVERY SYSTEM — Page Renderers
   dashboard, shipments, archive, debts, general,
   companies, drivers, users, settings
   =================================================== */

// ===================================================
//  DASHBOARD
// ===================================================
function renderHome() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
  <div class="home-blank">
    <img class="home-blank-logo logo-full-img" src="assets/logo-full.png" alt="Sonick">
  </div>`;
  syncLogoImages(currentLang);
}

async function renderDashboard() {
  const content = document.getElementById('page-content');
  let stats = { total: 0, pending: 0, delivered: 0, returned: 0, totalDol: 0, totalLeb: 0, profit: 0 };
  let recentShips = [];

  try {
    if (db) {
      const snap = await db.collection('sonick_shipments').orderBy('createdAt', 'desc').limit(100).get();
      recentShips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      stats.total = recentShips.length;
      recentShips.forEach(s => {
        if (s.status === 'Delivered') stats.delivered++;
        else if (s.status === 'Returned-Unpaid' || s.status === 'Returned-Paid') stats.returned++;
        else stats.pending++;
        stats.totalDol += (s.priceDollar || 0);
        stats.totalLeb += (s.priceLeb    || 0);
        if (can('canViewProfit')) {
          stats.profit += (s.deliveryProfit || 0);
          // Deduct returned delivery cost from profit
          if (s.status === 'Returned-Paid') stats.profit -= (s.returnedDeliveryCost || 0);
        }
      });
    }
  } catch (e) {
    stats = { total: 42, pending: 8, delivered: 30, returned: 4, totalDol: 12400, totalLeb: 950000000, profit: 3200 };
    recentShips = getDemoShipments().slice(0, 10);
    const reason = (e?.code === 'permission-denied' || /insufficient permissions/i.test(e?.message || ''))
      ? 'Demo mode: Firestore denied access to shipments — check your security rules.'
      : 'Demo mode: could not load shipments — showing sample data.';
    showDemoBanner(reason);
  }

  const showProfit = can('canViewProfit');

  content.innerHTML = `
  ${pageHeader(t('dashboard'))}

  ${can('canCreateShipments') || can('canManageCompanies') || can('canManageContractors') || can('canManageDrivers') ? `
  <div class="section-header"><div class="section-title">${t('quickActions')}</div></div>
  <div class="quick-actions">
    ${can('canCreateShipments') ? `<div class="quick-action" onclick="openNewShipmentModal()"><div class="qa-icon">${ICONS.plusCircle}</div><span>${t('newShipment')}</span></div>` : ''}
    <div class="quick-action" onclick="navigate('shipments')"><div class="qa-icon">${ICONS.package}</div><span>${t('viewShipments')}</span></div>
    ${can('canManageCompanies') ? `<div class="quick-action" onclick="navigate('companies')"><div class="qa-icon">${ICONS.building}</div><span>${t('companies')}</span></div>` : ''}
    ${can('canManageContractors') ? `<div class="quick-action" onclick="navigate('contractors')"><div class="qa-icon">${ICONS.handshake}</div><span>${t('contractors')}</span></div>` : ''}
    ${can('canManageDrivers')   ? `<div class="quick-action" onclick="navigate('drivers')"><div class="qa-icon">${ICONS.truck}</div><span>${t('drivers')}</span></div>`   : ''}
    ${can('canViewDebts')       ? `<div class="quick-action" onclick="navigate('debts')"><div class="qa-icon">${ICONS.wallet}</div><span>${t('payments')}</span></div>`       : ''}
    <div class="quick-action" onclick="navigate('archive')"><div class="qa-icon">${ICONS.archive}</div><span>${t('archive')}</span></div>
  </div>` : ''}

  <div class="section-header">
    <div><div class="section-title">${t('recentShipments')}</div><div class="section-subtitle">${t('latestActivity')}</div></div>
    <button class="btn btn-secondary btn-sm" onclick="navigate('shipments')">${t('viewAll')}</button>
  </div>

  <div class="table-container desktop-table">
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>#</th><th>${t('company')}</th><th>${t('driver')}</th>
          <th>${t('status')}</th><th>${t('priceUSD')}</th><th>${t('date')}</th><th></th>
        </tr></thead>
        <tbody>
          ${recentShips.slice(0, 10).map(s => `
          <tr>
            <td><span class="font-mono" style="color:var(--text-2);font-size:12px;">#${s.shipNumber || s.id?.slice(-4) || '—'}</span></td>
            <td><strong>${esc(s.companyName || '—')}</strong></td>
            <td>${esc(s.driverName || '—')}</td>
            <td>${statusBadge(s.status)}</td>
            <td><span class="font-mono">$${formatNum(s.priceDollar || 0)}</span></td>
            <td style="color:var(--text-3);">${fmtDate(s.date || s.createdAt)}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="viewShipment('${s.id}')">${t('view')}</button></td>
          </tr>`).join('') || '<tr><td colspan="7" class="table-empty"><div class="empty-icon">📦</div><p>No shipments yet</p></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <div class="mobile-cards">${recentShips.slice(0, 8).map(s => mobileShipCard(s)).join('')}</div>`;
}

// ===================================================
//  SHIPMENTS
// ===================================================
/** Fetch shipments from Firestore (or demo data on failure) — shared by full render and lightweight refresh. */
/** Most-recent-activity timestamp for a shipment, in epoch millis — whichever is newer between
 *  its last update and its creation. Handles both Firestore Timestamp objects (normal case) and
 *  ISO-string fallbacks (offline/demo-mode writes). */
function shipActivityMillis(s) {
  const toMillis = (v) => {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  };
  return Math.max(toMillis(s.updatedAt), toMillis(s.createdAt));
}

/** Sort shipments by most-recent activity first — new orders AND recently-updated ones both
 *  rise to the top, since both take priority for work. Sorted client-side (not via a Firestore
 *  orderBy on updatedAt) so older documents that predate this field are never silently dropped. */
function sortShipsByActivity(ships) {
  return [...ships].sort((a, b) => shipActivityMillis(b) - shipActivityMillis(a));
}

async function fetchShipmentsFromDB() {
  let ships = [];
  try {
    if (db) {
      const snap = await db.collection('sonick_shipments').orderBy('createdAt', 'desc').limit(500).get();
      ships = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      backfillMissingOrderTypes('sonick_shipments', ships);
    }
  } catch (e) { ships = getDemoShipments(); }
  return sortShipsByActivity(ships);
}

/** One-time-per-record silent migration: any shipment/archive doc saved before the Order
 *  Type field existed has no `orderType` value. Rather than leaving that to a display-time
 *  fallback, quietly write `orderType: 'Normal'` back onto those docs in Firestore the first
 *  time they're loaded, so old orders end up with a real, persisted "Normal" value like any
 *  new one. Cheap no-op once every doc has been patched (nothing left missing to write). */
let _orderTypeBackfillRunning = new Set();
async function backfillMissingOrderTypes(collectionName, docs) {
  if (!db || _orderTypeBackfillRunning.has(collectionName)) return;
  const missing = (docs || []).filter(d => !ALL_ORDER_TYPES.includes(d.orderType));
  if (!missing.length) return;
  _orderTypeBackfillRunning.add(collectionName);
  try {
    const CHUNK = 400;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = db.batch();
      missing.slice(i, i + CHUNK).forEach(d => {
        batch.update(db.collection(collectionName).doc(d.id), { orderType: 'Normal' });
        d.orderType = 'Normal'; // reflect immediately in the in-memory copy too
      });
      await batch.commit();
    }
  } catch (e) {
    console.warn(`Order type backfill (${collectionName}) failed:`, e.message);
  } finally {
    _orderTypeBackfillRunning.delete(collectionName);
  }
}

let _shipmentsUnsub = null;

/** Rebuild the shared #known-addresses <datalist> (see index.html) from whatever shipment
 *  data is currently in memory — powers the "list=" autocomplete on every delivery-address
 *  input (Quick Add bar, New/Edit Shipment modal, inline table-cell edit) so staff can pick
 *  a previously-used address instead of retyping it, while the field stays plain free text. */
function refreshKnownAddressesDatalist() {
  const dl = document.getElementById('known-addresses');
  if (!dl) return;
  const set = new Set();
  (window._allShips || []).forEach(s => { const a = (s.customerAddress || '').trim(); if (a) set.add(a); });
  dl.innerHTML = [...set].sort((a, b) => a.localeCompare(b)).map(a => `<option value="${esc(a)}">`).join('');
}

/** Subscribe to live shipment updates so admin edits and driver-portal edits (status
 *  changes, notes, reassignment) reflect instantly on both sides without a manual refresh.
 *  Replaces any previous subscription first — safe to call every time the Shipments page
 *  is opened. */
function subscribeShipments(onData) {
  if (_shipmentsUnsub) { _shipmentsUnsub(); _shipmentsUnsub = null; }
  if (!db) { onData(getDemoShipments()); return; }
  _shipmentsUnsub = db.collection('sonick_shipments').orderBy('createdAt', 'desc').limit(500)
    .onSnapshot(
      snap => {
        const ships = sortShipsByActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        onData(ships);
        backfillMissingOrderTypes('sonick_shipments', ships);
      },
      err  => { console.warn('Shipments live-sync error:', err.message); onData(getDemoShipments()); }
    );
}

/** Reload shipment data and re-apply the current filters WITHOUT rebuilding the filter bar —
 *  keeps the active Company/Driver/Contractor/Status filters (and the Quick Add bar) intact. */
async function refreshShipmentsData() {
  window._allShips = await fetchShipmentsFromDB();
  refreshKnownAddressesDatalist();
  filterShipments();
}

/** Persisted (localStorage) preference for whether the Profit column and its total are shown
 *  on the Shipments and Archive pages — separate from the canViewProfit permission gate. Even
 *  staff who CAN view profit start with it hidden (screen-share/shoulder-surf safety); a
 *  toggle button (shown only when canViewProfit) reveals/hides it, and the choice persists
 *  across reloads. */
const PROFIT_VISIBLE_KEY = 'sonick_show_profit';
function isProfitVisible() { return localStorage.getItem(PROFIT_VISIBLE_KEY) === 'true'; }
function toggleProfitVisibility() {
  localStorage.setItem(PROFIT_VISIBLE_KEY, isProfitVisible() ? 'false' : 'true');
  const btnHTML = isProfitVisible() ? '🙈 ' + t('hideProfitBtn') : '👁 ' + t('showProfitBtn');
  if (currentPage === 'shipments') {
    const btn = document.getElementById('ship-profit-toggle-btn');
    if (btn) btn.innerHTML = btnHTML;
    filterShipments();
  } else if (currentPage === 'archive') {
    const btn = document.getElementById('arch-profit-toggle-btn');
    if (btn) btn.innerHTML = btnHTML;
    filterArchive();
  }
}

/** Builds the Shipments table's <thead> row. The "our profit" column follows the
 *  show/hide toggle + permission; the driver/contractor profit columns are independent —
 *  they only ever appear when that specific driver/contractor is selected in the filters. */
function shipsTheadRowHTML(canEditCells, showOurProfit, showDriverProfit, showContractorProfit) {
  return `<tr>
    ${canEditCells ? `<th style="width:36px;text-align:center;"><input type="checkbox" id="ships-select-all" onchange="toggleSelectAllShipments(this)"></th>` : ''}
    <th>${t('shipNum')}</th><th>${t('customer')}</th><th>${t('address')}</th><th>${t('company')}</th>
    <th>${t('driver')}</th><th>${t('contractor')}</th>
    <th>${t('priceUSD')}</th><th>${t('priceLL')}</th>
    ${showOurProfit        ? `<th>${t('profitCol')}</th>`             : ''}
    ${showDriverProfit     ? `<th>${t('driverProfitCol')}</th>`       : ''}
    ${showContractorProfit ? `<th>${t('contractorProfitCol')}</th>`   : ''}
    <th>${t('status')}</th><th>${t('date')}</th><th>${t('actions')}</th>
  </tr>`;
}

async function renderShipments() {
  if (!can('canViewShipments')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');

  const canSeeProfit = can('canViewProfit');
  const showProfit   = canSeeProfit && isProfitVisible();
  window._selectedShipIds = new Set(); // fresh row-selection state each time this page opens

  // Filter dropdowns list all companies/drivers — not just ones that appear in the
  // currently loaded shipments — so every entity is always selectable.
  const companyNames    = companies_cache.map(c => c.name).filter(Boolean).sort();
  const driverNames     = drivers_cache.map(d => d.name).filter(Boolean).sort();
  const contractorNames = contractors_cache.map(c => c.name).filter(Boolean).sort();

  content.innerHTML = `
  ${pageHeader(t('shipments'), [t('operations')])}
  <div class="toolbar">
  <div class="filter-bar">
    <select class="filter-select" id="ship-ordertype-filter" onchange="filterShipments()">
      <option value="">${t('allOrderTypes')}</option>
      ${ALL_ORDER_TYPES.map(ot => `<option value="${ot}">${esc(t(ORDER_TYPE_CONFIG[ot].key))}</option>`).join('')}
    </select>
    <div class="dropdown" id="ship-status-dropdown">
      <button type="button" class="filter-select" onclick="toggleDropdown('ship-status-dropdown')">
        <span id="ship-status-filter-label">${t('allStatuses')}</span>
      </button>
      <div class="dropdown-menu" style="min-width:210px;max-height:280px;overflow-y:auto;">
        ${ALL_STATUSES.map(s => `
        <label class="dropdown-item" style="justify-content:flex-start;">
          <input type="checkbox" class="ship-status-check" value="${s}" onchange="filterShipments()" style="accent-color:var(--brand);">
          <span>${esc(t(STATUS_CONFIG[s].key))}</span>
        </label>`).join('')}
      </div>
    </div>
    <select class="filter-select" id="ship-company-filter" onchange="filterShipments()">
      <option value="">${t('allCompanies')}</option>
      ${companyNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <select class="filter-select" id="ship-driver-filter" onchange="if(this.value){document.getElementById('ship-contractor-filter').value='';} filterShipments()">
      <option value="">${t('allDrivers')}</option>
      ${driverNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <select class="filter-select" id="ship-contractor-filter" onchange="if(this.value){document.getElementById('ship-driver-filter').value='';} filterShipments()">
      <option value="">${t('allContractors')}</option>
      ${contractorNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <input type="date" class="filter-date" id="ship-date-from" onchange="filterShipments()" title="From date">
    <input type="date" class="filter-date" id="ship-date-to"   onchange="filterShipments()" title="To date">
    <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="resetShipmentFilters()" title="${t('resetFilters')}">${ICONS.refreshCcw}</button>
  </div>
  </div>

  ${can('canCreateShipments') ? `
  <div class="card" id="ship-fast-order-bar" style="display:none;margin-bottom:16px;padding:14px 16px;">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
      <strong style="font-size:0.857rem;color:var(--text-2);">⚡ ${t('quickAddOrder')}</strong>
      <span id="fast-order-badges" style="display:flex;gap:6px;flex-wrap:wrap;"></span>
    </div>
    <div class="fo-row" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
      <div class="form-group fo-f-shipnum" style="margin-bottom:0;min-width:100px;">
        <label class="form-label">${t('shipNumberLabel')} <span style="color:var(--brand)">*</span></label>
        <input type="text" id="fo-shipnum" class="form-input" placeholder="${t('shipNumPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-price" style="margin-bottom:0;min-width:110px;">
        <label class="form-label">${t('priceUSD')} <span style="color:var(--brand)">*</span></label>
        <input type="number" step="0.01" id="fo-price" class="form-input" placeholder="0.00" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-priceleb" style="margin-bottom:0;min-width:120px;">
        <label class="form-label">${t('priceLL')}</label>
        <input type="number" id="fo-priceleb" class="form-input" placeholder="0.00" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-customer" style="margin-bottom:0;min-width:110px;">
        <label class="form-label">${t('customer')}</label>
        <input type="text" id="fo-customer" class="form-input" placeholder="${t('recipientNamePlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-phone" style="margin-bottom:0;min-width:190px;">
        <label class="form-label">${t('phone')}</label>
        ${phoneFieldHTML('fo-phone', '', `onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}"`)}
      </div>
      <div class="form-group fo-f-address" style="margin-bottom:0;min-width:150px;">
        <label class="form-label">${t('address')}</label>
        <input type="text" id="fo-address" class="form-input" list="known-addresses" placeholder="${t('deliveryAddressPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-desc" style="margin-bottom:0;min-width:150px;">
        <label class="form-label">${t('descriptionNotesLabel')}</label>
        <input type="text" id="fo-desc" class="form-input" placeholder="${t('descPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-ordertype" style="margin-bottom:0;min-width:110px;">
        <label class="form-label">${t('orderTypeLabel')}</label>
        <select id="fo-ordertype" class="form-select">
          ${ALL_ORDER_TYPES.map(ot => `<option value="${ot}" ${ot === 'Normal' ? 'selected' : ''}>${esc(t(ORDER_TYPE_CONFIG[ot].key))}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-quick-add btn-sm fo-submit-btn" onclick="quickAddOrder()" style="height:38px;white-space:nowrap;">+ ${t('newShipment')}</button>
    </div>
  </div>` : ''}

  ${can('canEditShipments') ? `
  <div class="card" id="ship-bulk-assign-bar" style="display:none;margin-bottom:16px;padding:14px 16px;">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
      <strong style="font-size:0.857rem;color:var(--text-2);">⚡ ${t('bulkAssignOrders')}</strong>
      <span id="bulk-assign-badges" style="display:flex;gap:6px;flex-wrap:wrap;"></span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:260px;">
        <label class="form-label">${t('orderNumbersLabel')}</label>
        <input type="text" id="ba-shipnums" class="form-input" placeholder="${t('orderNumbersPlaceholder')}" onkeydown="handleShipNumsKeydown(event)">
      </div>
      <button class="btn btn-quick-add btn-sm" onclick="bulkAssignOrders()" style="height:38px;white-space:nowrap;">${t('assignBtn')}</button>
    </div>
  </div>` : ''}

  <div class="table-container desktop-table">
    <div class="table-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--text-2);" id="ships-count">Loading...</span>
        ${can('canEditShipments') ? `
        <div id="ship-bulk-status-bar" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;">
          <span id="bulk-status-count" style="font-size:12px;color:var(--text-3);"></span>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;">
            <select id="bulk-status-select" class="form-select" style="height:32px;padding:4px 10px;font-size:0.8rem;">
              ${ALL_STATUSES.map(s => `<option value="${s}">${esc(t(STATUS_CONFIG[s].key))}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="applyBulkStatus()" style="white-space:nowrap;">${t('applyBtn')}</button>
          </div>
        </div>` : ''}
      </div>
      ${can('canArchive')  ? `<button class="btn btn-secondary btn-sm" onclick="archiveFilteredShipments()">${t('archiveGroupBtn')}</button>` : ''}
      <button class="btn btn-secondary btn-sm" id="ship-entity-report-btn" style="display:none;" onclick="openEntityGeneralReport()">${ICONS.trendingUp} ${t('generalReportBtn')}</button>
      ${canSeeProfit ? `<button class="btn btn-secondary btn-sm" id="ship-profit-toggle-btn" onclick="toggleProfitVisibility()">${isProfitVisible() ? '🙈 ' + t('hideProfitBtn') : '👁 ' + t('showProfitBtn')}</button>` : ''}
      <div class="table-search">
        <span class="search-icon">📞</span>
        <input type="text" placeholder="${t('searchByPhone')}" id="ship-phone-search" oninput="filterShipments()">
      </div>
      <div class="table-search">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="${t('searchShipments')}" id="ship-search" oninput="filterShipments()" onkeydown="handleDotToCommaKeydown(event)">
      </div>
      ${can('canExport') ? `<button class="btn btn-secondary btn-sm" onclick="exportExcel()">${ICONS.excelFile} ${t('exportExcelBtn')}</button>
      <button class="btn btn-secondary btn-sm" onclick="exportPDF()">${ICONS.pdfFile} ${t('exportPdfBtn')}</button>` : ''}
    </div>
    <div class="table-footer">
      <span id="ships-total-label" style="color:var(--text-3);"></span>
      <span id="ships-summary"     style="font-family:var(--mono);font-size:1rem;font-weight:600;"></span>
    </div>
    <div class="table-scroll">
      <table id="ships-table">
        <thead>
          ${shipsTheadRowHTML(can('canEditShipments'), showProfit, false, false)}
        </thead>
        <tbody id="ships-tbody"></tbody>
      </table>
    </div>
  </div>
  <div class="mobile-cards" id="ships-mobile"></div>`;

  window._allShips = [];
  subscribeShipments(ships => { window._allShips = ships; refreshKnownAddressesDatalist(); filterShipments(); });
}

/** Show a summary in the status filter button: all/one/"N selected" */
function updateStatusFilterLabel(statuses) {
  const el = document.getElementById('ship-status-filter-label');
  if (!el) return;
  if (!statuses.length)      el.textContent = t('allStatuses');
  else if (statuses.length === 1) el.textContent = t(STATUS_CONFIG[statuses[0]].key);
  else el.textContent = `${statuses.length} ${t('selectedLabel')}`;
}

/**
 * Show/hide + populate the two order-entry bars based on the active
 * Company/Driver/Contractor filters:
 *  - Company set (with or without Driver/Contractor also set) → Quick Add
 *    Order bar, so a newly created shipment always has a company fixed to
 *    it. The matched entities are "fixed" for the quick-add form and their
 *    stored delivery costs are pulled in as defaults (company → delivery
 *    profit, driver/contractor → their own cost).
 *  - No Company, but Driver and/or Contractor set → Bulk Assign bar instead,
 *    to assign one or more existing order numbers to that driver/contractor.
 *  - Nothing set → both bars hidden.
 */
function updateOrderEntryBars(companyName, driverName, contractorName) {
  const fastBar = document.getElementById('ship-fast-order-bar');
  const bulkBar = document.getElementById('ship-bulk-assign-bar');

  const showFast = !!companyName;
  const showBulk = !companyName && (!!driverName || !!contractorName);

  if (fastBar) {
    const wasHidden = fastBar.style.display === 'none' || !fastBar.style.display;
    fastBar.style.display = showFast ? 'block' : 'none';
    if (showFast && wasHidden) document.getElementById('fo-shipnum')?.focus();
  }
  if (bulkBar) {
    const wasHidden = bulkBar.style.display === 'none' || !bulkBar.style.display;
    bulkBar.style.display = showBulk ? 'block' : 'none';
    if (showBulk && wasHidden) document.getElementById('ba-shipnums')?.focus();
  }

  if (!showFast) window._fastOrderFixed  = null;
  if (!showBulk) window._bulkAssignFixed = null;
  if (!showFast && !showBulk) return;

  const companyObj    = companyName    ? companies_cache.find(c => c.name === companyName)    : null;
  const driverObj      = driverName     ? drivers_cache.find(d => d.name === driverName)        : null;
  const contractorObj = contractorName ? contractors_cache.find(c => c.name === contractorName)  : null;

  if (showFast) {
    window._fastOrderFixed = {
      companyId: companyObj?.id || '',       companyName: companyObj?.name || '',
      driverId: driverObj?.id || '',         driverName: driverObj?.name || '',
      contractorId: contractorObj?.id || '', contractorName: contractorObj?.name || '',
      deliveryProfit:         companyObj?.deliveryCost    || 0,
      driverDeliveryCost:     driverObj?.deliveryCost      || 0,
      contractorDeliveryCost: contractorObj?.deliveryCost || 0,
    };

    const badges = document.getElementById('fast-order-badges');
    if (badges) {
      let html = '';
      if (companyObj)    html += `<span class="badge badge-blue">${t('company')}: ${esc(companyObj.name)}</span>`;
      if (driverObj)     html += `<span class="badge badge-green">${t('driver')}: ${esc(driverObj.name)}</span>`;
      if (contractorObj) html += `<span class="badge badge-purple">${t('contractor')}: ${esc(contractorObj.name)}</span>`;
      badges.innerHTML = html;
    }
  }

  if (showBulk) {
    window._bulkAssignFixed = {
      driverId: driverObj?.id || '',         driverName: driverObj?.name || '',         driverDeliveryCost:     driverObj?.deliveryCost      || 0,
      contractorId: contractorObj?.id || '', contractorName: contractorObj?.name || '', contractorDeliveryCost: contractorObj?.deliveryCost  || 0,
    };

    const badges = document.getElementById('bulk-assign-badges');
    if (badges) {
      let html = '';
      if (driverObj)     html += `<span class="badge badge-green">${t('driver')}: ${esc(driverObj.name)}</span>`;
      if (contractorObj) html += `<span class="badge badge-purple">${t('contractor')}: ${esc(contractorObj.name)}</span>`;
      badges.innerHTML = html;
    }
  }
}

/** True if a shipment with this ship number already exists for this company. Ship numbers
 *  may be stored as either a plain number (older records) or a string (now that letters are
 *  allowed), so this checks both representations of the given value against Firestore — not
 *  the local cache — so the check is accurate no matter which page the user is creating the
 *  order from. Skipped (returns false) when there's no company to compare against, or if the
 *  check itself fails — never blocks a save due to a network hiccup. */
async function shipNumberExistsForCompany(shipNumber, companyId) {
  if (!db || !companyId) return false;
  const str = String(shipNumber).trim();
  const num = /^-?\d+$/.test(str) ? parseInt(str, 10) : null;
  try {
    const queries = [
      db.collection('sonick_shipments').where('shipNumber', '==', str).where('companyId', '==', companyId).limit(1).get(),
    ];
    if (num !== null) {
      queries.push(db.collection('sonick_shipments').where('shipNumber', '==', num).where('companyId', '==', companyId).limit(1).get());
    }
    const snaps = await Promise.all(queries);
    return snaps.some(snap => !snap.empty);
  } catch (e) {
    console.warn('Duplicate ship-number check failed:', e.message);
    return false;
  }
}

/** Create a shipment from the Quick Add bar using the entities fixed by the active filters. */
async function quickAddOrder() {
  const fixed = window._fastOrderFixed;
  if (!fixed) return;

  const shipNumberRaw = document.getElementById('fo-shipnum')?.value;
  const shipNumber    = (shipNumberRaw || '').trim();
  if (!shipNumber) { toast(t('shipNumRequired'), 'error'); return; }

  if (await shipNumberExistsForCompany(shipNumber, fixed.companyId)) {
    toast(t('duplicateShipNumber'), 'error');
    return;
  }

  const priceRaw     = document.getElementById('fo-price')?.value;
  let priceDollar    = parseFloat(priceRaw);
  if (priceRaw === '' || priceRaw == null || isNaN(priceDollar)) { toast(t('priceUSD'), 'error'); return; }

  let priceLeb = parseFloat(document.getElementById('fo-priceleb')?.value) || 0;

  /* A negative price in Quick Add is a shorthand for "this order is withdrawn": store the
   *  absolute value as both the order price and the withdrawn amount, and set status to
   *  Withdrawn automatically instead of the usual Pending — same convention already used
   *  when bulk-changing a shipment's status to Withdrawn (see commitBulkStatus above). */
  const isWithdrawn = priceDollar < 0 || priceLeb < 0;
  if (isWithdrawn) {
    priceDollar = Math.abs(priceDollar);
    priceLeb    = Math.abs(priceLeb);
  }

  const customerName = document.getElementById('fo-customer')?.value?.trim() || '';

  const payload = {
    shipNumber,
    date:                   today(),
    customerName,
    customerPhone:          getPhoneFieldValue('fo-phone'),
    customerAddress:        document.getElementById('fo-address')?.value?.trim() || '',
    companyId:              fixed.companyId,    companyName:    fixed.companyName,
    driverId:               fixed.driverId,     driverName:     fixed.driverName,
    contractorId:           fixed.contractorId, contractorName: fixed.contractorName,
    status:                 isWithdrawn ? 'Withdrawn' : 'Pending',
    priceDollar,
    priceLeb,
    driverDeliveryCost:     fixed.driverDeliveryCost,
    contractorDeliveryCost: fixed.contractorDeliveryCost,
    deliveryProfit:         fixed.deliveryProfit,
    returnedDeliveryCost:   0,
    withdrawnAmountDollar:  isWithdrawn ? priceDollar : 0,
    withdrawnAmountLeb:     isWithdrawn ? priceLeb    : 0,
    description:            document.getElementById('fo-desc')?.value?.trim() || '',
    orderType:              ALL_ORDER_TYPES.includes(document.getElementById('fo-ordertype')?.value) ? document.getElementById('fo-ordertype').value : 'Normal',
    createdAt:              firebase.firestore.FieldValue.serverTimestamp(),
    createdBy:              currentUserData?.id || '',
    updatedAt:              firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy:              currentUserData?.id || '',
  };

  try {
    if (db) await db.collection('sonick_shipments').add(payload);
    toast(isWithdrawn ? `${t('shipmentCreated')} — ${t('statusWithdrawn')}` : t('shipmentCreated'), 'success');
    document.getElementById('fo-shipnum').value   = '';
    document.getElementById('fo-customer').value  = '';
    clearPhoneField('fo-phone');
    document.getElementById('fo-price').value     = '';
    document.getElementById('fo-priceleb').value  = '';
    document.getElementById('fo-address').value   = '';
    document.getElementById('fo-desc').value      = '';
    document.getElementById('fo-ordertype').value = 'Normal';
    await refreshShipmentsData();
    document.getElementById('fo-shipnum')?.focus();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
  }
}

/** Assign one or more existing shipments — identified by ship number, comma-separated —
 *  to the driver/contractor fixed by the active filters (Bulk Assign bar).
 *
 *  Order numbers are checked against the live shipment list first:
 *   - Numbers with no matching shipment are collected as "not found" and never silently
 *     ignored — they're surfaced to the admin (toast if everything else is clean, or in
 *     the confirmation modal alongside any reassignment warnings).
 *   - Matched shipments that are already assigned to a *different* driver/contractor than
 *     the one being applied are treated as conflicts: instead of overwriting them right
 *     away, a confirmation modal lists each one (current → new assignment) with a checkbox
 *     so the admin explicitly opts in per order before anything is overwritten.
 *   - Matched shipments with no conflicting existing assignment are applied immediately.
 */
// Numpad decimal key (prints "." with NumLock on, "Delete" printed on the keycap)
// is much easier for operators to hit repeatedly than the real comma key —
// swap it for a comma automatically. Shared by any multi-number input (bulk
// assign, shipment/archive number search).
function handleDotToCommaKeydown(event) {
  if (event.key === '.' || event.code === 'NumpadDecimal') {
    event.preventDefault();
    const input = event.target;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + ',' + input.value.slice(end);
    const pos = start + 1;
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

function handleShipNumsKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    bulkAssignOrders();
    return;
  }
  handleDotToCommaKeydown(event);
}

async function bulkAssignOrders() {
  const fixed = window._bulkAssignFixed;
  if (!fixed) return;

  const raw  = document.getElementById('ba-shipnums')?.value || '';
  const nums = [...new Set(
    raw.split(',').map(s => s.trim()).filter(Boolean)
  )];
  if (!nums.length) { toast(t('orderNumbersRequired'), 'error'); return; }

  const updates = {};
  // Assigning a driver clears any existing contractor on that order, and vice versa —
  // the two are mutually exclusive, so the payload always states both explicitly. Each
  // side's delivery cost is set from the assigned driver's/contractor's own stored cost,
  // and the opposite side's cost is zeroed out along with its id/name.
  if (fixed.driverId)     { updates.driverId     = fixed.driverId;     updates.driverName     = fixed.driverName;     updates.driverDeliveryCost     = fixed.driverDeliveryCost;     updates.contractorId = ''; updates.contractorName = ''; updates.contractorDeliveryCost = 0; }
  if (fixed.contractorId) { updates.contractorId = fixed.contractorId; updates.contractorName = fixed.contractorName; updates.contractorDeliveryCost = fixed.contractorDeliveryCost; updates.driverId     = ''; updates.driverName     = ''; updates.driverDeliveryCost     = 0; }

  const allShips = window._allShips || [];
  const matched  = [];
  const notFound = [];
  nums.forEach(n => {
    const hits = allShips.filter(s => String(s.shipNumber).trim() === n);
    if (hits.length) matched.push(...hits); else notFound.push(n);
  });

  if (!matched.length) {
    toast(`${t('noMatchingOrders')}: ${notFound.join(', ')}`, 'error');
    return;
  }

  // A shipment "conflicts" if it already carries a driver/contractor that differs from
  // the one this assignment would set — including converting it from a contractor order
  // to a driver order or vice versa. Assigning to the same driver/contractor again, or
  // filling in a field that was previously empty, is not a conflict.
  const conflicts    = [];
  const nonConflicts = [];
  matched.forEach(s => {
    const driverConflict     = updates.driverId     && s.driverId     && s.driverId     !== updates.driverId;
    const contractorConflict = updates.contractorId && s.contractorId && s.contractorId !== updates.contractorId;
    const crossTypeConflict  = (updates.driverId && s.contractorId) || (updates.contractorId && s.driverId);
    if (driverConflict || contractorConflict || crossTypeConflict) conflicts.push(s); else nonConflicts.push(s);
  });

  if (!conflicts.length) {
    await _applyBulkAssign(nonConflicts, updates, notFound);
    return;
  }

  openReassignConfirmModal(nonConflicts, conflicts, notFound, updates);
}

/** Commit the driver/contractor update for a set of shipments (no conflicts to resolve). */
async function _applyBulkAssign(ships, updates, notFound) {
  if (!ships.length) {
    if (notFound.length) toast(`${t('noMatchingOrders')}: ${notFound.join(', ')}`, 'error');
    return;
  }
  const payload = { ...updates };
  payload.updatedAt = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  payload.updatedBy = currentUserData?.id || '';

  try {
    if (db) {
      const batch = db.batch();
      ships.forEach(s => batch.update(db.collection('sonick_shipments').doc(s.id), payload));
      await batch.commit();
    }
    const msg = `${ships.length} ${t('ordersAssignedLabel')}` +
      (notFound.length ? ` — ${t('notFoundLabel')}: ${notFound.join(', ')}` : '');
    toast(msg, 'success');
    document.getElementById('ba-shipnums').value = '';
    await refreshShipmentsData();
    document.getElementById('ba-shipnums')?.focus();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
  }
}

let _reassignState = null; // { nonConflicts, conflicts, notFound, updates }

/** Open the confirmation modal listing every shipment whose existing driver/contractor
 *  would be overwritten, each with its own checkbox (checked by default), plus a plain
 *  warning line for any order numbers that don't exist at all. */
function openReassignConfirmModal(nonConflicts, conflicts, notFound, updates) {
  _reassignState = { nonConflicts, conflicts, notFound, updates };

  document.getElementById('reassign-confirm-title').textContent = t('reassignConfirmTitle');
  document.getElementById('reassign-confirm-intro').textContent = t('reassignConfirmIntro');
  document.getElementById('reassign-select-all-label').textContent = t('reassignSelectAll');
  document.getElementById('reassign-select-all').checked = true;
  document.getElementById('reassign-confirm-ok').textContent = t('reassignConfirmBtn');

  const list = document.getElementById('reassign-confirm-list');
  if (list) {
    list.innerHTML = conflicts.map(s => {
      const currentName = s.driverId
        ? (s.driverName || '')
        : (s.contractorName || '');
      const newName = updates.driverId ? (updates.driverName || '') : (updates.contractorName || '');
      return `
      <div class="settings-row" style="padding:8px 4px;align-items:flex-start;">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0;">
          <input type="checkbox" class="reassign-order-check" data-id="${esc(s.id)}" checked>
          <span>
            <span class="settings-row-label" style="display:block;">#${s.shipNumber} — ${esc(s.customerName || '')}</span>
            <span style="display:block;font-size:0.8rem;color:var(--text-3);margin-top:2px;">
              ${t('reassignCurrentlyLabel')}: ${esc(currentName)} → ${t('reassignNewLabel')}: ${esc(newName)}
            </span>
          </span>
        </label>
      </div>`;
    }).join('');
  }

  const notFoundBlock = document.getElementById('reassign-notfound-block');
  if (notFoundBlock) {
    if (notFound.length) {
      notFoundBlock.style.display = 'block';
      notFoundBlock.textContent = `${t('reassignNotFoundIntro')} ${notFound.join(', ')}`;
    } else {
      notFoundBlock.style.display = 'none';
      notFoundBlock.textContent = '';
    }
  }

  openModal('modal-reassign-confirm');
}

function toggleReassignSelectAll(checked) {
  document.querySelectorAll('.reassign-order-check').forEach(cb => { cb.checked = checked; });
}

/** Apply the bulk assignment: every non-conflicting matched order, plus whichever
 *  conflicting orders are still checked in the confirmation modal. */
async function confirmBulkReassign() {
  if (!_reassignState) return;
  const { nonConflicts, conflicts, notFound, updates } = _reassignState;

  const checkedIds = new Set(
    [...document.querySelectorAll('.reassign-order-check:checked')].map(cb => cb.dataset.id)
  );
  const approvedConflicts = conflicts.filter(s => checkedIds.has(s.id));
  const toApply = [...nonConflicts, ...approvedConflicts];

  closeModal('modal-reassign-confirm');
  _reassignState = null;

  await _applyBulkAssign(toApply, updates, notFound);
}

/** Build the "Total $ | L.L. total | Profit | Amount Due [| Withdrawn]" summary line as
 *  color-coded HTML instead of a single flat-colored string — same segment colors used
 *  everywhere else these figures appear (green for profit, per fin-value.positive; purple
 *  for the "amount due" figures, matching the Outcome cards on the General Report; blue/amber
 *  for $ / L.L. totals, matching the Income stat cards; red for withdrawn amounts, per
 *  fin-value.negative). Shared by the Shipments and Archive pages so both stay in sync. */
function shipSummaryLineHTML({ totalDol, totalLeb, profitLabel, profitValue, profitVisible, dueLabel, withdrawnDol, withdrawnLeb, withdrawnCount, totalLabel }) {
  let html = `<span style="color:var(--blue);">${totalLabel || ''}$${formatNum(totalDol)}</span> | <span style="color:var(--amber);">L.L. ${formatNum(totalLeb)}</span>`;
  if (profitVisible) {
    html += ` | <span style="color:var(--green);">${esc(profitLabel)}: $${formatNum(profitValue)}</span>`;
    html += ` | <span style="color:var(--purple);">${esc(dueLabel)}: $${formatNum(totalDol - profitValue)}</span>`;
  }
  if (withdrawnCount) html += ` | <span style="color:var(--red);">${esc(t('withdrawnLabel'))}: $${formatNum(withdrawnDol)} / L.L. ${formatNum(withdrawnLeb)}</span>`;
  return html;
}

function filterShipments() {
  const searchRaw  = (document.getElementById('ship-search')?.value || '').trim();
  const searchNums = searchRaw.includes(',')
    ? [...new Set(searchRaw.split(',').map(v => v.trim()).filter(Boolean))]
    : null;
  const search     = searchRaw.toLowerCase();
  const phoneSearch = (document.getElementById('ship-phone-search')?.value || '').trim();
  const statuses   =  [...document.querySelectorAll('.ship-status-check:checked')].map(cb => cb.value);
  const company    =  document.getElementById('ship-company-filter')?.value     || '';
  const driver     =  document.getElementById('ship-driver-filter')?.value      || '';
  const contractor =  document.getElementById('ship-contractor-filter')?.value  || '';
  const orderType  =  document.getElementById('ship-ordertype-filter')?.value   || '';
  const dateFrom   =  document.getElementById('ship-date-from')?.value          || '';
  const dateTo     =  document.getElementById('ship-date-to')?.value            || '';

  updateStatusFilterLabel(statuses);
  updateOrderEntryBars(company, driver, contractor);

  let ships = (window._allShips || []).filter(s => {
    if (searchNums) {
      if (!searchNums.includes(String(s.shipNumber).trim())) return false;
    } else if (search && !(
      (s.shipNumber + '').includes(search) ||
      (s.customerName  || '').toLowerCase().includes(search) ||
      (s.companyName   || '').toLowerCase().includes(search) ||
      (s.driverName    || '').toLowerCase().includes(search) ||
      (s.customerAddress || '').toLowerCase().includes(search)
    )) return false;
    if (phoneSearch && !(s.customerPhone || '').includes(phoneSearch)) return false;
    if (statuses.length && !statuses.includes(s.status)) return false;
    if (company     && s.companyName    !== company)     return false;
    if (driver      && s.driverName     !== driver)      return false;
    if (contractor  && s.contractorName !== contractor)  return false;
    if (orderType   && (s.orderType || 'Normal') !== orderType) return false;
    if (dateFrom && s.date < dateFrom) return false;
    if (dateTo   && s.date > dateTo)   return false;
    return true;
  });

  window._filteredShips = ships; // exact "searched rows" set, used by archiveFilteredShipments()

  const canSeeProfit        = can('canViewProfit');
  const showOurProfit        = canSeeProfit && isProfitVisible();
  const showDriverProfit     = canSeeProfit && !!driver;
  const showContractorProfit = canSeeProfit && !!contractor;
  let totalDol = 0, totalLeb = 0, totalProfit = 0;
  let withdrawnDol = 0, withdrawnLeb = 0, withdrawnCount = 0;
  let driverProfitTotal = 0, contractorProfitTotal = 0;
  ships.forEach(s => {
    totalDol    += shipTotalDollar(s);
    totalLeb    += shipTotalLeb(s);
    const profitEligible = isProfitEligible(s.status);
    if (profitEligible) {
      totalProfit            += s.deliveryProfit         || 0;
      driverProfitTotal       += s.driverDeliveryCost      || 0;
      contractorProfitTotal   += s.contractorDeliveryCost  || 0;
    }
    if (s.status === 'Withdrawn') {
      withdrawnDol += s.withdrawnAmountDollar || 0;
      withdrawnLeb += s.withdrawnAmountLeb    || 0;
      withdrawnCount++;
    }
  });
  const anyEntityFilterSelected = !!(company || driver || contractor);

  // The per-entity General Report popup only makes sense when exactly one of
  // Company/Driver/Contractor is picked alone — not combined with another, and not none.
  const singleEntitySelected = [company, driver, contractor].filter(Boolean).length === 1;
  window._entityReportSelection = singleEntitySelected
    ? (driver ? { type: 'driver', name: driver } : contractor ? { type: 'contractor', name: contractor } : { type: 'company', name: company })
    : null;
  const entityReportBtn = document.getElementById('ship-entity-report-btn');
  if (entityReportBtn) entityReportBtn.style.display = singleEntitySelected ? 'inline-flex' : 'none';

  const tbody    = document.getElementById('ships-tbody');
  const thead    = document.querySelector('#ships-table thead');
  const mobile   = document.getElementById('ships-mobile');
  const countEl  = document.getElementById('ships-count');
  const summaryEl= document.getElementById('ships-summary');
  const totalEl  = document.getElementById('ships-total-label');

  const canEditCells = can('canEditShipments');
  if (thead) thead.innerHTML = shipsTheadRowHTML(canEditCells, showOurProfit, showDriverProfit, showContractorProfit);

  if (countEl)   countEl.textContent   = `${ships.length} ${t('shipments')}`;
  if (summaryEl) {
    if (!anyEntityFilterSelected) {
      summaryEl.textContent = '';
    } else {
      // Driver/contractor selection takes precedence over company for which profit
      // figure is shown; company's own profit only shows when neither is selected.
      let profitLabel = '', profitValue = 0, profitVisible = false, dueLabel = '';
      if (driver) {
        profitLabel = t('driverProfitLabel'); profitValue = driverProfitTotal; profitVisible = showDriverProfit;
        dueLabel = t('driverDueLabel');
      } else if (contractor) {
        profitLabel = t('contractorProfitLabel'); profitValue = contractorProfitTotal; profitVisible = showContractorProfit;
        dueLabel = t('contractorDueLabel');
      } else if (company) {
        profitLabel = t('profitF'); profitValue = totalProfit; profitVisible = showOurProfit;
        dueLabel = t('companyDueLabel');
      }
      summaryEl.innerHTML = shipSummaryLineHTML({
        totalDol, totalLeb, profitLabel, profitValue, profitVisible, dueLabel,
        withdrawnDol, withdrawnLeb, withdrawnCount, totalLabel: `${esc(t('total'))} `
      });
    }
  }
  if (totalEl)   totalEl.textContent   = `${t('showing')} ${ships.length} ${t('of')} ${(window._allShips || []).length} ${t('shipments')}`;

  if (tbody) {
    tbody.innerHTML = ships.length
      ? ships.map(s => {
          const dbl = (field) => canEditCells ? `ondblclick="inlineEditCell(this,'${s.id}','${field}')" class="cell-editable" title="${t('dblClickToEdit')}"` : '';
          return `
        <tr>
          ${canEditCells ? `<td style="text-align:center;"><input type="checkbox" class="ship-row-check" value="${s.id}" ${window._selectedShipIds.has(s.id) ? 'checked' : ''} onchange="toggleShipRowCheck('${s.id}', this.checked)"></td>` : ''}
          <td ${dbl('shipNumber')}><span class="font-mono" style="color:var(--brand-light);font-weight:600;">#${s.shipNumber || '—'}</span></td>
          <td>
            <div ${dbl('customerName')} style="font-weight:500;">${esc(s.customerName || '—')}</div>
            <div ${dbl('customerPhone')} style="font-size:11px;color:var(--text-3);">${s.customerPhone ? phoneWithFlagHTML(s.customerPhone) : ''}</div>
          </td>
          <td ${dbl('customerAddress')} style="max-width:180px;white-space:normal;">${esc(s.customerAddress || '—')}</td>
          <td ${dbl('companyId')}>${esc(s.companyName    || '—')}</td>
          <td ${dbl('driverId')}>${esc(s.driverName     || '—')}</td>
          <td ${dbl('contractorId')}>${esc(s.contractorName || '—')}</td>
          <td ${dbl('priceDollar')} class="font-mono">$${formatNum(s.priceDollar || 0)}</td>
          <td ${dbl('priceLeb')} class="font-mono">${formatNum(s.priceLeb || 0)}</td>
          ${showOurProfit        ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.deliveryProfit || 0)}</td>` : ''}
          ${showDriverProfit     ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.driverDeliveryCost || 0)}</td>` : ''}
          ${showContractorProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.contractorDeliveryCost || 0)}</td>` : ''}
          <td ${dbl('status')}>${statusBadge(s.status)}</td>
          <td ${dbl('date')} style="color:var(--text-3);font-size:12px;">${fmtDate(s.date || s.createdAt)}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="viewShipment('${s.id}')"    title="${t('view')}">👁</button>
              ${can('canEditShipments')    ? `<button class="btn btn-ghost  btn-sm btn-icon" onclick="editShipment('${s.id}')"    title="Edit">✏️</button>`    : ''}
              ${can('canArchive')          ? `<button class="btn btn-ghost  btn-sm btn-icon" onclick="archiveShipment('${s.id}')" title="Archive">🗄️</button>` : ''}
              ${can('canDeleteShipments')  ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteShipment('${s.id}')"  title="Delete">🗑</button>`   : ''}
            </div>
          </td>
        </tr>`;
        }).join('')
      : `<tr><td colspan="${(canEditCells ? 1 : 0) + 11 + (showOurProfit?1:0) + (showDriverProfit?1:0) + (showContractorProfit?1:0)}" class="table-empty"><div class="empty-icon">📦</div><p>No shipments match your filters</p></td></tr>`;
  }

  updateShipSelectionUI();
  if (mobile) mobile.innerHTML = ships.slice(0, 50).map(s => mobileShipCard(s)).join('');
}

/** Clear every filter/search control on the Shipments page (status checkboxes, company/driver/
 *  contractor selects, both date pickers, and the search box) and re-apply to show all shipments. */
function resetShipmentFilters() {
  const searchEl = document.getElementById('ship-search');
  if (searchEl) searchEl.value = '';
  const phoneEl = document.getElementById('ship-phone-search');
  if (phoneEl) phoneEl.value = '';
  document.querySelectorAll('.ship-status-check').forEach(cb => { cb.checked = false; });
  const company    = document.getElementById('ship-company-filter');
  const driver     = document.getElementById('ship-driver-filter');
  const contractor = document.getElementById('ship-contractor-filter');
  const orderType  = document.getElementById('ship-ordertype-filter');
  const dateFrom   = document.getElementById('ship-date-from');
  const dateTo     = document.getElementById('ship-date-to');
  if (company)    company.value    = '';
  if (driver)     driver.value     = '';
  if (contractor) contractor.value = '';
  if (orderType)  orderType.value  = '';
  if (dateFrom)   dateFrom.value   = '';
  if (dateTo)     dateTo.value     = '';
  filterShipments();
}

// ===== ROW SELECTION + BULK STATUS UPDATE (Shipments table) =====

/** Toggle one row's checkbox in/out of the persistent selection set. */
function toggleShipRowCheck(id, checked) {
  window._selectedShipIds = window._selectedShipIds || new Set();
  if (checked) window._selectedShipIds.add(id);
  else window._selectedShipIds.delete(id);
  updateShipSelectionUI();
}

/** Header "select all" checkbox — selects/deselects every row currently visible in the table. */
function toggleSelectAllShipments(el) {
  window._selectedShipIds = window._selectedShipIds || new Set();
  const checked = el.checked;
  document.querySelectorAll('#ships-tbody .ship-row-check').forEach(cb => {
    cb.checked = checked;
    if (checked) window._selectedShipIds.add(cb.value);
    else window._selectedShipIds.delete(cb.value);
  });
  updateShipSelectionUI();
}

/** Sync the header checkbox (checked/indeterminate) and the bulk-status bar's
 *  visibility + count with the current selection. Called after every table render
 *  and every individual checkbox change. */
function updateShipSelectionUI() {
  window._selectedShipIds = window._selectedShipIds || new Set();

  const rowChecks = [...document.querySelectorAll('#ships-tbody .ship-row-check')];
  const total = rowChecks.length;
  const checkedCount = rowChecks.filter(cb => cb.checked).length;

  const selectAll = document.getElementById('ships-select-all');
  if (selectAll) {
    selectAll.checked = total > 0 && checkedCount === total;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < total;
  }

  const n = window._selectedShipIds.size;
  const bar = document.getElementById('ship-bulk-status-bar');
  if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
  const countEl = document.getElementById('bulk-status-count');
  if (countEl) countEl.textContent = `${n} ${t('selectedLabel')}`;
}

/** Apply the status chosen in the bulk-status-bar select to every selected shipment.
 *  Mirrors the single-row inline-edit rule: switching to Returned-Paid first prompts
 *  for a returned delivery cost, applied to all selected rows. */
function applyBulkStatus() {
  const ids = [...(window._selectedShipIds || [])];
  if (!ids.length) return;
  const newStatus = document.getElementById('bulk-status-select')?.value;
  if (!newStatus) return;

  const allShips = window._allShips || [];
  const unassigned = ids.filter(id => {
    const ship = allShips.find(x => x.id === id);
    return ship && !ship.driverId && !ship.contractorId;
  });
  const validIds = ids.filter(id => !unassigned.includes(id));

  if (unassigned.length) {
    toast(`${unassigned.length} ${t('bulkAssignDriverOrContractorFirst')}`, 'error');
  }
  if (!validIds.length) return;

  if (newStatus === 'Returned-Paid') {
    promptInput(
      {
        title:        t('returnedDeliveryCost'),
        message:      t('returnedDeliveryCostPrompt'),
        defaultValue: '',
        type:         'number',
        step:         '0.01',
        placeholder:  '0.00',
      },
      (costStr) => {
        const returnedDeliveryCost = parseFloat(costStr) || 0;
        commitBulkStatus(validIds, newStatus, { returnedDeliveryCost });
      },
      () => {} // cancelled — keep original statuses
    );
  } else {
    commitBulkStatus(validIds, newStatus, {});
  }
}

/** Persist a bulk status change (plus any extra fields, e.g. returnedDeliveryCost) to
 *  every given shipment id in one batched write, then refresh and clear the selection.
 *  When the new status is Withdrawn, each order's own price is used as its withdrawn
 *  amount ($ / L.L.) by default — a full-refund assumption an admin can always fine-tune
 *  afterwards on the individual order. */
async function commitBulkStatus(ids, newStatus, extraPayload) {
  const isWithdrawn = newStatus === 'Withdrawn';
  const payload = { status: newStatus, ...extraPayload };
  payload.updatedAt = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  payload.updatedBy = currentUserData?.id || '';

  try {
    if (db) {
      const batch = db.batch();
      ids.forEach(id => {
        let rowPayload = payload;
        if (isWithdrawn) {
          const ship = (window._allShips || []).find(x => x.id === id);
          rowPayload = {
            ...payload,
            withdrawnAmountDollar: ship?.priceDollar || 0,
            withdrawnAmountLeb:    ship?.priceLeb    || 0,
          };
        }
        batch.update(db.collection('sonick_shipments').doc(id), rowPayload);
      });
      await batch.commit();
    }
    toast(`${ids.length} ${t('statusUpdatedLabel')}`, 'success');
    window._selectedShipIds = new Set();
    await refreshShipmentsData();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
  }
}

/** Format a Lebanese Lira stat value for display: Arabic gets a descriptive "ألف/مليون ليرة"
 *  phrase (e.g. "500 ألف ليرة" for 500,000, "125 مليون ليرة" for 125,000,000) instead of the
 *  compact "M" suffix used for other languages (e.g. "1.8M"). */
function formatLebStat(value) {
  const v = value || 0;
  if (currentLang === 'ar') {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `${formatNum(v / 1000000)} مليون ليرة`;
    if (abs >= 1000)    return `${formatNum(v / 1000)} ألف ليرة`;
    return `${formatNum(v)} ليرة`;
  }
  return `${formatNum(v / 1000000)}M`;
}

// ===== INLINE CELL EDITING (double-click a shipments row cell) =====
/** Maps an editable field name to how its inline editor should be rendered. */
const INLINE_EDIT_FIELDS = {
  shipNumber:    { kind: 'text'   },
  customerName:  { kind: 'text'   },
  customerPhone: { kind: 'text'   },
  customerAddress: { kind: 'text' },
  companyId:     { kind: 'company'     },
  driverId:      { kind: 'driver'      },
  contractorId:  { kind: 'contractor'  },
  priceDollar:   { kind: 'number', step: '0.01' },
  priceLeb:      { kind: 'number' },
  status:        { kind: 'status' },
  date:          { kind: 'date'   },
};

/** Turn a single shipment table cell into an inline editor on double-click.
 *  Enter/blur saves, Escape cancels and restores the original cell content. */
function inlineEditCell(el, id, field) {
  if (!can('canEditShipments')) return;
  if (el.querySelector('input,select')) return; // already editing this cell

  const s = (window._allShips || []).find(x => x.id === id);
  const cfg = INLINE_EDIT_FIELDS[field];
  if (!s || !cfg) return;

  if (field === 'status' && !s.driverId && !s.contractorId) {
    toast(t('assignDriverOrContractorFirst'), 'error');
    return;
  }

  const prevHTML = el.innerHTML;
  let editorHTML;

  if (cfg.kind === 'company' || cfg.kind === 'contractor') {
    const selectedId = cfg.kind === 'company' ? s.companyId : s.contractorId;
    const sourceCache = cfg.kind === 'company' ? companies_cache : contractors_cache;
    const opts = sourceCache.map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    editorHTML = `<select class="inline-edit-input form-select"><option value="">${cfg.kind === 'company' ? t('selectCompanyOption') : t('noneOption')}</option>${opts}</select>`;
  } else if (cfg.kind === 'driver') {
    const opts = drivers_cache.map(d => `<option value="${d.id}" ${s.driverId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    editorHTML = `<select class="inline-edit-input form-select"><option value="">${t('noneOption')}</option>${opts}</select>`;
  } else if (cfg.kind === 'status') {
    const opts = ALL_STATUSES.map(st => `<option value="${st}" ${s.status === st ? 'selected' : ''}>${esc(t(STATUS_CONFIG[st].key))}</option>`).join('');
    editorHTML = `<select class="inline-edit-input form-select">${opts}</select>`;
  } else {
    const rawVal = s[field];
    const type = cfg.kind === 'date' ? 'date' : (cfg.kind === 'number' ? 'number' : 'text');
    const listAttr = field === 'customerAddress' ? 'list="known-addresses"' : '';
    editorHTML = `<input type="${type}" ${cfg.step ? `step="${cfg.step}"` : ''} ${listAttr} class="inline-edit-input form-input" value="${esc(rawVal ?? '')}">`;
  }

  el.innerHTML = editorHTML;
  const input = el.querySelector('input,select');
  input.focus();
  if (input.select) input.select();

  let settled = false;
  const finish = (commit) => {
    if (settled) return;
    settled = true;
    if (!commit) { el.innerHTML = prevHTML; return; }
    let val = input.value;
    if (cfg.kind === 'number') val = parseFloat(val) || 0;
    saveInlineField(id, field, val, () => { el.innerHTML = prevHTML; });
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); finish(true);  }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  if (input.tagName === 'SELECT') {
    input.addEventListener('change', () => {
      if (field === 'status' && input.value === 'Returned-Paid') {
        settled = true; // handled manually below; blocks the blur listener's finish(true)
        promptInput(
          {
            title:        t('returnedDeliveryCost'),
            message:      t('returnedDeliveryCostPrompt'),
            defaultValue: s.returnedDeliveryCost || '',
            type:         'number',
            step:         '0.01',
            placeholder:  '0.00',
          },
          (costStr) => {
            const returnedDeliveryCost = parseFloat(costStr) || 0;
            saveInlineField(id, field, input.value, () => { el.innerHTML = prevHTML; }, { returnedDeliveryCost });
          },
          () => { el.innerHTML = prevHTML; } // cancelled — keep original status
        );
      } else if (field === 'status' && input.value === 'Withdrawn') {
        settled = true; // handled manually below; blocks the blur listener's finish(true)
        promptWithdrawAmount(
          s,
          (extra) => {
            saveInlineField(id, field, input.value, () => { el.innerHTML = prevHTML; }, extra);
          },
          () => { el.innerHTML = prevHTML; } // cancelled — keep original status
        );
      } else if (field === 'driverId' && input.value && s.contractorId) {
        settled = true;
        const driverName = drivers_cache.find(d => d.id === input.value)?.name || '';
        confirmAction(
          t('convertToDriverTitle'),
          t('convertToDriverMsg').replace('{name}', s.contractorName || '').replace('{new}', driverName),
          () => { saveInlineField(id, field, input.value, () => { el.innerHTML = prevHTML; }, { contractorId: '', contractorName: '', contractorDeliveryCost: 0 }); },
          () => { el.innerHTML = prevHTML; }
        );
      } else if (field === 'contractorId' && input.value && s.driverId) {
        settled = true;
        const contractorName = contractors_cache.find(c => c.id === input.value)?.name || '';
        confirmAction(
          t('convertToContractorTitle'),
          t('convertToContractorMsg').replace('{name}', s.driverName || '').replace('{new}', contractorName),
          () => { saveInlineField(id, field, input.value, () => { el.innerHTML = prevHTML; }, { driverId: '', driverName: '', driverDeliveryCost: 0 }); },
          () => { el.innerHTML = prevHTML; }
        );
      } else {
        finish(true);
      }
    });
  }
}

/** Persist one inline-edited field to Firestore (resolving id → name for company/driver/
 *  contractor changes), then refresh the shipments table while keeping active filters. */
async function saveInlineField(id, field, value, onFail, extraPayload) {
  const payload = {};
  if (field === 'companyId') {
    const obj = companies_cache.find(c => c.id === value);
    payload.companyId = value || ''; payload.companyName = obj?.name || '';
    // Company drives the order's delivery profit — keep it synced to whatever this
    // company's own stored delivery cost currently is, same as the New/Edit form.
    payload.deliveryProfit = value ? (obj?.deliveryCost || 0) : 0;
  } else if (field === 'contractorId') {
    const obj = contractors_cache.find(c => c.id === value);
    payload.contractorId = value || ''; payload.contractorName = obj?.name || '';
    // Re-sync the contractor delivery cost to the newly-picked contractor's own stored
    // cost whenever the contractor assignment changes (including switching between two
    // contractors, or clearing it back to none).
    payload.contractorDeliveryCost = value ? (obj?.deliveryCost || 0) : 0;
  } else if (field === 'driverId') {
    const obj = drivers_cache.find(d => d.id === value);
    payload.driverId = value || ''; payload.driverName = obj?.name || '';
    // Same idea as contractorDeliveryCost above, but for the driver side.
    payload.driverDeliveryCost = value ? (obj?.deliveryCost || 0) : 0;
  } else if (field === 'shipNumber') {
    payload.shipNumber = (value || '').toString().trim();
  } else {
    payload[field] = value;
  }
  if (extraPayload) Object.assign(payload, extraPayload);
  payload.updatedAt = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  payload.updatedBy = currentUserData?.id || '';

  try {
    if (db) await db.collection('sonick_shipments').doc(id).update(payload);
    toast(t('shipmentUpdated'), 'success');
    await refreshShipmentsData();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
    if (onFail) onFail();
  }
}

function shipmentFormHTML(data) {
  const d = data || {};
  const companyOptions    = companies_cache.map(c  => `<option value="${c.id}"  ${d.companyId    === c.id  ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const driverOptions     = drivers_cache.map(dr   => `<option value="${dr.id}" ${d.driverId     === dr.id ? 'selected' : ''}>${esc(dr.name)}</option>`).join('');
  const contractorOptions = contractors_cache.map(c  => `<option value="${c.id}"  ${d.contractorId === c.id  ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  /* Build status options from STATUS_CONFIG */
  const statusOptions = ALL_STATUSES.map(s =>
    `<option value="${s}" ${d.status === s ? 'selected' : ''}>${esc(t(STATUS_CONFIG[s].key))}</option>`
  ).join('');

  /* Build order type options (عادي / تبديل) from ORDER_TYPE_CONFIG — only 2 real values,
     no blank/"none" option; defaults to Normal when the shipment has none set yet
     (new shipment, or an old one saved before this field existed). */
  const currentOrderType = ALL_ORDER_TYPES.includes(d.orderType) ? d.orderType : 'Normal';
  const orderTypeOptions = ALL_ORDER_TYPES.map(ot =>
    `<option value="${ot}" ${currentOrderType === ot ? 'selected' : ''}>${esc(t(ORDER_TYPE_CONFIG[ot].key))}</option>`
  ).join('');

  /* Show returned delivery cost row only when status is Returned-Paid; the withdrawn-order
     amount row is entirely separate and only shows for the Withdrawn status. */
  const isReturnedPaid = d.status === 'Returned-Paid';
  const isWithdrawn     = d.status === 'Withdrawn';

  return `
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('shipNumberLabel')} <span style="color:var(--brand)">*</span></label>
      <input type="text" id="f-shipnum" class="form-input" value="${esc(d.shipNumber ?? '')}" placeholder="${t('shipNumPlaceholder')}">
    </div>
    <div class="form-group">
      <label class="form-label">${t('date')} <span style="color:var(--brand)">*</span></label>
      <input type="date" id="f-date" class="form-input" value="${d.date || today()}">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('customer')}</label>
      <input type="text" id="f-customer" class="form-input" value="${esc(d.customerName || '')}" placeholder="${t('recipientNamePlaceholder')}">
    </div>
    <div class="form-group">
      <label class="form-label">${t('phone')}</label>
      ${phoneFieldHTML('f-phone', d.customerPhone, '')}
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">${t('address')}</label>
    <input type="text" id="f-address" class="form-input" list="known-addresses" value="${esc(d.customerAddress || '')}" placeholder="${t('deliveryAddressPlaceholder')}">
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('company')}</label>
      <select id="f-company" class="form-select" onchange="onCompanyFieldChange(this)"><option value="">${t('selectCompanyOption')}</option>${companyOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('contractor')}</label>
      <select id="f-contractor" class="form-select" onchange="onContractorFieldChange(this)"><option value="">${t('noneOption')}</option>${contractorOptions}</select>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('driver')}</label>
      <select id="f-driver" class="form-select" onchange="onDriverFieldChange(this)"><option value="">${t('noneOption')}</option>${driverOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('status')}</label>
      <select id="f-status" class="form-select" onchange="onStatusChange()">
        <option value="">${t('selectStatusOption')}</option>
        ${statusOptions}
      </select>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('orderTypeLabel')}</label>
      <select id="f-ordertype" class="form-select">
        ${orderTypeOptions}
      </select>
    </div>
  </div>

  <!-- Withdrawn order value ($ / L.L.) — a customer-initiated cancellation/return, unrelated
       to the Returned-Unpaid/Returned-Paid statuses below -->
  <div class="form-row" id="f-withdrawn-amount-row" style="display:${isWithdrawn ? 'flex' : 'none'};">
    <div class="form-group">
      <label class="form-label" style="color:var(--amber);">↺ ${t('withdrawnAmountUSD')}</label>
      <input type="number" step="0.01" id="f-withdrawn-usd" class="form-input"
             value="${d.withdrawnAmountDollar || ''}" placeholder="0.00"
             style="border-color:var(--amber);outline-color:var(--amber);">
    </div>
    <div class="form-group">
      <label class="form-label" style="color:var(--amber);">↺ ${t('withdrawnAmountLL')}</label>
      <input type="number" id="f-withdrawn-lbp" class="form-input"
             value="${d.withdrawnAmountLeb || ''}" placeholder="0.00"
             style="border-color:var(--amber);outline-color:var(--amber);">
    </div>
  </div>

  <!-- Returned-Paid delivery cost — shown/hidden via onStatusChange() -->
  <div class="form-group" id="f-returned-cost-row" style="display:${isReturnedPaid ? 'block' : 'none'};">
    <label class="form-label" style="color:var(--purple);">
      💰 ${t('returnedDeliveryCost')}
    </label>
    <input type="number" step="0.01" id="f-returned-cost" class="form-input"
           value="${d.returnedDeliveryCost || ''}" placeholder="0.00"
           style="border-color:var(--purple);outline-color:var(--purple);">
    <p style="font-size:11px;color:var(--text-3);margin-top:4px;">${t('returnedDeliveryCostHint')}</p>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('priceUSD')}</label>
      <input type="number" step="0.01" id="f-pricedol" class="form-input" value="${d.priceDollar || ''}" placeholder="0.00">
    </div>
    <div class="form-group">
      <label class="form-label">${t('priceLL')}</label>
      <input type="number" id="f-priceleb" class="form-input" value="${d.priceLeb || ''}" placeholder="0.00">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('driverCostLabel')}</label>
      <input type="number" step="0.01" id="f-drivercost"   class="form-input" value="${d.driverDeliveryCost   || ''}" placeholder="0.00">
    </div>
    <div class="form-group">
      <label class="form-label">${t('contractorCostLabel')}</label>
      <input type="number" step="0.01" id="f-contractorcost" class="form-input" value="${d.contractorDeliveryCost || ''}" placeholder="0.00">
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">${t('deliveryProfitLabel')}</label>
    <input type="number" step="0.01" id="f-profit"       class="form-input" value="${d.deliveryProfit       || ''}" placeholder="0.00">
  </div>
  <div class="form-group">
    <label class="form-label">${t('descriptionNotesLabel')}</label>
    <textarea id="f-desc" class="form-textarea" placeholder="${t('descPlaceholder')}">${esc(d.description || '')}</textarea>
  </div>
  <div style="background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;font-size:12px;color:var(--text-3);">
    💡 ${t('dollarRateLabel')} <strong style="color:var(--amber);font-family:var(--mono);">${formatNum(dollPrice)} L.L.</strong> — ${t('dollarRateNote')}
  </div>`;
}

/** Show/hide the returned-order fields based on selected status: the returned amount row
 *  shows for either Returned-Unpaid or Returned-Paid; the delivery-cost row only for Paid. */
/** Show/hide the returned-order fields based on selected status: the withdrawn-amount row
 *  shows only for the Withdrawn status; the delivery-cost row only for Returned-Paid. */
function onStatusChange() {
  const status = document.getElementById('f-status')?.value;
  const amountRow = document.getElementById('f-withdrawn-amount-row');
  const costRow   = document.getElementById('f-returned-cost-row');
  if (amountRow) amountRow.style.display = status === 'Withdrawn'      ? 'flex'  : 'none';
  if (costRow)   costRow.style.display   = status === 'Returned-Paid' ? 'block' : 'none';
}

/** Auto-fill the Driver Cost field in the New/Edit Shipment form to match whichever driver
 *  is currently selected — each driver has its own stored delivery cost (set on the Drivers
 *  page), so the admin no longer has to type it in by hand. Clears the field when no driver
 *  is selected. */
function setDriverCostField(driverId) {
  const el = document.getElementById('f-drivercost');
  if (el) el.value = driverId ? (drivers_cache.find(d => d.id === driverId)?.deliveryCost || 0) : '';
}
/** Same as setDriverCostField(), but for the Contractor Cost field / a contractor's own
 *  stored delivery cost. */
function setContractorCostField(contractorId) {
  const el = document.getElementById('f-contractorcost');
  if (el) el.value = contractorId ? (contractors_cache.find(c => c.id === contractorId)?.deliveryCost || 0) : '';
}
/** Re-reads whichever driver/contractor is *currently* selected in the form and re-applies
 *  both cost fields from that final state — called at the end of every driver/contractor
 *  change path (including confirm/cancel of the convert-warning dialog) instead of trying
 *  to set each field inline in every branch, so the two cost fields can never end up out of
 *  sync with what's actually selected. */
function syncDriverContractorCosts() {
  setDriverCostField(document.getElementById('f-driver')?.value || '');
  setContractorCostField(document.getElementById('f-contractor')?.value || '');
}

/** Auto-fill the (company) Profit field in the New/Edit Shipment form to match whichever
 *  company is currently selected — each company has its own stored delivery cost on the
 *  Companies page, used here as the delivery profit for orders under that company. */
function onCompanyFieldChange(sel) {
  const companyId = sel.value;
  const el = document.getElementById('f-profit');
  if (el) el.value = companyId ? (companies_cache.find(c => c.id === companyId)?.deliveryCost || 0) : '';
}

/** Selecting a driver while the order was originally assigned to a contractor (still
 *  showing that contractor in the form) warns the admin before converting it — same
 *  in reverse for selecting a contractor while a driver was originally assigned.
 *  Either way, the Driver Cost / Contractor Cost fields are kept in sync automatically
 *  with whichever driver/contractor ends up selected, using that entity's own stored
 *  delivery cost — for both a brand-new shipment and switching driver/contractor on an
 *  existing one. */
function onDriverFieldChange(sel) {
  const contractorSel = document.getElementById('f-contractor');
  const orig = window._editShipmentOriginal;
  const newDriverId = sel.value;
  if (!newDriverId || !contractorSel.value || !orig || orig.contractorId !== contractorSel.value) {
    if (newDriverId) contractorSel.value = '';
    syncDriverContractorCosts();
    return;
  }
  const driverName = drivers_cache.find(d => d.id === newDriverId)?.name || '';
  confirmAction(
    t('convertToDriverTitle'),
    t('convertToDriverMsg').replace('{name}', orig.contractorName || '').replace('{new}', driverName),
    () => { contractorSel.value = ''; syncDriverContractorCosts(); },
    () => { sel.value = ''; syncDriverContractorCosts(); }
  );
}
function onContractorFieldChange(sel) {
  const driverSel = document.getElementById('f-driver');
  const orig = window._editShipmentOriginal;
  const newContractorId = sel.value;
  if (!newContractorId || !driverSel.value || !orig || orig.driverId !== driverSel.value) {
    if (newContractorId) driverSel.value = '';
    syncDriverContractorCosts();
    return;
  }
  const contractorName = contractors_cache.find(c => c.id === newContractorId)?.name || '';
  confirmAction(
    t('convertToContractorTitle'),
    t('convertToContractorMsg').replace('{name}', orig.driverName || '').replace('{new}', contractorName),
    () => { driverSel.value = ''; syncDriverContractorCosts(); },
    () => { sel.value = ''; syncDriverContractorCosts(); }
  );
}

// ===== SAVE SHIPMENT =====
async function saveShipment() {
  const companyId    = document.getElementById('f-company')?.value;
  const driverId     = document.getElementById('f-driver')?.value;
  const contractorId = document.getElementById('f-contractor')?.value;

  const companyObj    = companies_cache.find(c  => c.id  === companyId);
  const driverObj     = drivers_cache.find(d   => d.id   === driverId);
  const contractorObj = contractors_cache.find(c  => c.id  === contractorId);

  const shipNum = (document.getElementById('f-shipnum')?.value || '').trim();
  if (!shipNum) { toast(t('shipNumRequired'), 'error'); return; }

  const statusVal = document.getElementById('f-status')?.value || 'Pending';
  if (statusVal !== 'Pending' && !driverId && !contractorId) {
    toast(t('assignDriverOrContractorFirst'), 'error');
    return;
  }

  if (!editingId && await shipNumberExistsForCompany(shipNum, companyId)) {
    toast(t('duplicateShipNumber'), 'error');
    return;
  }

  const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  const payload = {
    shipNumber:            shipNum,
    date:                  document.getElementById('f-date')?.value          || today(),
    customerName:          document.getElementById('f-customer')?.value?.trim()  || '',
    customerPhone:         getPhoneFieldValue('f-phone'),
    customerAddress:       document.getElementById('f-address')?.value?.trim()   || '',
    companyId:             companyId    || '',
    companyName:           companyObj?.name    || '',
    driverId:              driverId     || '',
    driverName:            driverObj?.name     || '',
    contractorId:          contractorId || '',
    contractorName:        contractorObj?.name  || '',
    status:                document.getElementById('f-status')?.value       || 'Pending',
    orderType:             document.getElementById('f-ordertype')?.value    || 'Normal',
    priceDollar:           parseFloat(document.getElementById('f-pricedol')?.value)       || 0,
    priceLeb:              parseFloat(document.getElementById('f-priceleb')?.value)       || 0,
    driverDeliveryCost:    parseFloat(document.getElementById('f-drivercost')?.value)     || 0,
    contractorDeliveryCost:parseFloat(document.getElementById('f-contractorcost')?.value) || 0,
    deliveryProfit:        parseFloat(document.getElementById('f-profit')?.value)         || 0,
    returnedDeliveryCost:  parseFloat(document.getElementById('f-returned-cost')?.value)  || 0,
    withdrawnAmountDollar: parseFloat(document.getElementById('f-withdrawn-usd')?.value)   || 0,
    withdrawnAmountLeb:    parseFloat(document.getElementById('f-withdrawn-lbp')?.value)   || 0,
    description:           document.getElementById('f-desc')?.value?.trim()  || '',
    updatedAt:             ts,
    updatedBy:             currentUserData?.id || '',
  };

  try {
    if (editingId) {
      if (db) await db.collection('sonick_shipments').doc(editingId).update(payload);
      toast(t('shipmentUpdated'), 'success');
    } else {
      payload.createdAt = ts;
      payload.createdBy = currentUserData?.id || '';
      if (db) await db.collection('sonick_shipments').add(payload);
      toast(t('shipmentCreated'), 'success');
    }
    closeModal('modal-shipment');
    if (currentPage === 'shipments') renderShipments();
    else if (currentPage === 'dashboard') renderDashboard();
    editingId = null;
  } catch (e) {
    console.error(e);
    toast(t('errorSaving') + e.message, 'error');
  }
}

// ===== VIEW / EDIT / DELETE / ARCHIVE =====
async function viewShipment(id) {
  let s;
  try {
    if (db) {
      const doc = await db.collection('sonick_shipments').doc(id).get();
      if (!doc.exists) { toast(t('shipmentNotFound'), 'error'); return; }
      s = { id, ...doc.data() };
    } else {
      s = (window._allShips || getDemoShipments()).find(x => x.id === id) || {};
    }
  } catch (e) {
    s = (window._allShips || getDemoShipments()).find(x => x.id === id) || {};
  }

  const showProfit = can('canViewProfit');
  document.getElementById('modal-detail-title').textContent = `${t('shipmentDetails')} #${s.shipNumber || id}`;
  document.getElementById('modal-detail-body').innerHTML = `
  <div class="detail-grid" style="margin-bottom:16px;">
    <div class="detail-field"><div class="detail-label">Ship Number</div><div class="detail-value font-mono" style="color:var(--brand-light);font-size:18px;font-weight:700;">#${s.shipNumber || '—'}</div></div>
    <div class="detail-field"><div class="detail-label">${t('status')}</div><div class="detail-value">${statusBadge(s.status)}</div></div>
    <div class="detail-field"><div class="detail-label">${t('orderTypeLabel')}</div><div class="detail-value">${orderTypeBadge(s.orderType || 'Normal')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('date')}</div><div class="detail-value">${fmtDate(s.date || s.createdAt)}</div></div>
    <div class="detail-field"><div class="detail-label">${t('company')}</div><div class="detail-value">${esc(s.companyName || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('customer')}</div><div class="detail-value">${esc(s.customerName || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('phone')}</div><div class="detail-value font-mono">${phoneWithFlagHTML(s.customerPhone)}</div></div>
    <div class="detail-field" style="grid-column:1/-1;"><div class="detail-label">${t('address')}</div><div class="detail-value">${esc(s.customerAddress || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('driver')}</div><div class="detail-value">${esc(s.driverName || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('contractor')}</div><div class="detail-value">${esc(s.contractorName || '—')}</div></div>
  </div>
  <div class="financial-summary">
    <div class="fin-item"><div class="fin-label">${t('priceUSD')}</div><div class="fin-value">$${formatNum(s.priceDollar || 0)}</div></div>
    <div class="fin-item"><div class="fin-label">${t('priceLL')}</div><div class="fin-value">${formatNum(s.priceLeb || 0)} LL</div></div>
    <div class="fin-item"><div class="fin-label">Delivery Cost</div><div class="fin-value negative">$${formatNum(s.deliveryCost || 0)}</div></div>
    <div class="fin-item"><div class="fin-label">Driver Cost</div><div class="fin-value negative">$${formatNum(s.driverDeliveryCost || 0)}</div></div>
    <div class="fin-item"><div class="fin-label">Contractor Cost</div><div class="fin-value negative">$${formatNum(s.contractorDeliveryCost || 0)}</div></div>
    ${s.status === 'Withdrawn' ? `<div class="fin-item"><div class="fin-label" style="color:var(--amber);">↺ ${t('withdrawnAmountUSD')}</div><div class="fin-value negative">$${formatNum(s.withdrawnAmountDollar || 0)}</div></div>
    <div class="fin-item"><div class="fin-label" style="color:var(--amber);">↺ ${t('withdrawnAmountLL')}</div><div class="fin-value negative">${formatNum(s.withdrawnAmountLeb || 0)} LL</div></div>` : ''}
    ${s.status === 'Returned-Paid' ? `<div class="fin-item"><div class="fin-label" style="color:var(--purple);">${t('returnedDeliveryCost')}</div><div class="fin-value negative">$${formatNum(s.returnedDeliveryCost || 0)}</div></div>` : ''}
    ${showProfit ? `<div class="fin-item"><div class="fin-label">${t('profitF')}</div><div class="fin-value positive">$${formatNum(s.deliveryProfit || 0)}</div></div>` : ''}
  </div>
  ${s.description ? `<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;font-size:13px;color:var(--text-2);"><strong>Notes:</strong> ${esc(s.description)}</div>` : ''}`;

  document.getElementById('modal-detail-footer').innerHTML = `
  <button class="btn btn-secondary" onclick="closeModal('modal-detail')">${t('close')}</button>
  ${can('canEditShipments') ? `<button class="btn btn-primary"   onclick="closeModal('modal-detail');editShipment('${id}')">${t('edit')}</button>`       : ''}
  ${can('canArchive')       ? `<button class="btn btn-secondary" onclick="closeModal('modal-detail');archiveShipment('${id}')">${t('archiveBtn')}</button>` : ''}`;

  openModal('modal-detail');
}

async function editShipment(id) {
  if (!can('canEditShipments')) { toast(t('noPermission'), 'error'); return; }
  let s;
  try {
    if (db) { const doc = await db.collection('sonick_shipments').doc(id).get(); s = { id, ...doc.data() }; }
    else s = (window._allShips || getDemoShipments()).find(x => x.id === id) || {};
  } catch (e) { s = (window._allShips || getDemoShipments()).find(x => x.id === id) || {}; }
  editingId = id;
  window._editShipmentOriginal = s;
  document.getElementById('modal-shipment-title').textContent = `Edit Shipment #${s.shipNumber || id}`;
  document.getElementById('modal-shipment-body').innerHTML    = shipmentFormHTML(s);
  openModal('modal-shipment');
}

function openNewShipmentModal() {
  editingId = null;
  window._editShipmentOriginal = null;
  document.getElementById('modal-shipment-title').textContent = t('newShipment');
  document.getElementById('modal-shipment-body').innerHTML    = shipmentFormHTML(null);
  openModal('modal-shipment');
  // The address datalist is normally kept fresh by the Shipments page's live subscription;
  // if this modal was opened from elsewhere (e.g. the header button from the Dashboard) and
  // that subscription never ran this session, backfill it once in the background so address
  // autocomplete still has suggestions instead of coming up empty.
  if (!window._allShips || !window._allShips.length) {
    fetchShipmentsFromDB().then(ships => {
      if (!window._allShips || !window._allShips.length) window._allShips = ships;
      refreshKnownAddressesDatalist();
    }).catch(() => {});
  }
}

async function deleteShipment(id) {
  confirmAction(t('deleteShipmentConfirm'), t('cannotUndo'), async () => {
    try {
      if (db) await db.collection('sonick_shipments').doc(id).delete();
      toast(t('shipmentDeleted'), 'success');
      renderShipments();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Resets the manual "Old Balance" yellow-cell entries on the General Statement page
 *  (driver + company/contractor) back to empty, both in Firestore (sonick_settings/general)
 *  and in the in-memory settlementOldBalances used to prefill those inputs — called right
 *  after an archive action succeeds, since archiving a batch of orders represents settling
 *  them, and any outside-system balance that was carried in no longer applies to the next
 *  period. Best-effort: never blocks or fails the archive action itself.
 *  IMPORTANT: uses mergeFields (not merge:true) — see saveSettlementOldBalances() below for
 *  why plain merge:true can't actually clear a nested map field. */
async function resetSettlementOldBalances() {
  try {
    const empty = { driver: {}, entity: {} };
    if (db) await db.collection('sonick_settings').doc('general').set({ settlementOldBalances: empty }, { mergeFields: ['settlementOldBalances'] });
    settlementOldBalances = empty;
  } catch (e) { /* best-effort — archiving already succeeded regardless */ }
}

async function archiveShipment(id) {
  if (!can('canArchive')) { toast(t('noPermission'), 'error'); return; }
  confirmAction(t('archiveShipmentConfirm'), t('archiveMsg'), async () => {
    try {
      if (db) {
        const doc = await db.collection('sonick_shipments').doc(id).get();
        if (doc.exists) {
          await db.collection('sonick_archive').doc(id).set({
            ...doc.data(),
            archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
            archivedBy: currentUserData?.id
          });
          await db.collection('sonick_shipments').doc(id).delete();
          archCounterAdjust(1);
        }
      }
      await resetSettlementOldBalances();
      toast(t('shipmentArchived'), 'success');
      renderShipments();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Archive every order in the CURRENT search/filter result set on the Shipments page in one
 *  action (not the row-level single archive) — excluding Pending and Delayed orders, which are
 *  still in progress and must stay in the active list. Always confirms with the exact count
 *  before doing anything, since this is a bulk irreversible move to the archive collection. */
async function archiveFilteredShipments() {
  if (!can('canArchive')) { toast(t('noPermission'), 'error'); return; }

  const filtered = window._filteredShips || [];
  const eligible = filtered.filter(s => s.status !== 'Pending' && s.status !== 'Delayed');
  const skipped  = filtered.length - eligible.length;

  if (!eligible.length) { toast(t('noOrdersToArchive'), 'error'); return; }

  const msg = `${t('archiveGroupConfirmMsg')} (${eligible.length}).`
    + (skipped > 0 ? ` ${t('archiveGroupSkippedNote')} (${skipped}).` : '');

  confirmAction(t('archiveGroupConfirmTitle'), msg, async () => {
    try {
      if (db) {
        const ids = eligible.map(s => s.id);
        // Read current data for each doc first, since the archive copy must reflect
        // whatever is in Firestore right now (not the possibly-stale in-memory list).
        const docs = await Promise.all(ids.map(id => db.collection('sonick_shipments').doc(id).get()));
        const CHUNK = 200; // set+delete = 2 writes/doc, stay well under Firestore's 500-write batch limit
        for (let i = 0; i < docs.length; i += CHUNK) {
          const batch = db.batch();
          let chunkCount = 0;
          docs.slice(i, i + CHUNK).forEach(doc => {
            if (!doc.exists) return;
            batch.set(db.collection('sonick_archive').doc(doc.id), {
              ...doc.data(),
              archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
              archivedBy: currentUserData?.id
            });
            batch.delete(db.collection('sonick_shipments').doc(doc.id));
            chunkCount++;
          });
          if (chunkCount) batch.set(archCounterDocRef(), { archivedCount: firebase.firestore.FieldValue.increment(chunkCount) }, { merge: true });
          await batch.commit();
        }
      }
      toast(`${eligible.length} ${t('ordersArchivedLabel')}`, 'success');
      window._selectedShipIds = new Set();
      await resetSettlementOldBalances();
      await refreshShipmentsData();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===================================================
//  ARCHIVE
// ===================================================

/** Archive pagination state.
 *  ARCH_PAGE_SIZE — both the Firestore page size (in 'paged' mode, exactly one page's worth
 *  of docs is read per Firestore call — was a flat 500-doc read on EVERY visit before) and
 *  the client-side display chunk size (in 'all' mode, after an admin presses Show All).
 *  'paged' mode: Prev/Next fetch that page directly from Firestore (cached per page so
 *  revisiting a page costs no extra reads). 'all' mode: the entire collection was already
 *  loaded, so Prev/Next just re-slice it in memory. */
const ARCH_PAGE_SIZE = 100;

async function refreshArchiveData() {
  window._archMode              = 'paged';
  window._archPageCache         = {};
  window._archPageStartCursors  = {};
  window._archCurrentPage       = 1;
  window._archLastKnownPage     = null;
  await archFetchTotalCount();
  await archLoadFirestorePage(1);
}

/** Builds the Archive table's <thead> row — same rule as Shipments: "our profit" follows
 *  the toggle, driver/contractor profit columns only show when that filter is set. */
function archTheadRowHTML(canManage, showOurProfit, showDriverProfit, showContractorProfit) {
  return `<tr>
    ${canManage ? `<th style="width:36px;text-align:center;"><input type="checkbox" id="arch-select-all" onchange="toggleSelectAllArchived(this)"></th>` : ''}
    <th>${t('shipNum')}</th><th>${t('customer')}</th><th>${t('address')}</th><th>${t('company')}</th>
    <th>${t('driver')}</th><th>${t('contractor')}</th>
    <th>${t('priceUSD')}</th><th>${t('priceLL')}</th>
    ${showOurProfit        ? `<th>${t('profitCol')}</th>`             : ''}
    ${showDriverProfit     ? `<th>${t('driverProfitCol')}</th>`       : ''}
    ${showContractorProfit ? `<th>${t('contractorProfitCol')}</th>`   : ''}
    <th>${t('status')}</th><th>${t('date')}</th><th>${t('archivedDateCol')}</th><th>${t('actions')}</th>
  </tr>`;
}

/** Reference to the small persisted counter doc that tracks the true archive size, kept in
 *  sync by archCounterAdjust() below. Reading it costs exactly 1 document read regardless of
 *  archive size — a reliable stand-in for Firestore's count() aggregate, which this
 *  environment doesn't consistently return a value from. */
const archCounterDocRef = () => db.collection('sonick_meta').doc('counters');

/** Adjusts the maintained archive-count counter by `delta` (positive when archiving,
 *  negative when unarchiving/deleting) — call this right after any write that changes how
 *  many documents are in sonick_archive. Best-effort: if it fails, the total-page label just
 *  falls back to unknown/stale until the next successful read/bootstrap; it never blocks or
 *  fails the action itself. */
async function archCounterAdjust(delta) {
  if (!db || !delta) return;
  try {
    await archCounterDocRef().set({ archivedCount: firebase.firestore.FieldValue.increment(delta) }, { merge: true });
  } catch (e) { /* best-effort */ }
}

/** Gets the true archived-order total for the page label, from the maintained counter doc
 *  (1 read, always available once seeded) rather than Firestore's count() aggregate, which
 *  doesn't reliably return a value in every project setup. If the counter hasn't been seeded
 *  yet, this tries count() once as a bootstrap and persists the result for next time; if that
 *  also comes back empty, the label just omits the "of ~N" part (see showAllArchive(), which
 *  also seeds/repairs this counter for free the next time an admin uses it). */
async function archFetchTotalCount() {
  window._archTotalCount = null;
  if (!db) return;
  try {
    const counterDoc = await archCounterDocRef().get();
    if (counterDoc.exists && typeof counterDoc.data().archivedCount === 'number') {
      window._archTotalCount = Math.max(0, counterDoc.data().archivedCount);
      return;
    }
  } catch (e) { /* fall through to the one-time aggregate bootstrap below */ }
  try {
    const countSnap = await db.collection('sonick_archive').count().get();
    window._archTotalCount = countSnap.data().count;
    archCounterDocRef().set({ archivedCount: window._archTotalCount }, { merge: true }).catch(() => {});
  } catch (e) { window._archTotalCount = null; /* aggregate queries unavailable here — label omits the "of ~N" part until Show All seeds it */ }
}

/** Load one Firestore page (ARCH_PAGE_SIZE docs) of the archive directly by page number —
 *  from cache if this page was already visited (no extra read), otherwise via a real
 *  Firestore query using the startAfter cursor recorded when the previous page was fetched.
 *
 *  Whether Next is enabled is decided purely from what a page fetch actually returns, never
 *  from the (approximate, occasionally wrong) count() total: a page that comes back full
 *  (ARCH_PAGE_SIZE docs) means "keep going", a page that comes back short or empty means
 *  window._archLastKnownPage is now known for certain — Next fetches the true next 100
 *  regardless of what "Show all" has or hasn't been pressed. */
async function archLoadFirestorePage(page) {
  if (page < 1) return;
  if (window._archLastKnownPage != null && page > window._archLastKnownPage) return; // proven not to exist
  const bar = document.getElementById('arch-pagination');
  if (window._archPageCache[page]) {
    const ships = window._archPageCache[page];
    if (ships.length < ARCH_PAGE_SIZE) window._archLastKnownPage = page;
    window._allArchShips    = ships;
    window._archCurrentPage = page;
    applyArchFilters();
    renderArchTable();
    return;
  }
  if (!db) return;
  if (bar) bar.style.opacity = '0.6';
  try {
    let q = db.collection('sonick_archive').orderBy('archivedAt', 'desc').limit(ARCH_PAGE_SIZE);
    const startCursor = window._archPageStartCursors[page];
    if (startCursor) q = q.startAfter(startCursor);
    const snap = await q.get();

    if (!snap.docs.length && page > 1) {
      // Overshot: the previous page looked full (exactly ARCH_PAGE_SIZE) but was actually
      // the last one — now confirmed. Stay put on the last real page instead of showing blank.
      window._archLastKnownPage = page - 1;
      toast(t('noMoreArchivedOrders'), 'info');
      renderArchTable(); // re-renders with the now-known last page, data/current page unchanged
      return;
    }

    const ships = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    backfillMissingOrderTypes('sonick_archive', ships);
    window._archPageCache[page] = ships;
    if (ships.length < ARCH_PAGE_SIZE) window._archLastKnownPage = page;
    if (snap.docs.length) window._archPageStartCursors[page + 1] = snap.docs[snap.docs.length - 1];
    window._allArchShips    = ships;
    window._archCurrentPage = page;
    applyArchFilters();
    renderArchTable();
  } catch (e) { toast(t('error') + e.message, 'error'); }
  finally { if (bar) bar.style.opacity = '1'; }
}

/** Admin-only escape hatch: load the ENTIRE archive collection at once (like the old
 *  unconditional behavior) for the rare case someone genuinely needs to search/export across
 *  everything in one go. Costs one read per archived order, so it's gated to admins and asks
 *  for confirmation first. */
async function showAllArchive() {
  if (!can('canManageUsers')) return;
  confirmAction(t('showAllConfirmTitle'), t('showAllConfirmMsg'), async () => {
    const btn = document.getElementById('arch-show-all-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('loadingMore'); }
    try {
      if (db) {
        const snap = await db.collection('sonick_archive').orderBy('archivedAt', 'desc').get();
        window._allArchShips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        backfillMissingOrderTypes('sonick_archive', window._allArchShips);
        // Free accurate reseed of the maintained counter — we already paid for every doc
        // read here, so use the exact real total to repair archCounterAdjust()'s running
        // count in case it had ever drifted (e.g. a doc removed outside this app).
        window._archTotalCount = window._allArchShips.length;
        archCounterDocRef().set({ archivedCount: window._archTotalCount }, { merge: true }).catch(() => {});
      }
      window._archMode        = 'all';
      window._archCurrentPage = 1;
      applyArchFilters();
      renderArchTable();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Leave Show-All mode and go back to efficient per-page Firestore reads. */
async function exitArchShowAllMode() {
  await renderArchive();
}

async function renderArchive() {
  const content = document.getElementById('page-content');
  window._archMode             = 'paged';
  window._archPageCache        = {};
  window._archPageStartCursors = {};
  window._archCurrentPage      = 1;
  window._archTotalCount       = null;
  window._archLastKnownPage    = null;
  let ships = [];
  try {
    if (db) {
      await archFetchTotalCount();
      const snap = await db.collection('sonick_archive').orderBy('archivedAt', 'desc').limit(ARCH_PAGE_SIZE).get();
      ships = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      backfillMissingOrderTypes('sonick_archive', ships);
      window._archPageCache[1] = ships;
      if (ships.length < ARCH_PAGE_SIZE) window._archLastKnownPage = 1;
      if (snap.docs.length) window._archPageStartCursors[2] = snap.docs[snap.docs.length - 1];
    }
  } catch (e) { ships = getDemoShipments().map(s => ({ ...s, status: 'Delivered' })); window._archTotalCount = ships.length; window._archLastKnownPage = 1; }


  const canSeeProfit = can('canViewProfit');
  const showProfit   = canSeeProfit && isProfitVisible();
  const canManage   = can('canArchive');
  const canDelete   = can('canDeleteShipments');
  window._selectedArchIds = new Set(); // fresh row-selection state each time this page opens

  // Same filter dropdowns as the Shipments page — list every company/driver, not just
  // ones present in the currently loaded archive rows.
  const companyNames    = companies_cache.map(c => c.name).filter(Boolean).sort();
  const driverNames     = drivers_cache.map(d => d.name).filter(Boolean).sort();
  const contractorNames = contractors_cache.map(c => c.name).filter(Boolean).sort();

  content.innerHTML = `
  ${pageHeader(t('archive'), [t('operations')])}
  <div class="toolbar">
  <div class="filter-bar">
    <div class="dropdown" id="arch-status-dropdown">
      <button type="button" class="filter-select" onclick="toggleDropdown('arch-status-dropdown')">
        <span id="arch-status-filter-label">${t('allStatuses')}</span>
      </button>
      <div class="dropdown-menu" style="min-width:210px;max-height:280px;overflow-y:auto;">
        ${ALL_STATUSES.map(s => `
        <label class="dropdown-item" style="justify-content:flex-start;">
          <input type="checkbox" class="arch-status-check" value="${s}" onchange="filterArchive()" style="accent-color:var(--brand);">
          <span>${esc(t(STATUS_CONFIG[s].key))}</span>
        </label>`).join('')}
      </div>
    </div>
    <select class="filter-select" id="arch-company-filter" onchange="filterArchive()">
      <option value="">${t('allCompanies')}</option>
      ${companyNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <select class="filter-select" id="arch-driver-filter" onchange="filterArchive()">
      <option value="">${t('allDrivers')}</option>
      ${driverNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <select class="filter-select" id="arch-contractor-filter" onchange="filterArchive()">
      <option value="">${t('allContractors')}</option>
      ${contractorNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <div class="table-search">
      <span class="search-icon">📞</span>
      <input type="text" placeholder="${t('searchByPhone')}" id="arch-phone-search" oninput="filterArchive()">
    </div>
    <div class="table-search">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="${t('searchArchive')}" id="arch-search" oninput="filterArchive()" onkeydown="handleDotToCommaKeydown(event)">
    </div>
    <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="resetArchiveFilters()" title="${t('resetFilters')}">${ICONS.refreshCcw}</button>
  </div>
  <div class="filter-bar">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:0.8rem;color:var(--text-3);white-space:nowrap;">${t('orderDateLabel')}:</span>
      <input type="date" class="filter-date" id="arch-from" onchange="filterArchive()" title="${t('orderDateFromTitle')}">
      <span style="color:var(--text-3);">–</span>
      <input type="date" class="filter-date" id="arch-to"   onchange="filterArchive()" title="${t('orderDateToTitle')}">
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:0.8rem;color:var(--text-3);white-space:nowrap;">${t('archivedDateLabel')}:</span>
      <input type="date" class="filter-date" id="arch-archived-from" onchange="filterArchive()" title="${t('archivedDateFromTitle')}">
      <span style="color:var(--text-3);">–</span>
      <input type="date" class="filter-date" id="arch-archived-to"   onchange="filterArchive()" title="${t('archivedDateToTitle')}">
    </div>
  </div>
  </div>

  <div id="arch-pagination" style="display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);"></div>

  <div class="table-container desktop-table">
    <div class="table-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--text-2);" id="arch-count">Loading...</span>
        ${canManage ? `
        <div id="arch-bulk-bar" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;">
          <span id="arch-bulk-count" style="font-size:12px;color:var(--text-3);"></span>
          <button class="btn btn-secondary btn-sm" onclick="unarchiveSelected()">↩️ ${t('unarchiveSelectedBtn')}</button>
          ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteSelectedArchived()">🗑 ${t('deleteSelectedBtn')}</button>` : ''}
        </div>` : ''}
      </div>
      ${can('canExport') ? `<button class="btn btn-secondary btn-sm" onclick="exportArchiveExcel()">${ICONS.excelFile} ${t('exportExcelBtn')}</button>
      <button class="btn btn-secondary btn-sm" onclick="exportArchivePDF()">${ICONS.pdfFile} ${t('exportPdfBtn')}</button>` : ''}
      ${canSeeProfit ? `<button class="btn btn-secondary btn-sm" id="arch-profit-toggle-btn" onclick="toggleProfitVisibility()">${isProfitVisible() ? '🙈 ' + t('hideProfitBtn') : '👁 ' + t('showProfitBtn')}</button>` : ''}
    </div>
    <div class="table-footer">
      <span id="arch-summary" style="font-family:var(--mono);font-size:1rem;font-weight:600;"></span>
    </div>
    <div class="table-scroll">
      <table id="arch-table">
        <thead>
          ${archTheadRowHTML(canManage, showProfit, false, false)}
        </thead>
        <tbody id="arch-tbody"></tbody>
      </table>
    </div>
  </div>
  <div class="mobile-cards" id="arch-mobile"></div>`;

  window._allArchShips = ships;
  filterArchive();
}

/** Show a summary in the archive status filter button: all/one/"N selected" — mirrors
 *  updateStatusFilterLabel() on the Shipments page. */
function updateArchStatusFilterLabel(statuses) {
  const el = document.getElementById('arch-status-filter-label');
  if (!el) return;
  if (!statuses.length)      el.textContent = t('allStatuses');
  else if (statuses.length === 1) el.textContent = t(STATUS_CONFIG[statuses[0]].key);
  else el.textContent = `${statuses.length} ${t('selectedLabel')}`;
}

/** Normalize an archived shipment's archivedAt (Firestore Timestamp, Date, or ISO string)
 *  into a plain 'YYYY-MM-DD' string so it can be compared against <input type="date"> values. */
function archivedDateStr(s) {
  let d = s.archivedAt;
  if (!d) return '';
  if (d.seconds) d = new Date(d.seconds * 1000);
  else if (typeof d === 'string') d = new Date(d);
  else if (!(d instanceof Date)) return '';
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Recomputes window._filteredArchShips from window._allArchShips using the current filter
 *  controls — pure filtering, no page reset and no render (see filterArchive()/
 *  archLoadFirestorePage() for the two different ways this gets triggered). In 'paged' mode
 *  window._allArchShips is just the single currently-loaded Firestore page, so filtering
 *  narrows within that page only; in 'all' mode it's the entire archive. */
function applyArchFilters() {
  const searchRaw   = (document.getElementById('arch-search')?.value || '').trim();
  const searchNums  = searchRaw.includes(',')
    ? [...new Set(searchRaw.split(',').map(v => v.trim()).filter(Boolean))]
    : null;
  const search      = searchRaw.toLowerCase();
  const phoneSearch = (document.getElementById('arch-phone-search')?.value || '').trim();
  const statuses    = [...document.querySelectorAll('.arch-status-check:checked')].map(cb => cb.value);
  const company     =  document.getElementById('arch-company-filter')?.value    || '';
  const driver      =  document.getElementById('arch-driver-filter')?.value     || '';
  const contractor  =  document.getElementById('arch-contractor-filter')?.value || '';
  const from        =  document.getElementById('arch-from')?.value || '';
  const to          =  document.getElementById('arch-to')?.value   || '';
  const archFrom    =  document.getElementById('arch-archived-from')?.value || '';
  const archTo      =  document.getElementById('arch-archived-to')?.value   || '';

  updateArchStatusFilterLabel(statuses);

  window._filteredArchShips = (window._allArchShips || []).filter(s => {
    if (searchNums) {
      if (!searchNums.includes(String(s.shipNumber).trim())) return false;
    } else if (search && !(
      (s.shipNumber + '').includes(search) ||
      (s.customerName    || '').toLowerCase().includes(search) ||
      (s.companyName      || '').toLowerCase().includes(search) ||
      (s.driverName       || '').toLowerCase().includes(search) ||
      (s.customerAddress  || '').toLowerCase().includes(search)
    )) return false;
    if (phoneSearch && !(s.customerPhone || '').includes(phoneSearch)) return false;
    if (statuses.length && !statuses.includes(s.status)) return false;
    if (company     && s.companyName    !== company)     return false;
    if (driver      && s.driverName     !== driver)      return false;
    if (contractor  && s.contractorName !== contractor)  return false;
    if (from && s.date < from) return false;
    if (to   && s.date > to)   return false;
    if (archFrom || archTo) {
      const archDate = archivedDateStr(s);
      if (archFrom && (!archDate || archDate < archFrom)) return false;
      if (archTo   && (!archDate || archDate > archTo))   return false;
    }
    return true;
  }); // exact "searched rows" set for export/bulk actions
}

/** Applies the filter controls, then renders. Called on every filter/search input change.
 *  In 'all' mode (admin pressed Show All) a filter change also jumps back to display page 1.
 *  In 'paged' mode the current Firestore page stays put — filtering narrows within it live,
 *  rather than jumping to a different server page just because the search box changed. */
function filterArchive() {
  applyArchFilters();
  if (window._archMode === 'all') window._archCurrentPage = 1;
  renderArchTable();
}

/** Draws the Archive table/summary/pagination from window._filteredArchShips. In 'all' mode
 *  this slices the full filtered set into ARCH_PAGE_SIZE chunks purely in memory. In 'paged'
 *  mode window._filteredArchShips already IS just one Firestore page (optionally narrowed by
 *  filters), so it's shown in full and the page total instead comes from the true archive
 *  count (window._archTotalCount, see archFetchTotalCount()). */
function renderArchTable() {
  const ships       = window._filteredArchShips || [];
  const company     = document.getElementById('arch-company-filter')?.value    || '';
  const driver      = document.getElementById('arch-driver-filter')?.value     || '';
  const contractor  = document.getElementById('arch-contractor-filter')?.value || '';

  const canSeeProfit         = can('canViewProfit');
  const showOurProfit        = canSeeProfit && isProfitVisible();
  const showDriverProfit     = canSeeProfit && !!driver;
  const showContractorProfit = canSeeProfit && !!contractor;
  const canManage   = can('canArchive');
  const canDelete   = can('canDeleteShipments');
  let totalDol = 0, totalLeb = 0, totalProfit = 0, driverProfitTotal = 0, contractorProfitTotal = 0;
  ships.forEach(s => {
    totalDol += shipTotalDollar(s);
    totalLeb += shipTotalLeb(s);
    if (isProfitEligible(s.status)) {
      totalProfit          += s.deliveryProfit         || 0;
      driverProfitTotal     += s.driverDeliveryCost      || 0;
      contractorProfitTotal += s.contractorDeliveryCost  || 0;
    }
  });

  const anyEntityFilterSelected = !!(company || driver || contractor);

  let totalPages, pageShips;
  if (window._archMode === 'all') {
    totalPages = Math.max(1, Math.ceil(ships.length / ARCH_PAGE_SIZE));
    window._archCurrentPage = Math.min(Math.max(1, window._archCurrentPage || 1), totalPages);
    const pageStart = (window._archCurrentPage - 1) * ARCH_PAGE_SIZE;
    pageShips = ships.slice(pageStart, pageStart + ARCH_PAGE_SIZE);
  } else {
    // totalPages here is only ever used for the page LABEL, never to decide whether Next can
    // be clicked — see renderArchPaginationBar()/window._archLastKnownPage for that.
    totalPages = window._archLastKnownPage ?? (window._archTotalCount != null ? Math.ceil(window._archTotalCount / ARCH_PAGE_SIZE) : null);
    pageShips  = ships; // already just this one Firestore page, optionally filtered
  }

  const countEl   = document.getElementById('arch-count');
  const summaryEl = document.getElementById('arch-summary');
  if (countEl)   countEl.textContent   = `${ships.length} ${t('archivedShipments')}`;
  if (summaryEl) {
    if (!anyEntityFilterSelected) {
      summaryEl.textContent = '';
    } else {
      let profitLabel = '', profitValue = 0, profitVisible = false, dueLabel = '';
      if (driver) {
        profitLabel = t('driverProfitLabel'); profitValue = driverProfitTotal; profitVisible = showDriverProfit;
        dueLabel = t('driverDueLabel');
      } else if (contractor) {
        profitLabel = t('contractorProfitLabel'); profitValue = contractorProfitTotal; profitVisible = showContractorProfit;
        dueLabel = t('contractorDueLabel');
      } else if (company) {
        profitLabel = t('profitF'); profitValue = totalProfit; profitVisible = showOurProfit;
        dueLabel = t('companyDueLabel');
      }
      summaryEl.innerHTML = shipSummaryLineHTML({
        totalDol, totalLeb, profitLabel, profitValue, profitVisible, dueLabel,
        withdrawnDol: 0, withdrawnLeb: 0, withdrawnCount: 0
      });
    }
  }

  const thead = document.querySelector('#arch-table thead');
  if (thead) thead.innerHTML = archTheadRowHTML(canManage, showOurProfit, showDriverProfit, showContractorProfit);

  const colCount = (canManage ? 1 : 0) + 11 + (showOurProfit?1:0) + (showDriverProfit?1:0) + (showContractorProfit?1:0);


  const tbody  = document.getElementById('arch-tbody');
  const mobile = document.getElementById('arch-mobile');
  if (tbody) {
    window._selectedArchIds = window._selectedArchIds || new Set();
    tbody.innerHTML = pageShips.length
      ? pageShips.map(s => `
    <tr>
      ${canManage ? `<td style="text-align:center;"><input type="checkbox" class="arch-row-check" value="${s.id}" ${window._selectedArchIds.has(s.id) ? 'checked' : ''} onchange="toggleArchRowCheck('${s.id}', this.checked)"></td>` : ''}
      <td class="font-mono" style="color:var(--brand-light);font-weight:600;">#${s.shipNumber || '—'}</td>
      <td>${esc(s.customerName || '—')}</td>
      <td style="max-width:180px;white-space:normal;">${esc(s.customerAddress || '—')}</td>
      <td>${esc(s.companyName  || '—')}</td>
      <td>${esc(s.driverName   || '—')}</td>
      <td>${esc(s.contractorName || '—')}</td>
      <td class="font-mono">$${formatNum(s.priceDollar || 0)}</td>
      <td class="font-mono">${formatNum(s.priceLeb || 0)}</td>
      ${showOurProfit        ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.deliveryProfit || 0)}</td>` : ''}
      ${showDriverProfit     ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.driverDeliveryCost || 0)}</td>` : ''}
      ${showContractorProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.contractorDeliveryCost || 0)}</td>` : ''}
      <td>${statusBadge(s.status)}</td>
      <td style="color:var(--text-3);font-size:12px;">${fmtDate(s.date)}</td>
      <td style="color:var(--text-3);font-size:12px;">${fmtDate(s.archivedAt)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="viewShipmentArchive('${s.id}')" title="${t('view')}">👁</button>
          ${canManage ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="unarchiveShipment('${s.id}')" title="${t('unarchiveBtn')}">↩️</button>` : ''}
          ${canDelete ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteArchivedShipment('${s.id}')" title="${t('deleteBtn')}">🗑</button>` : ''}
        </div>
      </td>
    </tr>`).join('')
      : `<tr><td colspan="${colCount}" class="table-empty"><div class="empty-icon">🗄️</div><p>Archive is empty</p></td></tr>`;
  }
  if (mobile) mobile.innerHTML = pageShips.map(s => mobileShipCard(s)).join('');

  renderArchPaginationBar(totalPages);
  updateArchSelectionUI();
}

/** Prev/Next + page indicator, plus an admin-only Show All / back-to-paged control.
 *  Arrow glyphs are swapped relative to their literal "back"/"forward" meaning because the
 *  page reads right-to-left: Prev (السابق, on the right) points ▶ toward the start of the
 *  list, Next (التالي, on the left) points ◀ onward — matching how RTL readers expect
 *  navigation arrows to point.
 *  Next's enabled/disabled state comes from window._archLastKnownPage (ground truth from an
 *  actual Firestore fetch), NOT from the passed-in totalPages label, which in 'paged' mode is
 *  only an approximate count() estimate — Next must keep working even if that estimate is
 *  off or "Show all" was never pressed. */
function renderArchPaginationBar(totalPages) {
  const bar = document.getElementById('arch-pagination');
  if (!bar) return;
  const page = window._archCurrentPage || 1;
  const showAllControl = can('canManageUsers')
    ? (window._archMode === 'all'
        ? `<button class="btn btn-secondary btn-sm" onclick="exitArchShowAllMode()" style="margin-inline-start:12px;">↩️ ${t('backToPagedBtn')}</button>`
        : `<button class="btn btn-secondary btn-sm" id="arch-show-all-btn" onclick="showAllArchive()" style="margin-inline-start:12px;">📋 ${t('showAllBtn')}</button>`)
    : '';
  const isLastPage = window._archMode === 'all'
    ? page >= totalPages
    : (window._archLastKnownPage != null && page >= window._archLastKnownPage);
  const pageLabel = totalPages != null
    ? t('pageOfLabel').replace('{page}', page).replace('{total}', totalPages)
    : t('pageLabel').replace('{page}', page);
  bar.innerHTML = `
    <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="goToArchPage(${page - 1})">▶ ${t('prevPageBtn')}</button>
    <span style="font-size:12px;color:var(--text-3);">${pageLabel}</span>
    <button class="btn btn-secondary btn-sm" ${isLastPage ? 'disabled' : ''} onclick="goToArchPage(${page + 1})">◀ ${t('nextPageBtn')}</button>
    ${showAllControl}
  `;
}

/** Move to another page. In 'all' mode this just re-slices the already-fully-loaded set
 *  (no Firestore call). In 'paged' mode it always fetches that page directly from Firestore
 *  (or reuses the cache if it was already visited this session) — this is exactly the "next
 *  100 orders" jump, independent of whether Show All has ever been used. */
async function goToArchPage(page) {
  if (page < 1) return;
  if (window._archMode === 'all') {
    const totalPages = Math.max(1, Math.ceil((window._filteredArchShips || []).length / ARCH_PAGE_SIZE));
    window._archCurrentPage = Math.min(Math.max(1, page), totalPages);
    renderArchTable();
    return;
  }
  await archLoadFirestorePage(page);
}

/** Clear every filter/search control on the Archive page and re-apply — mirrors
 *  resetShipmentFilters() on the Shipments page. */
function resetArchiveFilters() {
  const searchEl = document.getElementById('arch-search');
  if (searchEl) searchEl.value = '';
  const phoneEl = document.getElementById('arch-phone-search');
  if (phoneEl) phoneEl.value = '';
  document.querySelectorAll('.arch-status-check').forEach(cb => { cb.checked = false; });
  const company    = document.getElementById('arch-company-filter');
  const driver     = document.getElementById('arch-driver-filter');
  const contractor = document.getElementById('arch-contractor-filter');
  const dateFrom   = document.getElementById('arch-from');
  const dateTo     = document.getElementById('arch-to');
  const archFrom   = document.getElementById('arch-archived-from');
  const archTo     = document.getElementById('arch-archived-to');
  if (company)    company.value    = '';
  if (driver)     driver.value     = '';
  if (contractor) contractor.value = '';
  if (dateFrom)   dateFrom.value   = '';
  if (dateTo)     dateTo.value     = '';
  if (archFrom)   archFrom.value   = '';
  if (archTo)     archTo.value     = '';
  filterArchive();
}

// ===== ROW SELECTION (Archive table) — mirrors the Shipments table's selection logic =====

function toggleArchRowCheck(id, checked) {
  window._selectedArchIds = window._selectedArchIds || new Set();
  if (checked) window._selectedArchIds.add(id);
  else window._selectedArchIds.delete(id);
  updateArchSelectionUI();
}

/** Header "select all" checkbox — selects/deselects every row currently visible in the table. */
function toggleSelectAllArchived(el) {
  window._selectedArchIds = window._selectedArchIds || new Set();
  const checked = el.checked;
  document.querySelectorAll('#arch-tbody .arch-row-check').forEach(cb => {
    cb.checked = checked;
    if (checked) window._selectedArchIds.add(cb.value);
    else window._selectedArchIds.delete(cb.value);
  });
  updateArchSelectionUI();
}

function updateArchSelectionUI() {
  window._selectedArchIds = window._selectedArchIds || new Set();

  const rowChecks = [...document.querySelectorAll('#arch-tbody .arch-row-check')];
  const total = rowChecks.length;
  const checkedCount = rowChecks.filter(cb => cb.checked).length;

  const selectAll = document.getElementById('arch-select-all');
  if (selectAll) {
    selectAll.checked = total > 0 && checkedCount === total;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < total;
  }

  const n = window._selectedArchIds.size;
  const bar = document.getElementById('arch-bulk-bar');
  if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
  const countEl = document.getElementById('arch-bulk-count');
  if (countEl) countEl.textContent = `${n} ${t('selectedLabel')}`;
}

// ===== REVERSE ARCHIVE (send back to Orders) =====

/** Move one archived order back into the active Shipments list, dropping the
 *  archive-only archivedAt/archivedBy fields so it looks like a normal shipment again. */
async function unarchiveShipment(id) {
  if (!can('canArchive')) { toast(t('noPermission'), 'error'); return; }
  confirmAction(t('unarchiveConfirmTitle'), t('unarchiveConfirmMsg'), async () => {
    try {
      if (db) {
        const doc = await db.collection('sonick_archive').doc(id).get();
        if (doc.exists) {
          const { archivedAt, archivedBy, ...data } = doc.data();
          await db.collection('sonick_shipments').doc(id).set(data);
          await db.collection('sonick_archive').doc(id).delete();
          archCounterAdjust(-1);
        }
      }
      toast(t('orderUnarchived'), 'success');
      window._selectedArchIds?.delete(id);
      await refreshArchiveData();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Bulk-unarchive every currently selected archived order (or all, if "select all" was used)
 *  back into the active Orders/Shipments list — behind a confirm dialog. */
async function unarchiveSelected() {
  if (!can('canArchive')) { toast(t('noPermission'), 'error'); return; }
  const ids = [...(window._selectedArchIds || [])];
  if (!ids.length) return;

  confirmAction(t('unarchiveConfirmTitle'), `${t('unarchiveGroupConfirmMsg')} (${ids.length}).`, async () => {
    try {
      if (db) {
        const docs = await Promise.all(ids.map(id => db.collection('sonick_archive').doc(id).get()));
        const CHUNK = 200; // set+delete = 2 writes/doc, stay well under Firestore's 500-write batch limit
        for (let i = 0; i < docs.length; i += CHUNK) {
          const batch = db.batch();
          let chunkCount = 0;
          docs.slice(i, i + CHUNK).forEach(doc => {
            if (!doc.exists) return;
            const { archivedAt, archivedBy, ...data } = doc.data();
            batch.set(db.collection('sonick_shipments').doc(doc.id), data);
            batch.delete(db.collection('sonick_archive').doc(doc.id));
            chunkCount++;
          });
          if (chunkCount) batch.set(archCounterDocRef(), { archivedCount: firebase.firestore.FieldValue.increment(-chunkCount) }, { merge: true });
          await batch.commit();
        }
      }
      toast(`${ids.length} ${t('ordersUnarchivedLabel')}`, 'success');
      window._selectedArchIds = new Set();
      await refreshArchiveData();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===== PERMANENT DELETE (Archive table) =====

async function deleteArchivedShipment(id) {
  if (!can('canDeleteShipments')) { toast(t('noPermission'), 'error'); return; }
  confirmAction(t('deleteArchivedConfirm'), t('cannotUndo'), async () => {
    try {
      if (db) await db.collection('sonick_archive').doc(id).delete();
      archCounterAdjust(-1);
      toast(t('archivedOrderDeleted'), 'success');
      window._selectedArchIds?.delete(id);
      await refreshArchiveData();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Permanently delete every currently selected archived order (or all, if "select all" was
 *  used) — behind a confirm dialog, same as the single-row delete. */
async function deleteSelectedArchived() {
  if (!can('canDeleteShipments')) { toast(t('noPermission'), 'error'); return; }
  const ids = [...(window._selectedArchIds || [])];
  if (!ids.length) return;

  confirmAction(t('deleteArchivedConfirm'), `${t('cannotUndo')} (${ids.length})`, async () => {
    try {
      if (db) {
        const CHUNK = 400; // delete-only = 1 write/doc
        for (let i = 0; i < ids.length; i += CHUNK) {
          const batch = db.batch();
          const chunkIds = ids.slice(i, i + CHUNK);
          chunkIds.forEach(id => batch.delete(db.collection('sonick_archive').doc(id)));
          batch.set(archCounterDocRef(), { archivedCount: firebase.firestore.FieldValue.increment(-chunkIds.length) }, { merge: true });
          await batch.commit();
        }
      }
      toast(`${ids.length} ${t('archivedOrdersDeletedLabel')}`, 'success');
      window._selectedArchIds = new Set();
      await refreshArchiveData();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

async function viewShipmentArchive(id) {
  let s = (window._allArchShips || []).find(x => x.id === id);
  if (!s && db) {
    try { const doc = await db.collection('sonick_archive').doc(id).get(); if (doc.exists) s = { id, ...doc.data() }; } catch (e) {}
  }
  if (!s) return;
  const showProfit = can('canViewProfit');
  document.getElementById('modal-detail-title').textContent = `${t('shipmentDetails')} #${s.shipNumber || id}`;
  document.getElementById('modal-detail-body').innerHTML = `
  <div class="detail-grid" style="margin-bottom:16px;">
    <div class="detail-field"><div class="detail-label">Ship #</div><div class="detail-value font-mono" style="color:var(--brand-light);font-size:18px;font-weight:700;">#${s.shipNumber || '—'}</div></div>
    <div class="detail-field"><div class="detail-label">${t('status')}</div><div class="detail-value">${statusBadge(s.status)}</div></div>
    <div class="detail-field"><div class="detail-label">${t('orderTypeLabel')}</div><div class="detail-value">${orderTypeBadge(s.orderType || 'Normal')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('customer')}</div><div class="detail-value">${esc(s.customerName || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('company')}</div><div class="detail-value">${esc(s.companyName  || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('driver')}</div><div class="detail-value">${esc(s.driverName   || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('date')}</div><div class="detail-value">${fmtDate(s.date)}</div></div>
    <div class="detail-field"><div class="detail-label">${t('archivedDateCol')}</div><div class="detail-value">${fmtDate(s.archivedAt)}</div></div>
  </div>
  <div class="financial-summary">
    <div class="fin-item"><div class="fin-label">${t('priceUSD')}</div><div class="fin-value">$${formatNum(s.priceDollar || 0)}</div></div>
    <div class="fin-item"><div class="fin-label">${t('priceLL')}</div><div class="fin-value">${formatNum(s.priceLeb || 0)} LL</div></div>
    ${showProfit ? `<div class="fin-item"><div class="fin-label">${t('profitF')}</div><div class="fin-value positive">$${formatNum(s.deliveryProfit || 0)}</div></div>` : ''}
  </div>`;
  document.getElementById('modal-detail-footer').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('modal-detail')">${t('close')}</button>`;
  openModal('modal-detail');
}

// ===================================================
//  DEBTS & PAYMENTS
// ===================================================
/** Canonical stored values for a payment's `type` field, mapped to their i18n label key.
 *  Keeps the DB value itself language-independent (always "Payment"/"Advance"/etc.) while
 *  both the Type <select> options and the table's badge display show the current language. */
const PAYMENT_TYPE_CONFIG = {
  Payment:    { key: 'paymentTypePayment'    },
  Advance:    { key: 'paymentTypeAdvance'    },
  Refund:     { key: 'paymentTypeRefund'     },
  Adjustment: { key: 'paymentTypeAdjustment' },
};

/** Translated label for a payment's type — falls back to the raw stored value (then a
 *  generic "Payment") for any legacy/unrecognized type, mirroring statusBadge()'s fallback. */
function paymentTypeLabel(type) {
  const cfg = PAYMENT_TYPE_CONFIG[type];
  return cfg ? t(cfg.key) : (type || t('paymentTypePayment'));
}

async function renderDebts() {
  if (!can('canViewDebts')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let flows = [];
  try {
    if (db) {
      const snap = await db.collection('sonick_payments').orderBy('date', 'desc').limit(300).get();
      flows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { flows = getDemoPayments(); }

  let totalIn = 0, totalOut = 0;
  flows.forEach(f => { if (f.direction > 0) totalIn += f.amount; else totalOut += f.amount; });
  const balance = totalIn - totalOut;

  content.innerHTML = `
  ${pageHeader(t('debtsPayments'), [t('finance')], can('canViewFinance') ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal()">${t('recordPayment')}</button>` : '')}
  <div class="stats-grid" style="margin-bottom:24px;">
    <div class="stat-card green"><div class="stat-icon green">${ICONS.inbox}</div><div class="stat-label">${t('totalReceived')}</div><div class="stat-value mono">$${formatNum(totalIn)}</div></div>
    <div class="stat-card brand"><div class="stat-icon brand">${ICONS.send}</div><div class="stat-label">${t('totalPaidOut')}</div><div class="stat-value mono">$${formatNum(totalOut)}</div></div>
    <div class="stat-card ${balance >= 0 ? 'green' : 'brand'}"><div class="stat-icon ${balance >= 0 ? 'green' : 'brand'}">${balance >= 0 ? ICONS.checkCircle : ICONS.alertTriangle}</div><div class="stat-label">${t('balance')}</div><div class="stat-value mono">$${formatNum(Math.abs(balance))}</div></div>
  </div>
  <div class="table-container">
    <div class="table-header">
      <span class="card-title">${esc(t('paymentRecordsTitle'))}</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>${t('date')}</th><th>${t('entity')}</th><th>${t('typeCol')}</th>
          <th>${t('amountUSDCol')}</th><th>${t('directionCol')}</th><th>${t('paymentNote')}</th>
          ${can('canDeleteShipments') ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${flows.map(f => `
          <tr>
            <td style="color:var(--text-3);font-size:12px;">${fmtDate(f.date)}</td>
            <td><strong>${esc(f.entityName || '—')}</strong></td>
            <td><span class="badge badge-gray">${esc(paymentTypeLabel(f.type))}</span></td>
            <td class="font-mono" style="color:${f.direction > 0 ? 'var(--green)' : 'var(--red)'};">$${formatNum(f.amount || 0)}</td>
            <td>${f.direction > 0 ? `<span class="badge badge-green">${t('dirIn')}</span>` : `<span class="badge badge-red">${t('dirOut')}</span>`}</td>
            <td style="color:var(--text-3);font-size:12px;">${esc(f.notes || '')}</td>
            ${can('canDeleteShipments') ? `<td><button class="btn btn-danger btn-sm btn-icon" onclick="deletePayment('${f.id}')">🗑</button></td>` : ''}
          </tr>`).join('') || `<tr><td colspan="7" class="table-empty"><div class="empty-icon">💰</div><p>${esc(t('noPaymentsRecorded'))}</p></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function openPaymentModal() {
  const comps = companies_cache.map(c => `<option value="${c.id}">[${esc(t('companiesEntityPrefix'))}] ${esc(c.name)}</option>`).join('');
  const drvs  = drivers_cache.map(d  => `<option value="${d.id}">[${esc(t('driversEntityPrefix'))}] ${esc(d.name)}</option>`).join('');
  const ctrs  = contractors_cache.map(c => `<option value="${c.id}">[${esc(t('contractorsEntityPrefix'))}] ${esc(c.name)}</option>`).join('');
  const typeOptions = Object.keys(PAYMENT_TYPE_CONFIG).map(k => `<option value="${k}">${esc(t(PAYMENT_TYPE_CONFIG[k].key))}</option>`).join('');
  document.getElementById('modal-payment-title').textContent      = t('recordPaymentTitle');
  document.getElementById('modal-payment-cancel-btn').textContent = t('cancel');
  document.getElementById('modal-payment-save-btn').textContent   = t('recordPaymentTitle');
  document.getElementById('modal-payment-body').innerHTML = `
  <div class="form-group">
    <label class="form-label">${t('entity')}</label>
    <select id="p-entity" class="form-select" onchange="setEntityName()">
      <option value="">${esc(t('selectPlaceholderDash'))}</option>${comps}${drvs}${ctrs}
    </select>
  </div>
  <input type="hidden" id="p-entity-name">
  <div class="form-row">
    <div class="form-group"><label class="form-label">${t('amountUSDCol')}</label><input type="number" step="0.01" id="p-amount" class="form-input" placeholder="0.00"></div>
    <div class="form-group"><label class="form-label">${t('directionCol')}</label>
      <select id="p-direction" class="form-select">
        <option value="1">${esc(t('directionIncoming'))}</option>
        <option value="-1">${esc(t('directionOutgoing'))}</option>
      </select>
    </div>
  </div>
  <div class="form-group"><label class="form-label">${t('typeCol')}</label>
    <select id="p-type" class="form-select">
      ${typeOptions}
    </select>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">${t('date')}</label><input type="date" id="p-date" class="form-input" value="${today()}"></div>
    <div class="form-group"><label class="form-label">${t('paymentNote')}</label><input type="text" id="p-notes" class="form-input" placeholder="${esc(t('optionalNotePlaceholder'))}"></div>
  </div>`;
  openModal('modal-payment');
}

function setEntityName() {
  const sel = document.getElementById('p-entity');
  const opt = sel.options[sel.selectedIndex];
  document.getElementById('p-entity-name').value = opt.text.replace(/^\[.*?\] /, '');
}

async function savePayment() {
  const entityId   = document.getElementById('p-entity')?.value;
  const entityName = document.getElementById('p-entity-name')?.value;
  const amount     = parseFloat(document.getElementById('p-amount')?.value) || 0;
  const direction  = parseInt(document.getElementById('p-direction')?.value) || 1;
  const type       = document.getElementById('p-type')?.value  || 'Payment';
  const date       = document.getElementById('p-date')?.value  || today();
  const notes      = document.getElementById('p-notes')?.value || '';
  if (!entityId || !amount) { toast(t('entityRequired'), 'error'); return; }
  try {
    const payload = {
      entityId, entityName, amount, direction, type, date, notes,
      createdAt: (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
      createdBy: currentUserData?.id
    };
    if (db) await db.collection('sonick_payments').add(payload);
    toast(t('paymentRecorded'), 'success');
    closeModal('modal-payment');
    renderDebts();
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

async function deletePayment(id) {
  confirmAction('Delete this payment record?', '', async () => {
    try {
      if (db) await db.collection('sonick_payments').doc(id).delete();
      toast(t('deleted'), 'success');
      renderDebts();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===================================================
//  PER-ENTITY GENERAL REPORT POPUP (from Shipments page filters)
// ===================================================
/** Opens a modal showing the same figures as the General Report page's By Driver/By
 *  Contractor/By Company table, but for just the single entity currently selected in the
 *  Shipments page filters — computed from window._filteredShips, i.e. exactly the rows
 *  currently shown on screen (respecting the date/status filters too, not just the entity). */
function openEntityGeneralReport() {
  const sel = window._entityReportSelection;
  if (!sel) return;
  const ships = window._filteredShips || [];
  const showProfit = can('canViewProfit');

  let count = 0, dol = 0, leb = 0, second = 0; // second = driver/contractor cost, or company profit
  const statusCounts = {};
  ships.forEach(s => {
    const st = STATUS_CONFIG[s.status] ? s.status : 'Pending';
    count++;
    dol += shipTotalDollar(s);
    leb += shipTotalLeb(s);
    if (isProfitEligible(s.status)) {
      if (sel.type === 'driver')          second += s.driverDeliveryCost      || 0;
      else if (sel.type === 'contractor') second += s.contractorDeliveryCost  || 0;
      else                                 second += s.deliveryProfit          || 0;
    }
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });

  const cols = sel.type === 'driver'
    ? { entityLabel: t('driver'), income: t('driverIncomeCol'), profit: t('driverProfitCol'), due: t('driverTotalCol'), dueLeb: t('driverTotalColLeb') }
    : sel.type === 'contractor'
    ? { entityLabel: t('contractor'), income: t('contractorIncomeCol'), profit: t('contractorProfitCol'), due: t('contractorTotalCol'), dueLeb: t('contractorTotalColLeb') }
    : { entityLabel: t('company'), income: t('companyOutcomeCol'), profit: t('companyProfitCol'), due: t('companyTotalCol'), dueLeb: t('companyTotalColLeb') };

  document.getElementById('modal-entity-report-title').textContent = `${t('generalReportBtn')} — ${sel.name}`;
  document.getElementById('modal-entity-report-body').innerHTML = `
  <div class="table-container">
    <table class="report-fit-table"><thead><tr>
      <th>${cols.entityLabel}</th><th>${t('count')}</th><th>${t('statusBreakdownCol')}</th><th>${cols.income}</th>
      ${showProfit ? `<th>${cols.profit}</th><th>${cols.due}</th>` : ''}
      ${leb ? `<th>${cols.dueLeb}</th>` : ''}
    </tr></thead><tbody>
      <tr>
        <td><strong>${esc(sel.name)}</strong></td>
        <td class="font-mono">${count}</td>
        <td>${statusBreakdownCell(statusCounts)}</td>
        <td class="font-mono">$${formatNum(dol)}</td>
        ${showProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(second)}</td><td class="font-mono">$${formatNum(dol - second)}</td>` : ''}
        ${leb ? `<td class="font-mono">${formatNum(leb)}</td>` : ''}
      </tr>
    </tbody></table>
  </div>`;
  openModal('modal-entity-report');
}

// ===================================================
//  GENERAL REPORT
// ===================================================
let _mergedReportCollapsed = true; // Merged Company/Contractor section starts shrunk on the General Report page; persists across renderGeneral() re-renders (module-level, not reset per render)
let _reportSectionsCollapsed = { driver: true, contractor: true, company: true }; // By Driver/Contractor/Company sections start shrunk too, same as the merged section; persists across renderGeneral() re-renders
let _statementSectionsCollapsed = { driver: true, company: true }; // Driver / Companies&Contractors sections on the General Statement page start shrunk too, same convention; persists across renderGeneralStatement() re-renders

/** Fetch shipments and build the full company/driver/contractor breakdown used by both the
 *  General Report page (renderGeneral) and the General Statement page (renderGeneralStatement),
 *  plus their Excel/PDF/Settlement exports (js/ui.js) — all read from window._generalReportData
 *  rather than recomputing it themselves. Kept as one shared function so the two pages and every
 *  export always agree on the same figures. */
async function computeGeneralReportData() {
  let ships = [];
  try {
    if (db) { const snap = await db.collection('sonick_shipments').get(); ships = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
  } catch (e) { ships = getDemoShipments(); }

  const byCompany = {}, byDriver = {}, byContractor = {};
  ships.forEach(s => {
    const st = STATUS_CONFIG[s.status] ? s.status : 'Pending';
    const dollarContribution = shipTotalDollar(s);
    const lebContribution    = shipTotalLeb(s);
    const profitEligible     = isProfitEligible(s.status);

    const ck = s.companyName || 'Unknown';
    if (!byCompany[ck]) byCompany[ck] = { count: 0, dol: 0, leb: 0, profit: 0, delivered: 0, statusCounts: {} };
    byCompany[ck].count++;
    byCompany[ck].dol    += dollarContribution;
    byCompany[ck].leb    += lebContribution;
    if (profitEligible) byCompany[ck].profit += s.deliveryProfit || 0;
    if (s.status === 'Delivered') byCompany[ck].delivered++;
    byCompany[ck].statusCounts[st] = (byCompany[ck].statusCounts[st] || 0) + 1;

    const dk = s.driverName || '—';
    if (!byDriver[dk]) byDriver[dk] = { count: 0, dol: 0, leb: 0, cost: 0, statusCounts: {} };
    byDriver[dk].count++; byDriver[dk].dol += dollarContribution; byDriver[dk].leb += lebContribution;
    if (profitEligible) byDriver[dk].cost += s.driverDeliveryCost || 0;
    byDriver[dk].statusCounts[st] = (byDriver[dk].statusCounts[st] || 0) + 1;

    const ctk = s.contractorName || '—';
    if (!byContractor[ctk]) byContractor[ctk] = { count: 0, dol: 0, leb: 0, cost: 0, statusCounts: {} };
    byContractor[ctk].count++; byContractor[ctk].dol += dollarContribution; byContractor[ctk].leb += lebContribution;
    if (profitEligible) byContractor[ctk].cost += s.contractorDeliveryCost || 0;
    byContractor[ctk].statusCounts[st] = (byContractor[ctk].statusCounts[st] || 0) + 1;
  });

  // Lebanese Lira "amount due" figures only make sense for entities that actually have
  // LL-priced orders — driver/contractor/company delivery costs are always tracked in $,
  // so there's no LL cost to net out; the LL amount due is simply the LL revenue collected
  // through that entity. Only show the LL columns per table when at least one entry has some.
  const driverHasLeb     = Object.values(byDriver).some(v => v.leb);
  const contractorHasLeb = Object.values(byContractor).some(v => v.leb);
  const companyHasLeb    = Object.values(byCompany).some(v => v.leb);

  const showProfit = can('canViewProfit');
  const totalDol   = ships.reduce((a, s) => a + shipTotalDollar(s), 0);
  const totalLeb   = ships.reduce((a, s) => a + shipTotalLeb(s), 0);
  const companyProfit       = ships.reduce((a, s) => a + (isProfitEligible(s.status) ? (s.deliveryProfit || 0) : 0), 0);
  const totalDriverCost     = ships.reduce((a, s) => a + (isProfitEligible(s.status) ? (s.driverDeliveryCost      || 0) : 0), 0);
  const totalContractorCost = ships.reduce((a, s) => a + (isProfitEligible(s.status) ? (s.contractorDeliveryCost  || 0) : 0), 0);
  const netProfit = companyProfit - totalDriverCost - totalContractorCost;

  const sumRows = (entries) => {
    const out = { count: 0, dol: 0, leb: 0, second: 0, statusCounts: {} };
    entries.forEach(([, v]) => {
      out.count += v.count;
      out.dol   += v.dol;
      out.leb   += v.leb || 0;
      out.second += (v.cost !== undefined ? v.cost : v.profit) || 0;
      Object.entries(v.statusCounts || {}).forEach(([st, n]) => { out.statusCounts[st] = (out.statusCounts[st] || 0) + n; });
    });
    return out;
  };

  // Income = the "Amount Due to Company" total (company revenue minus our profit share).
  // Outcome = "Amount Due from Driver" + "Amount Due from Contractor" totals combined — the
  // same figures already shown in the tables' footer rows below, just added together here.
  // NOTE: these were previously assigned backwards (income showed the driver/contractor
  // figure and outcome showed the company figure) — swapped here to match the definitions
  // above, with card order/labels left exactly where they were originally.
  const companySum    = sumRows(Object.entries(byCompany));
  const driverSum      = sumRows(Object.entries(byDriver).filter(([k]) => k !== '—'));
  const contractorSum  = sumRows(Object.entries(byContractor).filter(([k]) => k !== '—'));
  const incomeDol  = (driverSum.dol - driverSum.second) + (contractorSum.dol - contractorSum.second);
  const incomeLeb  = driverSum.leb + contractorSum.leb;
  const outcomeDol = companySum.dol - companySum.second;
  const outcomeLeb = companySum.leb;

  // ── Merged Company/Contractor reconciliation ──
  // Some institutes act as BOTH a client company (they ship orders through us, so we owe
  // them their share) AND a delivery contractor (they also deliver for us, so they owe us
  // their collections minus their fee) — e.g. the same "Hajar speed drop" name can appear
  // in both the By Company and By Contractor tables above. Left as two separate rows, it's
  // easy to miss that the two amounts should really be netted against each other into one
  // settlement. Only meaningful with profit visibility, since it's built from the
  // profit/cost figures those tables already compute.
  const mergedNames = showProfit
    ? Object.keys(byCompany).filter(name => name !== '—' && byContractor[name])
    : [];
  const mergedEntries = mergedNames.map(name => {
    const c = byCompany[name], k = byContractor[name];
    const companyProfit = c.profit || 0;
    const companyDue    = c.dol - companyProfit;  // amount WE owe THEM, as their delivery company
    const contractorFee = k.cost || 0;
    const contractorDue = k.dol - contractorFee;  // amount THEY owe US, as our delivery contractor
    return {
      name, companyCount: c.count, contractorCount: k.count,
      companyRevenue: c.dol, companyProfit, companyDue,
      contractorRevenue: k.dol, contractorFee, contractorDue,
      netSettlement: companyDue - contractorDue,  // >0: we owe them net; <0: they owe us net
      netProfit: companyProfit - contractorFee,   // our profit from this institute, both roles combined
    };
  }).sort((a, b) => Math.abs(b.netSettlement) - Math.abs(a.netSettlement));
  const mergedTotalNet    = mergedEntries.reduce((a, e) => a + e.netSettlement, 0);
  const mergedTotalProfit = mergedEntries.reduce((a, e) => a + e.netProfit, 0);

  // Stashed for exportGeneralReportExcel()/exportGeneralReportPDF() (js/ui.js), which have
  // no DB access of their own and need this same computed breakdown to build the export.
  window._generalReportData = {
    totalShipments: ships.length, showProfit,
    byDriver, byContractor, byCompany,
    driverHasLeb, contractorHasLeb, companyHasLeb,
    driverSum, contractorSum, companySum,
    incomeDol, incomeLeb, outcomeDol, outcomeLeb, netProfit,
    mergedEntries, mergedTotalNet, mergedTotalProfit,
  };

  return {
    ships, byCompany, byDriver, byContractor,
    driverHasLeb, contractorHasLeb, companyHasLeb, showProfit,
    totalDol, totalLeb, companyProfit, totalDriverCost, totalContractorCost, netProfit,
    sumRows, companySum, driverSum, contractorSum,
    incomeDol, incomeLeb, outcomeDol, outcomeLeb,
    mergedEntries, mergedTotalNet, mergedTotalProfit,
  };
}

async function renderGeneral() {
  if (!can('canViewGeneral')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  const {
    ships, byCompany, byDriver, byContractor,
    driverHasLeb, contractorHasLeb, companyHasLeb, showProfit,
    netProfit, sumRows, incomeDol, incomeLeb, outcomeDol, outcomeLeb,
    mergedEntries, mergedTotalNet, mergedTotalProfit,
  } = await computeGeneralReportData();

  const mergedSectionHTML = mergedEntries.length ? `
  <div class="merged-report">
    <div class="merged-report-intro" style="cursor:pointer;" onclick="toggleMergedReportSection()">
      <div class="merged-report-intro-icon">🔗</div>
      <div style="flex:1;">
        <div class="merged-report-intro-title">${t('mergedTitle')}</div>
        <div class="merged-report-intro-sub">${t('mergedSubtitle')}</div>
      </div>
      <span id="merged-report-toggle-icon" style="display:inline-block;font-size:1.2rem;transition:transform var(--transition);transform:rotate(${_mergedReportCollapsed ? '0' : '180'}deg);">▾</span>
    </div>
    <div id="merged-report-body" style="display:${_mergedReportCollapsed ? 'none' : 'block'};">
    <div class="merged-cards-grid">
      ${mergedEntries.map(e => {
        const settleClass = e.netSettlement > 0.005 ? 'owe-them' : (e.netSettlement < -0.005 ? 'owe-us' : 'even');
        const settleLabel = e.netSettlement > 0.005 ? t('mergedNetOwedToThem') : (e.netSettlement < -0.005 ? t('mergedNetOwedToUs') : t('mergedNetEven'));
        const settleIcon  = e.netSettlement > 0.005 ? '↑' : (e.netSettlement < -0.005 ? '↓' : '•');
        return `
        <div class="merged-card">
          <div class="merged-card-head">
            <div class="merged-card-name">🏢 ${esc(e.name)}</div>
            <span class="merged-card-badge">${t('mergedBadge')}</span>
          </div>
          <div class="merged-card-body">
            <div class="merged-role-col">
              <div class="merged-role-label company">🏬 ${t('mergedAsCompany')}</div>
              <div class="merged-role-row"><span>${t('mergedOrders')}</span><span>${e.companyCount}</span></div>
              <div class="merged-role-row"><span>${t('mergedRevenue')}</span><span>$${formatNum(e.companyRevenue)}</span></div>
              <div class="merged-role-row"><span>${t('mergedOurProfit')}</span><span style="color:var(--green);">$${formatNum(e.companyProfit)}</span></div>
              <div class="merged-role-row"><span>${t('mergedWeOwe')}</span><span>$${formatNum(e.companyDue)}</span></div>
            </div>
            <div class="merged-role-col">
              <div class="merged-role-label contractor">🚚 ${t('mergedAsContractor')}</div>
              <div class="merged-role-row"><span>${t('mergedOrders')}</span><span>${e.contractorCount}</span></div>
              <div class="merged-role-row"><span>${t('mergedRevenue')}</span><span>$${formatNum(e.contractorRevenue)}</span></div>
              <div class="merged-role-row"><span>${t('mergedTheirFee')}</span><span style="color:var(--purple);">$${formatNum(e.contractorFee)}</span></div>
              <div class="merged-role-row"><span>${t('mergedTheyOwe')}</span><span>$${formatNum(e.contractorDue)}</span></div>
            </div>
          </div>
          <div class="merged-settlement ${settleClass}">
            <span class="merged-settlement-label">${settleIcon} ${settleLabel}</span>
            <span class="merged-settlement-value">$${formatNum(Math.abs(e.netSettlement))}</span>
          </div>
          <div class="merged-profit-note">💰 ${t('mergedNetProfitNote')} <strong>$${formatNum(e.netProfit)}</strong></div>
        </div>`;
      }).join('')}
    </div>
    ${mergedEntries.length > 1 ? `
    <div class="merged-summary-strip">
      <div class="merged-summary-item"><div class="label">${t('mergedSummaryTitle')}</div></div>
      <div class="merged-summary-item">
        <div class="label">${t('mergedSummaryNet')}</div>
        <div class="value" style="color:${mergedTotalNet > 0.005 ? 'var(--red)' : (mergedTotalNet < -0.005 ? 'var(--green)' : 'var(--text-2)')};">
          $${formatNum(Math.abs(mergedTotalNet))}${mergedTotalNet > 0.005 ? ` (${t('mergedNetOwedToThem')})` : (mergedTotalNet < -0.005 ? ` (${t('mergedNetOwedToUs')})` : '')}
        </div>
      </div>
      <div class="merged-summary-item">
        <div class="label">${t('mergedSummaryProfit')}</div>
        <div class="value" style="color:var(--green);">$${formatNum(mergedTotalProfit)}</div>
      </div>
    </div>` : ''}
    </div>
  </div>
  ` : '';

  content.innerHTML = `
  ${pageHeader(t('generalReport'), [t('finance')], can('canExport') ? `<button class="btn btn-secondary btn-sm" onclick="exportGeneralReportExcel()">${ICONS.excelFile} ${t('exportExcelBtn')}</button>
      <button class="btn btn-secondary btn-sm" onclick="exportGeneralReportPDF()">${ICONS.pdfFile} ${t('exportPdfBtn')}</button>` : '')}
  <div class="stats-grid" style="margin-bottom:24px;">
    <div class="stat-card brand"><div class="stat-icon brand">${ICONS.package}</div><div class="stat-label">${t('totalShipments')}</div><div class="stat-value">${ships.length}</div></div>
    <div class="stat-card blue"><div class="stat-icon blue">${ICONS.download}</div><div class="stat-label">${t('incomeDollar')}</div><div class="stat-value mono">$${formatNum(incomeDol)}</div></div>
    <div class="stat-card amber"><div class="stat-icon amber">${ICONS.download}</div><div class="stat-label">${t('incomeLeb')}</div><div class="stat-value mono">${formatLebStat(incomeLeb)}</div></div>
    ${showProfit ? `<div class="stat-card purple"><div class="stat-icon purple">${ICONS.upload}</div><div class="stat-label">${t('outcomeDriversContractors')}</div><div class="stat-value mono">$${formatNum(outcomeDol)}</div></div>` : ''}
    ${showProfit ? `<div class="stat-card purple"><div class="stat-icon purple">${ICONS.upload}</div><div class="stat-label">${t('outcomeDriversContractorsLeb')}</div><div class="stat-value mono">${formatLebStat(outcomeLeb)}</div></div>` : ''}
    ${showProfit ? `<div class="stat-card green"><div class="stat-icon green">${ICONS.trendingUp}</div><div class="stat-label">${t('netProfit')}</div><div class="stat-value mono">$${formatNum(netProfit)}</div></div>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:16px;" class="report-grid">
    <div class="table-container">
      <div class="card-header" style="cursor:pointer;" onclick="toggleReportSection('driver')">
        <span class="card-title">${t('byDriver')}</span>
        <span id="report-section-toggle-driver" style="display:inline-block;font-size:1.2rem;transition:transform var(--transition);transform:rotate(${_reportSectionsCollapsed.driver ? '0' : '180'}deg);">▾</span>
      </div>
      <div id="report-section-body-driver" style="display:${_reportSectionsCollapsed.driver ? 'none' : 'block'};">
      <div class="table-scroll">
      <table><thead><tr><th>${t('driver')}</th><th>${t('count')}</th><th>${t('statusBreakdownCol')}</th><th>${t('driverIncomeCol')}</th>${showProfit?`<th>${t('driverProfitCol')}</th><th>${t('driverTotalCol')}</th>`:''}${driverHasLeb?`<th>${t('driverTotalColLeb')}</th>`:''}</tr></thead><tbody>
        ${Object.entries(byDriver).filter(([k])=>k!=='—').sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>`
        <tr><td><strong>${esc(k)}</strong></td><td class="font-mono">${v.count}</td><td>${statusBreakdownCell(v.statusCounts)}</td><td class="font-mono">$${formatNum(v.dol)}</td>${showProfit?`<td class="font-mono" style="color:var(--green);">$${formatNum(v.cost)}</td><td class="font-mono">$${formatNum(v.dol - v.cost)}</td>`:''}${driverHasLeb?`<td class="font-mono">${v.leb?formatNum(v.leb):'—'}</td>`:''}</tr>`).join('')
        || `<tr><td colspan="${(showProfit?6:4)+(driverHasLeb?1:0)}" class="table-empty"><p>No data</p></td></tr>`}
      </tbody>${(() => { const d = Object.entries(byDriver).filter(([k])=>k!=='—'); if (!d.length) return ''; const s = sumRows(d); return `<tfoot><tr class="report-total-row"><td><strong>${t('total')}</strong></td><td class="font-mono"><strong>${s.count}</strong></td><td>${statusBreakdownCell(s.statusCounts)}</td><td class="font-mono"><strong>$${formatNum(s.dol)}</strong></td>${showProfit?`<td class="font-mono" style="color:var(--green);"><strong>$${formatNum(s.second)}</strong></td><td class="font-mono"><strong>$${formatNum(s.dol - s.second)}</strong></td>`:''}${driverHasLeb?`<td class="font-mono"><strong>${formatNum(s.leb)}</strong></td>`:''}</tr></tfoot>`; })()}</table>
      </div>
      </div>
    </div>
    <div class="table-container">
      <div class="card-header" style="cursor:pointer;" onclick="toggleReportSection('contractor')">
        <span class="card-title">${t('byContractor')}</span>
        <span id="report-section-toggle-contractor" style="display:inline-block;font-size:1.2rem;transition:transform var(--transition);transform:rotate(${_reportSectionsCollapsed.contractor ? '0' : '180'}deg);">▾</span>
      </div>
      <div id="report-section-body-contractor" style="display:${_reportSectionsCollapsed.contractor ? 'none' : 'block'};">
      <div class="table-scroll">
      <table><thead><tr><th>${t('contractor')}</th><th>${t('count')}</th><th>${t('statusBreakdownCol')}</th><th>${t('contractorIncomeCol')}</th>${showProfit?`<th>${t('contractorProfitCol')}</th><th>${t('contractorTotalCol')}</th>`:''}${contractorHasLeb?`<th>${t('contractorTotalColLeb')}</th>`:''}</tr></thead><tbody>
        ${Object.entries(byContractor).filter(([k])=>k!=='—').sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>`
        <tr><td><strong>${esc(k)}</strong></td><td class="font-mono">${v.count}</td><td>${statusBreakdownCell(v.statusCounts)}</td><td class="font-mono">$${formatNum(v.dol)}</td>${showProfit?`<td class="font-mono" style="color:var(--green);">$${formatNum(v.cost)}</td><td class="font-mono">$${formatNum(v.dol - v.cost)}</td>`:''}${contractorHasLeb?`<td class="font-mono">${v.leb?formatNum(v.leb):'—'}</td>`:''}</tr>`).join('')
        || `<tr><td colspan="${(showProfit?6:4)+(contractorHasLeb?1:0)}" class="table-empty"><p>No data</p></td></tr>`}
      </tbody>${(() => { const d = Object.entries(byContractor).filter(([k])=>k!=='—'); if (!d.length) return ''; const s = sumRows(d); return `<tfoot><tr class="report-total-row"><td><strong>${t('total')}</strong></td><td class="font-mono"><strong>${s.count}</strong></td><td>${statusBreakdownCell(s.statusCounts)}</td><td class="font-mono"><strong>$${formatNum(s.dol)}</strong></td>${showProfit?`<td class="font-mono" style="color:var(--green);"><strong>$${formatNum(s.second)}</strong></td><td class="font-mono"><strong>$${formatNum(s.dol - s.second)}</strong></td>`:''}${contractorHasLeb?`<td class="font-mono"><strong>${formatNum(s.leb)}</strong></td>`:''}</tr></tfoot>`; })()}</table>
      </div>
      </div>
    </div>
    <div class="table-container">
      <div class="card-header" style="cursor:pointer;" onclick="toggleReportSection('company')">
        <span class="card-title">${t('byCompany')}</span>
        <span id="report-section-toggle-company" style="display:inline-block;font-size:1.2rem;transition:transform var(--transition);transform:rotate(${_reportSectionsCollapsed.company ? '0' : '180'}deg);">▾</span>
      </div>
      <div id="report-section-body-company" style="display:${_reportSectionsCollapsed.company ? 'none' : 'block'};">
      <div class="table-scroll">
      <table><thead><tr><th>${t('company')}</th><th>${t('count')}</th><th>${t('statusBreakdownCol')}</th><th>${t('companyOutcomeCol')}</th>${showProfit?`<th>${t('companyProfitCol')}</th><th>${t('companyTotalCol')}</th>`:''}${companyHasLeb?`<th>${t('companyTotalColLeb')}</th>`:''}</tr></thead><tbody>
        ${Object.entries(byCompany).sort((a,b)=>b[1].dol-a[1].dol).map(([k,v])=>`
        <tr><td><strong>${esc(k)}</strong></td><td class="font-mono">${v.count}</td><td>${statusBreakdownCell(v.statusCounts)}</td><td class="font-mono">$${formatNum(v.dol)}</td>${showProfit?`<td class="font-mono" style="color:var(--green);">$${formatNum(v.profit)}</td><td class="font-mono">$${formatNum(v.dol - v.profit)}</td>`:''}${companyHasLeb?`<td class="font-mono">${v.leb?formatNum(v.leb):'—'}</td>`:''}</tr>`).join('')
        || `<tr><td colspan="${(showProfit?6:4)+(companyHasLeb?1:0)}" class="table-empty"><p>No data</p></td></tr>`}
      </tbody>${(() => { const d = Object.entries(byCompany); if (!d.length) return ''; const s = sumRows(d); return `<tfoot><tr class="report-total-row"><td><strong>${t('total')}</strong></td><td class="font-mono"><strong>${s.count}</strong></td><td>${statusBreakdownCell(s.statusCounts)}</td><td class="font-mono"><strong>$${formatNum(s.dol)}</strong></td>${showProfit?`<td class="font-mono" style="color:var(--green);"><strong>$${formatNum(s.second)}</strong></td><td class="font-mono"><strong>$${formatNum(s.dol - s.second)}</strong></td>`:''}${companyHasLeb?`<td class="font-mono"><strong>${formatNum(s.leb)}</strong></td>`:''}</tr></tfoot>`; })()}</table>
      </div>
      </div>
    </div>
  </div>
  ${mergedSectionHTML}
  <style>@media(max-width:768px){.report-grid{grid-template-columns:1fr;}}</style>`;
}

// ===================================================
//  GENERAL STATEMENT — styled on-screen settlement view (moved off General Report;
//  same figures as exportSettlementExcel(), plus live-editable "Old Balance" fields
//  matching the Excel's yellow manual-entry cells).
// ===================================================
async function renderGeneralStatement() {
  if (!can('canViewGeneral')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  const { byDriver, byContractor, byCompany, showProfit } = await computeGeneralReportData();

  if (!showProfit) {
    content.innerHTML = `
    ${pageHeader(t('generalStatement'), [t('finance')])}
    <div class="table-container"><div class="table-empty" style="padding:60px;"><div class="empty-icon">🏦</div><p>${t('noDataToExport')}</p></div></div>`;
    return;
  }

  const headerActions =
    (can('canExport') ? `<button class="btn btn-primary btn-sm" onclick="exportSettlementExcel()">${ICONS.excelFile} ${t('settlementExportBtn')}</button>` : '');

  const driverEntries = Object.entries(byDriver).filter(([k]) => k !== '—').sort((a, b) => b[1].count - a[1].count);
  const entities = buildSettlementEntityRows(byCompany, byContractor);
  const YELLOW_TH = 'background:rgba(255,211,64,0.16);';

  const driverTotals = driverEntries.reduce((a, [, v]) => {
    a.net += v.dol - (v.cost || 0); a.cost += v.cost || 0; a.dol += v.dol; a.leb += v.leb || 0; return a;
  }, { net: 0, cost: 0, dol: 0, leb: 0 });

  const driverRowsHTML = driverEntries.map(([name, v], idx) => {
    const savedLL = settlementOldBalances.driver?.[name];
    return `
    <tr>
      <td class="font-mono">${idx + 1}</td>
      <td><strong>${esc(name)}</strong></td>
      <td class="font-mono">$${formatNum(v.dol)}</td>
      <td class="font-mono">${v.leb ? formatNum(v.leb) : '—'}</td>
      <td class="font-mono" style="color:var(--green);">$${formatNum(v.cost || 0)}</td>
      <td><input type="number" step="0.01" class="form-input" style="width:110px;padding:4px 8px;font-size:0.8rem;" id="stmt-drv-oldbal-${idx}" value="${savedLL || savedLL === 0 ? savedLL : ''}" placeholder="${t('statementOldBalancePlaceholder')}" oninput="recalcGeneralStatementTotals(); autoSaveSettlementOldBalances();" onkeydown="handleSettlementOldBalanceKeydown(event)"></td>
      <td class="font-mono" id="stmt-drv-net-${idx}">$${formatNum(v.dol - (v.cost || 0))}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="table-empty"><p>No data</p></td></tr>`;

  const compRowsHTML = entities.map((e, idx) => {
    // Company Value must match the "Amount Due to Company" figure on the General Report page:
    // company revenue minus our profit share on that company's orders — not raw revenue.
    const companyDol    = (e.company?.dol || 0) - (e.company?.profit || 0);
    const companyLeb    = e.company?.leb || 0;
    const contractorDol = e.contractor?.dol || 0;
    const contractorFee = e.contractor?.cost || 0;
    const contractorNet = contractorDol - contractorFee;
    const contractorLeb = e.contractor?.leb || 0;
    const netDol = companyDol - contractorNet;
    const netLeb = companyLeb - contractorLeb;
    const savedDol = settlementOldBalances.entity?.[e.name]?.dollar;
    const savedLeb = settlementOldBalances.entity?.[e.name]?.leb;
    return `
    <tr>
      <td class="font-mono">${idx + 1}</td>
      <td><strong>${e.company ? esc(e.name) : '—'}</strong></td>
      <td class="font-mono">$${formatNum(companyDol)}</td>
      <td class="font-mono">${companyLeb ? formatNum(companyLeb) : '—'}</td>
      <td><strong>${e.contractor ? esc(e.name) : '—'}</strong></td>
      <td class="font-mono">$${formatNum(contractorDol)}</td>
      <td class="font-mono">$${formatNum(contractorFee)}</td>
      <td class="font-mono">$${formatNum(contractorNet)}</td>
      <td class="font-mono">${contractorLeb ? formatNum(contractorLeb) : '—'}</td>
      <td class="font-mono">$${formatNum(netDol)}</td>
      <td class="font-mono">${netLeb ? formatNum(netLeb) : '—'}</td>
      <td><input type="number" step="0.01" class="form-input" style="width:100px;padding:4px 8px;font-size:0.8rem;" id="stmt-comp-oldbal-dollar-${idx}" value="${savedDol || savedDol === 0 ? savedDol : ''}" placeholder="${t('statementOldBalancePlaceholder')}" oninput="recalcGeneralStatementTotals(); autoSaveSettlementOldBalances();" onkeydown="handleSettlementOldBalanceKeydown(event)"></td>
      <td><input type="number" step="0.01" class="form-input" style="width:100px;padding:4px 8px;font-size:0.8rem;" id="stmt-comp-oldbal-leb-${idx}" value="${savedLeb || savedLeb === 0 ? savedLeb : ''}" placeholder="${t('statementOldBalancePlaceholder')}" oninput="recalcGeneralStatementTotals(); autoSaveSettlementOldBalances();" onkeydown="handleSettlementOldBalanceKeydown(event)"></td>
      <td class="font-mono" id="stmt-comp-final-dollar-${idx}">$${formatNum(netDol)}</td>
      <td class="font-mono" id="stmt-comp-final-leb-${idx}">${netLeb ? formatNum(netLeb) : '—'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="15" class="table-empty"><p>No data</p></td></tr>`;

  content.innerHTML = `
  ${pageHeader(t('generalStatement'), [t('finance')], headerActions)}

  <div class="stats-grid" style="margin-bottom:16px;">
    <div class="stat-card purple"><div class="stat-icon purple">${ICONS.landmark}</div><div class="stat-label">${t('settlementNetCompaniesLabel')}</div><div class="stat-value mono" id="stmt-sum-net-companies">$0 / 0</div></div>
    <div class="stat-card purple"><div class="stat-icon purple">${ICONS.landmark}</div><div class="stat-label">${t('settlementCompaniesFinalLabel')}</div><div class="stat-value mono" id="stmt-sum-final-companies">$0 / 0</div></div>
    <div class="stat-card green"><div class="stat-icon green">${ICONS.trendingUp}</div><div class="stat-label">${t('settlementOfficeProfitLabel')}</div><div class="stat-value mono" id="stmt-sum-office-profit">$0</div></div>
    <div class="stat-card green"><div class="stat-icon green">${ICONS.trendingUp}</div><div class="stat-label">${t('settlementDriverProfitTotalLabel')}</div><div class="stat-value mono">$${formatNum(driverTotals.cost)}</div></div>
    <div class="stat-card green"><div class="stat-icon green">${ICONS.trendingUp}</div><div class="stat-label">${t('settlementContractorProfitTotalLabel')}</div><div class="stat-value mono" id="stmt-sum-contractor-profit">$0</div></div>
    <div class="stat-card brand"><div class="stat-icon brand">${ICONS.trendingUp}</div><div class="stat-label">${t('settlementCombinedProfitLabel')}</div><div class="stat-value mono" id="stmt-sum-combined-profit">$0</div></div>
  </div>

  <div class="card" style="padding:2px 16px;margin-bottom:16px;">
    <p style="font-size:0.8rem;color:var(--text-2);margin:10px 0;">🟡 ${t('settlementManualInputNote')}</p>
  </div>

  <div class="table-container" style="margin-bottom:16px;">
    <div class="card-header" style="cursor:pointer;" onclick="toggleStatementSection('driver')">
      <span class="card-title">🚗 ${t('settlementSheetDriverTitle')}</span>
      <span id="statement-section-toggle-driver" style="display:inline-block;font-size:1.2rem;transition:transform var(--transition);transform:rotate(${_statementSectionsCollapsed.driver ? '0' : '180'}deg);">▾</span>
    </div>
    <div id="statement-section-body-driver" style="display:${_statementSectionsCollapsed.driver ? 'none' : 'block'};">
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>#</th><th>${t('driver')}</th><th>${t('settlementColTotalDollar')}</th><th>${t('settlementColTotalLeb')}</th>
          <th>${t('settlementColDriverProfit')}</th>
          <th style="${YELLOW_TH}">${t('settlementColOldBalanceDollar')}</th>
          <th>${t('settlementColNetAccount')}</th>
        </tr></thead>
        <tbody>${driverRowsHTML}</tbody>
        <tfoot><tr class="report-total-row">
          <td></td><td><strong>${t('settlementGrandTotalLabel')} (${driverEntries.length})</strong></td>
          <td class="font-mono"><strong>$${formatNum(driverTotals.dol)}</strong></td>
          <td class="font-mono"><strong>${formatNum(driverTotals.leb)}</strong></td>
          <td class="font-mono" style="color:var(--green);"><strong>$${formatNum(driverTotals.cost)}</strong></td>
          <td class="font-mono" id="stmt-drv-oldbal-total"><strong>0</strong></td>
          <td class="font-mono" id="stmt-drv-net-total"><strong>$${formatNum(driverTotals.net)}</strong></td>
        </tr></tfoot>
      </table>
    </div>
    </div>
  </div>

  <div class="table-container" style="margin-bottom:16px;">
    <div class="card-header" style="cursor:pointer;" onclick="toggleStatementSection('company')">
      <span class="card-title">🏢 ${t('settlementSheetCompanyTitle')}</span>
      <span id="statement-section-toggle-company" style="display:inline-block;font-size:1.2rem;transition:transform var(--transition);transform:rotate(${_statementSectionsCollapsed.company ? '0' : '180'}deg);">▾</span>
    </div>
    <div id="statement-section-body-company" style="display:${_statementSectionsCollapsed.company ? 'none' : 'block'};">
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>#</th><th>${t('company')}</th><th>${t('settlementColCompanyValueDollar')}</th><th>${t('settlementColCompanyValueLeb')}</th>
          <th>${t('contractor')}</th><th>${t('settlementColContractorValueDollar')}</th><th>${t('settlementColContractorFee')}</th>
          <th>${t('settlementColContractorNet')}</th><th>${t('settlementColContractorValueLeb')}</th>
          <th>${t('settlementColNetValueDollar')}</th><th>${t('settlementColNetValueLeb')}</th>
          <th style="${YELLOW_TH}">${t('settlementColOldBalanceDollar')}</th>
          <th style="${YELLOW_TH}">${t('settlementColOldBalanceLL')}</th>
          <th>${t('settlementColFinalDollar')}</th><th>${t('settlementColFinalLeb')}</th>
        </tr></thead>
        <tbody id="stmt-comp-tbody">${compRowsHTML}</tbody>
        <tfoot><tr class="report-total-row" id="stmt-comp-total-row"></tr></tfoot>
      </table>
    </div>
    </div>
  </div>

  <p style="font-size:0.75rem;color:var(--text-2);font-style:italic;">${t('settlementFootnote')}</p>`;

  window._statementEntities    = entities;
  window._statementDriverCount = driverEntries.length;
  window._statementDriverNames = driverEntries.map(([name]) => name);
  window._statementDriverTotals = driverTotals;
  window._statementDriverEntries = driverEntries;
  recalcGeneralStatementTotals();
}

/** Reads every "Old Balance" yellow input currently on the General Statement page (driver
 *  L.L. balances + company/contractor $ and L.L. balances) and persists them to
 *  sonick_settings/general so they survive a page reload/navigation instead of resetting —
 *  same doc + save pattern as saveDollarRate()/saveExportColumns() in Settings.
 *  Bails out without writing anything if the Statement page's inputs aren't in the DOM right
 *  now (e.g. the admin already navigated to another page) — otherwise this would read back
 *  nothing for every field and overwrite Firestore with an empty balance set.
 *  IMPORTANT: writes with { mergeFields: ['settlementOldBalances'] }, NOT { merge: true }.
 *  A driver/entity that's set back to 0 is deliberately left OUT of driverBalances/
 *  entityBalances below (0 == "no old balance"), so the payload for that entry has no key at
 *  all — but plain merge:true does a *deep* merge on nested map fields, so any key that's
 *  simply missing from the new object is left completely untouched in Firestore rather than
 *  removed. That silently kept the OLD value forever (this was the bug where clearing a
 *  balance to 0 and saving looked successful but reverted after a refresh). mergeFields on
 *  the top-level 'settlementOldBalances' path makes this a full replace of that one field —
 *  every key not present in the new payload is actually gone — while every other field in the
 *  same sonick_settings/general doc (dollar rate, export columns, etc.) stays untouched. */
async function saveSettlementOldBalances(silent) {
  if (!document.getElementById('stmt-drv-net-total')) return; // Statement page isn't mounted — nothing safe to read

  const driverNames = window._statementDriverNames || [];
  const entities     = window._statementEntities || [];

  const driverBalances = {};
  driverNames.forEach((name, idx) => {
    const val = parseFloat(document.getElementById(`stmt-drv-oldbal-${idx}`)?.value);
    if (!isNaN(val) && val !== 0) driverBalances[name] = val;
  });

  const entityBalances = {};
  entities.forEach((e, idx) => {
    const dol = parseFloat(document.getElementById(`stmt-comp-oldbal-dollar-${idx}`)?.value);
    const leb = parseFloat(document.getElementById(`stmt-comp-oldbal-leb-${idx}`)?.value);
    const entry = {};
    if (!isNaN(dol) && dol !== 0) entry.dollar = dol;
    if (!isNaN(leb) && leb !== 0) entry.leb = leb;
    if (Object.keys(entry).length) entityBalances[e.name] = entry;
  });

  const payload = { driver: driverBalances, entity: entityBalances };
  try {
    if (db) await db.collection('sonick_settings').doc('general').set({ settlementOldBalances: payload }, { mergeFields: ['settlementOldBalances'] });
    settlementOldBalances = payload;
    if (!silent) toast(t('settlementBalancesSaved'), 'success');
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

/** Debounced auto-save wired to every Old Balance input's oninput — waits for a short pause
 *  in typing (rather than saving on every keystroke) before writing to Firestore, then
 *  confirms with a toast so the admin can actually see it saved (silent auto-save gave no
 *  feedback, which is why missed saves went unnoticed). */
let _settlementAutoSaveTimer = null;
function autoSaveSettlementOldBalances() {
  clearTimeout(_settlementAutoSaveTimer);
  _settlementAutoSaveTimer = setTimeout(() => { saveSettlementOldBalances(false); }, 700);
}

/** Called right before navigating away from the Statement page: if an edit's debounced save
 *  hasn't fired yet, cancel the timer and save immediately (synchronously, while the input
 *  elements the save needs to read are still in the DOM) instead of letting it fire later
 *  against a page that's already been replaced. */
function flushPendingSettlementSave() {
  if (!_settlementAutoSaveTimer) return;
  clearTimeout(_settlementAutoSaveTimer);
  _settlementAutoSaveTimer = null;
  saveSettlementOldBalances(false);
}

/** Enter in an Old Balance field saves right away instead of waiting out the ~0.7s debounce —
 *  also blurs the field so the number spinner/focus ring drops, giving a clear "done" moment.
 *  Without this, Enter did nothing special: it fell through to the same debounce timer as any
 *  other keystroke, which is easy to mistake for "Enter doesn't save". */
function handleSettlementOldBalanceKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  clearTimeout(_settlementAutoSaveTimer);
  _settlementAutoSaveTimer = null;
  saveSettlementOldBalances(false);
  event.target.blur();
}

/** Recompute the Companies & Contractors table's Final Statement cells/footer and the
 *  Overall Settlement Summary cards on the General Statement page, from the live values
 *  of the "Old Balance" input fields — mirrors the formulas in exportSettlementExcel()
 *  (js/ui.js): Final = Net Value + Old Balance; Office Profit = driver net total minus
 *  companies net total (NOT final, so old-balance entries never change office profit). */
function recalcGeneralStatementTotals() {
  const entities = window._statementEntities || [];
  let companyDolT = 0, companyLebT = 0, contractorDolT = 0, contractorFeeT = 0, contractorNetT = 0, contractorLebT = 0;
  let netDolT = 0, netLebT = 0, oldDolT = 0, oldLebT = 0, finalDolT = 0, finalLebT = 0;

  entities.forEach((e, idx) => {
    // Keep in sync with the render in renderGeneralStatement() and exportSettlementExcel():
    // company revenue minus our profit share, matching "Amount Due to Company" elsewhere.
    const companyDol    = (e.company?.dol || 0) - (e.company?.profit || 0);
    const companyLeb    = e.company?.leb || 0;
    const contractorDol = e.contractor?.dol || 0;
    const contractorFee = e.contractor?.cost || 0;
    const contractorNet = contractorDol - contractorFee;
    const contractorLeb = e.contractor?.leb || 0;
    const netDol = companyDol - contractorNet;
    const netLeb = companyLeb - contractorLeb;
    const oldDol = parseFloat(document.getElementById(`stmt-comp-oldbal-dollar-${idx}`)?.value) || 0;
    const oldLeb = parseFloat(document.getElementById(`stmt-comp-oldbal-leb-${idx}`)?.value) || 0;
    const finalDol = netDol + oldDol;
    const finalLeb = netLeb + oldLeb;

    const fd = document.getElementById(`stmt-comp-final-dollar-${idx}`);
    const fl = document.getElementById(`stmt-comp-final-leb-${idx}`);
    if (fd) fd.textContent = '$' + formatNum(finalDol);
    if (fl) fl.textContent = finalLeb ? formatNum(finalLeb) : '—';

    companyDolT += companyDol; companyLebT += companyLeb;
    contractorDolT += contractorDol; contractorFeeT += contractorFee; contractorNetT += contractorNet; contractorLebT += contractorLeb;
    netDolT += netDol; netLebT += netLeb; oldDolT += oldDol; oldLebT += oldLeb; finalDolT += finalDol; finalLebT += finalLeb;
  });

  const totalRow = document.getElementById('stmt-comp-total-row');
  if (totalRow) totalRow.innerHTML = `
    <td></td><td><strong>${t('total')} (${entities.length})</strong></td>
    <td class="font-mono"><strong>$${formatNum(companyDolT)}</strong></td>
    <td class="font-mono"><strong>${companyLebT ? formatNum(companyLebT) : '—'}</strong></td>
    <td></td>
    <td class="font-mono"><strong>$${formatNum(contractorDolT)}</strong></td>
    <td class="font-mono"><strong>$${formatNum(contractorFeeT)}</strong></td>
    <td class="font-mono"><strong>$${formatNum(contractorNetT)}</strong></td>
    <td class="font-mono"><strong>${contractorLebT ? formatNum(contractorLebT) : '—'}</strong></td>
    <td class="font-mono"><strong>$${formatNum(netDolT)}</strong></td>
    <td class="font-mono"><strong>${netLebT ? formatNum(netLebT) : '—'}</strong></td>
    <td class="font-mono"><strong>$${formatNum(oldDolT)}</strong></td>
    <td class="font-mono"><strong>${oldLebT ? formatNum(oldLebT) : '—'}</strong></td>
    <td class="font-mono"><strong>$${formatNum(finalDolT)}</strong></td>
    <td class="font-mono"><strong>${finalLebT ? formatNum(finalLebT) : '—'}</strong></td>`;

  let drvOldT = 0, drvNetT = 0;
  const driverEntries = window._statementDriverEntries || [];
  driverEntries.forEach(([, v], i) => {
    const oldDol = parseFloat(document.getElementById(`stmt-drv-oldbal-${i}`)?.value) || 0;
    const netAccount = v.dol - (v.cost || 0);
    const finalNet = netAccount + oldDol;
    drvOldT += oldDol; drvNetT += finalNet;
    const cell = document.getElementById(`stmt-drv-net-${i}`);
    if (cell) cell.textContent = '$' + formatNum(finalNet);
  });
  const drvOldCell = document.getElementById('stmt-drv-oldbal-total');
  if (drvOldCell) drvOldCell.innerHTML = `<strong>$${formatNum(drvOldT)}</strong>`;
  const drvNetCell = document.getElementById('stmt-drv-net-total');
  if (drvNetCell) drvNetCell.innerHTML = `<strong>$${formatNum(drvNetT)}</strong>`;

  const driverTotals   = window._statementDriverTotals || { net: 0, cost: 0 };
  const officeProfit   = driverTotals.net - netDolT;
  const combinedProfit = officeProfit + driverTotals.cost + contractorFeeT;

  const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  setHTML('stmt-sum-net-companies',     `$${formatNum(netDolT)} / ${formatNum(netLebT)}`);
  setHTML('stmt-sum-final-companies',   `$${formatNum(finalDolT)} / ${formatNum(finalLebT)}`);
  setHTML('stmt-sum-office-profit',     `$${formatNum(officeProfit)}`);
  setHTML('stmt-sum-contractor-profit', `$${formatNum(contractorFeeT)}`);
  setHTML('stmt-sum-combined-profit',   `$${formatNum(combinedProfit)}`);
}

/** Expand/collapse one of the By Driver/Contractor/Company sections on the General Report
 *  page. Starts shrunk (_reportSectionsCollapsed = all true), same as the Merged Company/
 *  Contractor section; state persists across renderGeneral() re-renders since the flag
 *  lives at module scope, not inside the function. */
function toggleReportSection(key) {
  _reportSectionsCollapsed[key] = !_reportSectionsCollapsed[key];
  const body = document.getElementById(`report-section-body-${key}`);
  const icon = document.getElementById(`report-section-toggle-${key}`);
  if (body) body.style.display = _reportSectionsCollapsed[key] ? 'none' : 'block';
  if (icon) icon.style.transform = `rotate(${_reportSectionsCollapsed[key] ? '0' : '180'}deg)`;
}

/** Expand/collapse the Merged Company/Contractor reconciliation section on the General
 *  Report page. Starts shrunk (_mergedReportCollapsed = true); state persists across
 *  renderGeneral() re-renders since the flag lives at module scope, not inside the function. */
function toggleMergedReportSection() {
  _mergedReportCollapsed = !_mergedReportCollapsed;
  const body = document.getElementById('merged-report-body');
  const icon = document.getElementById('merged-report-toggle-icon');
  if (body) body.style.display = _mergedReportCollapsed ? 'none' : 'block';
  if (icon) icon.style.transform = `rotate(${_mergedReportCollapsed ? '0' : '180'}deg)`;
}

/** Expand/collapse the Driver / Companies&Contractors sections on the General Statement
 *  page. Starts shrunk (_statementSectionsCollapsed = all true), same convention as the
 *  General Report sections; state persists across renderGeneralStatement() re-renders
 *  since the flag lives at module scope, not inside the function. */
function toggleStatementSection(key) {
  _statementSectionsCollapsed[key] = !_statementSectionsCollapsed[key];
  const body = document.getElementById(`statement-section-body-${key}`);
  const icon = document.getElementById(`statement-section-toggle-${key}`);
  if (body) body.style.display = _statementSectionsCollapsed[key] ? 'none' : 'block';
  if (icon) icon.style.transform = `rotate(${_statementSectionsCollapsed[key] ? '0' : '180'}deg)`;
}

// ===================================================
//  COMPANIES
// ===================================================
async function renderCompanies() {
  if (!can('canManageCompanies')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let companies = [];
  try {
    if (db) { const snap = await db.collection('sonick_companies').orderBy('name').get(); companies = snap.docs.map(d=>({id:d.id,...d.data()})); companies_cache = companies; }
    else companies = companies_cache;
  } catch (e) { companies = companies_cache; }

  content.innerHTML = `
  ${pageHeader(t('companies'), [t('management')])}
  <div class="table-container">
    <div class="table-header">
      <div class="table-search"><span class="search-icon">🔍</span><input type="text" placeholder="${t('searchCompanies')}" id="comp-search" oninput="filterCompanies()" style="width:200px;"></div>
      <button class="btn btn-primary btn-sm" onclick="openCompanyModal()">+ ${t('companies')}</button>
    </div>
    <div class="table-scroll desktop-table">
      <table>
        <thead><tr><th>${t('companyName')}</th><th>${t('phone')}</th><th>${t('deliveryCostCol')}</th><th>${t('actions')}</th></tr></thead>
        <tbody id="comp-tbody"></tbody>
      </table>
    </div>
    <div class="mobile-cards" id="comp-mobile"></div>
  </div>`;

  window._companies = companies;
  filterCompanies();
}

function filterCompanies() {
  const search = (document.getElementById('comp-search')?.value || '').toLowerCase();
  const list   = (window._companies || companies_cache).filter(c => !search || (c.name||'').toLowerCase().includes(search) || (c.phones||'').includes(search));
  const tbody  = document.getElementById('comp-tbody');
  const mobile = document.getElementById('comp-mobile');

  if (tbody) tbody.innerHTML = list.map(c => `
  <tr>
    <td><strong>${esc(c.name||'—')}</strong></td>
    <td class="font-mono">${phoneWithFlagHTML(c.phones)}</td>
    <td class="font-mono">$${formatNum(c.deliveryCost||0)}</td>
    <td><div style="display:flex;gap:4px;">
      <button class="btn btn-ghost  btn-sm btn-icon" onclick="editCompany('${c.id}')">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteCompany('${c.id}')">🗑</button>
    </div></td>
  </tr>`).join('') || `<tr><td colspan="4" class="table-empty"><div class="empty-icon">🏢</div><p>No companies yet</p></td></tr>`;

  if (mobile) mobile.innerHTML = list.map(c => `
  <div class="mobile-card">
    <div class="mobile-card-header"><span class="mobile-card-num">🏢 ${esc(c.name||'—')}</span></div>
    <div class="mobile-card-body">
      <div><div class="mobile-card-label">${t('phone')}</div><div class="mobile-card-value">${phoneWithFlagHTML(c.phones)}</div></div>
      <div><div class="mobile-card-label">${t('deliveryCostCol')}</div><div class="mobile-card-value">$${formatNum(c.deliveryCost||0)}</div></div>
    </div>
    <div class="mobile-card-footer">
      <button class="btn btn-ghost  btn-sm" onclick="editCompany('${c.id}')">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteCompany('${c.id}')">🗑 Delete</button>
    </div>
  </div>`).join('');
}

function companyFormHTML(d) {
  d = d || {};
  return `
  <div class="form-group"><label class="form-label">${t('companyName')} <span style="color:var(--brand)">*</span></label><input type="text" id="cf-name" class="form-input" value="${esc(d.name||'')}" placeholder="Company name"></div>
  <div class="form-group"><label class="form-label">${t('phone')}</label>${phoneFieldHTML('cf-phones', d.phones, '')}</div>
  <div class="form-group"><label class="form-label">${t('deliveryCostCol')}</label><input type="number" step="0.01" id="cf-delcost" class="form-input" value="${d.deliveryCost||''}" placeholder="0.00"></div>`;
}

function openCompanyModal(d) {
  editingId = d?.id || null;
  document.getElementById('modal-company-title').textContent = d ? 'Edit Company' : t('newCompany');
  document.getElementById('modal-company-body').innerHTML    = companyFormHTML(d);
  openModal('modal-company');
}

async function editCompany(id) {
  const c = (window._companies || companies_cache).find(x => x.id === id);
  if (c) openCompanyModal(c);
}

async function saveCompany() {
  const name = document.getElementById('cf-name')?.value?.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const payload = { name, phones: getPhoneFieldValue('cf-phones'), deliveryCost: parseFloat(document.getElementById('cf-delcost')?.value) || 0 };
  try {
    if (editingId) { if (db) await db.collection('sonick_companies').doc(editingId).update(payload); toast(t('companyUpdated'), 'success'); }
    else { if (db) await db.collection('sonick_companies').add(payload); else companies_cache.push({ id: 'c' + Date.now(), ...payload }); toast(t('companyAdded'), 'success'); }
    closeModal('modal-company'); await loadCaches(); renderCompanies();
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

async function deleteCompany(id) {
  confirmAction(t('deleteCompanyConfirm'), '', async () => {
    try { if (db) await db.collection('sonick_companies').doc(id).delete(); await loadCaches(); toast(t('deleted'), 'success'); renderCompanies(); }
    catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===================================================
//  CONTRACTORS
// ===================================================
async function renderContractors() {
  if (!can('canManageContractors')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let contractors = [];
  try {
    if (db) { const snap = await db.collection('sonick_contractors').orderBy('name').get(); contractors = snap.docs.map(d=>({id:d.id,...d.data()})); contractors_cache = contractors; }
    else contractors = contractors_cache;
  } catch (e) { contractors = contractors_cache; }

  content.innerHTML = `
  ${pageHeader(t('contractors'), [t('management')])}
  <div class="table-container">
    <div class="table-header">
      <div class="table-search"><span class="search-icon">🔍</span><input type="text" placeholder="${t('searchContractors')}" id="contr-search" oninput="filterContractors()" style="width:200px;"></div>
      <button class="btn btn-primary btn-sm" onclick="openContractorModal()">+ ${t('contractors')}</button>
    </div>
    <div class="table-scroll desktop-table">
      <table>
        <thead><tr><th>${t('contractorName')}</th><th>${t('phone')}</th><th>${t('deliveryCostCol')}</th><th>${t('actions')}</th></tr></thead>
        <tbody id="contr-tbody"></tbody>
      </table>
    </div>
    <div class="mobile-cards" id="contr-mobile"></div>
  </div>`;

  window._contractors = contractors;
  filterContractors();
}

function filterContractors() {
  const search = (document.getElementById('contr-search')?.value || '').toLowerCase();
  const list   = (window._contractors || contractors_cache).filter(c => !search || (c.name||'').toLowerCase().includes(search) || (c.phones||'').includes(search));
  const tbody  = document.getElementById('contr-tbody');
  const mobile = document.getElementById('contr-mobile');

  if (tbody) tbody.innerHTML = list.map(c => `
  <tr>
    <td><strong>${esc(c.name||'—')}</strong></td>
    <td class="font-mono">${phoneWithFlagHTML(c.phones)}</td>
    <td class="font-mono">$${formatNum(c.deliveryCost||0)}</td>
    <td><div style="display:flex;gap:4px;">
      <button class="btn btn-ghost  btn-sm btn-icon" onclick="editContractor('${c.id}')">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteContractor('${c.id}')">🗑</button>
    </div></td>
  </tr>`).join('') || `<tr><td colspan="4" class="table-empty"><div class="empty-icon">🤝</div><p>No contractors yet</p></td></tr>`;

  if (mobile) mobile.innerHTML = list.map(c => `
  <div class="mobile-card">
    <div class="mobile-card-header"><span class="mobile-card-num">🤝 ${esc(c.name||'—')}</span></div>
    <div class="mobile-card-body">
      <div><div class="mobile-card-label">${t('phone')}</div><div class="mobile-card-value">${phoneWithFlagHTML(c.phones)}</div></div>
      <div><div class="mobile-card-label">${t('deliveryCostCol')}</div><div class="mobile-card-value">$${formatNum(c.deliveryCost||0)}</div></div>
    </div>
    <div class="mobile-card-footer">
      <button class="btn btn-ghost  btn-sm" onclick="editContractor('${c.id}')">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteContractor('${c.id}')">🗑 Delete</button>
    </div>
  </div>`).join('');
}

function contractorFormHTML(d) {
  d = d || {};
  return `
  <div class="form-group"><label class="form-label">${t('contractorName')} <span style="color:var(--brand)">*</span></label><input type="text" id="ctf-name" class="form-input" value="${esc(d.name||'')}" placeholder="Contractor name"></div>
  <div class="form-group"><label class="form-label">${t('phone')}</label>${phoneFieldHTML('ctf-phones', d.phones, '')}</div>
  <div class="form-group"><label class="form-label">${t('deliveryCostCol')}</label><input type="number" step="0.01" id="ctf-delcost" class="form-input" value="${d.deliveryCost||''}" placeholder="0.00"></div>`;
}

function openContractorModal(d) {
  editingId = d?.id || null;
  document.getElementById('modal-contractor-title').textContent = d ? 'Edit Contractor' : t('newContractor');
  document.getElementById('modal-contractor-body').innerHTML    = contractorFormHTML(d);
  openModal('modal-contractor');
}

async function editContractor(id) {
  const c = (window._contractors || contractors_cache).find(x => x.id === id);
  if (c) openContractorModal(c);
}

async function saveContractor() {
  const name = document.getElementById('ctf-name')?.value?.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const payload = { name, phones: getPhoneFieldValue('ctf-phones'), deliveryCost: parseFloat(document.getElementById('ctf-delcost')?.value) || 0 };
  try {
    if (editingId) { if (db) await db.collection('sonick_contractors').doc(editingId).update(payload); toast(t('contractorUpdated'), 'success'); }
    else { if (db) await db.collection('sonick_contractors').add(payload); else contractors_cache.push({ id: 'ct' + Date.now(), ...payload }); toast(t('contractorAdded'), 'success'); }
    closeModal('modal-contractor'); await loadCaches(); renderContractors();
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

async function deleteContractor(id) {
  confirmAction(t('deleteContractorConfirm'), '', async () => {
    try { if (db) await db.collection('sonick_contractors').doc(id).delete(); await loadCaches(); toast(t('deleted'), 'success'); renderContractors(); }
    catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===================================================
//  DRIVERS
// ===================================================
async function renderDrivers() {
  if (!can('canManageDrivers')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let drivers = [];
  try {
    if (db) { const snap = await db.collection('sonick_drivers').orderBy('name').get(); drivers = snap.docs.map(d=>({id:d.id,...d.data()})); drivers_cache = drivers; }
    else drivers = drivers_cache;
  } catch (e) { drivers = drivers_cache; }

  content.innerHTML = `
  ${pageHeader(t('drivers'), [t('management')], `<a class="btn btn-secondary btn-sm" href="driver.html" target="_blank" rel="noopener"><span class="icon-inline">${ICONS.truck}</span> ${t('driverPortalLink')}</a>`)}
  <p class="section-subtitle" style="margin:-12px 0 16px;">${t('driverPortalLinkDesc')}</p>
  <div class="table-container">
    <div class="table-header">
      <div class="table-search"><span class="search-icon">🔍</span><input type="text" placeholder="${t('searchDrivers')}" id="drv-search" oninput="filterDrivers()" style="width:200px;"></div>
      <button class="btn btn-primary btn-sm" onclick="openDriverModal()">+ ${t('drivers')}</button>
    </div>
    <div class="table-scroll desktop-table">
      <table>
        <thead><tr><th>${t('driverName')}</th><th>${t('phone')}</th><th>${t('deliveryCostCol')}</th><th>${t('activeStatus')}</th><th>${t('portalColumnLabel')}</th><th>${t('actions')}</th></tr></thead>
        <tbody id="drv-tbody"></tbody>
      </table>
    </div>
    <div class="mobile-cards" id="drv-mobile"></div>
  </div>`;

  window._drivers = drivers;
  filterDrivers();
}

function filterDrivers() {
  const search = (document.getElementById('drv-search')?.value || '').toLowerCase();
  const list   = (window._drivers || drivers_cache).filter(d => !search || (d.name||'').toLowerCase().includes(search) || (d.phones||'').includes(search));
  const tbody  = document.getElementById('drv-tbody');
  const mobile = document.getElementById('drv-mobile');

  if (tbody) tbody.innerHTML = list.map(d => `
  <tr>
    <td><strong>${esc(d.name||'—')}</strong></td>
    <td class="font-mono">${phoneWithFlagHTML(d.phones)}</td>
    <td class="font-mono">$${formatNum(d.deliveryCost||0)}</td>
    <td>${d.active!==false ? `<span class="badge badge-green">${t('activeLabel')}</span>` : `<span class="badge badge-gray">${t('inactiveLabel')}</span>`}</td>
    <td>${d.hasPortalAccess ? `<span class="badge badge-blue">${t('portalStatusEnabled')}</span>` : `<span class="badge badge-gray">${t('portalStatusDisabled')}</span>`}</td>
    <td><div style="display:flex;gap:4px;">
      <button class="btn btn-ghost  btn-sm btn-icon" onclick="editDriver('${d.id}')">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDriver('${d.id}')">🗑</button>
    </div></td>
  </tr>`).join('') || `<tr><td colspan="6" class="table-empty"><div class="empty-icon">🚗</div><p>No drivers yet</p></td></tr>`;

  if (mobile) mobile.innerHTML = list.map(d => `
  <div class="mobile-card">
    <div class="mobile-card-header"><span class="mobile-card-num">🚗 ${esc(d.name||'—')}</span>${d.active!==false?`<span class="badge badge-green">${t('activeLabel')}</span>`:`<span class="badge badge-gray">${t('inactiveLabel')}</span>`}</div>
    <div class="mobile-card-body">
      <div><div class="mobile-card-label">${t('phone')}</div><div class="mobile-card-value">${phoneWithFlagHTML(d.phones)}</div></div>
      <div><div class="mobile-card-label">${t('deliveryCostCol')}</div><div class="mobile-card-value">$${formatNum(d.deliveryCost||0)}</div></div>
      <div><div class="mobile-card-label">${t('portalColumnLabel')}</div><div class="mobile-card-value">${d.hasPortalAccess ? `<span class="badge badge-blue">${t('portalStatusEnabled')}</span>` : `<span class="badge badge-gray">${t('portalStatusDisabled')}</span>`}</div></div>
    </div>
    <div class="mobile-card-footer">
      <button class="btn btn-ghost  btn-sm" onclick="editDriver('${d.id}')">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteDriver('${d.id}')">🗑 Delete</button>
    </div>
  </div>`).join('');
}

function driverFormHTML(d) {
  d = d || {};
  const portalSection = d.hasPortalAccess
    ? `
    <div class="form-group" style="background:var(--bg-3);border:1px solid var(--border-2);border-radius:var(--radius);padding:14px;">
      <label class="form-label" style="color:var(--blue);">${ICONS.checkCircle ? '' : ''}✓ ${t('portalStatusEnabled')}</label>
      <p style="font-size:0.929rem;margin-bottom:6px;">${t('loginUsernameLabel')}: <strong class="font-mono">${esc(d.username || '—')}</strong></p>
      <p style="font-size:0.786rem;color:var(--text-3);margin-bottom:10px;">${t('resetPasswordHint')} <span class="font-mono">${esc(d.loginEmail || '')}</span></p>
      ${d.plainPassword ? `
      <div class="form-group" style="margin-bottom:10px;">
        <label class="form-label">${t('currentPasswordLabel')}</label>
        <div style="display:flex;gap:6px;">
          <input type="password" id="df-current-password" class="form-input font-mono" readonly value="${esc(d.plainPassword)}" onclick="this.select()" style="flex:1;">
          <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="toggleCurrentPasswordVisibility(this)" title="${t('showPasswordBtn')}">👁️</button>
          <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="copyCurrentDriverPassword('${esc(d.plainPassword)}')" title="${t('copyCredentialsBtn')}">📋</button>
        </div>
      </div>` : ''}
      <button type="button" class="btn btn-secondary btn-sm" onclick="resetDriverPassword('${d.id}')">${t('resetPasswordBtn')}</button>
    </div>`
    : `
    <div class="form-group" style="background:var(--bg-3);border:1px solid var(--border-2);border-radius:var(--radius);padding:14px;">
      <label class="form-label">${t('portalAccessTitle')}</label>
      <p style="font-size:0.786rem;color:var(--text-3);margin-bottom:10px;">${t('portalAccessDesc')}</p>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">${t('loginUsernameLabel')}</label>
          <input type="text" id="df-username" class="form-input" placeholder="e.g. ahmad.k" autocomplete="off">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">${t('loginPasswordLabel')}</label>
          <input type="password" id="df-password" class="form-input" placeholder="min. 6 characters" autocomplete="new-password">
        </div>
      </div>
      <p style="font-size:0.786rem;color:var(--text-3);margin-top:8px;">${t('loginUsernameHint')}</p>
    </div>`;

  return `
  <div class="form-group"><label class="form-label">${t('driverName')} <span style="color:var(--brand)">*</span></label><input type="text" id="df-name" class="form-input" value="${esc(d.name||'')}" placeholder="Full name"></div>
  <div class="form-group"><label class="form-label">${t('phone')}</label>${phoneFieldHTML('df-phones', d.phones, '')}</div>
  <div class="form-group"><label class="form-label">${t('deliveryCostCol')}</label><input type="number" step="0.01" id="df-delcost" class="form-input" value="${d.deliveryCost||''}" placeholder="0.00"></div>
  <div class="form-group"><label class="form-label">${t('activeStatus')}</label>
    <select id="df-active" class="form-select">
      <option value="true"  ${d.active!==false?'selected':''}>${t('activeLabel')}</option>
      <option value="false" ${d.active===false ?'selected':''}>${t('inactiveLabel')}</option>
    </select>
  </div>
  ${portalSection}`;
}

function openDriverModal(d) {
  editingId = d?.id || null;
  document.getElementById('modal-driver-title').textContent = d ? 'Edit Driver' : t('newDriver');
  document.getElementById('modal-driver-body').innerHTML    = driverFormHTML(d);
  openModal('modal-driver');
}

async function editDriver(id) {
  const d = (window._drivers || drivers_cache).find(x => x.id === id);
  if (d) openDriverModal(d);
}

async function saveDriver() {
  const name    = document.getElementById('df-name')?.value?.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const phones  = getPhoneFieldValue('df-phones');
  const deliveryCost = parseFloat(document.getElementById('df-delcost')?.value) || 0;
  const active  = document.getElementById('df-active')?.value === 'true';
  const username = document.getElementById('df-username')?.value?.trim() || '';
  const password = document.getElementById('df-password')?.value || '';
  const existing = editingId ? (window._drivers || drivers_cache).find(x => x.id === editingId) : null;

  // Editing a driver that already has portal access — plain field update, no credentials shown.
  if (editingId && existing?.hasPortalAccess) {
    try {
      await db.collection('sonick_drivers').doc(editingId).update({ name, phones, active, deliveryCost });
      toast(t('driverUpdated'), 'success');
      closeModal('modal-driver'); await loadCaches(); renderDrivers();
    } catch (e) { toast(t('error') + e.message, 'error'); }
    return;
  }

  // Username/password provided — either creating a new driver with portal login,
  // or retroactively granting it to an existing one.
  if (username || password) {
    if (!username || !password) { toast(t('usernameRequired'), 'error'); return; }
    if (password.length < 6)    { toast(t('passwordTooShort'), 'error'); return; }
    try {
      if (editingId) await grantPortalAccessToExistingDriver(editingId, name, phones, active, username, password, deliveryCost);
      else            await createDriverWithPortal(name, phones, active, username, password, deliveryCost);
      closeModal('modal-driver'); await loadCaches(); renderDrivers();
      showPortalCredentials({ name, username, password });
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? t('usernameTaken') : (t('portalAccessFailed') + e.message);
      toast(msg, 'error');
    }
    return;
  }

  // No portal credentials involved — plain create/update, exactly as before.
  const payload = { name, phones, active, deliveryCost };
  try {
    if (editingId) { if (db) await db.collection('sonick_drivers').doc(editingId).update(payload); toast(t('driverUpdated'), 'success'); }
    else { if (db) await db.collection('sonick_drivers').add(payload); else drivers_cache.push({ id: 'd' + Date.now(), ...payload }); toast(t('driverAdded'), 'success'); }
    closeModal('modal-driver'); await loadCaches(); renderDrivers();
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

async function deleteDriver(id) {
  confirmAction(t('deleteDriverConfirm'), '', async () => {
    try { if (db) await db.collection('sonick_drivers').doc(id).delete(); await loadCaches(); toast(t('deleted'), 'success'); renderDrivers(); }
    catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Reset a portal-enabled driver's password. Firebase's client SDK can't change another
 *  user's password directly (that needs Admin SDK / a Cloud Function, which this project
 *  doesn't have) — so this reuses the same account-rotation trick as
 *  grantPortalAccessToExistingDriver: a new Auth account + password is created under the
 *  same username, every shipment/archive reference is repointed to it, and the old
 *  Firestore doc (and its now-orphaned Auth account) is dropped. Net effect for the driver
 *  is exactly a password reset — same username, new password. */
function resetDriverPassword(id) {
  const d = (window._drivers || drivers_cache).find(x => x.id === id);
  if (!d) return;
  promptInput(
    { title: t('resetPasswordTitle'), message: t('resetPasswordPrompt'), type: 'password', placeholder: '••••••••' },
    async (newPassword) => {
      if (!newPassword || newPassword.length < 6) { toast(t('passwordTooShort'), 'error'); return; }
      try {
        await grantPortalAccessToExistingDriver(d.id, d.name, d.phones, d.active !== false, d.username, newPassword, d.deliveryCost);
        closeModal('modal-driver');
        await loadCaches(); renderDrivers();
        showPortalCredentials({ name: d.name, username: d.username, password: newPassword });
      } catch (e) {
        toast(t('portalAccessFailed') + e.message, 'error');
      }
    },
    () => { /* cancelled — nothing to revert */ }
  );
}

/** Toggle the masked/plaintext view of the current-password field in the Edit Driver panel. */
function toggleCurrentPasswordVisibility(btn) {
  const input = document.getElementById('df-current-password');
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? '👁️' : '🙈';
}

/** Copy a driver's stored plaintext password to the clipboard from the Edit Driver panel. */
async function copyCurrentDriverPassword(password) {
  try { await navigator.clipboard.writeText(password); toast(t('copiedToClipboard'), 'success'); }
  catch (e) { toast(t('copyFailed'), 'error'); }
}

// ===================================================
//  USERS
// ===================================================
async function renderUsers() {
  if (!can('canManageUsers')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let users = [];
  try {
    if (db) { const snap = await db.collection('sonick_users').get(); users = snap.docs.map(d=>({id:d.id,...d.data()})); }
  } catch (e) { users = getDemoUsers(); }

  content.innerHTML = `
  ${pageHeader(t('users'), [t('management')])}
  <div class="table-container">
    <div class="table-header">
      <span class="card-title">System Users</span>
      <button class="btn btn-primary btn-sm" onclick="openUserModal()">+ ${t('newUser')}</button>
    </div>
    <div style="background:var(--bg-3);border-bottom:1px solid var(--border);padding:12px 20px;font-size:12px;color:var(--text-3);">${t('authNote')}</div>
    <div class="table-scroll desktop-table">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>
    <div class="mobile-cards" id="users-mobile"></div>
  </div>
  <div class="card" style="margin-top:16px;">
    <div class="card-header"><span class="card-title">Role Permissions</span></div>
    <div class="card-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
        ${Object.entries(ROLES).map(([key, role]) => `
        <div style="background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:${key==='admin'?'var(--brand-light)':key==='manager'?'var(--amber)':key==='operator'?'var(--blue)':key==='custom'?'var(--purple)':'var(--text-2)'};">${role.label}</div>
          ${key === 'custom'
            ? `<div style="font-size:11px;color:var(--text-3);font-style:italic;">${esc(t('customRoleGridNote'))}</div>`
            : `<div style="font-size:11px;color:var(--text-3);display:flex;flex-direction:column;gap:3px;">
            ${Object.entries(role).filter(([k])=>k!=='label').map(([k,v])=>`
            <span style="color:${v?'var(--green)':'var(--text-3)'}">${v?'✓':'✗'} ${k.replace('can','').replace(/([A-Z])/g,' $1').trim()}</span>`).join('')}
          </div>`}
        </div>`).join('')}
      </div>
    </div>
  </div>`;

  window._users = users;
  const tbody = document.getElementById('users-tbody');
  if (tbody) tbody.innerHTML = users.map(u => `
  <tr>
    <td><div style="display:flex;align-items:center;gap:8px;">
      <div class="user-avatar" style="width:28px;height:28px;font-size:11px;">${(u.displayName||u.email||'?').slice(0,2).toUpperCase()}</div>
      <strong>${esc(u.displayName||'—')}</strong>
    </div></td>
    <td style="color:var(--text-2);">${esc(u.email||'—')}</td>
    <td><span class="badge ${u.role==='admin'?'badge-brand':u.role==='manager'?'badge-amber':u.role==='operator'?'badge-blue':u.role==='custom'?'badge-purple':'badge-gray'}">${(ROLES[u.role]||{label:u.role||'?'}).label}</span></td>
    <td>${u.active!==false?`<span class="badge badge-green">${t('activeLabel')}</span>`:`<span class="badge badge-red">${t('inactiveLabel')}</span>`}</td>
    <td><div style="display:flex;gap:4px;">
      <button class="btn btn-ghost  btn-sm btn-icon" onclick="editUser('${u.id}')">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="toggleUserActive('${u.id}',${u.active!==false})">${u.active!==false?'🚫':'✅'}</button>
    </div></td>
  </tr>`).join('') || `<tr><td colspan="5" class="table-empty"><div class="empty-icon">👥</div><p>No users found</p></td></tr>`;
}

function userFormHTML(d) {
  d = d || {};
  const isNew = !d.id;
  const initialRole = d.role || 'admin';
  return `
  <div class="form-group"><label class="form-label">Display Name <span style="color:var(--brand)">*</span></label><input type="text" id="uf-name" class="form-input" value="${esc(d.displayName||'')}" placeholder="Full name"></div>
  <div class="form-group"><label class="form-label">Email <span style="color:var(--brand)">*</span></label><input type="email" id="uf-email" class="form-input" value="${esc(d.email||'')}" placeholder="user@example.com" ${!isNew?'readonly':''}></div>
  ${isNew?`<div class="form-group"><label class="form-label">Temporary Password <span style="color:var(--brand)">*</span></label><input type="password" id="uf-pass" class="form-input" placeholder="Min 6 characters"></div>`:''}
  <div class="form-group"><label class="form-label">Role <span style="color:var(--brand)">*</span></label>
    <select id="uf-role" class="form-select" onchange="onUserRoleChange()">
      ${Object.entries(ROLES).map(([k,r])=>`<option value="${k}" ${initialRole===k?'selected':''}>${r.label}</option>`).join('')}
    </select>
  </div>
  <div id="uf-perms-section">${userPermsChecklistHTML(initialRole)}</div>
  <div class="form-group"><label class="form-label">Status</label>
    <select id="uf-active" class="form-select">
      <option value="true"  ${d.active!==false?'selected':''}>${t('activeLabel')}</option>
      <option value="false" ${d.active===false ?'selected':''}>${t('inactiveLabel')}</option>
    </select>
  </div>`;
}

/** Checkbox grid for the "Custom" role — only rendered when that role is selected in the
 *  form. Starting checked-state comes from (in priority order): the user's own saved
 *  customPermissions if they're already Custom, otherwise the fixed permission set of
 *  whatever role they had before switching to Custom (so an admin tweaking an existing
 *  Manager into Custom starts from Manager's permissions, not a blank slate), otherwise
 *  (a brand-new user) every box starts unchecked. */
function userPermsChecklistHTML(selectedRole) {
  if (selectedRole !== 'custom') return '';
  const orig = _editingUserData || {};
  const base = (orig.role === 'custom' && orig.customPermissions) ? orig.customPermissions : (ROLES[orig.role] || {});
  return `
  <div class="form-group">
    <label class="form-label">${esc(t('customPermissionsLabel'))}</label>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 14px;padding:12px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);">
      ${PERMISSION_KEYS.map(k => `
      <label style="display:flex;align-items:center;gap:8px;font-size:0.83rem;cursor:pointer;margin:0;">
        <input type="checkbox" class="uf-perm-check" data-perm="${k}" ${base[k] ? 'checked' : ''}>
        ${esc(t(PERMISSION_LABEL_KEYS[k] || k))}
      </label>`).join('')}
    </div>
  </div>`;
}

/** Re-renders the permissions checklist whenever the Role dropdown changes, so picking
 *  "Custom" reveals it (pre-filled from the user's original role, see above) and picking
 *  any fixed role hides it again. */
function onUserRoleChange() {
  const role = document.getElementById('uf-role')?.value;
  const section = document.getElementById('uf-perms-section');
  if (section) section.innerHTML = userPermsChecklistHTML(role);
}

let _editingUserData = null; // the user record currently open in the New/Edit User modal, kept for userPermsChecklistHTML()'s pre-fill logic

function openUserModal(d) {
  editingId = d?.id || null;
  _editingUserData = d || {};
  document.getElementById('modal-user-title').textContent = d ? t('editUser') : t('newUser');
  document.getElementById('modal-user-body').innerHTML    = userFormHTML(d);
  openModal('modal-user');
}

async function editUser(id) {
  const u = (window._users || []).find(x => x.id === id);
  if (u) openUserModal(u);
}

async function saveUser() {
  const name   = document.getElementById('uf-name')?.value?.trim();
  const email  = document.getElementById('uf-email')?.value?.trim();
  const role   = document.getElementById('uf-role')?.value   || 'viewer';
  const active = document.getElementById('uf-active')?.value === 'true';
  if (!name || !email) { toast(t('nameEmailRequired'), 'error'); return; }

  // Custom permissions only apply (and are only saved) when Role is set to Custom —
  // switching a user back to a fixed role clears any previously saved custom set so it
  // doesn't linger unused on their record.
  const customPermissions = role === 'custom'
    ? Object.fromEntries(PERMISSION_KEYS.map(k => [k, !!document.querySelector(`.uf-perm-check[data-perm="${k}"]`)?.checked]))
    : null;

  const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();

  if (editingId) {
    try {
      if (db) await db.collection('sonick_users').doc(editingId).update({ displayName: name, role, customPermissions, active, updatedAt: ts });
      toast(t('userUpdated'), 'success'); closeModal('modal-user'); renderUsers();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  } else {
    const pass = document.getElementById('uf-pass')?.value;
    if (!pass || pass.length < 6) { toast(t('passRequired'), 'error'); return; }
    try {
      let uid = 'user_' + Date.now();
      try {
        // Isolated secondary Firebase app, same as createDriverWithPortal() above —
        // creating a user on the PRIMARY auth instance would immediately sign the
        // admin in AS that new user (Firebase Auth behavior), kicking them out of
        // their own session before the new user's Firestore profile even exists.
        const secAuth = _getSecondaryAuth();
        const cred    = await secAuth.createUserWithEmailAndPassword(email, pass);
        uid = cred.user.uid;
        await cred.user.updateProfile({ displayName: name });
        await secAuth.signOut();
      } catch (authErr) { console.warn('Auth creation note:', authErr.message); toast('Note: ' + authErr.message, 'info'); }
      if (db) await db.collection('sonick_users').doc(uid).set({ displayName: name, email, role, customPermissions, active, createdAt: ts, createdBy: currentUserData?.id });
      toast(t('userCreated'), 'success'); closeModal('modal-user'); renderUsers();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  }
}

async function toggleUserActive(id, currentlyActive) {
  const action = currentlyActive ? 'disable' : 'enable';
  confirmAction(`${action.charAt(0).toUpperCase() + action.slice(1)} this user?`, '', async () => {
    try { if (db) await db.collection('sonick_users').doc(id).update({ active: !currentlyActive }); toast(`User ${action}d`, 'success'); renderUsers(); }
    catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===================================================
//  SETTINGS
// ===================================================
let _exportColsDraft = null; // working copy of the export-columns list while Settings is open; rebuilt fresh each time renderSettings() runs
let _exportColsSectionCollapsed = true; // Export Columns section starts shrunk; persists across renderSettings() re-renders (module-level, not reset per render)

async function renderSettings() {
  const content = document.getElementById('page-content');
  let settings = { dollarRate: dollPrice };
  try { if (db) { const doc = await db.collection('sonick_settings').doc('general').get(); if (doc.exists) settings = doc.data(); } } catch (e) {}
  if (Array.isArray(settings.exportColumns)) exportColumnsConfig = settings.exportColumns; // keep the export functions' cache in sync with what Settings just fetched
  _exportColsDraft = resolveExportColumnsFull();
  await refreshExportReportsCache(); // fetch fresh saved reports, same pattern as renderCompanies()

  content.innerHTML = `
  ${pageHeader(t('settings'), [t('system')])}
  <div class="settings-section">
    <div class="settings-section-title">⚙️ ${esc(t('financialSettingsTitle'))}</div>
    <div class="settings-row">
      <div><div class="settings-row-label">${esc(t('dollarRateLabel'))}</div><div class="settings-row-desc">${esc(t('dollarRateDesc'))}</div></div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="s-dollrate" class="form-input" value="${settings.dollarRate||''}" style="width:160px;" placeholder="e.g. 89500">
        ${can('canManageUsers') ? `<button class="btn btn-primary btn-sm" onclick="saveDollarRate()">${esc(t('saveBtn'))}</button>` : ''}
      </div>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="toggleExportColumnsSection()">
      <span>📊 ${esc(t('exportColumnsTitle'))}</span>
      <span id="export-columns-toggle-icon" style="display:inline-block;transition:transform var(--transition);transform:rotate(${_exportColsSectionCollapsed ? '0' : '180'}deg);">▾</span>
    </div>
    <div id="export-columns-section-body" style="display:${_exportColsSectionCollapsed ? 'none' : 'block'};">
      <div class="settings-row">
        <div><div class="settings-row-label">💾 ${esc(t('savedReportsTitle'))}</div><div class="settings-row-desc">${esc(t('savedReportsDesc'))}</div></div>
        ${can('canManageUsers') ? `<button class="btn btn-secondary btn-sm" onclick="openExportReportModal()">+ ${esc(t('newReportBtn'))}</button>` : ''}
      </div>
      <div id="export-reports-list">${renderExportReportsList()}</div>
      <div class="settings-row" style="border-top:1px solid var(--border-2);margin-top:10px;padding-top:14px;">
        <div class="settings-row-desc" style="max-width:640px;">${esc(t('exportColumnsDesc'))}</div>
      </div>
      <div id="export-columns-list">${renderExportColumnsRows()}</div>
      <div class="settings-row">
        <div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="resetExportColumnsDefault()">${esc(t('resetToDefaultBtn'))}</button>
          ${can('canManageUsers') ? `<button class="btn btn-primary btn-sm" onclick="saveExportColumns()">${esc(t('saveBtn'))}</button>` : ''}
        </div>
      </div>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">👤 ${esc(t('myProfileTitle'))}</div>
    <div class="settings-row">
      <div><div class="settings-row-label">${esc(t('displayNameLabel'))}</div><div class="settings-row-desc">${esc(t('displayNameDesc'))}</div></div>
      <input type="text" id="s-displayname" class="form-input" value="${esc(currentUserData?.displayName||'')}" style="width:200px;">
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">${esc(t('emailLabel'))}</div><div class="settings-row-desc">${esc(t('yourLoginEmailDesc'))}</div></div>
      <span style="color:var(--text-2);font-size:13px;">${esc(currentUser?.email||'—')}</span>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">${esc(t('roleLabel'))}</div><div class="settings-row-desc">${esc(t('rolePermissionsDesc'))}</div></div>
      <span class="badge badge-brand">${(ROLES[currentUserData?.role]||{label:'?'}).label}</span>
    </div>
    <div class="settings-row"><div></div><button class="btn btn-primary btn-sm" onclick="saveProfile()">${esc(t('saveProfileBtn'))}</button></div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">🔐 ${esc(t('securityTitle'))}</div>
    <div class="settings-row">
      <div><div class="settings-row-label">${esc(t('changePasswordLabel'))}</div><div class="settings-row-desc">${esc(t('changePasswordDesc'))}</div></div>
      <button class="btn btn-secondary btn-sm" onclick="sendPasswordReset()">${esc(t('sendResetEmailBtn'))}</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">ℹ️ ${esc(t('systemInfoTitle'))}</div>
    <div class="settings-row"><div class="settings-row-label">${esc(t('versionLabel'))}</div><span style="color:var(--text-3);font-family:var(--mono);">2.0.0-web</span></div>
    <div class="settings-row"><div class="settings-row-label">${esc(t('firebaseProjectLabel'))}</div><span style="color:var(--text-3);font-family:var(--mono);">${firebaseConfig.projectId||esc(t('notConfiguredText'))}</span></div>
    <div class="settings-row"><div class="settings-row-label">${esc(t('userIdLabel'))}</div><span style="color:var(--text-3);font-family:var(--mono);font-size:11px;">${currentUser?.uid||'—'}</span></div>
  </div>`;
}

async function saveDollarRate() {
  const rate = parseInt(document.getElementById('s-dollrate')?.value) || 0;
  if (!rate) { toast(t('rateRequired'), 'error'); return; }
  try {
    if (db) await db.collection('sonick_settings').doc('general').set({ dollarRate: rate }, { merge: true });
    dollPrice = rate;
    const ratEl = document.getElementById('topbar-dollar-rate');
    const el    = document.getElementById('topbar-dollar');
    if (ratEl) ratEl.textContent = formatNum(rate) + ' L.L.';
    if (el)    el.style.display  = 'flex';
    toast(t('rateUpdated'), 'success');
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

/** Renders the export-columns checklist rows from the current draft (_exportColsDraft) —
 *  called both by renderSettings() on first paint and by _refreshExportColumnsList() after
 *  every toggle/reorder, so only this list re-renders rather than the whole Settings page. */
function renderExportColumnsRows() {
  return _exportColsDraft.map((c, i) => `
    <div class="settings-row">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin:0;">
        <input type="checkbox" ${c.visible ? 'checked' : ''} onchange="toggleExportColumn('${c.key}')">
        <span class="settings-row-label">${esc(c.label)}</span>
      </label>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-sm btn-icon" title="Move up"   ${i === 0 ? 'disabled' : ''} onclick="moveExportColumn('${c.key}', -1)">▲</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Move down" ${i === _exportColsDraft.length - 1 ? 'disabled' : ''} onclick="moveExportColumn('${c.key}', 1)">▼</button>
      </div>
    </div>`).join('');
}

function _refreshExportColumnsList() {
  const list = document.getElementById('export-columns-list');
  if (list) list.innerHTML = renderExportColumnsRows();
}

function toggleExportColumn(key) {
  const col = _exportColsDraft.find(c => c.key === key);
  if (col) col.visible = !col.visible;
  _refreshExportColumnsList();
}

function moveExportColumn(key, dir) {
  const i = _exportColsDraft.findIndex(c => c.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= _exportColsDraft.length) return;
  [_exportColsDraft[i], _exportColsDraft[j]] = [_exportColsDraft[j], _exportColsDraft[i]];
  _refreshExportColumnsList();
}

function resetExportColumnsDefault() {
  _exportColsDraft = EXPORT_COLUMN_DEFS.map(c => ({ ...c, visible: true }));
  _refreshExportColumnsList();
}

async function saveExportColumns() {
  const payload = _exportColsDraft.map(c => ({ key: c.key, visible: c.visible }));
  try {
    if (db) await db.collection('sonick_settings').doc('general').set({ exportColumns: payload }, { merge: true });
    exportColumnsConfig = payload;
    toast(t('exportColumnsSaved'), 'success');
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

/** Expand/shrink the whole Export Columns settings card (default columns + saved reports).
 *  Starts shrunk (_exportColsSectionCollapsed = true); state persists across renderSettings()
 *  re-renders since it lives in a module-level variable, not local render state. */
function toggleExportColumnsSection() {
  _exportColsSectionCollapsed = !_exportColsSectionCollapsed;
  const body = document.getElementById('export-columns-section-body');
  const icon = document.getElementById('export-columns-toggle-icon');
  if (body) body.style.display = _exportColsSectionCollapsed ? 'none' : 'block';
  if (icon) icon.style.transform = `rotate(${_exportColsSectionCollapsed ? '0' : '180'}deg)`;
}

// ===================================================
//  SAVED EXPORT REPORTS (named column presets)
// ===================================================
let _reportColsDraft        = null; // working copy of a report's column list while its modal is open
let editingExportReportId   = null;

function renderExportReportsList() {
  const reports = exportReports_cache || [];
  if (!reports.length) return `<div class="settings-row"><div class="settings-row-desc">${esc(t('noSavedReports'))}</div></div>`;
  return reports.map(r => `
    <div class="settings-row">
      <div><div class="settings-row-label">${esc(r.name)}</div><div class="settings-row-desc">${(r.columns||[]).filter(c => c.visible !== false).length} ${esc(t('columnsEnabledLabel'))}</div></div>
      ${can('canManageUsers') ? `
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost  btn-sm btn-icon" title="Edit"   onclick="editExportReport('${r.id}')">✏️</button>
        <button class="btn btn-danger btn-sm btn-icon" title="Delete" onclick="deleteExportReport('${r.id}')">🗑</button>
      </div>` : ''}
    </div>`).join('');
}

/** Open the New/Edit Report modal. Pass an existing saved report to edit it, or nothing to
 *  start a fresh one seeded from the full default column set (all visible). */
function openExportReportModal(report) {
  editingExportReportId = report?.id || null;
  _reportColsDraft = report ? resolveColumnsFromConfig(report.columns) : EXPORT_COLUMN_DEFS.map(c => ({ ...c, visible: true }));
  document.getElementById('modal-export-report-title').textContent = report ? t('editReportTitle') : t('newReportTitle');
  document.getElementById('erf-name-label').textContent = t('reportNameLabel');
  const nameInput = document.getElementById('erf-name');
  nameInput.value = report?.name || '';
  nameInput.placeholder = t('reportNamePlaceholder');
  _refreshReportColumnsList();
  openModal('modal-export-report');
}

function editExportReport(id) {
  const r = (exportReports_cache || []).find(x => x.id === id);
  if (r) openExportReportModal(r);
}

function renderReportColumnsRows() {
  return _reportColsDraft.map((c, i) => `
    <div class="settings-row" style="padding:6px 4px;">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin:0;">
        <input type="checkbox" ${c.visible ? 'checked' : ''} onchange="toggleReportColumn('${c.key}')">
        <span class="settings-row-label">${esc(c.label)}</span>
      </label>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-sm btn-icon" title="Move up"   ${i === 0 ? 'disabled' : ''} onclick="moveReportColumn('${c.key}', -1)">▲</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Move down" ${i === _reportColsDraft.length - 1 ? 'disabled' : ''} onclick="moveReportColumn('${c.key}', 1)">▼</button>
      </div>
    </div>`).join('');
}

function _refreshReportColumnsList() {
  const list = document.getElementById('export-report-columns-list');
  if (list) list.innerHTML = renderReportColumnsRows();
}

function toggleReportColumn(key) {
  const col = _reportColsDraft.find(c => c.key === key);
  if (col) col.visible = !col.visible;
  _refreshReportColumnsList();
}

function moveReportColumn(key, dir) {
  const i = _reportColsDraft.findIndex(c => c.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= _reportColsDraft.length) return;
  [_reportColsDraft[i], _reportColsDraft[j]] = [_reportColsDraft[j], _reportColsDraft[i]];
  _refreshReportColumnsList();
}

async function saveExportReport() {
  const name = document.getElementById('erf-name')?.value?.trim();
  if (!name) { toast(t('reportNameRequired'), 'error'); return; }
  const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  const payload = { name, columns: _reportColsDraft.map(c => ({ key: c.key, visible: c.visible })), updatedAt: ts };
  try {
    if (editingExportReportId) {
      if (db) await db.collection('sonick_export_reports').doc(editingExportReportId).update(payload);
      toast(t('reportUpdated'), 'success');
    } else {
      if (db) await db.collection('sonick_export_reports').add({ ...payload, createdAt: ts });
      toast(t('reportCreated'), 'success');
    }
    closeModal('modal-export-report');
    await refreshExportReportsCache();
    renderSettings();
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

async function deleteExportReport(id) {
  confirmAction(t('deleteReportConfirm'), '', async () => {
    try {
      if (db) await db.collection('sonick_export_reports').doc(id).delete();
      await refreshExportReportsCache();
      toast(t('deleted'), 'success');
      renderSettings();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

/** Refetch saved export reports from Firestore into exportReports_cache — called after any
 *  create/edit/delete so both Settings and the export-options picker stay in sync. */
async function refreshExportReportsCache() {
  try {
    if (db) {
      const snap = await db.collection('sonick_export_reports').orderBy('name').get();
      exportReports_cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { console.warn('Export reports cache refresh failed:', e.message); }
}

async function saveProfile() {
  const name = document.getElementById('s-displayname')?.value?.trim();
  if (!name) { toast(t('nameRequired'), 'error'); return; }
  try {
    if (currentUser) await currentUser.updateProfile({ displayName: name });
    if (db) await db.collection('sonick_users').doc(currentUser.uid).update({ displayName: name });
    currentUserData.displayName = name;
    document.getElementById('user-display-name').textContent = name;
    document.getElementById('user-avatar').textContent       = name.slice(0, 2).toUpperCase();
    toast(t('profileUpdated'), 'success');
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

async function sendPasswordReset() {
  try {
    if (currentUser?.email && auth) await auth.sendPasswordResetEmail(currentUser.email);
    toast(t('resetSent') + currentUser?.email, 'success');
  } catch (e) { toast(t('error') + e.message, 'error'); }
}

// ===================================================
//  BACKUP & RESTORE
// ===================================================
const BACKUP_COLLECTIONS = [
  'sonick_shipments', 'sonick_archive', 'sonick_companies', 'sonick_drivers',
  'sonick_billtypes', 'sonick_payments', 'sonick_users', 'sonick_settings',
  'sonick_export_reports'
];
const BACKUP_LAST_KEY = 'sonick_last_backup_at';
let _pendingRestoreFile = null;
let _pendingRestoreData = null;

/** Recursively convert Firestore Timestamp-like objects to ISO strings so the backup is plain, portable JSON. */
function _serializeForBackup(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(_serializeForBackup);
  if (typeof value === 'object') {
    const out = {};
    for (const k in value) out[k] = _serializeForBackup(value[k]);
    return out;
  }
  return value;
}

async function renderBackup() {
  if (!can('canManageBackup')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  const lastAt  = localStorage.getItem(BACKUP_LAST_KEY);
  const lastLabel = lastAt ? fmtDate(lastAt) + ' · ' + new Date(lastAt).toLocaleTimeString() : t('neverBackedUp');

  content.innerHTML = `
  ${pageHeader(t('backupRestore'), [t('system')])}

  <div class="settings-section">
    <div class="settings-section-title"><span class="icon-inline">${ICONS.database}</span> ${t('backupSectionTitle')}</div>
    <div class="settings-row">
      <div>
        <div class="settings-row-desc" style="max-width:520px;">${t('backupSectionDesc')}</div>
        <div class="settings-row-desc" style="margin-top:8px;color:var(--text-3);">${t('lastBackupLabel')}: <strong style="color:var(--text-2);">${esc(lastLabel)}</strong></div>
      </div>
      <button class="btn btn-primary btn-sm" id="backup-download-btn" onclick="createBackup()">
        <span class="icon-inline">${ICONS.download}</span> ${t('downloadBackupBtn')}
      </button>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-title"><span class="icon-inline">${ICONS.upload}</span> ${t('restoreSectionTitle')}</div>
    <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:12px;">
      <div class="settings-row-desc">${t('restoreSectionDesc')}</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <input type="file" id="restore-file-input" accept="application/json,.json" class="hidden" onchange="handleBackupFileChosen(event)">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('restore-file-input').click()">${t('chooseBackupFile')}</button>
        <span id="restore-file-name" style="font-size:0.857rem;color:var(--text-3);">${t('noFileChosen')}</span>
      </div>
      <div class="restore-mode-group" role="radiogroup" aria-label="${t('restoreModeTitle')}">
        <div class="restore-mode-title">${t('restoreModeTitle')}</div>
        <label class="restore-mode-option">
          <input type="radio" name="restore-mode" value="merge" checked>
          <div>
            <div class="restore-mode-option-label">${t('restoreModeMerge')}</div>
            <div class="restore-mode-option-desc">${t('restoreModeMergeDesc')}</div>
          </div>
        </label>
        <label class="restore-mode-option">
          <input type="radio" name="restore-mode" value="replace">
          <div>
            <div class="restore-mode-option-label">${t('restoreModeReplace')}</div>
            <div class="restore-mode-option-desc">${t('restoreModeReplaceDesc')}</div>
          </div>
        </label>
      </div>
      <div>
        <button class="btn btn-danger btn-sm" id="backup-restore-btn" onclick="confirmRestoreBackup()" disabled>
          <span class="icon-inline">${ICONS.upload}</span> ${t('restoreBtn')}
        </button>
      </div>
    </div>
  </div>`;
}

async function createBackup() {
  const btn = document.getElementById('backup-download-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('creatingBackup'); }
  try {
    const collections = {};
    for (const col of BACKUP_COLLECTIONS) {
      const snap = await db.collection(col).get();
      collections[col] = snap.docs.map(d => ({ id: d.id, ..._serializeForBackup(d.data()) }));
    }
    const payload = {
      _sonickBackup: true,
      exportedAt: new Date().toISOString(),
      appVersion: '2.0.0-web',
      collections
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url; a.download = `sonick-backup-${stamp}.json`; a.click();
    URL.revokeObjectURL(url);

    localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
    toast(t('backupDownloaded'), 'success');
    renderBackup();
  } catch (e) {
    toast(t('backupFailed') + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `<span class="icon-inline">${ICONS.download}</span> ${t('downloadBackupBtn')}`; }
  }
}

function handleBackupFileChosen(event) {
  const file = event.target.files?.[0];
  const nameEl = document.getElementById('restore-file-name');
  const restoreBtn = document.getElementById('backup-restore-btn');
  _pendingRestoreFile = file || null;
  _pendingRestoreData = null;
  if (!file) {
    if (nameEl) nameEl.textContent = t('noFileChosen');
    if (restoreBtn) restoreBtn.disabled = true;
    return;
  }
  if (nameEl) nameEl.textContent = file.name;
  if (restoreBtn) restoreBtn.disabled = true;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data._sonickBackup !== true || typeof data.collections !== 'object') {
        toast(t('invalidBackupFile'), 'error');
        return;
      }
      _pendingRestoreData = data;
      if (restoreBtn) restoreBtn.disabled = false;
    } catch (e) {
      toast(t('invalidBackupFile'), 'error');
    }
  };
  reader.onerror = () => toast(t('invalidBackupFile'), 'error');
  reader.readAsText(file);
}

function confirmRestoreBackup() {
  if (!_pendingRestoreData) { toast(t('invalidBackupFile'), 'error'); return; }
  const mode = document.querySelector('input[name="restore-mode"]:checked')?.value || 'merge';
  const counts = Object.entries(_pendingRestoreData.collections)
    .map(([col, docs]) => `${col.replace('sonick_', '')}: ${docs.length}`)
    .join(' · ');
  const warningMsg = mode === 'replace' ? t('restoreWarningMsgReplace') : t('restoreWarningMsgMerge');
  confirmAction(
    t('restoreWarningTitle'),
    `${warningMsg}\n\n${t('backupCollections')} — ${counts}`,
    () => performRestore(_pendingRestoreData, mode)
  );
}

async function performRestore(data, mode) {
  const restoreBtn = document.getElementById('backup-restore-btn');
  if (restoreBtn) { restoreBtn.disabled = true; restoreBtn.textContent = t('restoringData'); }
  try {
    for (const [col, docs] of Object.entries(data.collections)) {
      if (!Array.isArray(docs)) continue;
      // In merge mode an empty backup collection has nothing to add back, so skipping it
      // is correct. In replace mode we must NOT skip it — an empty collection in the backup
      // means "this should end up empty", so the wipe pass below still needs to run.
      if (!docs.length && mode !== 'replace') continue;

      let docsToWrite = docs;

      if (mode === 'replace') {
        // Wipe every current record in this collection first, so the end result matches
        // the backup exactly — nothing left over from after the backup was taken.
        //
        // Exception: never delete the signed-in user's own sonick_users doc here. Deleting
        // it (even briefly, mid-batch) revokes isAdmin() for the rest of the restore, since
        // that check reads this same doc — so any further create/delete in this collection
        // (including writing this doc back) gets denied and the restore dies mid-way. Their
        // doc still gets rewritten below via the write pass; Firestore treats that as an
        // update (self-update is always allowed) since we're leaving it in place rather than
        // deleting first, so it never loses the permission it needs to complete.
        const existingSnap = await db.collection(col).get();
        const existingIds = existingSnap.docs
          .map(d => d.id)
          .filter(id => !(col === 'sonick_users' && currentUser && id === currentUser.uid));
        for (let i = 0; i < existingIds.length; i += 400) {
          const chunk = existingIds.slice(i, i + 400);
          const batch = db.batch();
          chunk.forEach(id => batch.delete(db.collection(col).doc(id)));
          await batch.commit();
        }
      } else {
        // Merge: keep everything currently in the database untouched, only add back
        // records from the backup that no longer exist (by ID) — nothing is overwritten.
        const existingSnap = await db.collection(col).get();
        const existingIds = new Set(existingSnap.docs.map(d => d.id));
        docsToWrite = docs.filter(entry => entry.id && !existingIds.has(entry.id));
      }

      // Firestore batched writes are capped at 500 ops — chunk safely under that.
      for (let i = 0; i < docsToWrite.length; i += 400) {
        const chunk = docsToWrite.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach(entry => {
          const { id, ...fields } = entry;
          if (!id) return;
          batch.set(db.collection(col).doc(id), fields);
        });
        await batch.commit();
      }
    }
    toast(t('restoreSuccess'), 'success');
    _pendingRestoreFile = null;
    _pendingRestoreData = null;
    await loadCaches();
    renderBackup();
  } catch (e) {
    toast(t('restoreFailed') + e.message, 'error');
    if (restoreBtn) { restoreBtn.disabled = false; restoreBtn.innerHTML = `<span class="icon-inline">${ICONS.upload}</span> ${t('restoreBtn')}`; }
  }
}