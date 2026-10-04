// n8n Code node "Geocode addresses" (mode: Run Once for All Items).
// After editing, run `python3 n8n/build_workflow.py` to update the workflow file.
//
// Turns each woman's free-text address into a map area (her town, county or state).
// Only the address text is sent to the geocoder; no name, ID or health data. Results
// are kept in the workflow's static data, keyed by a hash of the address and holding
// only place names and coordinates rounded to about 1 km, so each address is looked
// up once. Static data is saved only when the workflow runs from its live webhook,
// not from a manual test run.

// ---- Settings ----
const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search'; // or your own Nominatim server
const CONTACT_EMAIL = ''; // OpenStreetMap's usage policy asks for a contact address
const COUNTRY_CODES = ''; // limit matches to these ISO country codes, e.g. 'ma' or 'ma,dz'
const AREA_LEVEL = 'town'; // group women by 'town', 'county' or 'state'
const MAX_LOOKUPS_PER_REQUEST = 15; // new addresses per page load, at one per second
const RETRY_NOT_FOUND_AFTER_DAYS = 7;

// 53-bit string hash (cyrb53), so the cache never stores the address itself.
function hashAddress(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const normalize = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const store = $getWorkflowStaticData('global');
const cache = (store.geocodeCache = store.geocodeCache || {});

const rows = $input
  .all()
  .map((item) => item.json)
  .filter((r) => r.original_id !== null && r.original_id !== undefined && Number.isInteger(Number(r.original_id)))
  .filter((r) => typeof r.address === 'string' && r.address.trim() !== '');

// 1. Look up addresses not seen before, a few per request.
let lookups = 0;
let serviceUnavailable = false;
for (const row of rows) {
  const key = hashAddress(normalize(row.address));
  const cached = cache[key];
  const retry = cached && cached.notFound && Date.now() - cached.at > RETRY_NOT_FOUND_AFTER_DAYS * 86400000;
  if ((cached && !retry) || serviceUnavailable || lookups >= MAX_LOOKUPS_PER_REQUEST) continue;

  if (lookups > 0) await sleep(1100); // OpenStreetMap allows one request per second
  lookups++;

  const qs = { q: row.address.replace(/\s+/g, ' ').trim(), format: 'jsonv2', addressdetails: 1, limit: 1 };
  if (COUNTRY_CODES) qs.countrycodes = COUNTRY_CODES;
  if (CONTACT_EMAIL) qs.email = CONTACT_EMAIL;

  let results;
  try {
    results = await this.helpers.httpRequest({
      method: 'GET',
      url: GEOCODER_URL,
      qs,
      headers: { 'User-Agent': `MaternalHealthAtlas/1.0 (${CONTACT_EMAIL || 'contact not set'})` },
      json: true,
    });
  } catch (error) {
    // Busy or unreachable: stop for now and try the rest on the next page load.
    serviceUnavailable = true;
    continue;
  }

  const match = Array.isArray(results) ? results[0] : undefined;
  if (!match) {
    cache[key] = { notFound: true, at: Date.now() };
    continue;
  }
  const a = match.address || {};
  cache[key] = {
    town: a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || a.state || '',
    county: a.county || a.state_district || a.state || '',
    state: a.state || a.region || '',
    country: a.country || '',
    lat: round(Number(match.lat), 2),
    lon: round(Number(match.lon), 2),
    at: Date.now(),
  };
}

// 2. Group women into areas.
const areasByKey = new Map();
const patientAreas = [];
let pending = 0;
let notFound = 0;
for (const row of rows) {
  const place = cache[hashAddress(normalize(row.address))];
  if (!place) {
    pending++;
    continue;
  }
  if (place.notFound) {
    notFound++;
    continue;
  }
  const level = AREA_LEVEL === 'state' ? place.state : AREA_LEVEL === 'county' ? place.county : place.town;
  const name = level || place.state || place.country || 'Unnamed place';
  const state = AREA_LEVEL === 'state' ? '' : place.state;
  const key = [name, state, place.country].join('|').toLowerCase();
  let area = areasByKey.get(key);
  if (!area) {
    area = { area_id: areasByKey.size + 1, name, state, country: place.country, latSum: 0, lonSum: 0, n: 0 };
    areasByKey.set(key, area);
  }
  area.latSum += place.lat;
  area.lonSum += place.lon;
  area.n++;
  patientAreas.push({ original_id: Number(row.original_id), area_id: area.area_id });
}

return [
  {
    json: {
      patientAreas,
      // Each marker sits at the average of its women's locations, rounded to about 10 km.
      areas: [...areasByKey.values()].map((a) => ({
        area_id: a.area_id,
        name: a.name,
        state: a.state,
        country: a.country,
        latitude: round(a.latSum / a.n, 1),
        longitude: round(a.lonSum / a.n, 1),
      })),
      geocoding: { with_address: rows.length, placed: patientAreas.length, pending, not_found: notFound },
    },
  },
];
