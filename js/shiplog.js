/* ===================================================
   SONICK DELIVERY SYSTEM — Shipment Change Log (audit trail)
   ---------------------------------------------------
   Every time a staff user edits or deletes a shipment, one immutable
   record is written to the `sonick_shipment_logs` collection:

     {
       action:       'update' | 'delete',
       source:       'edit' | 'inline' | 'bulkStatus' | 'bulkAssign'
                     | 'delete' | 'archiveDelete' | 'archiveBulkDelete',
       shipId, shipNumber, companyName, customerName,
       changes:      [{ field, before, after }]   // update only
       snapshot:     { ...main fields }            // delete only (what was removed)
       userId, userName, userEmail,                // who did it
       at:           server timestamp,             // when (authoritative)
       atClient:     ISO string                    // when (client clock, fallback)
     }

   Logging is best-effort: a failed log write never blocks or undoes the
   shipment save/delete itself (it just warns in the console).
   Viewing the log is limited to users with canManageUsers (admins).
   =================================================== */

const SHIPLOG_COLLECTION = 'sonick_shipment_logs';
const SHIPLOG_LOAD_LIMIT = 1000;

/** Tracked shipment fields → i18n label key. Id fields (companyId/driverId/contractorId)
 *  are intentionally not tracked — their human-readable *Name twins are, so the log shows
 *  "Driver: Ali → Hassan" instead of two Firestore ids. */
const SHIPLOG_FIELDS = {
  shipNumber:             'logF_shipNumber',
  date:                   'logF_date',
  customerName:           'logF_customerName',
  customerPhone:          'logF_customerPhone',
  customerAddress:        'logF_customerAddress',
  companyName:            'logF_companyName',
  driverName:             'logF_driverName',
  contractorName:         'logF_contractorName',
  status:                 'logF_status',
  orderType:              'logF_orderType',
  priceDollar:            'logF_priceDollar',
  priceLeb:               'logF_priceLeb',
  driverDeliveryCost:     'logF_driverDeliveryCost',
  contractorDeliveryCost: 'logF_contractorDeliveryCost',
  deliveryProfit:         'logF_deliveryProfit',
  returnedDeliveryCost:   'logF_returnedDeliveryCost',
  withdrawnAmountDollar:  'logF_withdrawnAmountDollar',
  withdrawnAmountLeb:     'logF_withdrawnAmountLeb',
  description:            'logF_description',
  driverNote:             'logF_driverNote',
};
const SHIPLOG_NUMERIC = new Set([
  'priceDollar', 'priceLeb', 'driverDeliveryCost', 'contractorDeliveryCost', 'deliveryProfit',
  'returnedDeliveryCost', 'withdrawnAmountDollar', 'withdrawnAmountLeb',
]);

