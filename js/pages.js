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
    <img class="home-blank-logo" src="assets/logo-mark.png" alt="Sonick">
  </div>`;
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
  <div class="stats-grid">
    <div class="stat-card brand"><div class="stat-icon brand">${ICONS.package}</div><div class="stat-label">${t('totalShipments')}</div><div class="stat-value">${stats.total}</div></div>
    <div class="stat-card amber"><div class="stat-icon amber">${ICONS.clock}</div><div class="stat-label">${t('pending')}</div><div class="stat-value">${stats.pending}</div></div>
    <div class="stat-card green"><div class="stat-icon green">${ICONS.checkCircle}</div><div class="stat-label">${t('delivered')}</div><div class="stat-value">${stats.delivered}</div></div>
    <div class="stat-card blue"><div class="stat-icon blue">${ICONS.dollarSign}</div><div class="stat-label">${t('revenue')}</div><div class="stat-value mono">$${formatNum(stats.totalDol)}</div></div>
    ${showProfit ? `<div class="stat-card purple"><div class="stat-icon purple">${ICONS.trendingUp}</div><div class="stat-label">${t('profit')}</div><div class="stat-value mono">$${formatNum(stats.profit)}</div></div>` : ''}
  </div>

  ${can('canCreateShipments') || can('canManageCompanies') || can('canManageDrivers') ? `
  <div class="section-header"><div class="section-title">${t('quickActions')}</div></div>
  <div class="quick-actions">
    ${can('canCreateShipments') ? `<div class="quick-action" onclick="openNewShipmentModal()"><div class="qa-icon">${ICONS.plusCircle}</div><span>${t('newShipment')}</span></div>` : ''}
    <div class="quick-action" onclick="navigate('shipments')"><div class="qa-icon">${ICONS.package}</div><span>${t('viewShipments')}</span></div>
    ${can('canManageCompanies') ? `<div class="quick-action" onclick="navigate('companies')"><div class="qa-icon">${ICONS.building}</div><span>${t('companies')}</span></div>` : ''}
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
    }
  } catch (e) { ships = getDemoShipments(); }
  return sortShipsByActivity(ships);
}

let _shipmentsUnsub = null;

/** Subscribe to live shipment updates so admin edits and driver-portal edits (status
 *  changes, notes, reassignment) reflect instantly on both sides without a manual refresh.
 *  Replaces any previous subscription first — safe to call every time the Shipments page
 *  is opened. */
