/**
 * Prompt 13 (TAX-01) — the standard, government-defined GST state/UT code
 * table (Schedule III of the CGST Rules). This is a FIXED geographic/legal
 * reference list, not configurable business data — the same category as a
 * country-code table, not the kind of "hardcoded tax rate/split" the spec
 * warns against. It exists so a customer's free-text shipping-address state
 * name (see customer-address.model.ts's plain-string `state` field — there's
 * no state dropdown in this codebase) can be normalized into the same
 * 2-digit code format already stored on `warehouse.stateCode` (Prompt 11),
 * making warehouse-vs-customer state comparison possible at all.
 */
export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  orissa: '21', // common alternate spelling
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'daman and diu': '25',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  'andhra pradesh (before division)': '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  pondicherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
  'other territory': '97',
} as const;

/** Common 2-letter abbreviations customers might type instead of the full state name. */
const STATE_ABBREVIATIONS: Record<string, string> = {
  jk: 'jammu and kashmir',
  hp: 'himachal pradesh',
  pb: 'punjab',
  ch: 'chandigarh',
  uk: 'uttarakhand',
  hr: 'haryana',
  dl: 'delhi',
  rj: 'rajasthan',
  up: 'uttar pradesh',
  br: 'bihar',
  sk: 'sikkim',
  ar: 'arunachal pradesh',
  nl: 'nagaland',
  mn: 'manipur',
  mz: 'mizoram',
  tr: 'tripura',
  ml: 'meghalaya',
  as: 'assam',
  wb: 'west bengal',
  jh: 'jharkhand',
  or: 'odisha',
  cg: 'chhattisgarh',
  mp: 'madhya pradesh',
  gj: 'gujarat',
  mh: 'maharashtra',
  ka: 'karnataka',
  ga: 'goa',
  kl: 'kerala',
  tn: 'tamil nadu',
  py: 'puducherry',
  tg: 'telangana',
  ts: 'telangana',
  ap: 'andhra pradesh',
  la: 'ladakh',
};

/**
 * Normalizes a free-text state name (whatever the customer typed into the
 * plain-string address field) into a 2-digit GST state code — case/whitespace
 * insensitive, tries the full name first, then a known abbreviation. Returns
 * `null` (never throws) when nothing matches, so callers can apply a
 * documented, deliberate fallback (see tax-calculation.service.ts) instead of
 * failing invoice generation over a data-quality issue in a customer-entered
 * address.
 */
export function normalizeStateToGstCode(rawState: string | null | undefined): string | null {
  if (!rawState) return null;
  const key = rawState.trim().toLowerCase();
  if (!key) return null;
  if (GST_STATE_CODES[key]) return GST_STATE_CODES[key];
  const expanded = STATE_ABBREVIATIONS[key];
  if (expanded && GST_STATE_CODES[expanded]) return GST_STATE_CODES[expanded];
  return null;
}
