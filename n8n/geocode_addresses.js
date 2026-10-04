// n8n Code node "Geocode addresses" (mode: Run Once for All Items).
// After editing, run `python3 n8n/build_workflow.py` to update the workflow file.
//
// Turns each woman's free-text address into a map area (her town, county or state).
// Only the address text is sent to the geocoders; no name, ID or health data. Results
// are kept in the workflow's static data, keyed by a hash of the address and holding
// only place names and coordinates rounded to about 1 km, so each address is looked
// up once. Static data is saved only when the workflow runs from its live webhook,
// not from a manual test run.

// ---- Settings ----
const COUNTRY_CODES = ''; // limit matches to these ISO country codes, e.g. 'sn' or 'sn,gm'
const AREA_LEVEL = 'town'; // group women by 'town', 'county' or 'state'
const CONTACT_EMAIL = ''; // OpenStreetMap's usage policy asks for a contact address
const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search'; // or your own Nominatim server
// Second geocoder, tried when the first is unavailable or finds nothing. '' turns it off.
const FALLBACK_GEOCODER_URL = 'https://photon.komoot.io/api/';
const MAX_LOOKUPS_PER_REQUEST = 10; // new addresses per page load, at about one per second
const RETRY_NOT_FOUND_AFTER_DAYS = 1;

// Places set by hand, by address (capitals, accents and punctuation don't matter).
// These are never sent to a geocoder. Use them for the sample towns, or to correct an
// address the geocoders put in the wrong place.
const KNOWN_PLACES = {
  'Dakar, Sénégal': { town: 'Dakar', county: 'Département de Dakar', state: 'Région de Dakar', country: 'Sénégal', country_code: 'sn', lat: 14.69, lon: -17.44 },
  'Tambacounda, Sénégal': { town: 'Tambacounda', county: 'Département de Tambacounda', state: 'Région de Tambacounda', country: 'Sénégal', country_code: 'sn', lat: 13.77, lon: -13.67 },
  'Kédougou, Sénégal': { town: 'Kédougou', county: 'Département de Kédougou', state: 'Région de Kédougou', country: 'Sénégal', country_code: 'sn', lat: 12.56, lon: -12.17 },
  'Ziguinchor, Sénégal': { town: 'Ziguinchor', county: 'Département de Ziguinchor', state: 'Région de Ziguinchor', country: 'Sénégal', country_code: 'sn', lat: 12.58, lon: -16.27 },
};

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

// Text saved with the wrong character set ("SÃ©nÃ©gal") is read as what was meant ("Sénégal").
function repairText(s) {
  if (!/[ÃÂ][\u0080-¿]/.test(s)) return s;
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

const cleanAddress = (s) => repairText(String(s)).normalize('NFC').replace(/\s+/g, ' ').trim();
const normalize = (s) => s.toLowerCase();
const looseKey = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const knownPlaces = new Map(Object.entries(KNOWN_PLACES).map(([address, place]) => [looseKey(address), place]));
const countryCodes = COUNTRY_CODES.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);

const helpers = this.helpers;
const getJson = (url, qs) =>
  helpers.httpRequest({
    method: 'GET',
    url,
    qs,
    headers: { 'User-Agent': `MaternalHealthAtlas/1.0 (${CONTACT_EMAIL || 'contact not set'})`, Accept: 'application/json' },
    json: true,
    timeout: 10000,
  });

// Each geocoder returns a place, or null when it has no match.
async function fromNominatim(address) {
  const qs = { q: address, format: 'jsonv2', addressdetails: 1, limit: 1 };
  if (countryCodes.length > 0) qs.countrycodes = countryCodes.join(',');
  if (CONTACT_EMAIL) qs.email = CONTACT_EMAIL;
  const results = await getJson(GEOCODER_URL, qs);
  const match = Array.isArray(results) ? results[0] : undefined;
  if (!match) return null;
  const a = match.address || {};
  return {
    town: a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || a.state || '',
    county: a.county || a.state_district || a.state || '',
    state: a.state || a.region || '',
    country: a.country || '',
    country_code: String(a.country_code || '').toLowerCase(),
    lat: Number(match.lat),
    lon: Number(match.lon),
  };
}

async function fromPhoton(address) {
  const body = await getJson(FALLBACK_GEOCODER_URL, { q: address, limit: countryCodes.length > 0 ? 10 : 1 });
  const features = Array.isArray(body && body.features) ? body.features : [];
  const match = features.find(
    (f) => countryCodes.length === 0 || countryCodes.includes(String((f.properties || {}).countrycode || '').toLowerCase()),
  );
  if (!match) return null;
  const p = match.properties || {};
  const [lon, lat] = (match.geometry && match.geometry.coordinates) || [];
  const settlement = ['city', 'town', 'village', 'hamlet'].includes(p.osm_value);
  return {
    town: (settlement ? p.name : '') || p.city || p.locality || p.district || p.county || p.state || '',
    county: p.county || p.state || '',
    state: p.state || '',
    country: p.country || '',
    country_code: String(p.countrycode || '').toLowerCase(),
    lat: Number(lat),
    lon: Number(lon),
  };
}

