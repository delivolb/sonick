/* ===================================================
   SONICK DELIVERY SYSTEM — Import Orders by Excel
   Lets an operator pick any .xlsx/.xls file and manually tell the
   system which spreadsheet column feeds which order field (with
   auto-detection from header text as a head start, always
   overridable). Rows missing required data are dropped automatically;
   duplicate or "not logical" ship numbers are surfaced for the
   operator to approve or skip before anything is written.
   =================================================== */

/** Every order field the importer can fill, in mapping-grid display order.
 *  `required` fields block a row from import (silently removed, reported in
 *  the review) when left blank in the sheet. */
const IMPORT_FIELDS = [
  { key: 'shipNumber',      labelKey: 'impFieldShipNumber',      required: true  },
  { key: 'customerName',    labelKey: 'impFieldCustomerName',    required: false },
  { key: 'customerPhone',   labelKey: 'impFieldCustomerPhone',   required: false },
  { key: 'customerAddress', labelKey: 'impFieldCustomerAddress', required: false },
  { key: 'companyName',     labelKey: 'impFieldCompany',         required: false },
  { key: 'driverName',      labelKey: 'impFieldDriver',          required: false },
  { key: 'contractorName',  labelKey: 'impFieldContractor',      required: false },
  { key: 'priceDollar',     labelKey: 'impFieldPriceDollar',     required: true  },
  { key: 'priceLeb',        labelKey: 'impFieldPriceLeb',        required: false },
  { key: 'status',          labelKey: 'impFieldStatus',          required: false },
  { key: 'orderType',       labelKey: 'impFieldOrderType',       required: false },
  { key: 'date',            labelKey: 'impFieldDate',            required: false },
  { key: 'description',     labelKey: 'impFieldDescription',     required: false },
];

/** Keyword hints (checked against lower-cased header text) used only to pre-select a
 *  likely column per field on first load — purely a head start, never a constraint;
 *  the operator can always override every mapping manually via its own dropdown. */
const IMPORT_AUTODETECT_HINTS = {
  shipNumber:      ['ship', 'order', 'رقم', 'طلبية', 'طلب'],
  customerName:    ['customer', 'recipient', 'name', 'زبون', 'اسم', 'العميل'],
  customerPhone:   ['phone', 'mobile', 'tel', 'هاتف', 'تلفون', 'موبايل'],
  customerAddress: ['address', 'عنوان'],
  companyName:     ['company', 'client', 'شركة'],
  driverName:      ['driver', 'سائق'],
  contractorName:  ['contractor', 'متعهد', 'متعهّد'],
  priceDollar:     ['usd', '$', 'دولار', 'price', 'سعر'],
  priceLeb:        ['ll', 'l.l', 'lbp', 'ليرة', 'لبنانية'],
  status:          ['status', 'حالة'],
  orderType:       ['type', 'نوع'],
  date:            ['date', 'تاريخ'],
  description:     ['description', 'note', 'desc', 'وصف', 'ملاحظ'],
};

let _importState  = null; // { fileName, hasHeader, allRows, mapping }
let _importReview = null; // { ready:[{rowNum,payload}], removed:[{rowNum,reason}], warned:[{rowNum,payload,reason}] }

// ===== PAGE RENDER =====
async function renderImport() {
  if (!can('canCreateShipments')) { renderAccessDenied(); return; }
  const content = document.getElementById('page-content');
  _importState  = null;
  _importReview = null;

  content.innerHTML = `
  ${pageHeader(t('importExcelTitle'), [t('operations')], `<button class="btn btn-secondary btn-sm" onclick="downloadImportTemplate()">${ICONS.excelFile} ${t('impDownloadTemplateBtn')}</button>`)}

  <div class="import-intro">
    <div class="import-intro-icon">${ICONS.upload}</div>
    <div>
      <div class="import-intro-title">${esc(t('impIntroTitle'))}</div>
      <div class="import-intro-sub">${esc(t('impIntroSub'))}</div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-title"><span class="icon-inline">${ICONS.excelFile}</span> ${t('impStep1Title')}</div>
    <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:12px;">
      <div class="settings-row-desc">${t('impStep1Desc')}</div>
      <div id="import-dropzone" class="import-dropzone" onclick="document.getElementById('import-file-input').click()"
           ondragover="event.preventDefault();this.classList.add('dragover')"
           ondragleave="this.classList.remove('dragover')"
           ondrop="handleImportFileDrop(event)">
        <input type="file" id="import-file-input" accept=".xlsx,.xls" class="hidden" onchange="handleImportFileChosen(event)">
        <div class="import-dropzone-icon">${ICONS.excelFile}</div>
        <div class="import-dropzone-text" id="import-dropzone-text">${t('impDropzoneText')}</div>
        <div class="import-dropzone-sub">${t('impDropzoneSub')}</div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:0.857rem;color:var(--text-2);cursor:pointer;">
        <input type="checkbox" id="import-has-header" checked onchange="onImportHeaderToggle()">
        ${t('impHasHeaderRow')}
      </label>
    </div>
  </div>

  <div id="import-mapping-section"></div>`;
}