function subscribeShipments(onData) {
  if (_shipmentsUnsub) { _shipmentsUnsub(); _shipmentsUnsub = null; }
  if (!db) { onData(getDemoShipments()); return; }
  _shipmentsUnsub = db.collection('sonick_shipments').orderBy('createdAt', 'desc').limit(500)
    .onSnapshot(
      snap => onData(sortShipsByActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      err  => { console.warn('Shipments live-sync error:', err.message); onData(getDemoShipments()); }
    );
}

/** Reload shipment data and re-apply the current filters WITHOUT rebuilding the filter bar —
 *  keeps the active Company/Driver/Contractor/Status filters (and the Quick Add bar) intact. */
async function refreshShipmentsData() {
  window._allShips = await fetchShipmentsFromDB();
  filterShipments();
}

async function renderShipments() {
  if (!can('canViewShipments')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');

  const showProfit = can('canViewProfit');
  window._selectedShipIds = new Set(); // fresh row-selection state each time this page opens

  // Filter dropdowns list all companies/drivers — not just ones that appear in the
  // currently loaded shipments — so every entity is always selectable.
  const companyNames    = companies_cache.map(c => c.name).filter(Boolean).sort();
  const driverNames     = drivers_cache.map(d => d.name).filter(Boolean).sort();
  const contractorNames = companies_cache.map(c => c.name).filter(Boolean).sort();

  content.innerHTML = `
  ${pageHeader(t('shipments'), [t('operations')])}
  <div class="toolbar">
  <div class="filter-bar">
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
    <select class="filter-select" id="ship-driver-filter" onchange="filterShipments()">
      <option value="">${t('allDrivers')}</option>
      ${driverNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <select class="filter-select" id="ship-contractor-filter" onchange="filterShipments()">
      <option value="">${t('allContractors')}</option>
      ${contractorNames.map(name => `<option>${esc(name)}</option>`).join('')}
    </select>
    <input type="date" class="filter-date" id="ship-date-from" onchange="filterShipments()" title="From date">
    <input type="date" class="filter-date" id="ship-date-to"   onchange="filterShipments()" title="To date">
    <div class="table-search">
      <span class="search-icon">📞</span>
      <input type="text" placeholder="${t('searchByPhone')}" id="ship-phone-search" oninput="filterShipments()">
    </div>
    <div class="table-search">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="${t('searchShipments')}" id="ship-search" oninput="filterShipments()">
    </div>
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
        <input type="number" id="fo-shipnum" class="form-input" placeholder="${t('shipNumPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
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
      <div class="form-group fo-f-phone" style="margin-bottom:0;min-width:140px;">
        <label class="form-label">${t('phone')}</label>
        <input type="tel" id="fo-phone" class="form-input" placeholder="+961..." onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-address" style="margin-bottom:0;min-width:150px;">
        <label class="form-label">${t('address')}</label>
        <input type="text" id="fo-address" class="form-input" placeholder="${t('deliveryAddressPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
      </div>
      <div class="form-group fo-f-desc" style="margin-bottom:0;min-width:150px;">
        <label class="form-label">${t('descriptionNotesLabel')}</label>
        <input type="text" id="fo-desc" class="form-input" placeholder="${t('descPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddOrder();}">
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
        <input type="text" id="ba-shipnums" class="form-input" placeholder="${t('orderNumbersPlaceholder')}" onkeydown="if(event.key==='Enter'){event.preventDefault();bulkAssignOrders();}">
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
      ${can('canExport') ? `<button class="btn btn-secondary btn-sm" onclick="exportExcel()">${ICONS.excelFile} ${t('exportExcelBtn')}</button>
      <button class="btn btn-secondary btn-sm" onclick="exportPDF()">${ICONS.pdfFile} ${t('exportPdfBtn')}</button>` : ''}
    </div>
    <div class="table-scroll">
      <table id="ships-table">
        <thead><tr>
          ${can('canEditShipments') ? `<th style="width:36px;text-align:center;"><input type="checkbox" id="ships-select-all" onchange="toggleSelectAllShipments(this)"></th>` : ''}
          <th>${t('shipNum')}</th><th>${t('customer')}</th><th>${t('company')}</th>
          <th>${t('driver')}</th><th>${t('contractor')}</th>
          <th>${t('priceUSD')}</th><th>${t('priceLL')}</th>
          ${showProfit ? `<th>${t('profitCol')}</th>` : ''}
          <th>${t('status')}</th><th>${t('date')}</th><th>${t('actions')}</th>
        </tr></thead>
        <tbody id="ships-tbody"></tbody>
      </table>
    </div>
    <div class="table-footer">
      <span id="ships-total-label" style="color:var(--text-3);"></span>
      <span id="ships-summary"     style="color:var(--text-2);font-family:var(--mono);"></span>
    </div>
  </div>
  <div class="mobile-cards" id="ships-mobile"></div>`;

  window._allShips = [];
  subscribeShipments(ships => { window._allShips = ships; filterShipments(); });
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
  const contractorObj = contractorName ? companies_cache.find(c => c.name === contractorName)  : null;

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
      driverId: driverObj?.id || '',         driverName: driverObj?.name || '',
      contractorId: contractorObj?.id || '', contractorName: contractorObj?.name || '',
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

/** True if a shipment with this ship number already exists for this company — queried directly
 *  against Firestore (not the local cache) so the check is accurate no matter which page the
 *  user is creating the order from. Skipped (returns false) when there's no company to compare
 *  against, or if the check itself fails — never blocks a save due to a network hiccup. */
async function shipNumberExistsForCompany(shipNumber, companyId) {
  if (!db || !companyId) return false;
  try {
    const snap = await db.collection('sonick_shipments')
      .where('shipNumber', '==', shipNumber)
      .where('companyId', '==', companyId)
      .limit(1)
      .get();
    return !snap.empty;
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
  const shipNumber    = parseInt(shipNumberRaw, 10);
  if (!shipNumberRaw || isNaN(shipNumber)) { toast(t('shipNumRequired'), 'error'); return; }

  if (await shipNumberExistsForCompany(shipNumber, fixed.companyId)) {
    toast(t('duplicateShipNumber'), 'error');
    return;
  }

  const priceRaw     = document.getElementById('fo-price')?.value;
  const priceDollar  = parseFloat(priceRaw);
  if (priceRaw === '' || priceRaw == null || isNaN(priceDollar)) { toast(t('priceUSD'), 'error'); return; }

  const priceLeb = parseFloat(document.getElementById('fo-priceleb')?.value) || 0;

  const customerName = document.getElementById('fo-customer')?.value?.trim() || '';

  const payload = {
    shipNumber,
    date:                   today(),
    customerName,
    customerPhone:          document.getElementById('fo-phone')?.value?.trim()   || '',
    customerAddress:        document.getElementById('fo-address')?.value?.trim() || '',
    companyId:              fixed.companyId,    companyName:    fixed.companyName,
    driverId:               fixed.driverId,     driverName:     fixed.driverName,
    contractorId:           fixed.contractorId, contractorName: fixed.contractorName,
    status:                 'Pending',
    priceDollar,
    priceLeb,
    driverDeliveryCost:     fixed.driverDeliveryCost,
    contractorDeliveryCost: fixed.contractorDeliveryCost,
    deliveryProfit:         fixed.deliveryProfit,
    returnedDeliveryCost:   0,
    withdrawnAmountDollar:  0,
    withdrawnAmountLeb:     0,
    description:            document.getElementById('fo-desc')?.value?.trim() || '',
    createdAt:              firebase.firestore.FieldValue.serverTimestamp(),
    createdBy:              currentUserData?.id || '',
    updatedAt:              firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy:              currentUserData?.id || '',
  };

  try {
    if (db) await db.collection('sonick_shipments').add(payload);
    toast(t('shipmentCreated'), 'success');
    document.getElementById('fo-shipnum').value   = '';
    document.getElementById('fo-customer').value  = '';
    document.getElementById('fo-phone').value     = '';
    document.getElementById('fo-price').value     = '';
    document.getElementById('fo-priceleb').value  = '';
    document.getElementById('fo-address').value   = '';
    document.getElementById('fo-desc').value      = '';
    await refreshShipmentsData();
    document.getElementById('fo-shipnum')?.focus();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
  }
}

/** Assign one or more existing shipments — identified by ship number, comma-separated —
 *  to the driver/contractor fixed by the active filters (Bulk Assign bar). */
async function bulkAssignOrders() {
  const fixed = window._bulkAssignFixed;
  if (!fixed) return;

  const raw  = document.getElementById('ba-shipnums')?.value || '';
  const nums = [...new Set(
    raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
  )];
  if (!nums.length) { toast(t('orderNumbersRequired'), 'error'); return; }

  const updates = {};
  if (fixed.driverId)     { updates.driverId     = fixed.driverId;     updates.driverName     = fixed.driverName; }
  if (fixed.contractorId) { updates.contractorId = fixed.contractorId; updates.contractorName = fixed.contractorName; }
  updates.updatedAt = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  updates.updatedBy = currentUserData?.id || '';

  const allShips = window._allShips || [];
  const matched  = [];
  const notFound = [];
  nums.forEach(n => {
    const hits = allShips.filter(s => s.shipNumber === n);
    if (hits.length) matched.push(...hits); else notFound.push(n);
  });

  if (!matched.length) { toast(t('noMatchingOrders'), 'error'); return; }

  try {
    if (db) {
      const batch = db.batch();
      matched.forEach(s => batch.update(db.collection('sonick_shipments').doc(s.id), updates));
      await batch.commit();
    }
    const msg = `${matched.length} ${t('ordersAssignedLabel')}` +
      (notFound.length ? ` — ${t('notFoundLabel')}: ${notFound.join(', ')}` : '');
    toast(msg, 'success');
    document.getElementById('ba-shipnums').value = '';
    await refreshShipmentsData();
    document.getElementById('ba-shipnums')?.focus();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
  }
}

function filterShipments() {
  const searchRaw  = (document.getElementById('ship-search')?.value || '').trim();
  const searchNums = searchRaw.includes(',')
    ? [...new Set(searchRaw.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n)))]
    : null;
  const search     = searchRaw.toLowerCase();
  const phoneSearch = (document.getElementById('ship-phone-search')?.value || '').trim();
  const statuses   =  [...document.querySelectorAll('.ship-status-check:checked')].map(cb => cb.value);
  const company    =  document.getElementById('ship-company-filter')?.value     || '';
  const driver     =  document.getElementById('ship-driver-filter')?.value      || '';
  const contractor =  document.getElementById('ship-contractor-filter')?.value  || '';
  const dateFrom   =  document.getElementById('ship-date-from')?.value          || '';
  const dateTo     =  document.getElementById('ship-date-to')?.value            || '';

  updateStatusFilterLabel(statuses);
  updateOrderEntryBars(company, driver, contractor);

  let ships = (window._allShips || []).filter(s => {
    if (searchNums) {
      if (!searchNums.includes(s.shipNumber)) return false;
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
    if (dateFrom && s.date < dateFrom) return false;
    if (dateTo   && s.date > dateTo)   return false;
    return true;
  });

  window._filteredShips = ships; // exact "searched rows" set, used by archiveFilteredShipments()

  const showProfit = can('canViewProfit');
  let totalDol = 0, totalLeb = 0, totalProfit = 0;
  let withdrawnDol = 0, withdrawnLeb = 0, withdrawnCount = 0;
  ships.forEach(s => {
    totalDol    += s.priceDollar    || 0;
    totalLeb    += s.priceLeb       || 0;
    totalProfit += s.deliveryProfit || 0;
    if (s.status === 'Returned-Paid') totalProfit -= (s.returnedDeliveryCost || 0);
    if (s.status === 'Withdrawn') {
      withdrawnDol += s.withdrawnAmountDollar || 0;
      withdrawnLeb += s.withdrawnAmountLeb    || 0;
      withdrawnCount++;
    }
  });
  const netDol = totalDol - withdrawnDol;
  const netLeb = totalLeb - withdrawnLeb;

  const tbody    = document.getElementById('ships-tbody');
  const mobile   = document.getElementById('ships-mobile');
  const countEl  = document.getElementById('ships-count');
  const summaryEl= document.getElementById('ships-summary');
  const totalEl  = document.getElementById('ships-total-label');

  if (countEl)   countEl.textContent   = `${ships.length} ${t('shipments')}`;
  if (summaryEl) summaryEl.textContent = `${t('total')} $${formatNum(totalDol)} | L.L. ${formatNum(totalLeb)}`
    + (showProfit ? ' | ' + t('profitF') + ': $' + formatNum(totalProfit) : '')
    + (withdrawnCount ? ` | ${t('withdrawnLabel')}: $${formatNum(withdrawnDol)} / L.L. ${formatNum(withdrawnLeb)} | ${t('netRemainingLabel')}: $${formatNum(netDol)} / L.L. ${formatNum(netLeb)}` : '');
  if (totalEl)   totalEl.textContent   = `${t('showing')} ${ships.length} ${t('of')} ${(window._allShips || []).length} ${t('shipments')}`;

  if (tbody) {
    const canEditCells = can('canEditShipments');
    tbody.innerHTML = ships.length
      ? ships.map(s => {
          const dbl = (field) => canEditCells ? `ondblclick="inlineEditCell(this,'${s.id}','${field}')" class="cell-editable" title="${t('dblClickToEdit')}"` : '';
          return `
        <tr>
          ${canEditCells ? `<td style="text-align:center;"><input type="checkbox" class="ship-row-check" value="${s.id}" ${window._selectedShipIds.has(s.id) ? 'checked' : ''} onchange="toggleShipRowCheck('${s.id}', this.checked)"></td>` : ''}
          <td ${dbl('shipNumber')}><span class="font-mono" style="color:var(--brand-light);font-weight:600;">#${s.shipNumber || '—'}</span></td>
          <td>
            <div ${dbl('customerName')} style="font-weight:500;">${esc(s.customerName || '—')}</div>
            <div ${dbl('customerPhone')} style="font-size:11px;color:var(--text-3);">${esc(s.customerPhone || '')}</div>
          </td>
          <td ${dbl('companyId')}>${esc(s.companyName    || '—')}</td>
          <td ${dbl('driverId')}>${esc(s.driverName     || '—')}</td>
          <td ${dbl('contractorId')}>${esc(s.contractorName || '—')}</td>
          <td ${dbl('priceDollar')} class="font-mono">$${formatNum(s.priceDollar || 0)}</td>
          <td ${dbl('priceLeb')} class="font-mono">${formatNum(s.priceLeb || 0)}</td>
          ${showProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.deliveryProfit || 0)}</td>` : ''}
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
      : `<tr><td colspan="${(canEditCells ? 1 : 0) + (showProfit ? 11 : 10)}" class="table-empty"><div class="empty-icon">📦</div><p>No shipments match your filters</p></td></tr>`;
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
  const dateFrom   = document.getElementById('ship-date-from');
  const dateTo     = document.getElementById('ship-date-to');
  if (company)    company.value    = '';
  if (driver)     driver.value     = '';
  if (contractor) contractor.value = '';
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
        commitBulkStatus(ids, newStatus, { returnedDeliveryCost });
      },
      () => {} // cancelled — keep original statuses
    );
  } else {
    commitBulkStatus(ids, newStatus, {});
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

// ===== INLINE CELL EDITING (double-click a shipments row cell) =====
/** Maps an editable field name to how its inline editor should be rendered. */
const INLINE_EDIT_FIELDS = {
  shipNumber:    { kind: 'number' },
  customerName:  { kind: 'text'   },
  customerPhone: { kind: 'text'   },
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

  const prevHTML = el.innerHTML;
  let editorHTML;

  if (cfg.kind === 'company' || cfg.kind === 'contractor') {
    const selectedId = cfg.kind === 'company' ? s.companyId : s.contractorId;
    const opts = companies_cache.map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
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
    editorHTML = `<input type="${type}" ${cfg.step ? `step="${cfg.step}"` : ''} class="inline-edit-input form-input" value="${esc(rawVal ?? '')}">`;
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
  } else if (field === 'contractorId') {
    const obj = companies_cache.find(c => c.id === value);
    payload.contractorId = value || ''; payload.contractorName = obj?.name || '';
  } else if (field === 'driverId') {
    const obj = drivers_cache.find(d => d.id === value);
    payload.driverId = value || ''; payload.driverName = obj?.name || '';
  } else if (field === 'shipNumber') {
    payload.shipNumber = parseInt(value, 10) || 0;
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
  const contractorOptions = companies_cache.map(c  => `<option value="${c.id}"  ${d.contractorId === c.id  ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  /* Build status options from STATUS_CONFIG */
  const statusOptions = ALL_STATUSES.map(s =>
    `<option value="${s}" ${d.status === s ? 'selected' : ''}>${esc(t(STATUS_CONFIG[s].key))}</option>`
  ).join('');

  /* Show returned delivery cost row only when status is Returned-Paid; the withdrawn-order
     amount row is entirely separate and only shows for the Withdrawn status. */
  const isReturnedPaid = d.status === 'Returned-Paid';
  const isWithdrawn     = d.status === 'Withdrawn';

  return `
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('shipNumberLabel')} <span style="color:var(--brand)">*</span></label>
      <input type="number" id="f-shipnum" class="form-input" value="${d.shipNumber || ''}" placeholder="${t('shipNumPlaceholder')}">
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
      <input type="tel" id="f-phone" class="form-input" value="${esc(d.customerPhone || '')}" placeholder="+961...">
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">${t('address')}</label>
    <input type="text" id="f-address" class="form-input" value="${esc(d.customerAddress || '')}" placeholder="${t('deliveryAddressPlaceholder')}">
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('company')}</label>
      <select id="f-company" class="form-select"><option value="">${t('selectCompanyOption')}</option>${companyOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('contractor')}</label>
      <select id="f-contractor" class="form-select"><option value="">${t('noneOption')}</option>${contractorOptions}</select>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('driver')}</label>
      <select id="f-driver" class="form-select"><option value="">${t('noneOption')}</option>${driverOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('status')}</label>
      <select id="f-status" class="form-select" onchange="onStatusChange()">
        <option value="">${t('selectStatusOption')}</option>
        ${statusOptions}
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

// ===== SAVE SHIPMENT =====
async function saveShipment() {
  const companyId    = document.getElementById('f-company')?.value;
  const driverId     = document.getElementById('f-driver')?.value;
  const contractorId = document.getElementById('f-contractor')?.value;

  const companyObj    = companies_cache.find(c  => c.id  === companyId);
  const driverObj     = drivers_cache.find(d   => d.id   === driverId);
  const contractorObj = companies_cache.find(c  => c.id  === contractorId);

  const shipNum = parseInt(document.getElementById('f-shipnum')?.value) || 0;
  if (!shipNum) { toast(t('shipNumRequired'), 'error'); return; }

  if (!editingId && await shipNumberExistsForCompany(shipNum, companyId)) {
    toast(t('duplicateShipNumber'), 'error');
    return;
  }

  const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  const payload = {
    shipNumber:            shipNum,
    date:                  document.getElementById('f-date')?.value          || today(),
    customerName:          document.getElementById('f-customer')?.value?.trim()  || '',
    customerPhone:         document.getElementById('f-phone')?.value?.trim()     || '',
    customerAddress:       document.getElementById('f-address')?.value?.trim()   || '',
    companyId:             companyId    || '',
    companyName:           companyObj?.name    || '',
    driverId:              driverId     || '',
    driverName:            driverObj?.name     || '',
    contractorId:          contractorId || '',
    contractorName:        contractorObj?.name  || '',
    status:                document.getElementById('f-status')?.value       || 'Pending',
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
    <div class="detail-field"><div class="detail-label">${t('date')}</div><div class="detail-value">${fmtDate(s.date || s.createdAt)}</div></div>
    <div class="detail-field"><div class="detail-label">${t('company')}</div><div class="detail-value">${esc(s.companyName || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('customer')}</div><div class="detail-value">${esc(s.customerName || '—')}</div></div>
    <div class="detail-field"><div class="detail-label">${t('phone')}</div><div class="detail-value font-mono">${esc(s.customerPhone || '—')}</div></div>
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
    ${showProfit ? `<div class="fin-item"><div class="fin-label">${t('profitF')}</div><div class="fin-value positive">$${formatNum((s.deliveryProfit || 0) - (s.status === 'Returned-Paid' ? (s.returnedDeliveryCost || 0) : 0))}</div></div>` : ''}
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
  document.getElementById('modal-shipment-title').textContent = `Edit Shipment #${s.shipNumber || id}`;
  document.getElementById('modal-shipment-body').innerHTML    = shipmentFormHTML(s);
  openModal('modal-shipment');
}

function openNewShipmentModal() {
  editingId = null;
  document.getElementById('modal-shipment-title').textContent = t('newShipment');
  document.getElementById('modal-shipment-body').innerHTML    = shipmentFormHTML(null);
  openModal('modal-shipment');
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
        }
      }
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
          docs.slice(i, i + CHUNK).forEach(doc => {
            if (!doc.exists) return;
            batch.set(db.collection('sonick_archive').doc(doc.id), {
              ...doc.data(),
              archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
              archivedBy: currentUserData?.id
            });
            batch.delete(db.collection('sonick_shipments').doc(doc.id));
          });
          await batch.commit();
        }
      }
      toast(`${eligible.length} ${t('ordersArchivedLabel')}`, 'success');
      window._selectedShipIds = new Set();
      await refreshShipmentsData();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  });
}