/* ── Translations (merged into the app's TRANSLATIONS table) ── */
Object.assign(TRANSLATIONS.en, {
  shipLog:                 'Change Log',
  shipLogHistory:          'Change History',
  shipLogEmpty:            'No changes recorded yet',
  shipLogEmptyShip:        'No changes recorded for this order yet',
  shipLogTime:             'Date / Time',
  shipLogUser:             'User',
  shipLogAction:           'Action',
  shipLogOrder:            'Order',
  shipLogChanges:          'Changes (before → after)',
  shipLogActionUpdate:     'Updated',
  shipLogActionDelete:     'Deleted',
  shipLogAllActions:       'All actions',
  shipLogAllUsers:         'All users',
  shipLogAllFields:        'All fields',
  shipLogSearch:           'Search order # or customer...',
  shipLogCount:            'records',
  shipLogLimitNote:        'Showing the latest {n} records — narrow the date range to see older ones.',
  shipLogDeletedOrder:     'Order was deleted. Its data at deletion:',
  shipLogBack:             'Back',
  shipLogDeleteRow:        'Delete this record',
  shipLogDeleteShown:      'Delete shown records',
  shipLogDeleteOneTitle:   'Delete this log record?',
  shipLogDeleteManyTitle:  'Delete {n} log records?',
  shipLogDeleteMsg:        'The selected change history will be permanently removed. This cannot be undone.',
  shipLogDeleted:          'log records deleted',
  shipLogSrc_edit:         'Edit form',
  shipLogSrc_inline:       'Quick edit in table',
  shipLogSrc_bulkStatus:   'Bulk status change',
  shipLogSrc_bulkAssign:   'Bulk driver/contractor assign',
  shipLogSrc_delete:       'Deleted from orders',
  shipLogSrc_archiveDelete:'Deleted from archive',
  shipLogSrc_archiveBulkDelete: 'Bulk delete from archive',
  logF_shipNumber: 'Order #', logF_date: 'Date', logF_customerName: 'Customer',
  logF_customerPhone: 'Phone', logF_customerAddress: 'Address', logF_companyName: 'Company',
  logF_driverName: 'Driver', logF_contractorName: 'Contractor', logF_status: 'Status',
  logF_orderType: 'Order type', logF_priceDollar: 'Price ($)', logF_priceLeb: 'Price (L.L.)',
  logF_driverDeliveryCost: 'Driver cost', logF_contractorDeliveryCost: 'Contractor cost',
  logF_deliveryProfit: 'Profit', logF_returnedDeliveryCost: 'Returned delivery cost',
  logF_withdrawnAmountDollar: 'Withdrawn ($)', logF_withdrawnAmountLeb: 'Withdrawn (L.L.)',
  logF_description: 'Notes', logF_driverNote: 'Driver note',
});
Object.assign(TRANSLATIONS.ar, {
  shipLog:                 'سجل التعديلات',
  shipLogHistory:          'سجل تعديلات الطلبية',
  shipLogEmpty:            'لا توجد تعديلات مسجلة بعد',
  shipLogEmptyShip:        'لا توجد تعديلات مسجلة لهذه الطلبية بعد',
  shipLogTime:             'التاريخ / الوقت',
  shipLogUser:             'المستخدم',
  shipLogAction:           'العملية',
  shipLogOrder:            'الطلبية',
  shipLogChanges:          'التغييرات (قبل ← بعد)',
  shipLogActionUpdate:     'تعديل',
  shipLogActionDelete:     'حذف',
  shipLogAllActions:       'كل العمليات',
  shipLogAllUsers:         'كل المستخدمين',
  shipLogAllFields:        'كل الحقول',
  shipLogSearch:           'بحث برقم الطلبية أو الزبون...',
  shipLogCount:            'سجل',
  shipLogLimitNote:        'يتم عرض آخر {n} سجل — حدّد نطاق تاريخ لرؤية السجلات الأقدم.',
  shipLogDeletedOrder:     'تم حذف الطلبية. بياناتها عند الحذف:',
  shipLogBack:             'رجوع',
  shipLogDeleteRow:        'حذف هذا السجل',
  shipLogDeleteShown:      'حذف السجلات المعروضة',
  shipLogDeleteOneTitle:   'حذف هذا السجل؟',
  shipLogDeleteManyTitle:  'حذف {n} سجل؟',
  shipLogDeleteMsg:        'سيتم حذف سجل التعديلات المحدد نهائياً. لا يمكن التراجع عن هذه العملية.',
  shipLogDeleted:          'سجل تم حذفه',
  shipLogSrc_edit:         'نموذج التعديل',
  shipLogSrc_inline:       'تعديل سريع في الجدول',
  shipLogSrc_bulkStatus:   'تغيير حالة جماعي',
  shipLogSrc_bulkAssign:   'تعيين سائق/متعهد جماعي',
  shipLogSrc_delete:       'حذف من الطلبيات',
  shipLogSrc_archiveDelete:'حذف من الأرشيف',
  shipLogSrc_archiveBulkDelete: 'حذف جماعي من الأرشيف',
  logF_shipNumber: 'رقم الطلبية', logF_date: 'التاريخ', logF_customerName: 'الزبون',
  logF_customerPhone: 'الهاتف', logF_customerAddress: 'العنوان', logF_companyName: 'الشركة',
  logF_driverName: 'السائق', logF_contractorName: 'المتعهد', logF_status: 'الحالة',
  logF_orderType: 'نوع الطلبية', logF_priceDollar: 'السعر ($)', logF_priceLeb: 'السعر (ل.ل)',
  logF_driverDeliveryCost: 'كلفة السائق', logF_contractorDeliveryCost: 'كلفة المتعهد',
  logF_deliveryProfit: 'الربح', logF_returnedDeliveryCost: 'كلفة توصيل المرتجع',
  logF_withdrawnAmountDollar: 'المبلغ المسحوب ($)', logF_withdrawnAmountLeb: 'المبلغ المسحوب (ل.ل)',
  logF_description: 'ملاحظات', logF_driverNote: 'ملاحظة السائق',
});

