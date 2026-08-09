/* ===================================================
   SONICK DELIVERY SYSTEM — Country Dial Codes
   Backs the phone-field widget (js/phone.js): a flag +
   calling-code picker attached to every phone entry field
   app-wide.

   Flags are never hand-typed emoji — they're generated at
   runtime from the ISO 3166-1 alpha-2 code via the Unicode
   "regional indicator symbol" trick (each A–Z letter maps to
   U+1F1E6..U+1F1FF; two letters combine into the flag glyph
   browsers render). Add a country by ISO code + name + dial
   code only — the flag just works, no emoji to source or
   maintain.
   =================================================== */
function isoToFlagEmoji(iso2) {
  return String.fromCodePoint(
    ...[...String(iso2 || '').toUpperCase()].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)
  );
}

// [iso2, name, dial] — Lebanon first (this app's home market and the default for
// unrecognized/legacy numbers), then the wider Levant/Gulf region, then a broad set
// of major world markets so the picker is useful for international customers too.
const COUNTRY_DIAL_DATA = [
  ['LB', 'Lebanon', '961'],
  ['SY', 'Syria', '963'],
  ['JO', 'Jordan', '962'],
  ['IQ', 'Iraq', '964'],
  ['PS', 'Palestine', '970'],
  ['EG', 'Egypt', '20'],
  ['SA', 'Saudi Arabia', '966'],
  ['AE', 'United Arab Emirates', '971'],
  ['QA', 'Qatar', '974'],
  ['KW', 'Kuwait', '965'],
  ['BH', 'Bahrain', '973'],
  ['OM', 'Oman', '968'],
  ['YE', 'Yemen', '967'],
  ['TR', 'Turkey', '90'],
  ['CY', 'Cyprus', '357'],
  ['GR', 'Greece', '30'],
  ['IR', 'Iran', '98'],
  ['DZ', 'Algeria', '213'],
  ['MA', 'Morocco', '212'],
  ['TN', 'Tunisia', '216'],
  ['LY', 'Libya', '218'],
  ['SD', 'Sudan', '249'],
  ['US', 'United States', '1'],
  ['CA', 'Canada', '1'],
  ['GB', 'United Kingdom', '44'],
  ['FR', 'France', '33'],
  ['DE', 'Germany', '49'],
  ['IT', 'Italy', '39'],
  ['ES', 'Spain', '34'],
  ['PT', 'Portugal', '351'],
  ['NL', 'Netherlands', '31'],
  ['BE', 'Belgium', '32'],
  ['CH', 'Switzerland', '41'],
  ['AT', 'Austria', '43'],
  ['SE', 'Sweden', '46'],
  ['NO', 'Norway', '47'],
  ['DK', 'Denmark', '45'],
  ['FI', 'Finland', '358'],
  ['IE', 'Ireland', '353'],
  ['PL', 'Poland', '48'],
  ['RO', 'Romania', '40'],
  ['RU', 'Russia', '7'],
  ['UA', 'Ukraine', '380'],
  ['BR', 'Brazil', '55'],
  ['MX', 'Mexico', '52'],
  ['AR', 'Argentina', '54'],
  ['AU', 'Australia', '61'],
  ['NZ', 'New Zealand', '64'],
  ['IN', 'India', '91'],
  ['PK', 'Pakistan', '92'],
  ['BD', 'Bangladesh', '880'],
  ['CN', 'China', '86'],
  ['JP', 'Japan', '81'],
  ['KR', 'South Korea', '82'],
  ['SG', 'Singapore', '65'],
  ['MY', 'Malaysia', '60'],
  ['ID', 'Indonesia', '62'],
  ['PH', 'Philippines', '63'],
  ['TH', 'Thailand', '66'],
  ['VN', 'Vietnam', '84'],
  ['ZA', 'South Africa', '27'],
  ['NG', 'Nigeria', '234'],
  ['KE', 'Kenya', '254'],
  ['ET', 'Ethiopia', '251'],
  ['GH', 'Ghana', '233'],
  ['SN', 'Senegal', '221'],
  ['CM', 'Cameroon', '237'],
  ['AM', 'Armenia', '374'],
  ['GE', 'Georgia', '995'],
  ['AZ', 'Azerbaijan', '994'],
];

const COUNTRIES = COUNTRY_DIAL_DATA.map(([iso, name, dial]) => ({
  iso, name, dial, flag: isoToFlagEmoji(iso),
}));