const geocoders = [
  { name: 'OpenStreetMap', url: GEOCODER_URL, find: fromNominatim, down: false },
  { name: 'Photon', url: FALLBACK_GEOCODER_URL, find: fromPhoton, down: false },
].filter((g) => g.url);

// Says why a geocoder failed without repeating the request, which holds the address.
function describeError(error) {
  const e = error || {};
  const status = (e.response && e.response.status) || e.httpCode || e.statusCode;
  if (status) return `answered ${status}`;
  return e.code ? `could not be reached (${e.code})` : 'could not be reached';
}

const store = $getWorkflowStaticData('global');
// Lookups saved by an earlier version of this node, which kept failed lookups for a week.
if (store.geocodeCache) delete store.geocodeCache;
const cache = (store.places = store.places || {});

const rows = $input
  .all()
  .map((item) => item.json)
  .filter((r) => r.original_id !== null && r.original_id !== undefined && Number.isInteger(Number(r.original_id)))
  .filter((r) => typeof r.address === 'string' && r.address.trim() !== '')
  .map((r) => ({ original_id: Number(r.original_id), address: cleanAddress(r.address) }));

const placeFor = (address) => knownPlaces.get(looseKey(address)) || cache[hashAddress(normalize(address))];

// 1. Look up addresses not seen before, a few per request.
const problems = new Set();
let lookups = 0;
for (const row of rows) {
  const key = hashAddress(normalize(row.address));
  if (knownPlaces.has(looseKey(row.address))) continue;
  const cached = cache[key];
  const retry = cached && cached.notFound && Date.now() - cached.at > RETRY_NOT_FOUND_AFTER_DAYS * 86400000;
  if (cached && !retry) continue;
  if (geocoders.every((g) => g.down) || lookups >= MAX_LOOKUPS_PER_REQUEST) continue;

  if (lookups > 0) await sleep(1100); // OpenStreetMap allows one request per second
  lookups++;

  let place = null;
  let everyGeocoderAnswered = true;
  for (const geocoder of geocoders) {
    if (geocoder.down) {
      everyGeocoderAnswered = false;
      continue;
    }
    try {
      place = await geocoder.find(row.address);
    } catch (error) {
      // Busy or unreachable: skip it for now and try again on the next page load.
      geocoder.down = true;
      everyGeocoderAnswered = false;
      problems.add(`${geocoder.name} ${describeError(error)}`);
      continue;
    }
    if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) break;
    place = null;
  }

  if (place) {
    cache[key] = { ...place, lat: round(place.lat, 2), lon: round(place.lon, 2), at: Date.now() };
  } else if (everyGeocoderAnswered) {
    cache[key] = { notFound: true, at: Date.now() };
  }
}

// 2. Group women into areas. Places with the same name in the same country count as one
//    area when they are close together, whichever geocoder found them.
const MERGE_WITHIN_KM = { town: 50, county: 150 }[AREA_LEVEL] || Infinity;
const distanceKm = (lat1, lon1, lat2, lon2) =>
  111 * Math.hypot(lat2 - lat1, (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180));

const areas = [];
const patientAreas = [];
let pending = 0;
let notFound = 0;
for (const row of rows) {
  const place = placeFor(row.address);
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
  const countryCode = place.country_code || place.country || '';
  let area = areas.find(
    (a) =>
      a.name.toLowerCase() === name.toLowerCase() &&
      a.countryCode === countryCode &&
      distanceKm(a.latSum / a.n, a.lonSum / a.n, place.lat, place.lon) <= MERGE_WITHIN_KM,
  );
  if (!area) {
    area = {
      area_id: areas.length + 1,
      name,
      state: AREA_LEVEL === 'state' ? '' : place.state,
      country: place.country,
      countryCode,
      latSum: 0,
      lonSum: 0,
      n: 0,
    };
    areas.push(area);
  }
  area.latSum += place.lat;
  area.lonSum += place.lon;
  area.n++;
  patientAreas.push({ original_id: row.original_id, area_id: area.area_id });
}

const geocoding = { with_address: rows.length, placed: patientAreas.length, pending, not_found: notFound };
if (problems.size > 0) geocoding.problem = [...problems].join('; ');

return [
  {
    json: {
      patientAreas,
      // Each marker sits at the average of its women's locations, rounded to about 10 km.
      areas: areas.map((a) => ({
        area_id: a.area_id,
        name: a.name,
        state: a.state,
        country: a.country,
        latitude: round(a.latSum / a.n, 1),
        longitude: round(a.lonSum / a.n, 1),
      })),
      geocoding,
    },
  },
];
