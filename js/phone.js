/* ===================================================
   SONICK DELIVERY SYSTEM — Phone Field Widget
   A reusable country-code + flag phone input, used at every
   phone entry point app-wide (Quick Add Order, New/Edit
   Shipment, Companies, Drivers). Built on the app's existing
   .dropdown / toggleDropdown() pattern, so it inherits the
   same styling and outside-click-to-close behavior for free.

   Stored/round-tripped value format: "+<dial> <national>",
   e.g. "+961 71 234 567". Legacy numbers saved before this
   widget existed (no "+" prefix) are treated as Lebanon
   national numbers when parsed, so nothing existing breaks.
   =================================================== */

/** Split a stored phone string into { iso, dial, national }. Matches the LONGEST known
 *  dial code first, so e.g. a Lebanon "+961…" number is never mistaken for some shorter
 *  prefix. Falls back to Lebanon for legacy numbers with no recognizable "+<dial>" prefix. */
function parsePhoneValue(raw) {
  const val = String(raw || '').trim();
  if (!val) return { iso: 'LB', dial: '961', national: '' };
  if (val.startsWith('+')) {
    const digits = val.slice(1).replace(/[^\d]/g, '');
    const byLongestDial = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of byLongestDial) {
      if (digits.startsWith(c.dial)) {
        return { iso: c.iso, dial: c.dial, national: digits.slice(c.dial.length).trim() };
      }
    }
  }
  return { iso: 'LB', dial: '961', national: val.replace(/^\+/, '').trim() };
}

/** Render a phone field's HTML: a flag + dial-code picker button (a .dropdown, exactly like
 *  the status-filter dropdowns) plus a plain number input for the national digits.
 *  `prefix` must be a unique DOM id root already used by the call site (e.g. "fo-phone") so
 *  getPhoneFieldValue()/clearPhoneField() can find it again. `extraInputAttrs` lets a call
 *  site keep its own behavior on the number input (e.g. Enter-to-submit in Quick Add). */
function phoneFieldHTML(prefix, value, extraInputAttrs) {
  const { iso, national } = parsePhoneValue(value);
  const country = COUNTRIES.find(c => c.iso === iso) || COUNTRIES[0];
  return `
  <div class="phone-field">
    <div class="dropdown" id="${prefix}-dd">
      <button type="button" class="phone-code-btn" onclick="togglePhoneDropdown('${prefix}')">
        <span class="phone-flag">${flagImgHTML(country.iso)}</span><span class="phone-dial">+${country.dial}</span><span class="phone-caret">▾</span>
      </button>
      <div class="dropdown-menu phone-dropdown-menu">
        <input type="text" class="phone-country-search" id="${prefix}-search" placeholder="${esc(t('phoneCountrySearchPlaceholder'))}" oninput="renderPhoneCountryList('${prefix}', this.value)">
        <div class="phone-country-list" id="${prefix}-list"></div>
      </div>
    </div>
    <input type="tel" class="form-input" id="${prefix}-num" value="${esc(national)}" ${extraInputAttrs || ''}>
    <input type="hidden" id="${prefix}-iso" value="${country.iso}">
  </div>`;
}

/** Open/close a phone field's country dropdown, populating the (unfiltered) country list
 *  and focusing the search box the moment it opens. */
function togglePhoneDropdown(prefix) {
  const dd = document.getElementById(prefix + '-dd');
  if (!dd) return;
  const opening = !dd.classList.contains('open');
  toggleDropdown(prefix + '-dd');
  if (opening) {
    renderPhoneCountryList(prefix, '');
    const search = document.getElementById(prefix + '-search');
    if (search) { search.value = ''; setTimeout(() => search.focus(), 30); }
  }
}

/** Render the (optionally filtered) country list inside a phone field's dropdown. Matches
 *  on country name, dial code, or ISO code. */
function renderPhoneCountryList(prefix, query) {
  const list = document.getElementById(prefix + '-list');
  if (!list) return;
  const q = (query || '').trim().toLowerCase().replace(/^\+/, '');
  const filtered = !q ? COUNTRIES : COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q);
  list.innerHTML = filtered.length ? filtered.map(c => `
    <div class="phone-country-item" onclick="selectPhoneCountry('${prefix}','${c.iso}')">
      <span class="phone-flag">${flagImgHTML(c.iso)}</span><span class="phone-country-name">${esc(c.name)}</span><span class="phone-country-dial">+${c.dial}</span>
    </div>`).join('') : `<div class="phone-country-empty">${esc(t('noMatchesFound'))}</div>`;
}

/** Pick a country for a phone field: updates the flag/code button, the hidden ISO input,
 *  closes the dropdown, and hands focus back to the number field. */
function selectPhoneCountry(prefix, iso) {
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return;
  const btn = document.querySelector(`#${prefix}-dd .phone-code-btn`);
  if (btn) btn.innerHTML = `<span class="phone-flag">${flagImgHTML(country.iso)}</span><span class="phone-dial">+${country.dial}</span><span class="phone-caret">▾</span>`;
  const isoInput = document.getElementById(prefix + '-iso');
  if (isoInput) isoInput.value = country.iso;
  document.getElementById(prefix + '-dd')?.classList.remove('open');
  document.getElementById(prefix + '-num')?.focus();
}

/** Combine a phone field's picked country + typed digits back into the stored string
 *  format ("+<dial> <national>"). Returns '' if the number field is empty/absent. */
function getPhoneFieldValue(prefix) {
  const iso = document.getElementById(prefix + '-iso')?.value || 'LB';
  const country = COUNTRIES.find(c => c.iso === iso) || COUNTRIES[0];
  const national = (document.getElementById(prefix + '-num')?.value || '').trim();
  return national ? `+${country.dial} ${national}` : '';
}

/** Clear a phone field's typed digits, keeping whichever country is currently selected —
 *  handy for rapid repeat entry of numbers from the same country (Quick Add Order bar). */
function clearPhoneField(prefix) {
  const num = document.getElementById(prefix + '-num');
  if (num) num.value = '';
}

/** Read-only display helper: prefix an already-stored phone string with its country's flag
 *  (e.g. "🇱🇧 +961 71234567"), for tables, detail panels, and mobile cards. Returns '—' for
 *  an empty value, matching how phone numbers already render elsewhere in the app.
 *  Plain text (emoji flag) — kept for any non-HTML use; UI call sites should use
 *  phoneWithFlagHTML() below instead, which renders a real flag image. */
function formatPhoneWithFlag(raw) {
  if (!raw) return '—';
  const { iso, dial, national } = parsePhoneValue(raw);
  const country = COUNTRIES.find(c => c.iso === iso);
  return `${country ? country.flag + ' ' : ''}+${dial} ${national}`.trim();
}

/** Same as formatPhoneWithFlag(), but returns ready-to-insert HTML with a real flag <img>
 *  (see flagImgHTML in countries.js) instead of relying on emoji font support. The number
 *  portion is escaped internally, so call sites should NOT wrap this in esc(). Returns the
 *  plain '—' placeholder (no markup) for an empty value. */
function phoneWithFlagHTML(raw) {
  if (!raw) return '—';
  const { iso, dial, national } = parsePhoneValue(raw);
  const country = COUNTRIES.find(c => c.iso === iso);
  const flag = country ? flagImgHTML(country.iso, 'flag-icon-inline') + ' ' : '';
  return `${flag}${esc('+' + dial + ' ' + national)}`;
}