/* =================================================================
   WRITING LOGS
   ================================================================= */

/** Normalise a field value so '' / undefined / null (and 0 vs "0" for money) compare equal. */
function shipLogNorm(field, v) {
  if (SHIPLOG_NUMERIC.has(field)) return Number(v) || 0;
  if (v === null || v === undefined) return '';
  if (v?.seconds) return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}

/** Compare a shipment (before) against the fields being written (payload). Only fields
 *  present in the payload are compared, so partial updates (inline edit, bulk status)
 *  never report untouched fields as changed. */
function shipLogDiff(before, payload) {
  const b = before || {};
  const changes = [];
  Object.keys(SHIPLOG_FIELDS).forEach(f => {
    if (!(f in payload)) return;
    const oldV = shipLogNorm(f, b[f]);
    const newV = shipLogNorm(f, payload[f]);
    if (oldV !== newV) changes.push({ field: f, before: oldV, after: newV });
  });
  return changes;
}

function shipLogSnapshot(ship) {
  const snap = {};
  Object.keys(SHIPLOG_FIELDS).forEach(f => {
    const v = shipLogNorm(f, ship?.[f]);
    if (v !== '' && v !== 0) snap[f] = v;
  });
  return snap;
}

function shipLogUserInfo() {
  return {
    userId:    (typeof currentUser !== 'undefined' && currentUser?.uid) || currentUserData?.id || '',
    userName:  currentUserData?.displayName || currentUserData?.email || '',
    userEmail: currentUserData?.email || '',
  };
}

function shipLogEntry(action, source, ship, extra) {
  const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
  return {
    action, source,
    shipId:       ship?.id || '',
    shipNumber:   String(ship?.shipNumber ?? ''),
    companyName:  ship?.companyName  || '',
    customerName: ship?.customerName || '',
    ...extra,
    ...shipLogUserInfo(),
    at:       ts,
    atClient: new Date().toISOString(),
  };
}

/** Write log entries in batches. Never throws — logging must not break the real action. */
async function writeShipLogs(entries) {
  if (!db || !entries || !entries.length) return;
  try {
    const CHUNK = 450;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const batch = db.batch();
      entries.slice(i, i + CHUNK).forEach(e => batch.set(db.collection(SHIPLOG_COLLECTION).doc(), e));
      await batch.commit();
    }
  } catch (e) {
    console.warn('[ShipLog] could not write change log:', e);
  }
}

/** Log one edit. `before` = the shipment as it was, `payload` = the fields just saved.
 *  The shipNumber/company shown in the log is the *new* value when it changed. */
function logShipmentUpdate(before, payload, source) {
  return logShipmentUpdates([{ before, payload }], source);
}

/** Log many edits at once (bulk actions). items: [{ before, payload }] */
function logShipmentUpdates(items, source) {
  const entries = [];
  (items || []).forEach(({ before, payload }) => {
    if (!before) return;
    const changes = shipLogDiff(before, payload);
    if (!changes.length) return;
    const ref = { ...before, ...payload, id: before.id };
    entries.push(shipLogEntry('update', source, ref, { changes }));
  });
  return writeShipLogs(entries);
}

/** Log one or many deletions. ships: shipment objects (with id) as they were before delete. */
function logShipmentDeletes(ships, source) {
  const entries = (ships || []).filter(Boolean).map(s => shipLogEntry('delete', source, s, { snapshot: shipLogSnapshot(s) }));
  return writeShipLogs(entries);
}

/* =================================================================
   DISPLAY HELPERS
   ================================================================= */

