/* ===================================================
   SONICK DELIVERY SYSTEM — Page Renderers
   dashboard, shipments, archive, debts, general,
   companies, drivers, users, settings
   =================================================== */

// ===================================================
//  DASHBOARD
// ===================================================
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
  }

  const showProfit = can('canViewProfit');

  content.innerHTML = `
  <div class="stats-grid">
    <div class="stat-card brand"><div class="stat-icon brand">📦</div><div class="stat-label">${t('totalShipments')}</div><div class="stat-value">${stats.total}</div></div>
    <div class="stat-card amber"><div class="stat-icon amber">⏳</div><div class="stat-label">${t('pending')}</div><div class="stat-value">${stats.pending}</div></div>
    <div class="stat-card green"><div class="stat-icon green">✅</div><div class="stat-label">${t('delivered')}</div><div class="stat-value">${stats.delivered}</div></div>
    <div class="stat-card blue"><div class="stat-icon blue">💵</div><div class="stat-label">${t('revenue')}</div><div class="stat-value mono">$${formatNum(stats.totalDol)}</div></div>
    ${showProfit ? `<div class="stat-card purple"><div class="stat-icon purple">📈</div><div class="stat-label">${t('profit')}</div><div class="stat-value mono">$${formatNum(stats.profit)}</div></div>` : ''}
  </div>

  ${can('canCreateShipments') || can('canManageCompanies') || can('canManageDrivers') ? `
  <div class="section-header"><div class="section-title">${t('quickActions')}</div></div>
  <div class="quick-actions">
    ${can('canCreateShipments') ? `<div class="quick-action" onclick="navigate('new-shipment')"><div class="qa-icon">➕</div><span>${t('newShipment')}</span></div>` : ''}
    <div class="quick-action" onclick="navigate('shipments')"><div class="qa-icon">📦</div><span>${t('viewShipments')}</span></div>
    ${can('canManageCompanies') ? `<div class="quick-action" onclick="navigate('companies')"><div class="qa-icon">🏢</div><span>${t('companies')}</span></div>` : ''}
    ${can('canManageDrivers')   ? `<div class="quick-action" onclick="navigate('drivers')"><div class="qa-icon">🚗</div><span>${t('drivers')}</span></div>`   : ''}
    ${can('canViewDebts')       ? `<div class="quick-action" onclick="navigate('debts')"><div class="qa-icon">💰</div><span>${t('payments')}</span></div>`       : ''}
    <div class="quick-action" onclick="navigate('archive')"><div class="qa-icon">🗄️</div><span>${t('archive')}</span></div>
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
async function renderShipments() {
  if (!can('canViewShipments')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  let ships = [];
  try {
    if (db) {
      const snap = await db.collection('sonick_shipments').orderBy('createdAt', 'desc').limit(500).get();
      ships = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { ships = getDemoShipments(); }

  const showProfit = can('canViewProfit');
  const statusOpts = ALL_STATUSES.map(s => `<option value="${s}">${esc(t(STATUS_CONFIG[s].key))}</option>`).join('');

  content.innerHTML = `
  <div class="filter-bar">
    <div class="table-search">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="${t('searchShipments')}" id="ship-search" oninput="filterShipments()" style="width:220px;">
    </div>
    <select class="filter-select" id="ship-status-filter"  onchange="filterShipments()">
      <option value="">All Statuses</option>${statusOpts}
    </select>
    <select class="filter-select" id="ship-company-filter" onchange="filterShipments()">
      <option value="">All Companies</option>
      ${companies_cache.map(c => `<option>${esc(c.name)}</option>`).join('')}
    </select>
    <input type="date" class="filter-date" id="ship-date-from" onchange="filterShipments()" title="From date">
    <input type="date" class="filter-date" id="ship-date-to"   onchange="filterShipments()" title="To date">
    ${can('canCreateShipments') ? `<button class="btn btn-primary btn-sm" onclick="openNewShipmentModal()">+ ${t('newShipment')}</button>` : ''}
  </div>

  <div class="table-container desktop-table">
    <div class="table-header">
      <span style="font-size:13px;color:var(--text-2);" id="ships-count">Loading...</span>
      ${can('canExport') ? `<button class="btn btn-secondary btn-sm" onclick="exportCSV()">⬇ Export CSV</button>` : ''}
    </div>
    <div class="table-scroll">
      <table id="ships-table">
        <thead><tr>
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

  window._allShips = ships;
  filterShipments();
}

function filterShipments() {
  const search   = (document.getElementById('ship-search')?.value   || '').toLowerCase();
  const status   =  document.getElementById('ship-status-filter')?.value  || '';
  const company  =  document.getElementById('ship-company-filter')?.value || '';
  const dateFrom =  document.getElementById('ship-date-from')?.value      || '';
  const dateTo   =  document.getElementById('ship-date-to')?.value        || '';

  let ships = (window._allShips || []).filter(s => {
    if (search && !(
      (s.shipNumber + '').includes(search) ||
      (s.customerName  || '').toLowerCase().includes(search) ||
      (s.companyName   || '').toLowerCase().includes(search) ||
      (s.driverName    || '').toLowerCase().includes(search) ||
      (s.customerAddress || '').toLowerCase().includes(search)
    )) return false;
    if (status  && s.status      !== status)  return false;
    if (company && s.companyName !== company) return false;
    if (dateFrom && s.date < dateFrom) return false;
    if (dateTo   && s.date > dateTo)   return false;
    return true;
  });

  const showProfit = can('canViewProfit');
  let totalDol = 0, totalLeb = 0, totalProfit = 0;
  ships.forEach(s => {
    totalDol    += s.priceDollar    || 0;
    totalLeb    += s.priceLeb       || 0;
    totalProfit += s.deliveryProfit || 0;
    if (s.status === 'Returned-Paid') totalProfit -= (s.returnedDeliveryCost || 0);
  });

  const tbody    = document.getElementById('ships-tbody');
  const mobile   = document.getElementById('ships-mobile');
  const countEl  = document.getElementById('ships-count');
  const summaryEl= document.getElementById('ships-summary');
  const totalEl  = document.getElementById('ships-total-label');

  if (countEl)   countEl.textContent   = `${ships.length} ${t('shipments')}`;
  if (summaryEl) summaryEl.textContent = `${t('total')} $${formatNum(totalDol)} | L.L. ${formatNum(totalLeb)}${showProfit ? ' | ' + t('profitF') + ': $' + formatNum(totalProfit) : ''}`;
  if (totalEl)   totalEl.textContent   = `${t('showing')} ${ships.length} ${t('of')} ${(window._allShips || []).length} ${t('shipments')}`;

  if (tbody) {
    tbody.innerHTML = ships.length
      ? ships.map(s => `
        <tr>
          <td><span class="font-mono" style="color:var(--brand-light);font-weight:600;">#${s.shipNumber || '—'}</span></td>
          <td><div style="font-weight:500;">${esc(s.customerName || '—')}</div><div style="font-size:11px;color:var(--text-3);">${esc(s.customerPhone || '')}</div></td>
          <td>${esc(s.companyName    || '—')}</td>
          <td>${esc(s.driverName     || '—')}</td>
          <td>${esc(s.contractorName || '—')}</td>
          <td class="font-mono">$${formatNum(s.priceDollar || 0)}</td>
          <td class="font-mono">${formatNum(s.priceLeb || 0)}</td>
          ${showProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.deliveryProfit || 0)}</td>` : ''}
          <td>${statusBadge(s.status)}</td>
          <td style="color:var(--text-3);font-size:12px;">${fmtDate(s.date || s.createdAt)}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="viewShipment('${s.id}')"    title="${t('view')}">👁</button>
              ${can('canEditShipments')    ? `<button class="btn btn-ghost  btn-sm btn-icon" onclick="editShipment('${s.id}')"    title="Edit">✏️</button>`    : ''}
              ${can('canArchive')          ? `<button class="btn btn-ghost  btn-sm btn-icon" onclick="archiveShipment('${s.id}')" title="Archive">🗄️</button>` : ''}
              ${can('canDeleteShipments')  ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteShipment('${s.id}')"  title="Delete">🗑</button>`   : ''}
            </div>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="${showProfit ? 11 : 10}" class="table-empty"><div class="empty-icon">📦</div><p>No shipments match your filters</p></td></tr>`;
  }

  if (mobile) mobile.innerHTML = ships.slice(0, 50).map(s => mobileShipCard(s)).join('');
}

// ===================================================
//  NEW SHIPMENT PAGE
// ===================================================
function renderNewShipment() {
  if (!can('canCreateShipments')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  editingId = null;
  content.innerHTML = `
  <div class="card" style="max-width:900px;">
    <div class="card-header"><div class="card-title">${t('createNewShipment')}</div></div>
    <div class="card-body">${shipmentFormHTML(null)}</div>
    <div style="padding:0 20px 20px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn btn-secondary" onclick="navigate('shipments')">${t('cancel')}</button>
      <button class="btn btn-primary btn-lg" onclick="saveShipment()">💾 ${t('saveShipmentBtn')}</button>
    </div>
  </div>`;
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

  /* Show returned delivery cost row only when status is Returned-Paid */
  const isReturnedPaid = d.status === 'Returned-Paid';

  return `
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">Ship Number <span style="color:var(--brand)">*</span></label>
      <input type="number" id="f-shipnum" class="form-input" value="${d.shipNumber || ''}" placeholder="e.g. 1001">
    </div>
    <div class="form-group">
      <label class="form-label">${t('date')} <span style="color:var(--brand)">*</span></label>
      <input type="date" id="f-date" class="form-input" value="${d.date || today()}">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('customer')}</label>
      <input type="text" id="f-customer" class="form-input" value="${esc(d.customerName || '')}" placeholder="Recipient name">
    </div>
    <div class="form-group">
      <label class="form-label">${t('phone')}</label>
      <input type="tel" id="f-phone" class="form-input" value="${esc(d.customerPhone || '')}" placeholder="+961...">
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">${t('address')}</label>
    <input type="text" id="f-address" class="form-input" value="${esc(d.customerAddress || '')}" placeholder="Delivery address">
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('company')}</label>
      <select id="f-company" class="form-select"><option value="">— Select Company —</option>${companyOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('contractor')}</label>
      <select id="f-contractor" class="form-select"><option value="">— None —</option>${contractorOptions}</select>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">${t('driver')}</label>
      <select id="f-driver" class="form-select"><option value="">— None —</option>${driverOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('status')}</label>
      <select id="f-status" class="form-select" onchange="onStatusChange()">
        <option value="">— Select Status —</option>
        ${statusOptions}
      </select>
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
      <input type="number" step="0.01" id="f-pricedol" class="form-input" value="${d.priceDollar || ''}" placeholder="0.00" oninput="calcLeb()">
    </div>
    <div class="form-group">
      <label class="form-label">${t('priceLL')} — auto</label>
      <input type="number" id="f-priceleb" class="form-input" value="${d.priceLeb || ''}" placeholder="Auto from $ × rate">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">Delivery Cost ($)</label>
      <input type="number" step="0.01" id="f-delivery"     class="form-input" value="${d.deliveryCost         || ''}" placeholder="0.00">
    </div>
    <div class="form-group">
      <label class="form-label">Driver Cost ($)</label>
      <input type="number" step="0.01" id="f-drivercost"   class="form-input" value="${d.driverDeliveryCost   || ''}" placeholder="0.00">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">Contractor Cost ($)</label>
      <input type="number" step="0.01" id="f-contractorcost" class="form-input" value="${d.contractorDeliveryCost || ''}" placeholder="0.00">
    </div>
    <div class="form-group">
      <label class="form-label">Delivery Profit ($)</label>
      <input type="number" step="0.01" id="f-profit"       class="form-input" value="${d.deliveryProfit       || ''}" placeholder="0.00">
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">Description / Notes</label>
    <textarea id="f-desc" class="form-textarea" placeholder="${t('descPlaceholder')}">${esc(d.description || '')}</textarea>
  </div>
  <div style="background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;font-size:12px;color:var(--text-3);">
    💡 Dollar rate: <strong style="color:var(--amber);font-family:var(--mono);">${formatNum(dollPrice)} L.L.</strong> — used for auto-conversion
  </div>`;
}

function calcLeb() {
  if (!dollPrice) return;
  const dol   = parseFloat(document.getElementById('f-pricedol')?.value) || 0;
  const lebEl = document.getElementById('f-priceleb');
  if (lebEl && dol > 0) lebEl.value = Math.round(dol * dollPrice);
}

/** Show/hide the Returned-Paid delivery cost field based on selected status */
function onStatusChange() {
  const status = document.getElementById('f-status')?.value;
  const row    = document.getElementById('f-returned-cost-row');
  if (row) row.style.display = status === 'Returned-Paid' ? 'block' : 'none';
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
    deliveryCost:          parseFloat(document.getElementById('f-delivery')?.value)       || 0,
    driverDeliveryCost:    parseFloat(document.getElementById('f-drivercost')?.value)     || 0,
    contractorDeliveryCost:parseFloat(document.getElementById('f-contractorcost')?.value) || 0,
    deliveryProfit:        parseFloat(document.getElementById('f-profit')?.value)         || 0,
    returnedDeliveryCost:  parseFloat(document.getElementById('f-returned-cost')?.value)  || 0,
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
    else if (currentPage === 'new-shipment') navigate('shipments');
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

// ===================================================
//  ARCHIVE
// ===================================================
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
  content.innerHTML = `
  <div class="filter-bar">
    <div class="table-search">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="${t('searchArchive')}" id="arch-search" oninput="filterArchive()" style="width:220px;">
    </div>
    <select class="filter-select" id="arch-status-filter" onchange="filterArchive()">
      <option value="">All Statuses</option>
      <option>Delivered</option><option>Pending</option><option>Returned</option><option>Cancelled</option>
    </select>
    <input type="date" class="filter-date" id="arch-from" onchange="filterArchive()">
    <input type="date" class="filter-date" id="arch-to"   onchange="filterArchive()">
  </div>
  <div class="table-container desktop-table">
    <div class="table-header">
      <span style="font-size:13px;color:var(--text-2);" id="arch-count">Loading...</span>
      ${can('canExport') ? `<button class="btn btn-secondary btn-sm" onclick="exportArchiveCSV()">⬇ Export</button>` : ''}
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>${t('shipNum')}</th><th>${t('customer')}</th><th>${t('company')}</th><th>${t('driver')}</th>
          <th>${t('priceUSD')}</th><th>${t('priceLL')}</th>
          ${showProfit ? `<th>${t('profitCol')}</th>` : ''}
          <th>${t('status')}</th><th>${t('date')}</th>
          ${can('canEditShipments') ? `<th>${t('actions')}</th>` : ''}
        </tr></thead>
        <tbody id="arch-tbody"></tbody>
      </table>
    </div>
    <div class="table-footer">
      <span id="arch-summary" style="color:var(--text-2);font-family:var(--mono);"></span>
    </div>
  </div>
  <div class="mobile-cards" id="arch-mobile"></div>`;

  window._archShips = ships;
  filterArchive();
}

function filterArchive() {
  const search   = (document.getElementById('arch-search')?.value        || '').toLowerCase();
  const status   =  document.getElementById('arch-status-filter')?.value || '';
  const from     =  document.getElementById('arch-from')?.value          || '';
  const to       =  document.getElementById('arch-to')?.value            || '';
  const showProfit = can('canViewProfit');

  let ships = (window._archShips || []).filter(s => {
    if (search && !((s.shipNumber + '').includes(search) || (s.customerName || '').toLowerCase().includes(search) || (s.companyName || '').toLowerCase().includes(search))) return false;
    if (status && s.status !== status) return false;
    if (from && s.date < from) return false;
    if (to   && s.date > to)   return false;
    return true;
  });

  let totalDol = 0, totalLeb = 0, totalProfit = 0;
  ships.forEach(s => { totalDol += s.priceDollar || 0; totalLeb += s.priceLeb || 0; totalProfit += s.deliveryProfit || 0; });

  const countEl   = document.getElementById('arch-count');
  const summaryEl = document.getElementById('arch-summary');
  if (countEl)   countEl.textContent   = `${ships.length} ${t('archivedShipments')}`;
  if (summaryEl) summaryEl.textContent = `$${formatNum(totalDol)} | L.L.${formatNum(totalLeb)}${showProfit ? ' | ' + t('profitF') + ': $' + formatNum(totalProfit) : ''}`;

  const colCount = showProfit
    ? (can('canEditShipments') ? 10 : 9)
    : (can('canEditShipments') ?  9 : 8);

  const tbody  = document.getElementById('arch-tbody');
  const mobile = document.getElementById('arch-mobile');
  if (tbody) tbody.innerHTML = ships.map(s => `
  <tr>
    <td class="font-mono" style="color:var(--brand-light);font-weight:600;">#${s.shipNumber || '—'}</td>
    <td>${esc(s.customerName || '—')}</td>
    <td>${esc(s.companyName  || '—')}</td>
    <td>${esc(s.driverName   || '—')}</td>
    <td class="font-mono">$${formatNum(s.priceDollar || 0)}</td>
    <td class="font-mono">${formatNum(s.priceLeb || 0)}</td>
    ${showProfit ? `<td class="font-mono" style="color:var(--green);">$${formatNum(s.deliveryProfit || 0)}</td>` : ''}
    <td>${statusBadge(s.status)}</td>
    <td style="color:var(--text-3);font-size:12px;">${fmtDate(s.date)}</td>
    ${can('canEditShipments') ? `<td><button class="btn btn-ghost btn-sm" onclick="viewShipmentArchive('${s.id}')">${t('view')}</button></td>` : ''}
  </tr>`).join('') || `<tr><td colspan="${colCount}" class="table-empty"><div class="empty-icon">🗄️</div><p>Archive is empty</p></td></tr>`;
  if (mobile) mobile.innerHTML = ships.slice(0, 30).map(s => mobileShipCard(s)).join('');
}

async function viewShipmentArchive(id) {
  let s = (window._archShips || []).find(x => x.id === id);
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
  <div class="stats-grid" style="margin-bottom:24px;">
    <div class="stat-card green"><div class="stat-icon green">📥</div><div class="stat-label">${t('totalReceived')}</div><div class="stat-value mono">$${formatNum(totalIn)}</div></div>
    <div class="stat-card brand"><div class="stat-icon brand">📤</div><div class="stat-label">${t('totalPaidOut')}</div><div class="stat-value mono">$${formatNum(totalOut)}</div></div>
    <div class="stat-card ${balance >= 0 ? 'green' : 'brand'}"><div class="stat-icon ${balance >= 0 ? 'green' : 'brand'}">${balance >= 0 ? '✅' : '⚠️'}</div><div class="stat-label">${t('balance')}</div><div class="stat-value mono">$${formatNum(Math.abs(balance))}</div></div>
  </div>
  <div class="table-container">
    <div class="table-header">
      <span class="card-title">Payment Records</span>
      ${can('canViewFinance') ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal()">${t('recordPayment')}</button>` : ''}
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
  <div class="stats-grid" style="margin-bottom:24px;">
    <div class="stat-card brand"><div class="stat-icon brand">📦</div><div class="stat-label">${t('totalShipments')}</div><div class="stat-value">${ships.length}</div></div>
    <div class="stat-card blue"><div class="stat-icon blue">💵</div><div class="stat-label">${t('revenue')}</div><div class="stat-value mono">$${formatNum(totalDol)}</div></div>
    <div class="stat-card amber"><div class="stat-icon amber">🇱🇧</div><div class="stat-label">Total (L.L.)</div><div class="stat-value mono">${formatNum(Math.round(totalLeb / 1000000))}M</div></div>
    ${showProfit ? `<div class="stat-card green"><div class="stat-icon green">📈</div><div class="stat-label">${t('profit')}</div><div class="stat-value mono">$${formatNum(totalProfit)}</div></div>` : ''}
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
  <div class="table-container">
    <div class="table-header">
      <div class="table-search"><span class="search-icon">🔍</span><input type="text" placeholder="${t('searchDrivers')}" id="drv-search" oninput="filterDrivers()" style="width:200px;"></div>
      <button class="btn btn-primary btn-sm" onclick="openDriverModal()">+ ${t('drivers')}</button>
    </div>
    <div class="table-scroll desktop-table">
      <table>
        <thead><tr><th>${t('driverName')}</th><th>${t('phone')}</th><th>${t('activeStatus')}</th><th>${t('actions')}</th></tr></thead>
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
    <td>${d.active!==false ? `<span class="badge badge-green">${t('activeLabel')}</span>` : `<span class="badge badge-gray">${t('inactiveLabel')}</span>`}</td>
    <td><div style="display:flex;gap:4px;">
      <button class="btn btn-ghost  btn-sm btn-icon" onclick="editDriver('${d.id}')">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDriver('${d.id}')">🗑</button>
    </div></td>
  </tr>`).join('') || `<tr><td colspan="4" class="table-empty"><div class="empty-icon">🚗</div><p>No drivers yet</p></td></tr>`;

  if (mobile) mobile.innerHTML = list.map(d => `
  <div class="mobile-card">
    <div class="mobile-card-header"><span class="mobile-card-num">🚗 ${esc(d.name||'—')}</span>${d.active!==false?`<span class="badge badge-green">${t('activeLabel')}</span>`:`<span class="badge badge-gray">${t('inactiveLabel')}</span>`}</div>
    <div class="mobile-card-body"><div><div class="mobile-card-label">${t('phone')}</div><div class="mobile-card-value">${esc(d.phones||'—')}</div></div></div>
    <div class="mobile-card-footer">
      <button class="btn btn-ghost  btn-sm" onclick="editDriver('${d.id}')">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteDriver('${d.id}')">🗑 Delete</button>
    </div>
  </div>`).join('');
}

function driverFormHTML(d) {
  d = d || {};
  return `
  <div class="form-group"><label class="form-label">${t('driverName')} <span style="color:var(--brand)">*</span></label><input type="text" id="df-name" class="form-input" value="${esc(d.name||'')}" placeholder="Full name"></div>
  <div class="form-group"><label class="form-label">${t('phone')}</label><input type="tel" id="df-phones" class="form-input" value="${esc(d.phones||'')}" placeholder="+961..."></div>
  <div class="form-group"><label class="form-label">${t('activeStatus')}</label>
    <select id="df-active" class="form-select">
      <option value="true"  ${d.active!==false?'selected':''}>${t('activeLabel')}</option>
      <option value="false" ${d.active===false ?'selected':''}>${t('inactiveLabel')}</option>
    </select>
  </div>`;
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
  const name = document.getElementById('df-name')?.value?.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const payload = { name, phones: document.getElementById('df-phones')?.value || '', active: document.getElementById('df-active')?.value === 'true' };
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
async function renderSettings() {
  const content = document.getElementById('page-content');
  let settings = { dollarRate: dollPrice };
  try { if (db) { const doc = await db.collection('sonick_settings').doc('general').get(); if (doc.exists) settings = doc.data(); } } catch (e) {}

  content.innerHTML = `
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