// ===================================================
//  ARCHIVE
// ===================================================
async function refreshArchiveData() {
  try {
    if (db) {
      const snap = await db.collection('sonick_archive').orderBy('archivedAt', 'desc').limit(500).get();
      window._allArchShips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { /* keep whatever was already loaded */ }
  filterArchive();
}

async function renderArchive() {
  const content = document.getElementById('page-content');
  let ships = [];
  try {
    if (db) {
      const snap = await db.collection('sonick_archive').orderBy('archivedAt', 'desc').limit(500).get();
      ships = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { ships = getDemoShipments().map(s => ({ ...s, status: 'Delivered' })); }

  const showProfit = can('canViewProfit');
  const canManage   = can('canArchive');
  const canDelete   = can('canDeleteShipments');
  window._selectedArchIds = new Set(); // fresh row-selection state each time this page opens

  // Same filter dropdowns as the Shipments page — list every company/driver, not just
  // ones present in the currently loaded archive rows.
  const companyNames    = companies_cache.map(c => c.name).filter(Boolean).sort();
  const driverNames     = drivers_cache.map(d => d.name).filter(Boolean).sort();
  const contractorNames = companies_cache.map(c => c.name).filter(Boolean).sort();

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
      <input type="text" placeholder="${t('searchArchive')}" id="arch-search" oninput="filterArchive()">
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
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr>
          ${canManage ? `<th style="width:36px;text-align:center;"><input type="checkbox" id="arch-select-all" onchange="toggleSelectAllArchived(this)"></th>` : ''}
          <th>${t('shipNum')}</th><th>${t('customer')}</th><th>${t('company')}</th>
          <th>${t('driver')}</th><th>${t('contractor')}</th>
          <th>${t('priceUSD')}</th><th>${t('priceLL')}</th>
          ${showProfit ? `<th>${t('profitCol')}</th>` : ''}
          <th>${t('status')}</th><th>${t('date')}</th><th>${t('archivedDateCol')}</th><th>${t('actions')}</th>
        </tr></thead>
        <tbody id="arch-tbody"></tbody>
      </table>
    </div>
    <div class="table-footer">
      <span id="arch-summary" style="color:var(--text-2);font-family:var(--mono);"></span>
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

function filterArchive() {
  const searchRaw   = (document.getElementById('arch-search')?.value || '').trim();
  const searchNums  = searchRaw.includes(',')
    ? [...new Set(searchRaw.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n)))]
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

  let ships = (window._allArchShips || []).filter(s => {
    if (searchNums) {
      if (!searchNums.includes(s.shipNumber)) return false;
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
  });

  window._filteredArchShips = ships; // exact "searched rows" set for export/bulk actions

  const showProfit = can('canViewProfit');
  const canManage   = can('canArchive');
  const canDelete   = can('canDeleteShipments');
  let totalDol = 0, totalLeb = 0, totalProfit = 0;
  ships.forEach(s => { totalDol += s.priceDollar || 0; totalLeb += s.priceLeb || 0; totalProfit += s.deliveryProfit || 0; });

  const countEl   = document.getElementById('arch-count');
  const summaryEl = document.getElementById('arch-summary');
  if (countEl)   countEl.textContent   = `${ships.length} ${t('archivedShipments')}`;
  if (summaryEl) summaryEl.textContent = `$${formatNum(totalDol)} | L.L.${formatNum(totalLeb)}${showProfit ? ' | ' + t('profitF') + ': $' + formatNum(totalProfit) : ''}`;

  const colCount = (canManage ? 1 : 0) + (showProfit ? 11 : 10) + 1;

  const tbody  = document.getElementById('arch-tbody');
  const mobile = document.getElementById('arch-mobile');
  if (tbody) {
    window._selectedArchIds = window._selectedArchIds || new Set();
    tbody.innerHTML = ships.length
      ? ships.map(s => `
    <tr>
      ${canManage ? `<td style="text-align:center;"><input type="checkbox" class="arch-row-check" value="${s.id}" ${window._selectedArchIds.has(s.id) ? 'checked' : ''} onchange="toggleArchRowCheck('${s.id}', this.checked)"></td>` : ''}
      <td class="font-mono" style="color:var(--brand-light);font-weight:600;">#${s.shipNumber || '—'}</td>
      <td>${esc(s.customerName || '—')}</td>
      <td>${esc(s.companyName  || '—')}</td>
      <td>${esc(s.driverName   || '—')}</td>
      <td>${esc(s.contractorName || '—')}</td>
      <td class="font-mono">$${formatNum(s.priceDollar || 0)}</td>
      <td class="font-mono">${formatNum(s.priceLeb || 0)}</td>
      ${showProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.deliveryProfit || 0)}</td>` : ''}
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
  if (mobile) mobile.innerHTML = ships.slice(0, 30).map(s => mobileShipCard(s)).join('');

  updateArchSelectionUI();
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
          docs.slice(i, i + CHUNK).forEach(doc => {
            if (!doc.exists) return;
            const { archivedAt, archivedBy, ...data } = doc.data();
            batch.set(db.collection('sonick_shipments').doc(doc.id), data);
            batch.delete(db.collection('sonick_archive').doc(doc.id));
          });
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
          ids.slice(i, i + CHUNK).forEach(id => batch.delete(db.collection('sonick_archive').doc(id)));
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
      <span class="card-title">Payment Records</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>${t('date')}</th><th>${t('entity')}</th><th>Type</th>
          <th>Amount ($)</th><th>Direction</th><th>${t('paymentNote')}</th>
          ${can('canDeleteShipments') ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${flows.map(f => `
          <tr>
            <td style="color:var(--text-3);font-size:12px;">${fmtDate(f.date)}</td>
            <td><strong>${esc(f.entityName || '—')}</strong></td>
            <td><span class="badge badge-gray">${esc(f.type || 'Payment')}</span></td>
            <td class="font-mono" style="color:${f.direction > 0 ? 'var(--green)' : 'var(--red)'};">$${formatNum(f.amount || 0)}</td>
            <td>${f.direction > 0 ? `<span class="badge badge-green">${t('dirIn')}</span>` : `<span class="badge badge-red">${t('dirOut')}</span>`}</td>
            <td style="color:var(--text-3);font-size:12px;">${esc(f.notes || '')}</td>
            ${can('canDeleteShipments') ? `<td><button class="btn btn-danger btn-sm btn-icon" onclick="deletePayment('${f.id}')">🗑</button></td>` : ''}
          </tr>`).join('') || `<tr><td colspan="7" class="table-empty"><div class="empty-icon">💰</div><p>No payments recorded</p></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function openPaymentModal() {
  const comps = companies_cache.map(c => `<option value="${c.id}">[Company] ${esc(c.name)}</option>`).join('');
  const drvs  = drivers_cache.map(d  => `<option value="${d.id}">[Driver] ${esc(d.name)}</option>`).join('');
  document.getElementById('modal-payment-body').innerHTML = `
  <div class="form-group">
    <label class="form-label">${t('entity')}</label>
    <select id="p-entity" class="form-select" onchange="setEntityName()">
      <option value="">— Select —</option>${comps}${drvs}
    </select>
  </div>
  <input type="hidden" id="p-entity-name">
  <div class="form-row">
    <div class="form-group"><label class="form-label">Amount ($)</label><input type="number" step="0.01" id="p-amount" class="form-input" placeholder="0.00"></div>
    <div class="form-group"><label class="form-label">Direction</label>
      <select id="p-direction" class="form-select">
        <option value="1">↑ Incoming (received)</option>
        <option value="-1">↓ Outgoing (paid)</option>
      </select>
    </div>
  </div>
  <div class="form-group"><label class="form-label">Type</label>
    <select id="p-type" class="form-select">
      <option>Payment</option><option>Advance</option><option>Refund</option><option>Adjustment</option>
    </select>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">${t('date')}</label><input type="date" id="p-date" class="form-input" value="${today()}"></div>
    <div class="form-group"><label class="form-label">${t('paymentNote')}</label><input type="text" id="p-notes" class="form-input" placeholder="Optional note"></div>
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
//  GENERAL REPORT
// ===================================================
async function renderGeneral() {
  if (!can('canViewGeneral')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let ships = [];
  try {
    if (db) { const snap = await db.collection('sonick_shipments').get(); ships = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
  } catch (e) { ships = getDemoShipments(); }

  const byCompany = {}, byDriver = {}, byStatus = {};
  ships.forEach(s => {
    const ck = s.companyName || 'Unknown';
    if (!byCompany[ck]) byCompany[ck] = { count: 0, dol: 0, leb: 0, profit: 0, delivered: 0 };
    byCompany[ck].count++;
    byCompany[ck].dol    += s.priceDollar    || 0;
    byCompany[ck].leb    += s.priceLeb       || 0;
    byCompany[ck].profit += s.deliveryProfit || 0;
    if (s.status === 'Delivered') byCompany[ck].delivered++;

    const dk = s.driverName || '—';
    if (!byDriver[dk]) byDriver[dk] = { count: 0, dol: 0, cost: 0 };
    byDriver[dk].count++; byDriver[dk].dol += s.priceDollar || 0; byDriver[dk].cost += s.driverDeliveryCost || 0;

    const sk = s.status || 'Unknown';
    byStatus[sk] = (byStatus[sk] || 0) + 1;
  });

  const showProfit = can('canViewProfit');
  const totalDol   = ships.reduce((a, s) => a + (s.priceDollar    || 0), 0);
  const totalLeb   = ships.reduce((a, s) => a + (s.priceLeb       || 0), 0);
  const totalProfit= ships.reduce((a, s) => {
    let p = a + (s.deliveryProfit || 0);
    if (s.status === 'Returned-Paid') p -= (s.returnedDeliveryCost || 0);
    return p;
  }, 0);

  content.innerHTML = `
  ${pageHeader(t('generalReport'), [t('finance')])}
  <div class="stats-grid" style="margin-bottom:24px;">
    <div class="stat-card brand"><div class="stat-icon brand">${ICONS.package}</div><div class="stat-label">${t('totalShipments')}</div><div class="stat-value">${ships.length}</div></div>
    <div class="stat-card blue"><div class="stat-icon blue">${ICONS.dollarSign}</div><div class="stat-label">${t('revenue')}</div><div class="stat-value mono">$${formatNum(totalDol)}</div></div>
    <div class="stat-card amber"><div class="stat-icon amber">${ICONS.landmark}</div><div class="stat-label">Total (L.L.)</div><div class="stat-value mono">${formatNum(Math.round(totalLeb / 1000000))}M</div></div>
    ${showProfit ? `<div class="stat-card green"><div class="stat-icon green">${ICONS.trendingUp}</div><div class="stat-label">${t('profit')}</div><div class="stat-value mono">$${formatNum(totalProfit)}</div></div>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="report-grid">
    <div class="table-container">
      <div class="card-header"><span class="card-title">${t('byStatus')}</span></div>
      <table><thead><tr><th>${t('status')}</th><th>${t('count')}</th><th>%</th></tr></thead><tbody>
        ${Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <tr><td>${statusBadge(k)}</td><td class="font-mono">${v}</td><td class="font-mono" style="color:var(--text-3);">${ships.length?Math.round(v/ships.length*100):0}%</td></tr>`).join('')
        || '<tr><td colspan="3" class="table-empty"><p>No data</p></td></tr>'}
      </tbody></table>
    </div>
    <div class="table-container">
      <div class="card-header"><span class="card-title">${t('byDriver')}</span></div>
      <table><thead><tr><th>${t('driver')}</th><th>${t('count')}</th><th>${t('revenueCol')}</th></tr></thead><tbody>
        ${Object.entries(byDriver).filter(([k])=>k!=='—').sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>`
        <tr><td><strong>${esc(k)}</strong></td><td class="font-mono">${v.count}</td><td class="font-mono">$${formatNum(v.dol)}</td></tr>`).join('')
        || '<tr><td colspan="3" class="table-empty"><p>No data</p></td></tr>'}
      </tbody></table>
    </div>
  </div>
  <div class="table-container">
    <div class="card-header"><span class="card-title">${t('byCompany')}</span></div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>${t('company')}</th><th>Shipments</th><th>${t('delivered')}</th><th>${t('revenueCol')}</th><th>${t('revenueLL')}</th>${showProfit?'<th>Profit ($)</th>':''}</tr></thead>
        <tbody>
          ${Object.entries(byCompany).sort((a,b)=>b[1].dol-a[1].dol).map(([k,v])=>`
          <tr>
            <td><strong>${esc(k)}</strong></td><td class="font-mono">${v.count}</td>
            <td><span class="badge badge-green">${v.delivered}</span></td>
            <td class="font-mono">$${formatNum(v.dol)}</td><td class="font-mono">${formatNum(v.leb)}</td>
            ${showProfit?`<td class="font-mono" style="color:var(--green);">$${formatNum(v.profit)}</td>`:''}
          </tr>`).join('') || `<tr><td colspan="6" class="table-empty"><p>No data</p></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>
  <style>@media(max-width:768px){.report-grid{grid-template-columns:1fr;}}</style>`;
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
    <td class="font-mono">${esc(c.phones||'—')}</td>
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
      <div><div class="mobile-card-label">${t('phone')}</div><div class="mobile-card-value">${esc(c.phones||'—')}</div></div>
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
  <div class="form-group"><label class="form-label">${t('phone')}</label><input type="tel" id="cf-phones" class="form-input" value="${esc(d.phones||'')}" placeholder="+961..."></div>
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
  const payload = { name, phones: document.getElementById('cf-phones')?.value || '', deliveryCost: parseFloat(document.getElementById('cf-delcost')?.value) || 0 };
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
    <td class="font-mono">${esc(d.phones||'—')}</td>
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
      <div><div class="mobile-card-label">${t('phone')}</div><div class="mobile-card-value">${esc(d.phones||'—')}</div></div>
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
  <div class="form-group"><label class="form-label">${t('phone')}</label><input type="tel" id="df-phones" class="form-input" value="${esc(d.phones||'')}" placeholder="+961..."></div>
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
  const phones  = document.getElementById('df-phones')?.value || '';
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
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:${key==='admin'?'var(--brand-light)':key==='manager'?'var(--amber)':key==='operator'?'var(--blue)':'var(--text-2)'};">${role.label}</div>
          <div style="font-size:11px;color:var(--text-3);display:flex;flex-direction:column;gap:3px;">
            ${Object.entries(role).filter(([k])=>k!=='label').map(([k,v])=>`
            <span style="color:${v?'var(--green)':'var(--text-3)'}">${v?'✓':'✗'} ${k.replace('can','').replace(/([A-Z])/g,' $1').trim()}</span>`).join('')}
          </div>
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
    <td><span class="badge ${u.role==='admin'?'badge-brand':u.role==='manager'?'badge-amber':u.role==='operator'?'badge-blue':'badge-gray'}">${(ROLES[u.role]||{label:u.role||'?'}).label}</span></td>
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
  return `
  <div class="form-group"><label class="form-label">Display Name <span style="color:var(--brand)">*</span></label><input type="text" id="uf-name" class="form-input" value="${esc(d.displayName||'')}" placeholder="Full name"></div>
  <div class="form-group"><label class="form-label">Email <span style="color:var(--brand)">*</span></label><input type="email" id="uf-email" class="form-input" value="${esc(d.email||'')}" placeholder="user@example.com" ${!isNew?'readonly':''}></div>
  ${isNew?`<div class="form-group"><label class="form-label">Temporary Password <span style="color:var(--brand)">*</span></label><input type="password" id="uf-pass" class="form-input" placeholder="Min 6 characters"></div>`:''}
  <div class="form-group"><label class="form-label">Role <span style="color:var(--brand)">*</span></label>
    <select id="uf-role" class="form-select">
      ${Object.entries(ROLES).map(([k,r])=>`<option value="${k}" ${d.role===k?'selected':''}>${r.label}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label class="form-label">Status</label>
    <select id="uf-active" class="form-select">
      <option value="true"  ${d.active!==false?'selected':''}>${t('activeLabel')}</option>
      <option value="false" ${d.active===false ?'selected':''}>${t('inactiveLabel')}</option>
    </select>
  </div>`;
}

function openUserModal(d) {
  editingId = d?.id || null;
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

  const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();

  if (editingId) {
    try {
      if (db) await db.collection('sonick_users').doc(editingId).update({ displayName: name, role, active, updatedAt: ts });
      toast(t('userUpdated'), 'success'); closeModal('modal-user'); renderUsers();
    } catch (e) { toast(t('error') + e.message, 'error'); }
  } else {
    const pass = document.getElementById('uf-pass')?.value;
    if (!pass || pass.length < 6) { toast(t('passRequired'), 'error'); return; }
    try {
      let uid = 'user_' + Date.now();
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        uid = cred.user.uid;
        await cred.user.updateProfile({ displayName: name });
      } catch (authErr) { console.warn('Auth creation note:', authErr.message); toast('Note: ' + authErr.message, 'info'); }
      if (db) await db.collection('sonick_users').doc(uid).set({ displayName: name, email, role, active, createdAt: ts, createdBy: currentUserData?.id });
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

async function renderSettings() {
  const content = document.getElementById('page-content');
  let settings = { dollarRate: dollPrice };
  try { if (db) { const doc = await db.collection('sonick_settings').doc('general').get(); if (doc.exists) settings = doc.data(); } } catch (e) {}
  if (Array.isArray(settings.exportColumns)) exportColumnsConfig = settings.exportColumns; // keep the export functions' cache in sync with what Settings just fetched
  _exportColsDraft = resolveExportColumnsFull();

  content.innerHTML = `
  ${pageHeader(t('settings'), [t('system')])}
  <div class="settings-section">
    <div class="settings-section-title">⚙️ Financial Settings</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Dollar Exchange Rate (L.L.)</div><div class="settings-row-desc">Used for automatic conversion in shipments</div></div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="s-dollrate" class="form-input" value="${settings.dollarRate||''}" style="width:160px;" placeholder="e.g. 89500">
        ${can('canManageUsers') ? `<button class="btn btn-primary btn-sm" onclick="saveDollarRate()">Save</button>` : ''}
      </div>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">📊 Export Columns</div>
    <div class="settings-row">
      <div class="settings-row-desc" style="max-width:640px;">Choose which shipment fields are included — and in what order — when exporting to Excel or PDF, from both the Shipments and Archive pages.</div>
    </div>
    <div id="export-columns-list">${renderExportColumnsRows()}</div>
    <div class="settings-row">
      <div></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="resetExportColumnsDefault()">Reset to Default</button>
        ${can('canManageUsers') ? `<button class="btn btn-primary btn-sm" onclick="saveExportColumns()">Save</button>` : ''}
      </div>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">👤 My Profile</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Display Name</div><div class="settings-row-desc">Shown across the system</div></div>
      <input type="text" id="s-displayname" class="form-input" value="${esc(currentUserData?.displayName||'')}" style="width:200px;">
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Email</div><div class="settings-row-desc">Your login email</div></div>
      <span style="color:var(--text-2);font-size:13px;">${esc(currentUser?.email||'—')}</span>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Role</div><div class="settings-row-desc">Determines your permissions</div></div>
      <span class="badge badge-brand">${(ROLES[currentUserData?.role]||{label:'?'}).label}</span>
    </div>
    <div class="settings-row"><div></div><button class="btn btn-primary btn-sm" onclick="saveProfile()">Save Profile</button></div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">🔐 Security</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Change Password</div><div class="settings-row-desc">Send a reset email to your address</div></div>
      <button class="btn btn-secondary btn-sm" onclick="sendPasswordReset()">Send Reset Email</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">ℹ️ System Info</div>
    <div class="settings-row"><div class="settings-row-label">Version</div><span style="color:var(--text-3);font-family:var(--mono);">2.0.0-web</span></div>
    <div class="settings-row"><div class="settings-row-label">Firebase Project</div><span style="color:var(--text-3);font-family:var(--mono);">${firebaseConfig.projectId||'not configured'}</span></div>
    <div class="settings-row"><div class="settings-row-label">User ID</div><span style="color:var(--text-3);font-family:var(--mono);font-size:11px;">${currentUser?.uid||'—'}</span></div>
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
  'sonick_billtypes', 'sonick_payments', 'sonick_users', 'sonick_settings'
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
  const counts = Object.entries(_pendingRestoreData.collections)
    .map(([col, docs]) => `${col.replace('sonick_', '')}: ${docs.length}`)
    .join(' · ');
  confirmAction(
    t('restoreWarningTitle'),
    `${t('restoreWarningMsg')}\n\n${t('backupCollections')} — ${counts}`,
    () => performRestore(_pendingRestoreData)
  );
}

async function performRestore(data) {
  const restoreBtn = document.getElementById('backup-restore-btn');
  if (restoreBtn) { restoreBtn.disabled = true; restoreBtn.textContent = t('restoringData'); }
  try {
    for (const [col, docs] of Object.entries(data.collections)) {
      if (!Array.isArray(docs) || !docs.length) continue;
      // Firestore batched writes are capped at 500 ops — chunk safely under that.
      for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
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