function shipLogFmtTime(entry) {
  let d = entry.at;
  if (d?.seconds) d = new Date(d.seconds * 1000);
  else d = new Date(entry.atClient || d);
  if (isNaN(d?.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date}<div class="shiplog-time">${time}</div>`;
}

function shipLogFmtValue(field, v) {
  if (v === '' || v === null || v === undefined) return '<span class="shiplog-empty">—</span>';
  if (field === 'status' && STATUS_CONFIG[v])        return esc(t(STATUS_CONFIG[v].key));
  if (field === 'orderType' && ORDER_TYPE_CONFIG[v]) return esc(t(ORDER_TYPE_CONFIG[v].key));
  if (SHIPLOG_NUMERIC.has(field)) {
    const isLL = field === 'priceLeb' || field === 'withdrawnAmountLeb';
    return isLL ? `${formatNum(v)} L.L.` : `$${formatNum(v)}`;
  }
  return esc(v);
}

function shipLogActionBadge(action) {
  return action === 'delete'
    ? `<span class="badge badge-red">${esc(t('shipLogActionDelete'))}</span>`
    : `<span class="badge badge-blue">${esc(t('shipLogActionUpdate'))}</span>`;
}

function shipLogChangesHTML(entry) {
  const src = `<div class="shiplog-src">${esc(t('shipLogSrc_' + entry.source))}</div>`;
  if (entry.action === 'delete') {
    const snap = entry.snapshot || {};
    const lines = Object.keys(SHIPLOG_FIELDS).filter(f => f in snap).map(f => `
      <div class="shiplog-chg"><span class="shiplog-field">${esc(t(SHIPLOG_FIELDS[f]))}:</span>
      <span class="shiplog-before">${shipLogFmtValue(f, snap[f])}</span></div>`).join('');
    return `${src}<div class="shiplog-deleted-note">${esc(t('shipLogDeletedOrder'))}</div>${lines}`;
  }
  const arrow = currentLang === 'ar' ? '←' : '→';
  return src + (entry.changes || []).map(c => `
    <div class="shiplog-chg">
      <span class="shiplog-field">${esc(t(SHIPLOG_FIELDS[c.field] || c.field))}:</span>
      <span class="shiplog-before">${shipLogFmtValue(c.field, c.before)}</span>
      <span class="shiplog-arrow">${arrow}</span>
      <span class="shiplog-after">${shipLogFmtValue(c.field, c.after)}</span>
    </div>`).join('');
}

function shipLogTimeMs(entry) {
  if (entry.at?.seconds) return entry.at.seconds * 1000;
  const d = new Date(entry.atClient || 0).getTime();
  return isNaN(d) ? 0 : d;
}

/* =================================================================
   CHANGE LOG PAGE
   ================================================================= */

/** Deleting log history is restricted to the fixed Admin role only (not managers or
 *  custom roles, even with canManageUsers) — enforced again in firestore.rules. */
function canDeleteShipLogs() {
  return currentUserData?.role === 'admin';
}

async function renderShipLog() {
  if (!can('canManageUsers')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  const fieldOptions = Object.keys(SHIPLOG_FIELDS)
    .map(f => `<option value="${f}">${esc(t(SHIPLOG_FIELDS[f]))}</option>`).join('');

  content.innerHTML = `
  ${pageHeader(t('shipLog'), [t('operations')])}
  <div class="toolbar">
    <div class="filter-bar">
      <input type="date" class="filter-date" id="sl-from" onchange="loadShipLog()">
      <span style="color:var(--text-3);">–</span>
      <input type="date" class="filter-date" id="sl-to" onchange="loadShipLog()">
      <select class="filter-select" id="sl-user" onchange="filterShipLog()"><option value="">${esc(t('shipLogAllUsers'))}</option></select>
      <select class="filter-select" id="sl-action" onchange="filterShipLog()">
        <option value="">${esc(t('shipLogAllActions'))}</option>
        <option value="update">${esc(t('shipLogActionUpdate'))}</option>
        <option value="delete">${esc(t('shipLogActionDelete'))}</option>
      </select>
      <select class="filter-select" id="sl-field" onchange="filterShipLog()"><option value="">${esc(t('shipLogAllFields'))}</option>${fieldOptions}</select>
      <div class="table-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="sl-search" placeholder="${esc(t('shipLogSearch'))}" oninput="filterShipLog()">
      </div>
      <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="resetShipLogFilters()" title="${esc(t('resetFilters'))}">${ICONS.refreshCcw}</button>
    </div>
  </div>
  <div class="table-container">
    <div class="table-header">
      <span style="font-size:13px;color:var(--text-2);" id="sl-count">Loading...</span>
      ${canDeleteShipLogs() ? `<button class="btn btn-danger btn-sm" id="sl-delete-shown" onclick="deleteShownShipLogs()" style="display:none;">🗑 ${esc(t('shipLogDeleteShown'))}</button>` : ''}
    </div>
    <div id="sl-limit-note" class="shiplog-limit-note" style="display:none;"></div>
    <div class="table-scroll">
      <table class="shiplog-table">
        <thead><tr>
          <th>${esc(t('shipLogTime'))}</th>
          <th>${esc(t('shipLogUser'))}</th>
          <th>${esc(t('shipLogAction'))}</th>
          <th>${esc(t('shipLogOrder'))}</th>
          <th>${esc(t('shipLogChanges'))}</th>
          ${canDeleteShipLogs() ? `<th></th>` : ''}
        </tr></thead>
        <tbody id="sl-tbody"><tr><td colspan="6" style="text-align:center;padding:40px;"><div class="spinner" style="margin:auto;"></div></td></tr></tbody>
      </table>
    </div>
  </div>`;

  await loadShipLog();
}

/** (Re)load log records from Firestore — newest first, optionally limited to a date range. */
async function loadShipLog() {
  const from = document.getElementById('sl-from')?.value;
  const to   = document.getElementById('sl-to')?.value;
  let rows = [];
  try {
    if (db) {
      let q = db.collection(SHIPLOG_COLLECTION);
      if (from) q = q.where('at', '>=', new Date(from + 'T00:00:00'));
      if (to)   q = q.where('at', '<=', new Date(to + 'T23:59:59.999'));
      const snap = await q.orderBy('at', 'desc').limit(SHIPLOG_LOAD_LIMIT).get();
      rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    console.error(e);
    toast(t('error') + e.message, 'error');
  }
  window._shipLogRows = rows;

  const note = document.getElementById('sl-limit-note');
  if (note) {
    note.style.display = rows.length >= SHIPLOG_LOAD_LIMIT ? '' : 'none';
    note.textContent = t('shipLogLimitNote').replace('{n}', SHIPLOG_LOAD_LIMIT);
  }

  // Rebuild the user dropdown from whoever appears in the loaded records.
  const userSel = document.getElementById('sl-user');
  if (userSel) {
    const prev  = userSel.value;
    const users = [...new Map(rows.map(r => [r.userId, r.userName || r.userEmail || r.userId])).entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    userSel.innerHTML = `<option value="">${esc(t('shipLogAllUsers'))}</option>` +
      users.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    if (users.some(([id]) => id === prev)) userSel.value = prev;
  }
  filterShipLog();
}

function filterShipLog() {
  const user   = document.getElementById('sl-user')?.value   || '';
  const action = document.getElementById('sl-action')?.value || '';
  const field  = document.getElementById('sl-field')?.value  || '';
  const search = (document.getElementById('sl-search')?.value || '').trim().toLowerCase();

  const list = (window._shipLogRows || []).filter(r => {
    if (user   && r.userId !== user)   return false;
    if (action && r.action !== action) return false;
    if (field  && !(r.action === 'update' && (r.changes || []).some(c => c.field === field))) return false;
    if (search) {
      const hay = `${r.shipNumber} ${r.customerName} ${r.companyName}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  window._shipLogFiltered = list;
  const countEl = document.getElementById('sl-count');
  if (countEl) countEl.textContent = `${list.length} ${t('shipLogCount')}`;
  const delBtn = document.getElementById('sl-delete-shown');
  if (delBtn) delBtn.style.display = list.length ? '' : 'none';
  const canDel = canDeleteShipLogs();

  const tbody = document.getElementById('sl-tbody');
  if (!tbody) return;
  tbody.innerHTML = list.map(r => `
  <tr>
    <td class="font-mono" style="white-space:nowrap;">${shipLogFmtTime(r)}</td>
    <td><strong>${esc(r.userName || '—')}</strong>${r.userEmail && r.userEmail !== r.userName ? `<div class="shiplog-time">${esc(r.userEmail)}</div>` : ''}</td>
    <td>${shipLogActionBadge(r.action)}</td>
    <td style="white-space:nowrap;">
      <span class="font-mono" style="color:var(--brand-light);font-weight:700;">#${esc(r.shipNumber || '—')}</span>
      ${r.companyName ? `<div class="shiplog-time">${esc(r.companyName)}</div>` : ''}
    </td>
    <td class="shiplog-changes-cell">${shipLogChangesHTML(r)}</td>
    ${canDel ? `<td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteShipLog('${esc(r.id)}')" title="${esc(t('shipLogDeleteRow'))}">🗑</button></td>` : ''}
  </tr>`).join('') ||
  `<tr><td colspan="6" class="table-empty"><div class="empty-icon">📝</div><p>${esc(t('shipLogEmpty'))}</p></td></tr>`;
}

/** Permanently delete the given log record ids (admin only), in batches. */
async function _deleteShipLogIds(ids) {
  if (!canDeleteShipLogs()) { toast(t('noPermission'), 'error'); return; }
  if (!ids.length) return;
  try {
    if (db) {
      const CHUNK = 450;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = db.batch();
        ids.slice(i, i + CHUNK).forEach(id => batch.delete(db.collection(SHIPLOG_COLLECTION).doc(id)));
        await batch.commit();
      }
    }
    const gone = new Set(ids);
    window._shipLogRows = (window._shipLogRows || []).filter(r => !gone.has(r.id));
    toast(`${ids.length} ${t('shipLogDeleted')}`, 'success');
    filterShipLog();
  } catch (e) {
    toast(t('error') + e.message, 'error');
  }
}

function deleteShipLog(id) {
  if (!canDeleteShipLogs()) { toast(t('noPermission'), 'error'); return; }
  confirmAction(t('shipLogDeleteOneTitle'), t('shipLogDeleteMsg'), () => _deleteShipLogIds([id]));
}

/** Delete every record currently shown by the active filters (e.g. pick a date range
 *  or a user first, then clear just those). */
function deleteShownShipLogs() {
  if (!canDeleteShipLogs()) { toast(t('noPermission'), 'error'); return; }
  const ids = (window._shipLogFiltered || []).map(r => r.id);
  if (!ids.length) return;
  confirmAction(t('shipLogDeleteManyTitle').replace('{n}', ids.length), t('shipLogDeleteMsg'), () => _deleteShipLogIds(ids));
}

function resetShipLogFilters() {
  ['sl-user', 'sl-action', 'sl-field', 'sl-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const hadDates = document.getElementById('sl-from')?.value || document.getElementById('sl-to')?.value;
  ['sl-from', 'sl-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (hadDates) loadShipLog(); else filterShipLog();
}

/* =================================================================
   PER-ORDER HISTORY (opened from the shipment details modal)
   ================================================================= */

async function openShipmentHistory(id, shipNumber) {
  if (!can('canManageUsers')) { toast(t('noPermission'), 'error'); return; }
  const title  = document.getElementById('modal-detail-title');
  const body   = document.getElementById('modal-detail-body');
  const footer = document.getElementById('modal-detail-footer');
  title.textContent = `${t('shipLogHistory')} #${shipNumber || id}`;
  body.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>';
  footer.innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('modal-detail')">${esc(t('close'))}</button>
    <button class="btn btn-primary" onclick="viewShipment('${esc(id)}')">${esc(t('shipLogBack'))}</button>`;
  openModal('modal-detail');

  let rows = [];
  try {
    if (db) {
      // Equality filter only (no orderBy) so no composite index is needed — sorted below.
      const snap = await db.collection(SHIPLOG_COLLECTION).where('shipId', '==', id).get();
      rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { toast(t('error') + e.message, 'error'); }
  rows.sort((a, b) => shipLogTimeMs(b) - shipLogTimeMs(a));

  body.innerHTML = rows.length ? `
    <div class="shiplog-history">
      ${rows.map(r => `
      <div class="shiplog-history-item">
        <div class="shiplog-history-head">
          ${shipLogActionBadge(r.action)}
          <strong>${esc(r.userName || '—')}</strong>
          <span class="shiplog-time" style="margin-inline-start:auto;">${shipLogFmtTime(r).replace('<div class="shiplog-time">', ' · ').replace('</div>', '')}</span>
        </div>
        ${shipLogChangesHTML(r)}
      </div>`).join('')}
    </div>` :
    `<div class="table-empty" style="padding:40px;text-align:center;"><div class="empty-icon">📝</div><p>${esc(t('shipLogEmptyShip'))}</p></div>`;
}