// ===== FILE PARSING =====
function handleImportFileChosen(event) {
  const file = event.target.files?.[0];
  if (file) loadImportFile(file);
}

function handleImportFileDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('dragover');
  const file = event.dataTransfer?.files?.[0];
  if (file) loadImportFile(file);
}

/** Best-effort flatten of an ExcelJS cell value (which can be a plain string/number, a
 *  Date, or an object for rich text / formula results / hyperlinks) into a plain value
 *  suitable for the rest of the import pipeline to work with. */
function cellToPlainValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(rt => rt.text).join('');
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
  }
  return v;
}

/** 0-indexed column number → spreadsheet letter (0→A, 1→B, ... 26→AA). */
function colLetter(n) {
  let s = '';
  n++;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function loadImportFile(file) {
  const dzText = document.getElementById('import-dropzone-text');
  if (dzText) dzText.textContent = t('impParsingFile');

  try {
    const buf = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('no sheet');

    let colCount = sheet.actualColumnCount || sheet.columnCount || 0;
    if (!colCount) {
      sheet.eachRow({ includeEmpty: true }, row => {
        colCount = Math.max(colCount, row.actualCellCount || row.cellCount || 0);
      });
    }
    if (!colCount) throw new Error('no columns');

    const rawRows = [];
    sheet.eachRow({ includeEmpty: true }, row => {
      const vals = [];
      for (let c = 1; c <= colCount; c++) vals.push(cellToPlainValue(row.getCell(c).value));
      rawRows.push(vals);
    });

    // Drop rows that are entirely blank (formatting-only rows, trailing blank rows, etc.)
    // — they carry no data at all, so surfacing them as "removed" would just be noise.
    const allRows = rawRows.filter(r => r.some(v => v !== '' && v !== null && v !== undefined));
    if (!allRows.length) throw new Error('no data rows');

    _importState = {
      fileName: file.name,
      hasHeader: document.getElementById('import-has-header')?.checked !== false,
      allRows,
      mapping: {},
    };
    applyImportAutoDetect();
    renderImportMappingSection();
    toast(`${t('impFileLoaded')} — ${importDataRows().length} ${t('impRowsFound')}`, 'success');
  } catch (e) {
    toast(t('impFileReadError'), 'error');
    if (dzText) dzText.textContent = t('impDropzoneText');
  }
}

function onImportHeaderToggle() {
  if (!_importState) return;
  _importState.hasHeader = document.getElementById('import-has-header')?.checked !== false;
  renderImportMappingSection();
}

function importHeaderRow()  { return (_importState?.hasHeader && _importState.allRows[0]) || []; }
function importDataRows()   { return _importState ? (_importState.hasHeader ? _importState.allRows.slice(1) : _importState.allRows) : []; }
function importColumnLabels() {
  if (!_importState) return [];
  const header = importHeaderRow();
  const n = _importState.allRows[0]?.length || 0;
  const labels = [];
  for (let i = 0; i < n; i++) {
    const h = header[i];
    const letter = colLetter(i);
    labels.push(h !== '' && h !== undefined && h !== null ? `${letter} — ${String(h).trim()}` : `${t('impColumnLabel')} ${letter}`);
  }
  return labels;
}

/** Pre-select a likely column per field by matching header text against
 *  IMPORT_AUTODETECT_HINTS. No-op (leaves fields unmapped) when there's no header row. */
function applyImportAutoDetect() {
  if (!_importState?.hasHeader) return;
  const header = importHeaderRow().map(h => String(h ?? '').toLowerCase());
  IMPORT_FIELDS.forEach(f => {
    const hints = IMPORT_AUTODETECT_HINTS[f.key] || [];
    const idx = header.findIndex(h => h && hints.some(hint => h.includes(hint)));
    if (idx !== -1) _importState.mapping[f.key] = idx;
  });
}

function updateImportMapping(field, value) {
  if (!_importState) return;
  if (value === '') delete _importState.mapping[field];
  else _importState.mapping[field] = parseInt(value, 10);
  renderImportPreviewTable();
}

// ===== MAPPING + PREVIEW UI =====
function renderImportMappingSection() {
  const container = document.getElementById('import-mapping-section');
  if (!container) return;
  if (!_importState) { container.innerHTML = ''; return; }

  const labels = importColumnLabels();

  container.innerHTML = `
  <div class="settings-section">
    <div class="settings-section-title"><span class="icon-inline">${ICONS.filter}</span> ${t('impStep2Title')}</div>
    <div class="settings-row-desc" style="padding:0 20px 14px;">${t('impStep2Desc')}</div>
    <div class="import-mapping-grid">
      ${IMPORT_FIELDS.map(f => `
        <div class="import-mapping-item ${_importState.mapping[f.key] !== undefined ? 'mapped' : ''}">
          <label class="form-label">${esc(t(f.labelKey))} ${f.required ? '<span style="color:var(--brand)">*</span>' : ''}</label>
          <select class="form-select" onchange="updateImportMapping('${f.key}', this.value)">
            <option value="">${t('impNotImported')}</option>
            ${labels.map((label, idx) => `<option value="${idx}" ${_importState.mapping[f.key] === idx ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-title">
      <span class="icon-inline">${ICONS.package}</span> ${t('impStep3Title')}
      <span style="font-weight:400;color:var(--text-3);font-size:0.8rem;">${t('impPreviewNote')}</span>
    </div>
    <div class="table-scroll" style="padding:0 20px;">
      <table>
        <thead><tr>
          <th>#</th><th>${t('impFieldShipNumber')}</th><th>${t('impFieldCustomerName')}</th>
          <th>${t('impFieldCustomerPhone')}</th><th>${t('impFieldCompany')}</th>
          <th>${t('impFieldPriceDollar')}</th><th>${t('impPreviewStatusCol')}</th>
        </tr></thead>
        <tbody id="import-preview-tbody"></tbody>
      </table>
    </div>
    <div class="settings-row">
      <div class="settings-row-desc">${t('impTotalRowsLabel')}: <strong style="color:var(--text-2);">${importDataRows().length}</strong></div>
      <button class="btn btn-primary btn-sm" id="import-validate-btn" onclick="runImportValidation()">${ICONS.upload} ${t('impValidateBtn')}</button>
    </div>
  </div>`;

  renderImportPreviewTable();
}

/** Pull every mapped field's raw spreadsheet value out of one data row. */
function extractRowFields(row) {
  const out = {};
  IMPORT_FIELDS.forEach(f => {
    const idx = _importState.mapping[f.key];
    out[f.key] = idx === undefined ? '' : row[idx];
  });
  return out;
}

function renderImportPreviewTable() {
  const tbody = document.getElementById('import-preview-tbody');
  if (!tbody || !_importState) return;

  const rows = importDataRows();
  const previewCount = Math.min(8, rows.length);
  const headerOffset = _importState.hasHeader ? 1 : 0;

  const rowsHtml = rows.slice(0, previewCount).map((row, i) => {
    const f = extractRowFields(row);
    const shipNum = String(f.shipNumber ?? '').trim();
    const priceRaw = f.priceDollar;
    const missing = !shipNum || priceRaw === '' || priceRaw === undefined || priceRaw === null || isNaN(parseFloat(priceRaw));
    return `
    <tr ${missing ? 'style="opacity:0.55;"' : ''}>
      <td class="font-mono" style="color:var(--text-3);">${i + 1 + headerOffset}</td>
      <td class="font-mono">${esc(shipNum || '—')}</td>
      <td>${esc(f.customerName || '—')}</td>
      <td>${esc(f.customerPhone || '—')}</td>
      <td>${esc(f.companyName || '—')}</td>
      <td class="font-mono">${priceRaw !== '' && priceRaw !== undefined && priceRaw !== null ? esc(String(priceRaw)) : '—'}</td>
      <td>${missing ? `<span class="badge badge-red">${t('impMissingBadge')}</span>` : `<span class="badge badge-green">${t('impOkBadge')}</span>`}</td>
    </tr>`;
  }).join('');

  const moreHtml = rows.length > previewCount
    ? `<tr><td colspan="7" style="text-align:center;color:var(--text-3);font-size:0.8rem;">${t('impMoreRows').replace('{n}', rows.length - previewCount)}</td></tr>`
    : '';

  tbody.innerHTML = rowsHtml + moreHtml;
}

// ===== VALIDATION =====
function matchEntityByName(cache, name) {
  const n = String(name ?? '').trim().toLowerCase();
  if (!n) return null;
  return (cache || []).find(c => (c.name || '').trim().toLowerCase() === n) || null;
}

/** Match a free-text status/order-type value against its key, English label, or Arabic
 *  label — so a sheet exported in either language (or using raw internal keys) resolves. */
function matchConfigLabel(raw, keys, config) {
  const n = String(raw ?? '').trim().toLowerCase();
  if (!n) return null;
  for (const key of keys) {
    if (key.toLowerCase() === n) return key;
    const enLabel = (TRANSLATIONS.en[config[key].key] || '').toLowerCase();
    const arLabel = (TRANSLATIONS.ar[config[key].key] || '').toLowerCase();
    if (enLabel === n || arLabel === n) return key;
  }
  return null;
}

/** Parse a date cell (an ExcelJS Date object, or free text) into the app's stored
 *  'YYYY-MM-DD' string format. Returns null (caller falls back to today()) if unparseable. */
function parseImportDate(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().split('T')[0];
  const str = String(val ?? '').trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

/** A ship number is "not logical" if, after trimming, it has no alphanumeric characters
 *  at all (e.g. just punctuation/whitespace/a formula-error placeholder) or is
 *  unreasonably long — either way it's not something a human would use as an order number. */
function isLogicalShipNumber(str) {
  return /[A-Za-z0-9\u0600-\u06FF]/.test(str) && str.length <= 24;
}

/** Full validation pass over every mapped data row: fetches existing shipments once to
 *  check duplicates against the live database, classifies each row as ready / removed
 *  (missing required data — dropped automatically) / warned (duplicate or not-logical
 *  ship number — surfaced for the operator to approve or skip), then opens the review
 *  modal. Company/Driver/Contractor names are resolved against the existing caches by
 *  exact (case-insensitive) name match; when a name doesn't match anything on file, the
 *  order is still imported with that name as free text but with no linked id/cost sync. */
async function runImportValidation() {
  if (!_importState) return;
  const btn = document.getElementById('import-validate-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('impValidating'); }

  let existingShips = [];
  try {
    if (db) {
      const snap = await db.collection('sonick_shipments').get();
      existingShips = snap.docs.map(d => d.data());
    }
  } catch (e) { /* proceed without DB duplicate check if the fetch itself fails */ }

  const keyOf = (shipNumber, companyId) => `${String(shipNumber).trim().toLowerCase()}::${companyId || ''}`;
  const existingSet = new Set(existingShips.map(s => keyOf(s.shipNumber, s.companyId)));
  const seenInFile  = new Map(); // key -> first row number seen

  const rows = importDataRows();
  const headerOffset = _importState.hasHeader ? 1 : 0;

  const ready = [], removed = [], warned = [];

  rows.forEach((row, i) => {
    const rowNum = i + 1 + headerOffset;
    const f = extractRowFields(row);

    const shipNumberRaw = String(f.shipNumber ?? '').trim();
    const priceRaw = f.priceDollar;
    const priceDollar = parseFloat(priceRaw);
    const priceMissing = priceRaw === '' || priceRaw === undefined || priceRaw === null || isNaN(priceDollar);

    if (!shipNumberRaw || priceMissing) {
      removed.push({ rowNum, reason: !shipNumberRaw ? t('impReasonMissingShipNum') : t('impReasonMissingPrice') });
      return;
    }

    const companyObj    = matchEntityByName(companies_cache, f.companyName);
    const driverObj     = matchEntityByName(drivers_cache, f.driverName);
    const contractorObj = matchEntityByName(contractors_cache, f.contractorName);

    let priceLeb = parseFloat(f.priceLeb);
    if (isNaN(priceLeb)) priceLeb = 0;

    const statusVal    = matchConfigLabel(f.status, ALL_STATUSES, STATUS_CONFIG) || 'Pending';
    const orderTypeVal = matchConfigLabel(f.orderType, ALL_ORDER_TYPES, ORDER_TYPE_CONFIG) || 'Normal';
    const dateVal       = (f.date && parseImportDate(f.date)) || today();

    const payload = {
      shipNumber: shipNumberRaw,
      date: dateVal,
      customerName:    String(f.customerName ?? '').trim(),
      customerPhone:   String(f.customerPhone ?? '').trim(),
      customerAddress: String(f.customerAddress ?? '').trim(),
      companyId:       companyObj?.id || '',    companyName:    companyObj?.name    || String(f.companyName ?? '').trim(),
      driverId:        driverObj?.id || '',     driverName:     driverObj?.name     || (driverObj ? '' : String(f.driverName ?? '').trim()),
      contractorId:    contractorObj?.id || '', contractorName: contractorObj?.name || (contractorObj ? '' : String(f.contractorName ?? '').trim()),
      status: statusVal,
      orderType: orderTypeVal,
      priceDollar, priceLeb,
      driverDeliveryCost:     driverObj?.deliveryCost     || 0,
      contractorDeliveryCost: contractorObj?.deliveryCost || 0,
      deliveryProfit:         companyObj?.deliveryCost    || 0,
      returnedDeliveryCost:  0,
      withdrawnAmountDollar: 0,
      withdrawnAmountLeb:    0,
      description: String(f.description ?? '').trim(),
    };

    const key = keyOf(shipNumberRaw, payload.companyId);

    if (!isLogicalShipNumber(shipNumberRaw)) {
      warned.push({ rowNum, payload, reason: t('impReasonInvalidShipNum') });
      return;
    }
    if (existingSet.has(key)) {
      warned.push({ rowNum, payload, reason: t('impReasonDuplicateExisting') });
      return;
    }
    if (seenInFile.has(key)) {
      warned.push({ rowNum, payload, reason: t('impReasonDuplicateInFile').replace('{row}', seenInFile.get(key)) });
      return;
    }

    seenInFile.set(key, rowNum);
    ready.push({ rowNum, payload });
  });

  _importReview = { ready, removed, warned };
  if (btn) { btn.disabled = false; btn.innerHTML = `${ICONS.upload} ${t('impValidateBtn')}`; }
  openImportReviewModal();
}

// ===== REVIEW MODAL =====
function openImportReviewModal() {
  if (!_importReview) return;
  const { ready, removed, warned } = _importReview;

  document.getElementById('import-review-title').textContent = t('impReviewTitle');

  const statsEl = document.getElementById('import-review-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="import-stat-pill green"><strong>${ready.length}</strong><span>${t('impReadyLabel')}</span></div>
      <div class="import-stat-pill gray"><strong>${removed.length}</strong><span>${t('impRemovedLabel')}</span></div>
      <div class="import-stat-pill amber"><strong>${warned.length}</strong><span>${t('impWarnLabel')}</span></div>
    `;
  }

  const removedBlock = document.getElementById('import-review-removed-block');
  if (removed.length) {
    removedBlock.style.display = 'block';
    document.getElementById('import-review-removed-title').textContent = `🗑 ${t('impRemovedSectionTitle')}`;
    document.getElementById('import-review-removed-list').innerHTML = removed.map(r => `
      <div class="settings-row" style="padding:6px 10px;">
        <span style="font-size:0.83rem;color:var(--text-3);">${t('impRowLabel')} ${r.rowNum}</span>
        <span style="font-size:0.83rem;color:var(--red);">${esc(r.reason)}</span>
      </div>`).join('');
  } else {
    removedBlock.style.display = 'none';
  }

  const warnBlock = document.getElementById('import-review-warn-block');
  if (warned.length) {
    warnBlock.style.display = 'block';
    document.getElementById('import-review-warn-title').textContent = `⚠️ ${t('impWarnSectionTitle')}`;
    document.getElementById('import-warn-select-all-label').textContent = t('impIncludeAllAnyway');
    const selectAll = document.getElementById('import-warn-select-all');
    if (selectAll) selectAll.checked = false;
    document.getElementById('import-review-warn-list').innerHTML = warned.map((w, idx) => `
      <div class="settings-row" style="padding:8px 10px;align-items:flex-start;">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0;">
          <input type="checkbox" class="import-warn-check" data-idx="${idx}" onchange="updateImportConfirmCount()">
          <span>
            <span class="settings-row-label" style="display:block;">${t('impRowLabel')} ${w.rowNum} — #${esc(w.payload.shipNumber)}</span>
            <span style="display:block;font-size:0.8rem;color:var(--amber);margin-top:2px;">${esc(w.reason)}</span>
          </span>
        </label>
      </div>`).join('');
  } else {
    warnBlock.style.display = 'none';
  }

  updateImportConfirmCount();
  openModal('modal-import-review');
}

function toggleImportWarnSelectAll(checked) {
  document.querySelectorAll('.import-warn-check').forEach(cb => { cb.checked = checked; });
  updateImportConfirmCount();
}

function updateImportConfirmCount() {
  if (!_importReview) return;
  const includedWarn = document.querySelectorAll('.import-warn-check:checked').length;
  const total = _importReview.ready.length + includedWarn;
  const btn = document.getElementById('import-review-confirm-btn');
  if (btn) {
    btn.textContent = `${t('impConfirmImportBtn')} (${total})`;
    btn.disabled = total === 0;
  }
}

/** Write every ready + operator-approved-warned row to Firestore in batches (chunked
 *  defensively at 450 writes — well under Firestore's 500-per-batch cap), then refresh
 *  the page so the operator can import another file right away. */
async function confirmImportCommit() {
  if (!_importReview) return;
  const { ready, warned } = _importReview;
  const includedIdx = new Set([...document.querySelectorAll('.import-warn-check:checked')].map(cb => parseInt(cb.dataset.idx, 10)));
  const toImport = [...ready.map(r => r.payload), ...warned.filter((w, i) => includedIdx.has(i)).map(w => w.payload)];

  if (!toImport.length) { toast(t('impNothingToImport'), 'info'); return; }

  const btn = document.getElementById('import-review-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('impImporting'); }

  try {
    const ts = (firebase?.firestore?.FieldValue?.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
    for (let i = 0; i < toImport.length; i += 450) {
      const chunk = toImport.slice(i, i + 450);
      const batch = db.batch();
      chunk.forEach(payload => {
        const ref = db.collection('sonick_shipments').doc();
        batch.set(ref, { ...payload, createdAt: ts, createdBy: currentUserData?.id || '', updatedAt: ts, updatedBy: currentUserData?.id || '' });
      });
      await batch.commit();
    }

    closeModal('modal-import-review');
    toast(`${toImport.length} ${t('impImportedSuccessLabel')}`, 'success');
    _importState = null;
    _importReview = null;
    renderImport();
  } catch (e) {
    toast(t('errorSaving') + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('impConfirmImportBtn'); }
  }
}

// ===== TEMPLATE DOWNLOAD =====
/** Generates a starter .xlsx with the exact field labels as headers plus one example
 *  row, so an operator building a fresh sheet (or mapping an existing export) has a
 *  ready reference for column order and expected value shapes. */
async function downloadImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const isRTL = document.documentElement.dir === 'rtl';
  const sheet = workbook.addWorksheet('Orders', { views: [{ rightToLeft: isRTL }] });
  const headers = IMPORT_FIELDS.map(f => t(f.labelKey));
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F6EF5' } };
  sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.columns = headers.map(() => ({ width: 18 }));
  sheet.addRow(['1001', 'Ali Hassan', '+961 71 234 567', 'Beirut, Hamra', 'Alpha Logistics', 'Ahmad Khalil', '', 150, '', 'Pending', 'Normal', '2026-05-20', 'Fragile items']);
  sheet.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sonick-import-template.xlsx'; a.click();
  URL.revokeObjectURL(url);
}