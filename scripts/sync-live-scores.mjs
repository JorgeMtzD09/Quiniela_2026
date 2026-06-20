const API_BASE_URL = 'https://v3.football.api-sports.io/fixtures';
const DEFAULT_LEAGUE_ID = '1';
const DEFAULT_SEASON = '2026';
const DEFAULT_TIMEZONE = 'America/Mexico_City';
const MAX_API_CALLS_PER_DAY = 95;
const PRE_MATCH_WINDOW_MS = 30 * 60 * 1000;
const POST_MATCH_WINDOW_MS = 4 * 60 * 60 * 1000;
const MATCH_DATE_TOLERANCE_MS = 12 * 60 * 60 * 1000;

const MATCH_STATUS = {
  PENDING: 'pendiente',
  LIVE: 'jugando',
  HALFTIME: 'medio_tiempo',
  FINAL: 'finalizado',
};

const LIVE_STATUSES = new Set(['1H', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT']);
const HALFTIME_STATUSES = new Set(['HT']);
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const NOT_STARTED_STATUSES = new Set(['TBD', 'NS', 'PST', 'CANC', 'ABD', 'AWD', 'WO']);

const TEAM_ALIASES = {
  mexico: ['mexico', 'mex'],
  sudafrica: ['sudafrica', 'south africa', 'rsa'],
  'corea del sur': ['corea del sur', 'south korea', 'korea republic', 'kor'],
  chequia: ['chequia', 'czechia', 'czech republic', 'cze'],
  canada: ['canada', 'can'],
  'bosnia y herzegovina': ['bosnia y herzegovina', 'bosnia and herzegovina', 'bih'],
  catar: ['catar', 'qatar', 'qat'],
  suiza: ['suiza', 'switzerland', 'sui'],
  brasil: ['brasil', 'brazil', 'bra'],
  marruecos: ['marruecos', 'morocco', 'mar'],
  haiti: ['haiti', 'hai'],
  escocia: ['escocia', 'scotland', 'sco'],
  paraguay: ['paraguay', 'par'],
  'estados unidos': ['estados unidos', 'usa', 'united states', 'united states of america'],
  australia: ['australia', 'aus'],
  turquia: ['turquia', 'turkiye', 'turkey', 'tur'],
  alemania: ['alemania', 'germany', 'ger'],
  curazao: ['curazao', 'curacao', 'cur'],
  'paises bajos': ['paises bajos', 'netherlands', 'holanda', 'ned'],
  japon: ['japon', 'japan', 'jpn'],
  'costa de marfil': ['costa de marfil', 'ivory coast', 'cote divoire', 'cote d ivoire', 'civ'],
  ecuador: ['ecuador', 'ecu'],
  suecia: ['suecia', 'sweden', 'swe'],
  tunez: ['tunez', 'tunisia', 'tun'],
  espana: ['espana', 'spain', 'esp'],
  'cabo verde': ['cabo verde', 'cape verde', 'cpv'],
  belgica: ['belgica', 'belgium', 'bel'],
  egipto: ['egipto', 'egypt', 'egy'],
  iran: ['iran', 'irn'],
  'nueva zelanda': ['nueva zelanda', 'new zealand', 'nzl'],
  'arabia saudita': ['arabia saudita', 'saudi arabia', 'ksa'],
  uruguay: ['uruguay', 'uru'],
  francia: ['francia', 'france', 'fra'],
  senegal: ['senegal', 'sen'],
  irak: ['irak', 'iraq', 'irq'],
  noruega: ['noruega', 'norway', 'nor'],
  argentina: ['argentina', 'arg'],
  argelia: ['argelia', 'algeria', 'alg'],
  austria: ['austria', 'aut'],
  jordania: ['jordania', 'jordan', 'jor'],
  portugal: ['portugal', 'por'],
  'rd congo': ['rd congo', 'dr congo', 'congo dr', 'congo', 'cod'],
  uzbekistan: ['uzbekistan', 'uzb'],
  colombia: ['colombia', 'col'],
  inglaterra: ['inglaterra', 'england', 'eng'],
  croacia: ['croacia', 'croatia', 'cro'],
  ghana: ['ghana', 'gha'],
  panama: ['panama', 'pan'],
};

const ALIAS_LOOKUP = (() => {
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    map.set(normalizeRaw(canonical), canonical);
    aliases.forEach(alias => map.set(normalizeRaw(alias), canonical));
  }
  return map;
})();

function normalizeRaw(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeTeam(value) {
  const raw = normalizeRaw(value);
  if (!raw) return '';
  if (ALIAS_LOOKUP.has(raw)) return ALIAS_LOOKUP.get(raw);
  const compact = raw.replace(/\b(fc|cf|national team)\b/g, '').trim();
  return ALIAS_LOOKUP.get(compact) || compact || raw;
}

export function teamsMatch(a, b) {
  const left = normalizeTeam(a);
  const right = normalizeTeam(b);
  return !!left && !!right && left === right;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isRelevantMatch(match, now = new Date()) {
  const status = match.estado;
  if (status === MATCH_STATUS.LIVE || status === MATCH_STATUS.HALFTIME) return true;
  const start = toDate(match.fecha);
  if (!start) return false;
  const nowMs = now.getTime();
  return nowMs >= start.getTime() - PRE_MATCH_WINDOW_MS
    && nowMs <= start.getTime() + POST_MATCH_WINDOW_MS;
}

export function mapApiStatus(shortStatus) {
  const short = String(shortStatus || '').toUpperCase();
  if (HALFTIME_STATUSES.has(short)) return MATCH_STATUS.HALFTIME;
  if (FINAL_STATUSES.has(short)) return MATCH_STATUS.FINAL;
  if (LIVE_STATUSES.has(short)) return MATCH_STATUS.LIVE;
  if (NOT_STARTED_STATUSES.has(short)) return MATCH_STATUS.PENDING;
  return null;
}

function fixtureDate(fixture) {
  return toDate(fixture?.fixture?.date);
}

function fixtureTeams(fixture) {
  return {
    home: fixture?.teams?.home?.name || '',
    away: fixture?.teams?.away?.name || '',
  };
}

export function findProviderFixture(localMatch, providerFixtures) {
  const providerId = localMatch.apiFootballFixtureId;
  if (providerId != null) {
    const exact = providerFixtures.find(f => String(f?.fixture?.id) === String(providerId));
    if (exact) return exact;
  }

  const localDate = toDate(localMatch.fecha);
  return providerFixtures.find(fixture => {
    const apiDate = fixtureDate(fixture);
    if (localDate && apiDate && Math.abs(localDate.getTime() - apiDate.getTime()) > MATCH_DATE_TOLERANCE_MS) {
      return false;
    }
    const { home, away } = fixtureTeams(fixture);
    const direct = teamsMatch(localMatch.local, home) && teamsMatch(localMatch.visitante, away);
    const swapped = teamsMatch(localMatch.local, away) && teamsMatch(localMatch.visitante, home);
    return direct || swapped;
  }) || null;
}

export function buildMatchUpdate(localMatch, fixture, now = new Date()) {
  const providerStatus = fixture?.fixture?.status?.short || null;
  const mappedStatus = mapApiStatus(providerStatus);
  const goalsHome = fixture?.goals?.home;
  const goalsAway = fixture?.goals?.away;
  const { home, away } = fixtureTeams(fixture);
  const isSwapped = teamsMatch(localMatch.local, away) && teamsMatch(localMatch.visitante, home);
  const hasScore = Number.isInteger(goalsHome) && Number.isInteger(goalsAway);
  const elapsed = fixture?.fixture?.status?.elapsed;

  const next = {
    apiFootballFixtureId: fixture?.fixture?.id ?? localMatch.apiFootballFixtureId ?? null,
    providerStatus,
    lastLiveSync: now,
  };

  if (Number.isInteger(elapsed)) next.minuto = elapsed;
  else if (mappedStatus === MATCH_STATUS.PENDING || mappedStatus === MATCH_STATUS.FINAL) next.minuto = null;

  if (hasScore) {
    next.golesLocal = Number(isSwapped ? goalsAway : goalsHome);
    next.golesVisitante = Number(isSwapped ? goalsHome : goalsAway);
  }

  if (mappedStatus && mappedStatus !== MATCH_STATUS.PENDING) {
    next.estado = mappedStatus;
    next.faseEnVivo = mappedStatus === MATCH_STATUS.HALFTIME ? 'medio_tiempo' : null;
  } else if (mappedStatus === MATCH_STATUS.PENDING && localMatch.estado !== MATCH_STATUS.FINAL) {
    next.estado = MATCH_STATUS.PENDING;
    next.faseEnVivo = null;
  }

  return next;
}

function valuesEqual(a, b) {
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  return a === b || (a == null && b == null);
}

export function diffUpdate(localMatch, next) {
  const diff = {};
  for (const [key, value] of Object.entries(next)) {
    if (key === 'lastLiveSync') {
      diff[key] = value;
      continue;
    }
    if (!valuesEqual(localMatch[key], value)) diff[key] = value;
  }
  return diff;
}

function cdmxDateKey(date) {
  return date.toLocaleDateString('en-CA', { timeZone: DEFAULT_TIMEZONE });
}

function datesForMatches(matches) {
  return [...new Set(matches
    .map(match => toDate(match.fecha))
    .filter(Boolean)
    .map(cdmxDateKey))];
}

async function readQuota(db, todayKey) {
  const ref = db.collection('meta').doc('liveSync');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  if (data?.quotaDate !== todayKey) return { ref, callsToday: 0 };
  return { ref, callsToday: Number(data?.apiCallsToday || 0) || 0 };
}

async function fetchFixturesForDate({ apiKey, leagueId, season, date }) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('league', leagueId);
  url.searchParams.set('season', season);
  url.searchParams.set('date', date);
  url.searchParams.set('timezone', DEFAULT_TIMEZONE);

  const res = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (!Array.isArray(body.response)) throw new Error('API-Football response missing response[]');
  return body.response;
}

async function initFirestoreFromEnv() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
  const serviceAccount = JSON.parse(raw);
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  return { db: getFirestore(), FieldValue };
}

async function run() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error('Missing API_FOOTBALL_KEY');

  const leagueId = process.env.API_FOOTBALL_LEAGUE_ID || DEFAULT_LEAGUE_ID;
  const season = process.env.API_FOOTBALL_SEASON || DEFAULT_SEASON;
  const now = new Date();
  const todayKey = cdmxDateKey(now);
  const { db, FieldValue } = await initFirestoreFromEnv();

  const partidosSnap = await db.collection('partidos').orderBy('id').get();
  const matches = partidosSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
  const relevantMatches = matches.filter(match => isRelevantMatch(match, now));

  if (!relevantMatches.length) {
    console.log('No relevant matches near/live/recently ended. Skipping API call.');
    return;
  }

  const targetDates = datesForMatches(relevantMatches);
  const { ref: quotaRef, callsToday } = await readQuota(db, todayKey);
  const remainingCalls = MAX_API_CALLS_PER_DAY - callsToday;
  if (remainingCalls <= 0) {
    console.log(`API quota guard reached (${callsToday}/${MAX_API_CALLS_PER_DAY}). Skipping.`);
    return;
  }

  const datesToFetch = targetDates.slice(0, remainingCalls);
  const providerFixtures = [];
  for (const date of datesToFetch) {
    const fixtures = await fetchFixturesForDate({ apiKey, leagueId, season, date });
    providerFixtures.push(...fixtures);
  }

  await quotaRef.set({
    quotaDate: todayKey,
    apiCallsToday: callsToday + datesToFetch.length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const batch = db.batch();
  let writes = 0;
  for (const match of relevantMatches) {
    const fixture = findProviderFixture(match, providerFixtures);
    if (!fixture) continue;
    const update = diffUpdate(match, buildMatchUpdate(match, fixture, now));
    if (!Object.keys(update).length) continue;
    update.lastLiveSync = FieldValue.serverTimestamp();
    batch.update(db.collection('partidos').doc(match.docId), update);
    writes += 1;
  }

  if (writes) await batch.commit();
  console.log(`Fetched ${datesToFetch.length} date(s), matched ${writes} Firestore match(es).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
