import {
  formatDateCDMX, dayKeyCDMX, formatDayHeaderCDMX, formatDayTabCDMX,
  GROUP_LETTERS, computeGroupStandings, parseApiStandings, mergeStandings,
  displayTeamName, teamFlag, getMatchGroup, teamsMatch,
} from './fixtures-data.js';
import {
  renderPodiumScreen,
  mapAppPodioToLeaderboard,
  disposePodiumScene,
  DEMO_LEADERBOARD,
  DEMO_LEADERBOARD_TIE,
  DEMO_LEADERBOARD_TRIPLE_TIE,
} from './podio.js';

// ============================================================
// CONFIGURACIÓN — Firebase
// ============================================================
export const CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDwEIfkoudtZ6QQge3agKMqs932kg-SHEE',
    authDomain: 'quiniela-2026-110e5.firebaseapp.com',
    projectId: 'quiniela-2026-110e5',
    storageBucket: 'quiniela-2026-110e5.firebasestorage.app',
    messagingSenderId: '940858489606',
    appId: '1:940858489606:web:d7d6c50791c56181457c87',
  },
  liveSync: {
    enabled: true,
    // Directo desde el cliente: esta key queda visible en el navegador.
    apiKey: '8b2d04d17003724255b9c3427467592b',
    leagueId: '1',
    season: '2026',
  },
};

const SESSION_KEY = 'quiniela_session_v1';
const FIREBASE_VERSION = '10.12.0';
const CLOCK_SYNC_URL = 'https://worldtimeapi.org/api/timezone/America/Mexico_City';
const STANDINGS_API_URL = 'https://wcup2026.org/api/data.php?action=standings';
const API_FOOTBALL_FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const STANDINGS_POLL_MS = 60000;
const MATCH_LOCK_INTERVAL_MS = 30000;
const LIVE_MINUTE_TICK_MS = 1000;
const CLIENT_LIVE_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const CLIENT_LIVE_SYNC_KEY = 'quiniela_live_sync_last_v1';
const INTRO_SEEN_KEY = 'quiniela_intro_seen_v3';
const PODIO_MUSIC_SRC = 'assets/podio-song.mp3';
const PODIO_MUSIC_VOLUME = 0.54;
const MATCH_DATE_TOLERANCE_MS = 12 * 60 * 60 * 1000;
// Duración aproximada de un partido (90' + medio tiempo + descuentos + margen) = 2h
const MATCH_DURATION_MS = 120 * 60 * 1000;
const CLIENT_LIVE_SYNC_BEFORE_MS = 30 * 60 * 1000;
const CLIENT_LIVE_SYNC_AFTER_MS = MATCH_DURATION_MS + 30 * 60 * 1000;
const LIVE_SYNC_STALE_MS = 3 * 60 * 1000;

// ============================================================
// Estados de partido y helpers para estado/marcador
// ============================================================
// Modelo de estados de partido:
// - pendiente: el partido no ha iniciado o no se ha capturado marcador
// - jugando: el partido está en vivo y se puede capturar marcador en vivo
// - medio_tiempo: fase de medio tiempo
// - finalizado: el partido terminó, el marcador es definitivo
const MATCH_STATUS = {
  PENDING: 'pendiente',
  LIVE: 'jugando',
  HALFTIME: 'medio_tiempo',
  FINAL: 'finalizado',
};

const MATCH_STATUS_VALUES = Object.values(MATCH_STATUS);

function isValidMatchStatus(status) {
  return MATCH_STATUS_VALUES.includes(status);
}

// Determina si estamos en la ventana de tiempo en la que un partido se considera en vivo.
function matchInLiveWindow(m) {
  if (!m?.fecha) return false;
  const start = m.fecha.getTime();
  const now = nowMs();
  return now >= start && now < start + MATCH_DURATION_MS;
}

/**
 * Normaliza el estado de un partido proveniente de la base de datos.
 * Los documentos antiguos pueden no tener `estado` definido y en su lugar usan
 * `faseEnVivo` (solo 'medio_tiempo') o infieren finalizado a partir de goles.
 */
function normalizeMatchStatus(m) {
  // Si ya tiene un estado válido, úsalo tal cual.
  if (isValidMatchStatus(m?.estado)) return m.estado;
  // Compatibilidad con faseEnVivo: medio tiempo.
  if (m?.faseEnVivo === 'medio_tiempo') return MATCH_STATUS.HALFTIME;
  // Compatibilidad con datos antiguos: si se capturó marcador, se considera finalizado.
  if (m?.golesLocal !== null || m?.golesVisitante !== null) {
    return MATCH_STATUS.FINAL;
  }
  // Si está dentro de la ventana de juego, se considera en vivo.
  if (matchInLiveWindow(m)) return MATCH_STATUS.LIVE;
  // Por defecto, pendiente.
  return MATCH_STATUS.PENDING;
}

// Determina si un partido ya está finalizado.
function matchFinalized(m) {
  return normalizeMatchStatus(m) === MATCH_STATUS.FINAL;
}

// Determina si un partido tiene marcador capturado (sin importar el estado).
function matchHasScore(m) {
  return m?.golesLocal !== null && m?.golesVisitante !== null;
}
// ============================================================
// Firebase
// ============================================================
let db = null;
let auth = null;
let firestoreFns = null;
let authFns = null;
let unsubscribers = [];

function isFirebaseConfigured() {
  return CONFIG.firebase.projectId && CONFIG.firebase.projectId !== 'YOUR_PROJECT_ID';
}

async function initFirebase() {
  const appMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);

  firestoreFns = fsMod;
  authFns = authMod;

  const app = appMod.initializeApp(CONFIG.firebase);
  db = fsMod.getFirestore(app);
  auth = authMod.getAuth(app);

  await authMod.signInAnonymously(auth);
  return true;
}

// ============================================================
// Estado global
// ============================================================
let state = {
  partidos: [],
  participantes: [],
  pronosticos: {},
  pronosticosMeta: {},
  podio: [],
  selectedPerson: null,
  selectedDay: null,
  session: null,
  firebaseReady: false,
  editingMatchId: null,
  pendingSave: null,
  adminEditingId: null,
  adminPendingSave: null,
  sharePreferenceSaving: false,
  clockOffset: 0,
  apiStandings: null,
  apiStandingsAt: null,
  activeView: 'info',
  gruposPollTimer: null,
};

let matchLockTimer = null;
let liveMinuteTimer = null;
let lastRenderedLiveMinuteLabel = '';

// ============================================================
// Intro de carga
// ============================================================
function initIntroVideo() {
  const overlay = document.getElementById('introOverlay');
  const video = document.getElementById('introVideo');
  const startButton = document.getElementById('introStart');
  const shouldPlay = document.documentElement.classList.contains('intro-pending');

  if (!overlay || !video || !shouldPlay) {
    overlay?.remove();
    document.documentElement.classList.remove('intro-pending');
    return;
  }

  let isDone = false;
  let fallbackTimer = null;

  const finishIntro = () => {
    if (isDone) return;
    isDone = true;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    document.body.classList.remove('intro-playing');
    overlay.classList.add('is-fading');
    window.setTimeout(() => {
      document.documentElement.classList.remove('intro-pending');
      overlay.remove();
    }, 850);
  };

  const scheduleFinishFallback = () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    const remainingSeconds = Math.max(0, video.duration - video.currentTime);
    fallbackTimer = window.setTimeout(finishIntro, (remainingSeconds + 1) * 1000);
  };

  document.body.classList.add('intro-playing');
  video.controls = false;
  video.muted = false;
  video.volume = 1;
  video.playsInline = true;

  const rememberIntro = () => {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch (err) {
      console.warn('No se pudo guardar el estado de intro:', err);
    }
  };

  const playWithSound = async () => {
    if (startButton) startButton.hidden = true;
    video.muted = false;
    video.volume = 1;
    try {
      await video.play();
      rememberIntro();
      scheduleFinishFallback();
    } catch (err) {
      console.warn('Intro con audio requiere interacción:', err);
      if (startButton) startButton.hidden = false;
    }
  };

  const handleIntroStart = e => {
    e.preventDefault();
    e.stopPropagation();
    if (!video.paused) return;
    playWithSound();
  };

  overlay.addEventListener('pointerdown', handleIntroStart, { capture: true });
  overlay.addEventListener('click', handleIntroStart, { capture: true });
  startButton?.addEventListener('pointerdown', handleIntroStart);
  startButton?.addEventListener('click', handleIntroStart);

  video.addEventListener('ended', finishIntro, { once: true });
  video.addEventListener('error', finishIntro, { once: true });
  video.addEventListener('loadedmetadata', () => {
    if (!video.paused) scheduleFinishFallback();
  }, { once: true });

  playWithSound();
}

// ============================================================
// Música del Podio
// ============================================================
let podioMusicAudio = null;
let podioMusicFadeFrame = null;
let podioMusicToken = 0;
let podioMusicManuallyPaused = false;

function getPodioMusicAudio() {
  if (podioMusicAudio) return podioMusicAudio;

  podioMusicAudio = new Audio(PODIO_MUSIC_SRC);
  podioMusicAudio.loop = true;
  podioMusicAudio.preload = 'auto';
  podioMusicAudio.volume = 0;
  podioMusicAudio.addEventListener('error', () => {
    console.warn('No se pudo cargar la música del podio.');
  });
  return podioMusicAudio;
}

function setPodioAudioGate(visible) {
  const gate = document.getElementById('podioAudioGate');
  if (!gate) return;
  gate.hidden = !(visible && state.activeView === 'podio');
}

function updatePodioAudioPauseButton() {
  const button = document.getElementById('podioAudioPause');
  if (!button) return;
  button.hidden = state.activeView !== 'podio';
  button.textContent = podioMusicManuallyPaused ? 'Reanudar audio' : 'Pausar audio';
  button.classList.toggle('is-resume', podioMusicManuallyPaused);
}

function fadePodioMusicTo(targetVolume, durationMs = 700, token = podioMusicToken) {
  const audio = podioMusicAudio;
  if (!audio) return;

  if (podioMusicFadeFrame) {
    cancelAnimationFrame(podioMusicFadeFrame);
    podioMusicFadeFrame = null;
  }

  const startVolume = audio.volume;
  const startedAt = performance.now();
  const target = Math.max(0, Math.min(1, targetVolume));

  const tick = now => {
    if (token !== podioMusicToken) return;

    const progress = Math.min(1, (now - startedAt) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    audio.volume = startVolume + (target - startVolume) * eased;

    if (progress < 1) {
      podioMusicFadeFrame = requestAnimationFrame(tick);
      return;
    }

    podioMusicFadeFrame = null;
    audio.volume = target;
    if (target === 0) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch (err) {
        console.warn('No se pudo reiniciar la música del podio:', err);
      }
    }
  };

  podioMusicFadeFrame = requestAnimationFrame(tick);
}

async function startPodioMusic() {
  if (state.activeView !== 'podio') return;
  if (podioMusicManuallyPaused) return;

  const token = ++podioMusicToken;
  const audio = getPodioMusicAudio();
  audio.muted = false;
  if (podioMusicFadeFrame) {
    cancelAnimationFrame(podioMusicFadeFrame);
    podioMusicFadeFrame = null;
  }
  audio.volume = 0;
  try {
    audio.currentTime = 0;
  } catch (err) {
    console.warn('No se pudo reiniciar la música del podio:', err);
  }

  try {
    await audio.play();
    if (token !== podioMusicToken || state.activeView !== 'podio') {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch (err) {
        console.warn('No se pudo reiniciar la música del podio:', err);
      }
      return;
    }
    setPodioAudioGate(false);
    fadePodioMusicTo(PODIO_MUSIC_VOLUME, 900, token);
  } catch (err) {
    if (token === podioMusicToken && state.activeView === 'podio') {
      setPodioAudioGate(true);
    }
  }
}

function stopPodioMusic() {
  setPodioAudioGate(false);
  podioMusicManuallyPaused = false;
  updatePodioAudioPauseButton();
  if (!podioMusicAudio) return;
  const token = ++podioMusicToken;
  fadePodioMusicTo(0, 650, token);
}

function pausePodioMusic() {
  if (state.activeView !== 'podio') return;

  podioMusicManuallyPaused = true;
  updatePodioAudioPauseButton();
  const audio = podioMusicAudio;
  ++podioMusicToken;
  if (podioMusicFadeFrame) {
    cancelAnimationFrame(podioMusicFadeFrame);
    podioMusicFadeFrame = null;
  }
  if (!audio) return;
  audio.pause();
  audio.volume = PODIO_MUSIC_VOLUME;
}

async function resumePodioMusic() {
  if (state.activeView !== 'podio') return;

  podioMusicManuallyPaused = false;
  updatePodioAudioPauseButton();

  const token = ++podioMusicToken;
  const audio = getPodioMusicAudio();
  audio.muted = false;
  if (podioMusicFadeFrame) {
    cancelAnimationFrame(podioMusicFadeFrame);
    podioMusicFadeFrame = null;
  }
  audio.volume = 0;

  try {
    await audio.play();
    if (token !== podioMusicToken || state.activeView !== 'podio') {
      audio.pause();
      return;
    }
    setPodioAudioGate(false);
    fadePodioMusicTo(PODIO_MUSIC_VOLUME, 500, token);
  } catch (err) {
    if (token === podioMusicToken && state.activeView === 'podio') {
      setPodioAudioGate(true);
    }
  }
}

function initPodioMusic() {
  const startButton = document.getElementById('podioAudioStart');
  const pauseButton = document.getElementById('podioAudioPause');
  startButton?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    startPodioMusic();
  });
  pauseButton?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (podioMusicManuallyPaused) {
      resumePodioMusic();
    } else {
      pausePodioMusic();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPodioMusic();
    } else if (state.activeView === 'podio') {
      startPodioMusic();
    }
  });
}

// ============================================================
// Hora de referencia (internet)
// ============================================================
function nowMs() {
  return Date.now() + state.clockOffset;
}

async function syncInternetClock() {
  try {
    const res = await fetch(CLOCK_SYNC_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo obtener la hora');
    const data = await res.json();
    const serverMs = typeof data.unixtime === 'number'
      ? data.unixtime * 1000
      : new Date(data.datetime).getTime();
    state.clockOffset = serverMs - Date.now();
    return true;
  } catch (err) {
    console.warn('Hora de internet no disponible, usando reloj local:', err);
    state.clockOffset = 0;
    return false;
  }
}

function parsePartidoFecha(raw) {
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function matchStarted(m) {
  if (!m?.fecha) return false;
  return nowMs() >= m.fecha.getTime();
}

// Partido en juego: ya inició, sigue dentro de la ventana de 2h y aún sin resultado final
function matchLive(m) {
  // En este modelo, un partido se considera en vivo si su estado es 'jugando' o 'medio_tiempo'.
  const status = normalizeMatchStatus(m);
  return status === MATCH_STATUS.LIVE || status === MATCH_STATUS.HALFTIME;
}

function matchHalftime(m) {
  // Medio tiempo únicamente cuando el estado normalizado coincide.
  return normalizeMatchStatus(m) === MATCH_STATUS.HALFTIME;
}

function formatMatchDate(d) {
  if (!d) return 'Fecha por definir';
  return formatDateCDMX(d);
}

function matchDatetimeHTML(m) {
  const letter = getMatchGroup(m.local, m.visitante);
  const groupHTML = letter
    ? `<span class="match-group-chip">Grupo ${letter}</span>`
    : '';
  const dateHTML = `<span class="match-datetime-text">${formatMatchDate(m.fecha)}</span>`;
  return `<div class="match-datetime">${groupHTML}${dateHTML}</div>`;
}

function estimatedMatchMinute(m) {
  if (!m?.fecha) return null;
  const elapsed = Math.floor((nowMs() - m.fecha.getTime()) / 60000) + 1;
  if (elapsed < 1 || elapsed > 130) return null;
  if (elapsed <= 45) return elapsed;
  if (elapsed <= 60) return 45;
  if (elapsed <= 105) return Math.min(90, elapsed - 15);
  return Math.min(120, elapsed - 15);
}

function estimatedMatchPeriod(m) {
  if (!m?.fecha) return null;
  const elapsed = Math.floor((nowMs() - m.fecha.getTime()) / 60000) + 1;
  if (elapsed < 1 || elapsed > 130) return null;
  if (elapsed <= 60) return '1T';
  return '2T';
}

function providerMatchPeriod(m) {
  const status = String(m?.providerStatus || '').toUpperCase();
  if (status === '1H') return '1T';
  if (status === '2H') return '2T';
  if (status === 'HT') return 'MT';
  if (status === 'ET' || status === 'BT') return 'TE';
  if (status === 'P') return 'Penales';
  return null;
}

function displayLiveMinute(m) {
  const hasFreshOfficialMinute = Number.isInteger(m?.minuto)
    && m?.lastLiveSync instanceof Date
    && nowMs() - m.lastLiveSync.getTime() <= LIVE_SYNC_STALE_MS;
  const official = hasFreshOfficialMinute ? m.minuto : null;
  if (official === null && matchLive(m)) return 'Jugando ahora';
  const minute = official !== null ? official : estimatedMatchMinute(m);
  const period = providerMatchPeriod(m) || estimatedMatchPeriod(m);
  if (!Number.isInteger(minute)) return 'Jugando ahora';
  return period ? `${period} · Min ${minute}` : `Min ${minute}`;
}

function liveMinuteRenderKey() {
  return state.partidos
    .filter(m => matchLive(m))
    .map(m => `${m.id}:${displayLiveMinute(m)}`)
    .join('|');
}

function mapApiMatchStatus(shortStatus) {
  const short = String(shortStatus || '').toUpperCase();
  if (short === 'HT') return MATCH_STATUS.HALFTIME;
  if (short === 'FT' || short === 'AET' || short === 'PEN') return MATCH_STATUS.FINAL;
  if (['1H', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT'].includes(short)) return MATCH_STATUS.LIVE;
  if (['TBD', 'NS', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(short)) return MATCH_STATUS.PENDING;
  return null;
}

function cdmxDateKey(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function matchRelevantForClientSync(m) {
  if (matchFinalized(m) && matchHasScore(m)) return false;
  if (matchLive(m) || matchHalftime(m)) return true;
  if (!m?.fecha) return false;
  const now = nowMs();
  return now >= m.fecha.getTime() - CLIENT_LIVE_SYNC_BEFORE_MS
    && now <= m.fecha.getTime() + CLIENT_LIVE_SYNC_AFTER_MS;
}

function clientSyncDates(matches) {
  return [...new Set(matches
    .filter(matchRelevantForClientSync)
    .map(m => m.fecha)
    .filter(Boolean)
    .map(cdmxDateKey))];
}

function fixtureTeams(fixture) {
  return {
    home: fixture?.teams?.home?.name || '',
    away: fixture?.teams?.away?.name || '',
  };
}

function fixtureDate(fixture) {
  return parsePartidoFecha(fixture?.fixture?.date);
}

function findProviderFixture(localMatch, providerFixtures) {
  if (localMatch.apiFootballFixtureId != null) {
    const exact = providerFixtures.find(f => String(f?.fixture?.id) === String(localMatch.apiFootballFixtureId));
    if (exact) return exact;
  }

  return providerFixtures.find(fixture => {
    const apiDate = fixtureDate(fixture);
    if (localMatch.fecha && apiDate && Math.abs(localMatch.fecha.getTime() - apiDate.getTime()) > MATCH_DATE_TOLERANCE_MS) {
      return false;
    }
    const { home, away } = fixtureTeams(fixture);
    return (teamsMatch(localMatch.local, home) && teamsMatch(localMatch.visitante, away))
      || (teamsMatch(localMatch.local, away) && teamsMatch(localMatch.visitante, home));
  }) || null;
}

async function fetchApiFootballFixturesForDate(date, includeCompetition = true) {
  const cfg = CONFIG.liveSync || {};
  const url = new URL(API_FOOTBALL_FIXTURES_URL);
  if (includeCompetition) {
    url.searchParams.set('league', cfg.leagueId || '1');
    url.searchParams.set('season', cfg.season || '2026');
  }
  url.searchParams.set('date', date);
  url.searchParams.set('timezone', 'America/Mexico_City');

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'x-apisports-key': cfg.apiKey },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const data = await res.json();
  if (data?.errors && Object.keys(data.errors).length) {
    const msg = Object.values(data.errors).join(' ');
    throw new Error(msg || 'API-Football no disponible');
  }
  if (!Array.isArray(data.response)) throw new Error('Respuesta inválida de API-Football');
  return data.response;
}

async function fetchClientLiveFixtures(dates) {
  const fixtures = [];
  const seen = new Set();
  const appendFixtures = items => {
    for (const fixture of items) {
      const id = fixture?.fixture?.id;
      const key = id == null ? JSON.stringify(fixtureTeams(fixture)) + fixture?.fixture?.date : String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      fixtures.push(fixture);
    }
  };

  for (const date of dates) {
    let scoped = [];
    try {
      scoped = await fetchApiFootballFixturesForDate(date, true);
      appendFixtures(scoped);
    } catch (err) {
      console.warn(`No se pudo leer API-Football filtrado para ${date}:`, err);
    }

    if (!scoped.length) {
      try {
        const fullDay = await fetchApiFootballFixturesForDate(date, false);
        appendFixtures(fullDay);
      } catch (err) {
        if (!fixtures.length) throw err;
        console.warn(`No se pudo leer API-Football completo para ${date}:`, err);
      }
    }
  }

  return fixtures;
}

function parseProviderNumber(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

function buildClientMatchUpdate(localMatch, fixture) {
  const providerStatus = fixture?.fixture?.status?.short || null;
  const mappedStatus = mapApiMatchStatus(providerStatus);
  const goalsHome = parseProviderNumber(fixture?.goals?.home);
  const goalsAway = parseProviderNumber(fixture?.goals?.away);
  const { home, away } = fixtureTeams(fixture);
  const isSwapped = teamsMatch(localMatch.local, away) && teamsMatch(localMatch.visitante, home);
  const hasScore = goalsHome !== null && goalsAway !== null;
  const shouldPersistScore = hasScore
    && (mappedStatus === MATCH_STATUS.FINAL
      || mappedStatus === MATCH_STATUS.LIVE
      || mappedStatus === MATCH_STATUS.HALFTIME);
  const elapsed = parseProviderNumber(fixture?.fixture?.status?.elapsed);

  const update = {
    apiFootballFixtureId: fixture?.fixture?.id ?? localMatch.apiFootballFixtureId ?? null,
    providerStatus,
    lastLiveSync: new Date(),
  };

  if (elapsed !== null) update.minuto = elapsed;
  else if (mappedStatus === MATCH_STATUS.PENDING || mappedStatus === MATCH_STATUS.FINAL) update.minuto = null;

  if (shouldPersistScore) {
    update.golesLocal = Number(isSwapped ? goalsAway : goalsHome);
    update.golesVisitante = Number(isSwapped ? goalsHome : goalsAway);
  }

  if (mappedStatus && mappedStatus !== MATCH_STATUS.PENDING) {
    update.estado = mappedStatus;
    update.faseEnVivo = mappedStatus === MATCH_STATUS.HALFTIME ? 'medio_tiempo' : null;
  } else if (mappedStatus === MATCH_STATUS.PENDING && localMatch.estado !== MATCH_STATUS.FINAL) {
    update.estado = MATCH_STATUS.PENDING;
    update.faseEnVivo = null;
  }

  return update;
}

function clientUpdateDiff(localMatch, update) {
  const diff = {};
  for (const [key, value] of Object.entries(update)) {
    const current = localMatch[key];
    if (current instanceof Date && value instanceof Date && current.getTime() === value.getTime()) continue;
    if (current === value || (current == null && value == null)) continue;
    diff[key] = value;
  }
  return diff;
}

async function syncLiveScoresFromClient({ force = false, silent = false } = {}) {
  const cfg = CONFIG.liveSync || {};
  if (!cfg.enabled || !cfg.apiKey || !db || !firestoreFns || !state.partidos.length) return false;

  const now = Date.now();
  const last = Number(localStorage.getItem(CLIENT_LIVE_SYNC_KEY) || 0);
  if (!force && now - last < CLIENT_LIVE_SYNC_COOLDOWN_MS) return false;

  const relevantMatches = state.partidos.filter(matchRelevantForClientSync);
  const dates = clientSyncDates(relevantMatches);
  if (!dates.length) return false;

  const providerFixtures = await fetchClientLiveFixtures(dates);
  localStorage.setItem(CLIENT_LIVE_SYNC_KEY, String(now));
  const { doc, updateDoc, serverTimestamp } = firestoreFns;

  let writes = 0;
  let failures = 0;
  for (const match of relevantMatches) {
    const fixture = findProviderFixture(match, providerFixtures);
    if (!fixture) continue;
    const update = clientUpdateDiff(match, buildClientMatchUpdate(match, fixture));
    if (!Object.keys(update).length) continue;
    update.lastLiveSync = serverTimestamp();
    try {
      await updateDoc(doc(db, 'partidos', match.docId), update);
      writes += 1;
    } catch (err) {
      failures += 1;
      console.warn(`No se pudo actualizar el partido ${match.id}:`, err);
    }
  }

  if (writes && !silent) showToast(`Resultados actualizados (${writes})`, false);
  return true;
}

function handleClientLiveSyncError(err) {
  console.warn('No se pudo actualizar marcador en cliente:', err);
  const msg = String(err?.message || '');
  if (/request limit|requests/i.test(msg)) {
    setStatus('API de marcadores sin cuota por hoy', 'error');
  }
}

function startLiveMinuteTimer() {
  if (liveMinuteTimer) return;
  liveMinuteTimer = setInterval(() => {
    const quinielaActive = document.getElementById('viewQuiniela')?.classList.contains('active');
    const adminActive = document.getElementById('viewAdmin')?.classList.contains('active');
    const hasLive = state.partidos.some(m => matchLive(m));
    const hasRelevant = state.partidos.some(matchRelevantForClientSync);
    if (hasRelevant && !adminActive) {
      syncLiveScoresFromClient({ silent: true }).catch(handleClientLiveSyncError);
    }
    if (!hasLive) return;
    const nextKey = liveMinuteRenderKey();
    if (nextKey === lastRenderedLiveMinuteLabel) return;
    lastRenderedLiveMinuteLabel = nextKey;
    if (quinielaActive && state.editingMatchId === null) renderPersonDetail();
    if (adminActive && state.adminEditingId === null) renderAdmin();
  }, LIVE_MINUTE_TICK_MS);
}

function stopLiveMinuteTimer() {
  if (!liveMinuteTimer) return;
  clearInterval(liveMinuteTimer);
  liveMinuteTimer = null;
}

function startMatchLockTimer() {
  if (matchLockTimer) return;
  matchLockTimer = setInterval(() => {
    if (!state.session) return;
    const quinielaActive = document.getElementById('viewQuiniela')?.classList.contains('active');
    if (!quinielaActive || state.editingMatchId !== null) return;
    renderPersonDetail();
  }, MATCH_LOCK_INTERVAL_MS);
}

function stopMatchLockTimer() {
  if (!matchLockTimer) return;
  clearInterval(matchLockTimer);
  matchLockTimer = null;
}

// ============================================================
// Sesión (localStorage)
// ============================================================
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  state.session = session;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  state.session = null;
}

function displayName() {
  if (!state.session) return '';
  if (state.session.admin) return state.session.nombreVisible || 'Admin';
  const p = state.participantes.find(x => x.clave === state.session.clave);
  return p ? p.nombreVisible : (state.session.nombreVisible || state.session.clave);
}

function isAdminSession() {
  return !!(state.session && state.session.admin);
}

// ============================================================
// Login / Logout
// ============================================================
async function login(usuario, password) {
  if (!db) throw new Error('Sin conexión con el servidor');

  const u = usuario.trim().toLowerCase();
  if (!u) throw new Error('Escribe tu usuario');

  const { doc, getDoc } = firestoreFns;
  const snap = await getDoc(doc(db, 'usuarios', u));
  if (!snap.exists()) throw new Error('Usuario no encontrado');

  const data = snap.data();
  if (data.password !== password) throw new Error('Clave incorrecta');

  if (data.admin === true) {
    saveSession({ usuario: u, admin: true, nombreVisible: data.clave || 'Admin' });
    return state.session;
  }

  saveSession({ usuario: u, clave: data.clave, nombreVisible: data.clave });
  return state.session;
}

function logout() {
  teardownListeners();
  stopMatchLockTimer();
  stopLiveMinuteTimer();
  stopGruposPolling();
  clearSession();
  state.selectedPerson = null;
  state.editingMatchId = null;
  state.pendingSave = null;
  state.sharePreferenceSaving = false;
  state.partidos = [];
  state.participantes = [];
  state.pronosticos = {};
  state.pronosticosMeta = {};
  state.podio = [];
  disposePodiumScene();
  state.apiStandings = null;
  state.apiStandingsAt = null;
  closeModal();
  document.body.classList.remove('admin-mode', 'podio-mode');
  updateHeaderSession();
  applyAuthGate();
}

// ============================================================
// Transformar datos Firestore → formato app
// ============================================================
function pronosticosFromFirestore(docs, partidos) {
  const pronosticos = {};
  const meta = {};

  for (const p of state.participantes) {
    pronosticos[p.clave] = partidos.map(m => ({ id: m.id, golesLocal: null, golesVisitante: null }));
    meta[p.clave] = { items: {}, compartirPronosticos: true };
  }

  docs.forEach(d => {
    const data = d.data();
    const clave = d.id;
    if (!pronosticos[clave]) return;

    const items = data.items || {};
    meta[clave] = {
      items,
      actualizado: data.actualizado || null,
      compartirPronosticos: data.compartirPronosticos !== false,
    };

    pronosticos[clave] = partidos.map(m => {
      const item = items[String(m.id)];
      return {
        id: m.id,
        golesLocal: item && item.l != null ? Number(item.l) : null,
        golesVisitante: item && item.v != null ? Number(item.v) : null,
      };
    });
  });

  return { pronosticos, meta };
}

function ownSharePreference() {
  const clave = state.session?.clave;
  if (!clave) return true;
  return state.pronosticosMeta[clave]?.compartirPronosticos !== false;
}

function renderShareToggle() {
  const wrap = document.getElementById('shareToggleWrap');
  const toggle = document.getElementById('sharePredictionsToggle');
  const text = document.getElementById('shareToggleText');
  if (!wrap || !toggle || !text) return;

  const show = !!state.session && !isAdminSession() && state.activeView === 'quiniela';
  wrap.hidden = !show;
  if (!show) return;

  const enabled = ownSharePreference();
  toggle.checked = enabled;
  toggle.disabled = state.sharePreferenceSaving;
  text.textContent = 'Compartir resultados';
  wrap.classList.toggle('is-saving', state.sharePreferenceSaving);
}

async function saveSharePreference(compartirPronosticos) {
  if (!state.session?.clave) throw new Error('Inicia sesión');
  if (!db) throw new Error('Sin conexión');

  const clave = state.session.clave;
  const meta = state.pronosticosMeta[clave] || { items: {} };
  const { doc, setDoc, serverTimestamp } = firestoreFns;

  await setDoc(doc(db, 'pronosticos', clave), {
    items: meta.items || {},
    compartirPronosticos,
    actualizado: serverTimestamp(),
  }, { merge: true });
}

async function handleShareToggleChange(e) {
  const toggle = e.currentTarget;
  const nextValue = toggle.checked;
  const clave = state.session?.clave;
  const previousValue = ownSharePreference();
  if (clave) {
    state.pronosticosMeta[clave] = {
      ...(state.pronosticosMeta[clave] || { items: {} }),
      compartirPronosticos: nextValue,
    };
  }
  state.sharePreferenceSaving = true;
  renderShareToggle();

  try {
    await saveSharePreference(nextValue);
  } catch (err) {
    console.error(err);
    alert('No se pudo guardar tu preferencia de privacidad.');
    if (clave) {
      state.pronosticosMeta[clave] = {
        ...(state.pronosticosMeta[clave] || { items: {} }),
        compartirPronosticos: previousValue,
      };
    }
    toggle.checked = previousValue;
  } finally {
    state.sharePreferenceSaving = false;
    renderShareToggle();
  }
}

function applyData(partidos, participantes, pronosticos, meta) {
  state.partidos = partidos.sort((a, b) => a.id - b.id);
  state.participantes = participantes;
  state.pronosticos = pronosticos;
  state.pronosticosMeta = meta;
  state.podio = buildPodio(state.partidos, state.participantes, state.pronosticos);

  if (!state.selectedPerson) {
    if (state.session && participantes.some(p => p.clave === state.session.clave)) {
      state.selectedPerson = state.session.clave;
    } else if (state.podio.length) {
      state.selectedPerson = state.podio[0].clave;
    }
  }
}

// ============================================================
// Suscripciones Firestore (tiempo real)
// ============================================================
function teardownListeners() {
  unsubscribers.forEach(fn => fn());
  unsubscribers = [];
}

function subscribeFirestore() {
  if (!db) return;
  teardownListeners();
  const { collection, onSnapshot, query, orderBy } = firestoreFns;

  let partidos = [];
  let participantes = [];
  let pronosticosDocs = [];
  let didInitialClientSync = false;

  const maybeUpdate = () => {
    if (!partidos.length || !participantes.length) return;
    const { pronosticos, meta } = pronosticosFromFirestore(pronosticosDocs, partidos);
    applyData(partidos, participantes, pronosticos, meta);
    renderAll();
    setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
    const force = !didInitialClientSync;
    didInitialClientSync = true;
    syncLiveScoresFromClient({ force, silent: true }).catch(handleClientLiveSyncError);
  };

  unsubscribers.push(
    onSnapshot(query(collection(db, 'partidos'), orderBy('id')), snap => {
      partidos = snap.docs.map(parsePartidoDoc);
      maybeUpdate();
    }, err => { console.error(err); setStatus('Error al leer partidos', 'error'); })
  );

  unsubscribers.push(
    onSnapshot(collection(db, 'participantes'), snap => {
      participantes = snap.docs.map(d => ({
        clave: d.id,
        nombreVisible: d.data().nombreVisible,
        orden: d.data().orden ?? 0,
      })).sort((a, b) => a.orden - b.orden || a.nombreVisible.localeCompare(b.nombreVisible, 'es'));
      maybeUpdate();
    }, err => { console.error(err); setStatus('Error al leer participantes', 'error'); })
  );

  unsubscribers.push(
    onSnapshot(collection(db, 'pronosticos'), snap => {
      pronosticosDocs = snap.docs;
      maybeUpdate();
    }, err => { console.error(err); setStatus('Error al leer pronósticos', 'error'); })
  );
}

function parsePartidoDoc(d) {
  const m = d.data();
  return {
    docId: d.id,
    id: Number(m.id ?? d.id),
    local: m.local,
    visitante: m.visitante,
    golesLocal: m.golesLocal != null && m.golesLocal !== '' ? Number(m.golesLocal) : null,
    golesVisitante: m.golesVisitante != null && m.golesVisitante !== '' ? Number(m.golesVisitante) : null,
    // Estado explícito, solo si es uno de los valores válidos. Para documentos antiguos puede ser null.
    estado: isValidMatchStatus(m.estado) ? m.estado : null,
    faseEnVivo: m.faseEnVivo === 'medio_tiempo' ? 'medio_tiempo' : null,
    fecha: parsePartidoFecha(m.fecha),
    apiFootballFixtureId: m.apiFootballFixtureId ?? null,
    minuto: Number.isInteger(m.minuto) ? m.minuto : null,
    providerStatus: m.providerStatus || null,
    lastLiveSync: parsePartidoFecha(m.lastLiveSync),
  };
}

function subscribeAdmin() {
  if (!db) return;
  teardownListeners();
  const { collection, onSnapshot, query, orderBy } = firestoreFns;

  unsubscribers.push(
    onSnapshot(query(collection(db, 'partidos'), orderBy('id')), snap => {
      state.partidos = snap.docs.map(parsePartidoDoc).sort((a, b) => a.id - b.id);
      if (state.adminEditingId === null) renderAdmin();
      setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
    }, err => {
      console.error(err);
      setStatus('Error al leer partidos', 'error');
    })
  );
}

async function saveMatchResult(docId, gl, gv, estado = null) {
  if (!isAdminSession()) throw new Error('Sin permisos de admin');
  if (!db) throw new Error('Sin conexión');

  const { doc, updateDoc } = firestoreFns;
  const m = state.partidos.find(x => x.docId === docId);

  let nextStatus;
  // Sin marcador -> pendiente siempre
  if (gl === null || gv === null) {
    nextStatus = MATCH_STATUS.PENDING;
  } else if (isValidMatchStatus(estado)) {
    nextStatus = estado;
  } else {
    // Si no se proporciona estado explícito, usa el actual normalizado
    nextStatus = normalizeMatchStatus(m);
  }
  // Si se captura marcador y el estado resultante es pendiente, decide si en vivo o finalizado
  if (gl !== null && gv !== null && nextStatus === MATCH_STATUS.PENDING) {
    nextStatus = matchInLiveWindow(m) ? MATCH_STATUS.LIVE : MATCH_STATUS.FINAL;
  }

  await updateDoc(doc(db, 'partidos', docId), {
    golesLocal: gl,
    golesVisitante: gv,
    estado: nextStatus,
    faseEnVivo: nextStatus === MATCH_STATUS.HALFTIME ? 'medio_tiempo' : null,
  });
}

async function saveMatchLivePhase(docId, faseEnVivo) {
  if (!isAdminSession()) throw new Error('Sin permisos de admin');
  if (!db) throw new Error('Sin conexión');

  const { doc, updateDoc } = firestoreFns;
  await updateDoc(doc(db, 'partidos', docId), {
    faseEnVivo: faseEnVivo === 'medio_tiempo' ? 'medio_tiempo' : null,
  });
}

// Guardar solo el estado del partido sin tocar el marcador
async function saveMatchStatus(docId, estado) {
  if (!isAdminSession()) throw new Error('Sin permisos de admin');
  if (!db) throw new Error('Sin conexión');
  if (!isValidMatchStatus(estado)) throw new Error('Estado inválido');
  const { doc, updateDoc } = firestoreFns;
  await updateDoc(doc(db, 'partidos', docId), {
    estado,
    faseEnVivo: estado === MATCH_STATUS.HALFTIME ? 'medio_tiempo' : null,
  });
}

function buildAdminMatchCard(m) {
  const status = normalizeMatchStatus(m);
  const isPlayed = status === MATCH_STATUS.FINAL;
  const isLive = status === MATCH_STATUS.LIVE || status === MATCH_STATUS.HALFTIME;
  const isHalftime = status === MATCH_STATUS.HALFTIME;
  const hasScore = matchHasScore(m);
  const glVal = m.golesLocal != null ? m.golesLocal : '';
  const gvVal = m.golesVisitante != null ? m.golesVisitante : '';
  const teams = `<div class="match-teams">${teamBlock(m.local, 'home')}<span class="match-vs">vs</span>${teamBlock(m.visitante, 'away')}</div>`;
  const statusHTML = isPlayed && hasScore
    ? `<span class="match-points pts-saved">Finalizado: ${m.golesLocal} - ${m.golesVisitante}</span>`
    : isHalftime
      ? `<span class="match-points pts-halftime">Medio tiempo</span>`
        : status === MATCH_STATUS.LIVE
          ? `<span class="match-points pts-live"><span class="live-ball">⚽</span> ${displayLiveMinute(m)}</span>`
          : `<span class="match-points pts-pending">Sin resultado</span>`;
  // Mostrar siempre los controles de estado para el admin
  const livePhaseHTML = `
      <div class="admin-live-phase" role="group" aria-label="Estado del partido">
        <button type="button" class="admin-phase-opt${status === MATCH_STATUS.PENDING ? ' active' : ''}" data-status="pendiente">Pendiente</button>
        <button type="button" class="admin-phase-opt${status === MATCH_STATUS.LIVE ? ' active' : ''}" data-status="jugando">Jugando ahora</button>
        <button type="button" class="admin-phase-opt${status === MATCH_STATUS.HALFTIME ? ' active' : ''}" data-status="medio_tiempo">Medio tiempo</button>
        <button type="button" class="admin-phase-opt${status === MATCH_STATUS.FINAL ? ' active' : ''}" data-status="finalizado">Finalizado</button>
      </div>`;

  return `
    <div class="match-card form-card editable-admin-card ${isPlayed ? 'admin-played' : 'admin-pending'}" data-doc-id="${m.docId}">
      ${matchDatetimeHTML(m)}
      ${teams}
      <div class="form-score-row">
        <div class="form-score-field">
          <input class="form-score-input admin-score-input" type="number" min="0" max="20" step="1"
                 name="admin_l_${m.docId}" inputmode="numeric" placeholder="-" value="${glVal}">
        </div>
        <span class="form-score-sep">—</span>
        <div class="form-score-field">
          <input class="form-score-input admin-score-input" type="number" min="0" max="20" step="1"
                 name="admin_v_${m.docId}" inputmode="numeric" placeholder="-" value="${gvVal}">
        </div>
      </div>
      ${livePhaseHTML}
      <div class="admin-footer">
        ${statusHTML}
        ${isPlayed ? '<button type="button" class="btn-reset-admin" title="Dejar el partido sin resultado">Restaurar</button>' : ''}
      </div>
      <div class="edit-actions" hidden>
        <button type="button" class="btn-secondary btn-cancel-admin">Cancelar</button>
        <button type="button" class="btn-primary btn-save-admin">Guardar</button>
      </div>
    </div>`;
}

function renderAdminMatchesByDay(partidos) {
  const groups = [];
  const indexByKey = new Map();
  const SIN_FECHA = '__sin_fecha__';

  for (const m of partidos) {
    const key = m.fecha ? dayKeyCDMX(m.fecha) : SIN_FECHA;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        label: m.fecha ? formatDayHeaderCDMX(m.fecha) : 'Fecha por definir',
        matches: [],
      });
    }
    groups[indexByKey.get(key)].matches.push(m);
  }

  return groups.map(g => `
    <div class="day-group">
      <h3 class="day-header">${g.label}</h3>
      <div class="day-matches">
        ${g.matches.map(m => buildAdminMatchCard(m)).join('')}
      </div>
    </div>`).join('');
}

function validateScoreInputs(lRaw, vRaw) {
  if (lRaw === '' || vRaw === '') {
    return { error: 'Escribe ambos marcadores antes de guardar.' };
  }
  const gl = Number(lRaw);
  const gv = Number(vRaw);
  if (!Number.isInteger(gl) || !Number.isInteger(gv) || gl < 0 || gv < 0 || gl > 20 || gv > 20) {
    return { error: 'Los goles deben ser números enteros entre 0 y 20.' };
  }
  return { gl, gv };
}

function attachAdminListeners() {
  document.querySelectorAll('.editable-admin-card').forEach(card => {
    const docId = card.dataset.docId;
    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('focus', () => enterAdminEditMode(docId));
    });
    const cancel = card.querySelector('.btn-cancel-admin');
    const save = card.querySelector('.btn-save-admin');
    const reset = card.querySelector('.btn-reset-admin');
    if (cancel) cancel.addEventListener('click', () => exitAdminEditMode(true));
    if (save) save.addEventListener('click', () => openAdminConfirm(docId));
    if (reset) reset.addEventListener('click', () => openAdminResetConfirm(docId));
    card.querySelectorAll('.admin-phase-opt').forEach(btn => {
      btn.addEventListener('click', () => setAdminMatchStatus(docId, btn.dataset.status));
    });
  });
}

async function setAdminMatchStatus(docId, status) {
  const m = state.partidos.find(x => x.docId === docId);
  // validar partido y estado
  if (!m || !isValidMatchStatus(status)) return;
  const currentStatus = normalizeMatchStatus(m);
  if (currentStatus === status) return;
  // No se puede finalizar sin marcador
  if (status === MATCH_STATUS.FINAL && !matchHasScore(m)) {
    showToast('Primero captura el resultado para finalizar el partido.', true);
    return;
  }
  // No se puede volver a pendiente si ya existe marcador; usar Restaurar
  if (status === MATCH_STATUS.PENDING && matchHasScore(m)) {
    showToast('Para dejarlo pendiente usa Restaurar.', true);
    return;
  }
  const card = document.querySelector(`.editable-admin-card[data-doc-id="${docId}"]`);
  card?.querySelectorAll('.admin-phase-opt').forEach(b => { b.disabled = true; });
  try {
    await saveMatchStatus(docId, status);
    // Actualizar estado local para re-render sin esperar a snapshot
    m.estado = status;
    m.faseEnVivo = status === MATCH_STATUS.HALFTIME ? 'medio_tiempo' : null;
    renderAdmin();
    const label = {
      pendiente: 'Pendiente',
      jugando: 'Jugando ahora',
      medio_tiempo: 'Medio tiempo',
      finalizado: 'Finalizado',
    }[status];
    showToast(label, false);
  } catch (err) {
    showToast(err.message || 'No se pudo cambiar el estado', true);
    renderAdmin();
  } finally {
    card?.querySelectorAll('.admin-phase-opt').forEach(b => { b.disabled = false; });
  }
}

function enterAdminEditMode(docId) {
  if (state.adminEditingId === docId) return;
  if (state.adminEditingId !== null) return;
  state.adminEditingId = docId;
  document.querySelectorAll('.editable-admin-card').forEach(card => {
    const actions = card.querySelector('.edit-actions');
    if (card.dataset.docId === docId) {
      card.classList.add('editing');
      if (actions) actions.hidden = false;
    } else {
      card.classList.add('locked');
      card.querySelectorAll('input').forEach(i => { i.disabled = true; });
    }
  });
}

function exitAdminEditMode(restore) {
  const docId = state.adminEditingId;
  state.adminEditingId = null;
  document.querySelectorAll('.editable-admin-card').forEach(card => {
    card.classList.remove('locked', 'editing');
    card.querySelectorAll('input').forEach(i => { i.disabled = false; });
    const actions = card.querySelector('.edit-actions');
    if (actions) actions.hidden = true;
  });
  if (restore && docId != null) {
    const m = state.partidos.find(x => x.docId === docId);
    const card = document.querySelector(`.editable-admin-card[data-doc-id="${docId}"]`);
    if (card && m) {
      const lInp = card.querySelector(`input[name="admin_l_${docId}"]`);
      const vInp = card.querySelector(`input[name="admin_v_${docId}"]`);
      if (lInp) lInp.value = m.golesLocal != null ? m.golesLocal : '';
      if (vInp) vInp.value = m.golesVisitante != null ? m.golesVisitante : '';
    }
  }
}

function openAdminConfirm(docId) {
  const card = document.querySelector(`.editable-admin-card[data-doc-id="${docId}"]`);
  if (!card) return;
  const lRaw = card.querySelector(`input[name="admin_l_${docId}"]`).value;
  const vRaw = card.querySelector(`input[name="admin_v_${docId}"]`).value;

  const validated = validateScoreInputs(lRaw, vRaw);
  if (validated.error) { alert(validated.error); return; }

  const m = state.partidos.find(x => x.docId === docId);
  // Determinar el estado que se intenta guardar desde los botones activos. Si no hay, usa estado actual.
  let estado = card.querySelector('.admin-phase-opt.active')?.dataset.status;
  if (!isValidMatchStatus(estado)) {
    estado = normalizeMatchStatus(m);
  }
  state.adminPendingSave = { docId, gl: validated.gl, gv: validated.gv, estado };
  const titleEl = document.querySelector('#confirmModal .modal-title');
  const warnEl = document.querySelector('#confirmModal .modal-warn');
  if (titleEl) titleEl.textContent = 'Confirmar resultado';
  if (warnEl) warnEl.textContent = 'Puedes corregir el resultado las veces que necesites.';
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-match">
      <span class="modal-team">${m.local}</span>
      <span class="modal-score">${validated.gl} - ${validated.gv}</span>
      <span class="modal-team">${m.visitante}</span>
    </div>`;
  document.getElementById('confirmModal').hidden = false;
}

function openAdminResetConfirm(docId) {
  const m = state.partidos.find(x => x.docId === docId);
  if (!m) return;
  state.adminPendingSave = {
    docId,
    gl: null,
    gv: null,
    reset: true,
    estado: MATCH_STATUS.PENDING,
  };
  const titleEl = document.querySelector('#confirmModal .modal-title');
  const warnEl = document.querySelector('#confirmModal .modal-warn');
  if (titleEl) titleEl.textContent = 'Restaurar partido';
  if (warnEl) warnEl.textContent = 'El partido quedará sin resultado (–) y dejará de contar en el podio.';
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-match">
      <span class="modal-team">${m.local}</span>
      <span class="modal-score">– - –</span>
      <span class="modal-team">${m.visitante}</span>
    </div>`;
  document.getElementById('confirmModal').hidden = false;
}

async function handleAdminModalConfirm() {
  const pending = state.adminPendingSave;
  if (!pending) return;
  const { docId, gl, gv, reset, estado } = pending;
  const btn = document.getElementById('modalConfirm');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    await saveMatchResult(docId, gl, gv, estado);
    state.adminPendingSave = null;
    state.adminEditingId = null;
    closeModal();
    showToast(reset ? 'Partido restaurado' : 'Resultado guardado', false);
    renderAdmin();
  } catch (err) {
    state.adminPendingSave = null;
    state.adminEditingId = null;
    closeModal();
    showToast(err.message || 'Error al guardar', true);
    renderAdmin();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

let toastTimer = null;
function showToast(message, isError) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('toast-error', !!isError);
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2800);
}

function renderAdmin() {
  const el = document.getElementById('adminContent');
  if (!el) return;
  if (!state.partidos.length) {
    el.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Cargando partidos...</div>';
    return;
  }
  el.innerHTML = renderAdminMatchesByDay(state.partidos);
  attachAdminListeners();
  updateJumpButton();
}

function handleLiveSyncNow() {
  if (!CONFIG.liveSync?.apiKey) {
    showToast('Configura la API key de API-Football en app.js.', true);
    return;
  }
  syncLiveScoresFromClient({ force: true })
    .then(ok => {
      if (!ok) showToast('No hay partidos para actualizar ahora.', false);
    })
    .catch(err => {
      console.error(err);
      showToast('No se pudo actualizar desde API-Football.', true);
    });
}

// ============================================================
// Guardar un pronóstico (por partido)
// ============================================================
async function saveSingleMatch(matchId, gl, gv) {
  if (!state.session) throw new Error('Inicia sesión');
  if (!db) throw new Error('Sin conexión');

  await syncInternetClock();

  const clave = state.session.clave;
  const meta = state.pronosticosMeta[clave] || { items: {} };
  const saved = meta.items || {};

  if (saved[String(matchId)]) throw new Error('Ese pronóstico ya está guardado');

  const m = state.partidos.find(x => x.id === matchId);
  if (!m || matchHasScore(m)) throw new Error('Ese partido ya no se puede pronosticar');
  if (matchStarted(m)) throw new Error('Ya cerró el tiempo para pronosticar este partido');

  const { doc, setDoc, serverTimestamp } = firestoreFns;
  await setDoc(doc(db, 'pronosticos', clave), {
    items: { ...saved, [String(matchId)]: { l: gl, v: gv } },
    actualizado: serverTimestamp(),
  }, { merge: true });
}

// ============================================================
// Scoring
// ============================================================
function getOutcome(golesL, golesV) {
  if (golesL === null || golesV === null) return null;
  if (golesL > golesV) return 'L';
  if (golesL < golesV) return 'V';
  return 'E';
}

function calcPoints(predL, predV, realL, realV) {
  if (realL === null || realV === null) return null;
  if (predL === null || predV === null) return 0;
  let pts = 0;
  if (getOutcome(predL, predV) === getOutcome(realL, realV)) pts += 3;
  if (predL === realL && predV === realV) pts += 1;
  return pts;
}

function buildPodio(partidos, participantes, pronosticos) {
  const scores = participantes.map(p => {
    let total = 0, played = 0, aciertos = 0;
    const preds = pronosticos[p.clave] || [];
    const predMap = {};
    preds.forEach(pr => { predMap[pr.id] = pr; });

    for (const m of partidos) {
      // Solo contar partidos finalizados con marcador definitivo para puntuar
      if (!matchFinalized(m) || !matchHasScore(m)) continue;
      played++;
      const pr = predMap[m.id];
      if (pr) {
        const pts = calcPoints(pr.golesLocal, pr.golesVisitante, m.golesLocal, m.golesVisitante) || 0;
        total += pts;
        if (pts > 0) aciertos++;
      }
    }
    return { clave: p.clave, nombre: p.nombreVisible, puntos: total, jugados: played, aciertos };
  });

  scores.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'));

  let rank = 0, prevPts = null;
  return scores.map(s => {
    if (s.puntos !== prevPts) { rank += 1; prevPts = s.puntos; }
    return { ...s, rank };
  });
}

// ============================================================
// Render helpers
// ============================================================
function splitFlag(str) {
  if (!str) return { flag: '', name: '' };
  const m = str.match(/[A-Za-zÀ-ÿ]/);
  if (!m) return { flag: str, name: '' };
  return { flag: str.slice(0, m.index).trim(), name: str.slice(m.index).trim() };
}

function teamBlock(str, side) {
  const { flag, name } = splitFlag(str);
  return `
    <div class="match-team ${side}">
      <span class="team-flag">${flag}</span>
      <span class="team-name">${name}</span>
    </div>`;
}

let lastPodioSig = '';

function podioSignature() {
  return state.podio.map(p => `${p.clave}:${p.rank}:${p.puntos}`).join('|');
}

function renderPodio(forceAnimate = false) {
  if (state.activeView !== 'podio') return;

  const el = document.getElementById('podioContent');
  if (!el) return;

  const mockPodio = new URLSearchParams(window.location.search).get('podioMock');
  if (mockPodio === 'ties') {
    lastPodioSig = 'mock:ties';
    renderPodiumScreen(el, DEMO_LEADERBOARD_TIE, { animate: forceAnimate });
    return;
  }
  if (mockPodio === 'triple') {
    lastPodioSig = 'mock:triple';
    renderPodiumScreen(el, DEMO_LEADERBOARD_TRIPLE_TIE, { animate: forceAnimate });
    return;
  }
  if (mockPodio === 'field') {
    lastPodioSig = 'mock:field';
    renderPodiumScreen(el, DEMO_LEADERBOARD, { animate: forceAnimate });
    return;
  }

  if (!state.podio.length) {
    lastPodioSig = '';
    renderPodiumScreen(el, [], { animate: false });
    return;
  }

  const sig = podioSignature();
  const animate = forceAnimate || sig !== lastPodioSig;
  lastPodioSig = sig;

  renderPodiumScreen(el, mapAppPodioToLeaderboard(state.podio), { animate });
}

function getMatchDayGroups(partidos) {
  const groups = [];
  const indexByKey = new Map();
  const SIN_FECHA = '__sin_fecha__';

  for (const m of partidos) {
    const key = m.fecha ? dayKeyCDMX(m.fecha) : SIN_FECHA;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        label: m.fecha ? formatDayTabCDMX(m.fecha) : 'Sin fecha',
        matches: [],
      });
    }
    groups[indexByKey.get(key)].matches.push(m);
  }
  return groups;
}

function ensureSelectedDay() {
  const groups = getMatchDayGroups(state.partidos);
  if (!groups.length) return;
  if (state.selectedDay && groups.some(g => g.key === state.selectedDay)) return;

  const currentId = getCurrentMatchId();
  if (currentId != null) {
    const m = state.partidos.find(x => x.id === currentId);
    if (m?.fecha) {
      state.selectedDay = dayKeyCDMX(m.fecha);
      return;
    }
  }
  state.selectedDay = groups[0].key;
}

function renderDayTabs() {
  const el = document.getElementById('dayTabs');
  if (!el) return;
  const groups = getMatchDayGroups(state.partidos);
  if (!groups.length) {
    el.innerHTML = '';
    return;
  }
  ensureSelectedDay();
  el.innerHTML = groups.map(g => `
    <button type="button" class="day-tab ${state.selectedDay === g.key ? 'active' : ''}" data-day="${g.key}">
      ${g.label}
    </button>`).join('');
  el.querySelectorAll('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.day === state.selectedDay) return;
      if (state.editingMatchId !== null) {
        const ok = confirm('Tienes un pronóstico sin guardar. ¿Descartarlo y cambiar de fecha?');
        if (!ok) return;
        state.editingMatchId = null;
      }
      state.selectedDay = btn.dataset.day;
      renderDayTabs();
      renderPersonDetail({ resetScroll: true });
    });
  });
  centerActiveDayTab();
}

function centerActiveDayTab() {
  const container = document.getElementById('dayTabs');
  if (!container) return;
  const active = container.querySelector('.day-tab.active');
  if (!active) return;
  requestAnimationFrame(() => {
    const target = active.offsetLeft - container.clientWidth / 2 + active.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  });
}

function renderPersonTabs() {
  const el = document.getElementById('personTabs');
  const ordered = state.podio.length
    ? state.podio.map(p => ({ clave: p.clave, nombreVisible: p.nombre }))
    : state.participantes;
  el.innerHTML = ordered.map(p => {
    const isMe = state.session && state.session.clave === p.clave;
    return `
    <button class="person-tab ${state.selectedPerson === p.clave ? 'active' : ''}" data-person="${p.clave}">
      ${p.nombreVisible}${isMe ? ' <span class="tab-me">(tú)</span>' : ''}
    </button>`;
  }).join('');
  el.querySelectorAll('.person-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.editingMatchId !== null) {
        const ok = confirm('Tienes un pronóstico sin guardar. ¿Descartarlo y cambiar de persona?');
        if (!ok) return;
        state.editingMatchId = null;
      }
      state.selectedPerson = btn.dataset.person;
      renderPersonTabs();
      renderPersonDetail();
    });
  });
}

function renderPersonDetail({ resetScroll = false } = {}) {
  const scrollY = resetScroll ? null : window.scrollY;
  const person = state.selectedPerson;
  if (!person) return;

  const isOwn = !!(state.session && state.session.clave === person);
  const meta = state.pronosticosMeta[person] || { items: {} };
  const savedItems = meta.items || {};
  const sharesPredictions = meta.compartirPronosticos !== false;
  const preds = state.pronosticos[person] || [];
  const predMap = {};
  preds.forEach(pr => { predMap[pr.id] = pr; });

  const podioEntry = state.podio.find(p => p.clave === person);
  const puntos = podioEntry ? podioEntry.puntos : 0;
  const rank = podioEntry ? podioEntry.rank : '-';
  const aciertos = podioEntry ? podioEntry.aciertos : 0;
  const jugados = podioEntry ? podioEntry.jugados : 0;

  document.getElementById('personSummary').innerHTML = `
    <div class="summary-stat"><span class="summary-value">${puntos}</span><span class="summary-label">Puntos</span></div>
    <div class="summary-stat"><span class="summary-value">${rank}º</span><span class="summary-label">Posición</span></div>
    <div class="summary-stat"><span class="summary-value">${aciertos}<small>/${jugados}</small></span><span class="summary-label">Aciertos</span></div>
  `;

  const playedCountEl = document.getElementById('playedCount');
  if (playedCountEl) {
    const played = state.partidos.filter(m => matchFinalized(m)).length;
    playedCountEl.textContent = `${played}/${state.partidos.length}`;
  }

  const ctx = { isOwn, savedItems, predMap, sharesPredictions };
  ensureSelectedDay();
  const dayMatches = state.selectedDay
    ? state.partidos.filter(m => {
      const key = m.fecha ? dayKeyCDMX(m.fecha) : '__sin_fecha__';
      return key === state.selectedDay;
    })
    : state.partidos;
  document.getElementById('personContent').innerHTML = renderMatchesFlat(dayMatches, ctx);

  attachEditingListeners();
  updateJumpButton();

  if (resetScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  } else if (scrollY !== null) {
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
  }
}

function getJumpTargetMatch() {
  const liveTarget = state.partidos.find(m => !matchFinalized(m) && (matchLive(m) || matchHalftime(m)));
  if (liveTarget) return liveTarget;
  const pendingTarget = state.partidos.find(m => !matchFinalized(m) && !matchHasScore(m));
  if (pendingTarget) return pendingTarget;
  return state.partidos.find(m => !matchFinalized(m)) || null;
}

// El primer partido no finalizado y sin resultado: puede estar pendiente, jugando o en medio tiempo.
function getCurrentMatchId() {
  const target = getJumpTargetMatch();
  return target ? target.id : null;
}

function activeJumpView() {
  if (document.getElementById('viewAdmin')?.classList.contains('active')) return 'admin';
  if (document.getElementById('viewQuiniela')?.classList.contains('active')) return 'quiniela';
  return null;
}

// Devuelve la tarjeta del primer partido relevante para la vista activa.
function getCurrentMatchCard() {
  const id = getCurrentMatchId();
  if (id === null) return null;
  const view = activeJumpView();
  if (view === 'admin') {
    const match = state.partidos.find(m => m.id === id);
    return match ? document.querySelector(`#adminContent .match-card[data-doc-id="${match.docId}"]`) : null;
  }
  if (view === 'quiniela') {
    return document.querySelector(`#personContent .match-card[data-match-id="${id}"]`);
  }
  return null;
}

function ensureDayForCurrentMatch() {
  const id = getCurrentMatchId();
  if (id == null) return false;
  const m = state.partidos.find(x => x.id === id);
  if (!m?.fecha) return false;
  const day = dayKeyCDMX(m.fecha);
  if (state.selectedDay === day) return false;
  state.selectedDay = day;
  renderDayTabs();
  renderPersonDetail({ resetScroll: true });
  return true;
}

// Muestra/oculta el botón y ajusta la flecha (arriba o abajo) según dónde
// esté el partido pendiente respecto a la zona visible. Se oculta cuando el
// partido ya está a la vista.
function updateJumpButton() {
  const btn = document.getElementById('btnJumpCurrent');
  if (!btn) return;

  const view = activeJumpView();
  if (!view) {
    btn.hidden = true;
    return;
  }
  btn.classList.toggle('admin-position', view === 'admin');

  const id = getCurrentMatchId();
  if (id === null) { btn.hidden = true; return; }

  const card = getCurrentMatchCard();
  if (!card) {
    btn.hidden = false;
    btn.classList.remove('points-up');
    const label = btn.querySelector('span');
    if (label) label.textContent = view === 'admin' ? 'Partido actual' : 'Próximo partido';
    return;
  }

  const sticky = view === 'quiniela' ? document.querySelector('#viewQuiniela .quiniela-sticky') : null;
  const nav = document.getElementById('bottomNav');
  const regionTop = sticky ? sticky.getBoundingClientRect().bottom : 0;
  const navTop = nav && nav.style.display !== 'none' ? nav.getBoundingClientRect().top : window.innerHeight;
  const regionBottom = Math.min(window.innerHeight, navTop);

  const rect = card.getBoundingClientRect();
  const visible = rect.bottom > regionTop + 8 && rect.top < regionBottom - 8;

  if (visible) { btn.hidden = true; return; }

  btn.hidden = false;
  const label = btn.querySelector('span');
  if (label) label.textContent = view === 'admin' ? 'Partido actual' : 'Próximo partido';
  // Si la tarjeta está por debajo de la zona visible, la flecha apunta abajo;
  // si está por arriba, apunta arriba.
  const pointsUp = rect.top < regionTop;
  btn.classList.toggle('points-up', pointsUp);
}

// Hace scroll suave hasta el primer partido pendiente, compensando la barra fija.
function scrollToCurrentMatch() {
  const view = activeJumpView();
  const dayChanged = view === 'quiniela' ? ensureDayForCurrentMatch() : false;
  const scrollToCard = () => {
    const card = getCurrentMatchCard();
    if (!card) return;

    const sticky = view === 'quiniela' ? document.querySelector('#viewQuiniela .quiniela-sticky') : null;
    const offset = sticky ? sticky.getBoundingClientRect().bottom : 0;
    const delta = card.getBoundingClientRect().top - offset - 8;

    window.scrollBy({ top: delta, behavior: 'smooth' });
  };

  if (dayChanged) {
    requestAnimationFrame(() => requestAnimationFrame(scrollToCard));
  } else {
    scrollToCard();
  }
}

function buildMatchCard(m, { isOwn, savedItems, predMap, sharesPredictions }) {
  const isPlayed = matchFinalized(m);
  const isLive = matchLive(m);
  const isHalftime = matchHalftime(m);
  const canSeePrediction = isOwn || sharesPredictions !== false || isLive || isPlayed;
  const saved = savedItems[String(m.id)];
  const pr = predMap[m.id];
  const teams = `<div class="match-teams">${teamBlock(m.local, 'home')}<span class="match-vs">vs</span>${teamBlock(m.visitante, 'away')}</div>`;

  // Editable: es tu propia quiniela, partido no jugado, sin pronóstico guardado y antes del kickoff
  if (isOwn && !isPlayed && !saved && !matchStarted(m)) {
    return `
      <div class="match-card form-card editable-card" data-match-id="${m.id}">
        ${matchDatetimeHTML(m)}
        ${teams}
        <div class="form-score-row">
          <div class="form-score-field">
            <input class="form-score-input" type="number" min="0" max="20" step="1" name="l_${m.id}" inputmode="numeric" placeholder="-">
          </div>
          <span class="form-score-sep">—</span>
          <div class="form-score-field">
            <input class="form-score-input" type="number" min="0" max="20" step="1" name="v_${m.id}" inputmode="numeric" placeholder="-">
          </div>
        </div>
        <div class="edit-actions" hidden>
          <button type="button" class="btn-secondary btn-cancel-edit">Cancelar</button>
          <button type="button" class="btn-primary btn-save-edit">Guardar</button>
        </div>
      </div>`;
  }

  // Solo lectura
  const hasPred = canSeePrediction && pr && pr.golesLocal !== null && pr.golesVisitante !== null;
  const hasPrivatePred = !canSeePrediction && pr && pr.golesLocal !== null && pr.golesVisitante !== null;
  const hasRealScore = matchHasScore(m);
  const pts = isPlayed && hasPred ? calcPoints(pr.golesLocal, pr.golesVisitante, m.golesLocal, m.golesVisitante) : 0;
  const predL = hasPred ? pr.golesLocal : '–';
  const predV = hasPred ? pr.golesVisitante : '–';
  const realL = hasRealScore ? m.golesLocal : '–';
  const realV = hasRealScore ? m.golesVisitante : '–';
  let stateClass = 'state-pending';
  if (isPlayed) stateClass = pts && pts > 0 ? 'state-win' : 'state-lose';
  else if (isHalftime) stateClass = 'state-halftime';
  else if (isLive) stateClass = 'state-live';
  let ptsHTML;
  if (hasPrivatePred) {
    ptsHTML = `<span class="match-points pts-private">Pronóstico privado</span>`;
  } else if (isPlayed) {
    ptsHTML = `<span class="match-points pts-${pts}">+${pts} ${pts === 1 ? 'punto' : 'puntos'}</span>`;
  } else if (isHalftime) {
    ptsHTML = `<span class="match-points pts-halftime">Medio tiempo</span>`;
  } else if (isLive) {
    ptsHTML = `<span class="match-points pts-live"><span class="live-ball">⚽</span> ${displayLiveMinute(m)}</span>`;
  } else if (saved) {
    ptsHTML = `<span class="match-points pts-saved">Guardado</span>`;
  } else {
    ptsHTML = `<span class="match-points pts-pending">Por jugar</span>`;
  }

  return `
    <div class="match-card ${stateClass}" data-match-id="${m.id}">
      ${matchDatetimeHTML(m)}
      ${teams}
      ${hasPrivatePred ? `
      <div class="private-chip-wrap">
        <span class="private-chip">PRIVADO</span>
      </div>` : `
      <div class="score-rows">
        <div class="score-row pred">
          <span class="score-num ${hasPred ? '' : 'empty'}">${predL}</span>
          <span class="score-row-label">Pronóstico</span>
          <span class="score-num ${hasPred ? '' : 'empty'}">${predV}</span>
        </div>
        <div class="score-row real">
          <span class="score-num ${hasRealScore ? '' : 'empty'}">${realL}</span>
          <span class="score-row-label">Resultado</span>
          <span class="score-num ${hasRealScore ? '' : 'empty'}">${realV}</span>
        </div>
      </div>`}
      <div class="match-footer">${ptsHTML}</div>
    </div>`;
}

function renderMatchesFlat(partidos, ctx) {
  return partidos.map(m => buildMatchCard(m, ctx)).join('');
}

// ============================================================
// Edición por partido (uno a la vez)
// ============================================================
function attachEditingListeners() {
  document.querySelectorAll('.editable-card').forEach(card => {
    const id = Number(card.dataset.matchId);
    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('focus', () => enterEditMode(id));
    });
    const cancel = card.querySelector('.btn-cancel-edit');
    const save = card.querySelector('.btn-save-edit');
    if (cancel) cancel.addEventListener('click', () => exitEditMode(true));
    if (save) save.addEventListener('click', () => openConfirm(id));
  });
}

function enterEditMode(id) {
  if (state.editingMatchId === id) return;
  if (state.editingMatchId !== null) return;
  state.editingMatchId = id;
  document.querySelectorAll('.editable-card').forEach(card => {
    const cid = Number(card.dataset.matchId);
    const actions = card.querySelector('.edit-actions');
    if (cid === id) {
      card.classList.add('editing');
      if (actions) actions.hidden = false;
    } else {
      card.classList.add('locked');
      card.querySelectorAll('input').forEach(i => { i.disabled = true; });
    }
  });
}

function exitEditMode(clear) {
  const id = state.editingMatchId;
  state.editingMatchId = null;
  document.querySelectorAll('.editable-card').forEach(card => {
    card.classList.remove('locked', 'editing');
    card.querySelectorAll('input').forEach(i => { i.disabled = false; });
    const actions = card.querySelector('.edit-actions');
    if (actions) actions.hidden = true;
  });
  if (clear && id != null) {
    const card = document.querySelector(`.editable-card[data-match-id="${id}"]`);
    if (card) card.querySelectorAll('input').forEach(i => { i.value = ''; });
  }
}

function openConfirm(matchId) {
  const card = document.querySelector(`.editable-card[data-match-id="${matchId}"]`);
  if (!card) return;
  const lRaw = card.querySelector(`input[name="l_${matchId}"]`).value;
  const vRaw = card.querySelector(`input[name="v_${matchId}"]`).value;

  if (lRaw === '' || vRaw === '') { alert('Escribe ambos marcadores antes de guardar.'); return; }
  const gl = Number(lRaw), gv = Number(vRaw);
  if (!Number.isInteger(gl) || !Number.isInteger(gv) || gl < 0 || gv < 0 || gl > 20 || gv > 20) {
    alert('Los goles deben ser números enteros entre 0 y 20.');
    return;
  }

  const m = state.partidos.find(x => x.id === matchId);
  state.pendingSave = { matchId, gl, gv };
  const titleEl = document.querySelector('#confirmModal .modal-title');
  const warnEl = document.querySelector('#confirmModal .modal-warn');
  if (titleEl) titleEl.textContent = 'Confirmar pronóstico';
  if (warnEl) warnEl.textContent = 'Una vez guardado, no podrás editar este pronóstico.';
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-match">
      <span class="modal-team">${m.local}</span>
      <span class="modal-score">${gl} - ${gv}</span>
      <span class="modal-team">${m.visitante}</span>
    </div>`;
  document.getElementById('confirmModal').hidden = false;
}

function closeModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.hidden = true;
}

async function handleModalConfirm() {
  if (state.adminPendingSave) return handleAdminModalConfirm();
  if (!state.pendingSave) return;
  const { matchId, gl, gv } = state.pendingSave;
  const btn = document.getElementById('modalConfirm');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    await saveSingleMatch(matchId, gl, gv);
    state.editingMatchId = null;
    state.pendingSave = null;
    closeModal();
    renderPersonDetail();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

function handleModalCancel() {
  closeModal();
  if (state.adminPendingSave) {
    state.adminPendingSave = null;
    return;
  }
  state.pendingSave = null;
  exitEditMode(true);
}

// ============================================================
// Header / Auth gate
// ============================================================
function updateHeaderSession() {
  const logged = !!state.session;
  document.getElementById('btnLogout').hidden = !logged;
  document.getElementById('headerSubtitle').textContent = logged ? `Hola, ${displayName()}` : 'Fase de Grupos';
}

function applyAuthGate() {
  const logged = !!state.session;
  const admin = isAdminSession();
  document.getElementById('bottomNav').style.display = logged && !admin ? 'flex' : 'none';
  document.getElementById('btnRefresh').style.display = logged ? '' : 'none';
  document.getElementById('btnLogout').hidden = !logged;
  document.body.classList.toggle('admin-mode', admin);
  if (!logged || admin) document.body.classList.remove('podio-mode');

  if (!logged) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('viewLogin').classList.add('active');
  } else if (admin) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('viewAdmin').classList.add('active');
  }
  renderShareToggle();
  updateJumpButton();
}

function showAdminView() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('viewAdmin').classList.add('active');
}

function renderAll() {
  renderPodio();
  renderDayTabs();
  renderPersonTabs();
  if (state.editingMatchId === null) renderPersonDetail();
  if (state.activeView === 'grupos') renderGrupos();
  updateHeaderSession();
  renderShareToggle();
}

// ============================================================
// Status
// ============================================================
function setStatus(text, type = 'loading') {
  const dot = document.querySelector('.status-dot');
  document.getElementById('statusText').textContent = text;
  dot.className = 'status-dot' + (type === 'ok' ? ' ok' : type === 'error' ? ' error' : '');
}

function formatTime(date) {
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Tablas de grupos
// ============================================================
async function fetchApiStandings() {
  try {
    const res = await fetch(STANDINGS_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('API no disponible');
    const data = await res.json();
    if (!data.ok || !data.standings) throw new Error('Respuesta inválida');
    state.apiStandings = parseApiStandings(data.standings);
    state.apiStandingsAt = Date.now();
    return true;
  } catch (err) {
    console.warn('Tablas externas no disponibles:', err);
    return false;
  }
}

function stopGruposPolling() {
  if (state.gruposPollTimer) {
    clearInterval(state.gruposPollTimer);
    state.gruposPollTimer = null;
  }
}

function startGruposPolling() {
  stopGruposPolling();
  fetchApiStandings().then(ok => {
    if (ok && state.activeView === 'grupos') renderGrupos();
  });
  state.gruposPollTimer = setInterval(async () => {
    if (state.activeView !== 'grupos') return;
    const ok = await fetchApiStandings();
    if (ok) renderGrupos();
  }, STANDINGS_POLL_MS);
}

function formatGruposUpdated() {
  const el = document.getElementById('gruposUpdated');
  if (!el) return;
  const local = computeGroupStandings(state.partidos);
  const merged = mergeStandings(local, state.apiStandings);
  const played = GROUP_LETTERS.reduce((sum, l) =>
    sum + merged[l].reduce((s, r) => s + r.j, 0), 0);
  const parts = [`${played / 2 | 0} partidos reflejados`];
  if (state.apiStandingsAt) {
    parts.push(`API · ${formatTime(new Date(state.apiStandingsAt))}`);
  }
  el.textContent = parts.join(' · ');
}

function buildStandingsRow(row, rank) {
  const zoneClass = rank <= 2 ? 'zone-qualify' : rank === 3 ? 'zone-playoff' : '';
  const name = displayTeamName(row.team);
  const dif = row.dif > 0 ? `+${row.dif}` : String(row.dif);
  return `
    <tr class="standings-row ${zoneClass}">
      <td class="col-rank">${rank}</td>
      <td class="col-team">
        <div class="standings-team-cell">
          <span class="standings-flag">${teamFlag(row.team)}</span>
          <span class="standings-team">${name}</span>
        </div>
      </td>
      <td class="col-stat">${row.j}</td>
      <td class="col-stat">${row.g}</td>
      <td class="col-stat">${row.e}</td>
      <td class="col-stat">${row.p}</td>
      <td class="col-stat">${row.gf}</td>
      <td class="col-stat">${row.gc}</td>
      <td class="col-stat">${dif}</td>
      <td class="col-pts col-stat">${row.pts}</td>
    </tr>`;
}

function buildGroupCard(letter, rows) {
  const body = rows.map((row, i) => buildStandingsRow(row, i + 1)).join('');
  return `
    <article class="group-card">
      <h3 class="group-card-title">GRUPO ${letter}</h3>
      <div class="standings-wrap">
        <table class="standings-table">
          <colgroup>
            <col class="col-rank-col">
            <col class="col-team-col">
            <col class="col-stat-col" span="8">
          </colgroup>
          <thead>
            <tr>
              <th class="col-rank">#</th>
              <th class="col-team">Equipo</th>
              <th class="col-stat">J</th>
              <th class="col-stat">G</th>
              <th class="col-stat">E</th>
              <th class="col-stat">P</th>
              <th class="col-stat">GF</th>
              <th class="col-stat">GC</th>
              <th class="col-stat">+/-</th>
              <th class="col-pts col-stat">PTS</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </article>`;
}

function renderGrupos() {
  const el = document.getElementById('gruposContent');
  if (!el) return;

  const local = computeGroupStandings(state.partidos);
  const standings = mergeStandings(local, state.apiStandings);

  el.innerHTML = GROUP_LETTERS.map(letter =>
    buildGroupCard(letter, standings[letter])
  ).join('');

  formatGruposUpdated();
}

// ============================================================
// Navegación
// ============================================================
function switchView(viewKey) {
  const views = { podio: 'viewPodio', quiniela: 'viewQuiniela', info: 'viewInfo', grupos: 'viewGrupos' };
  const target = views[viewKey] ? viewKey : 'podio';
  state.activeView = target;
  document.body.classList.toggle('podio-mode', target === 'podio');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === target));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(views[target]).classList.add('active');
  if (target === 'quiniela') {
    renderDayTabs();
    renderPersonDetail();
    stopGruposPolling();
    syncLiveScoresFromClient({ force: true, silent: true }).catch(handleClientLiveSyncError);
  } else if (target === 'grupos') {
    renderGrupos();
    startGruposPolling();
  } else {
    stopGruposPolling();
  }
  updatePodioAudioPauseButton();
  renderShareToggle();
  if (target === 'podio') {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    podioMusicManuallyPaused = false;
    startPodioMusic();
    renderPodio(true);
  } else {
    disposePodiumScene();
    stopPodioMusic();
  }
  updateJumpButton();
}

function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.session) return;
      switchView(btn.dataset.view);
    });
  });
}

// ============================================================
// Handlers de login y reconexión
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    if (!state.firebaseReady) await ensureFirebase();
    await syncInternetClock();
    await login(
      document.getElementById('loginUsuario').value,
      document.getElementById('loginPassword').value
    );
    document.getElementById('loginPassword').value = '';
    updateHeaderSession();
    applyAuthGate();
    if (isAdminSession()) {
      subscribeAdmin();
      showAdminView();
      setStatus('Conectando...', 'loading');
    } else {
      state.selectedPerson = state.session.clave;
      subscribeFirestore();
      switchView('quiniela');
      setStatus('Conectando...', 'loading');
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

async function reconnect() {
  if (!state.session) return;
  const btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  setStatus('Reconectando...');
  try {
    if (!state.firebaseReady) await ensureFirebase();
    if (isAdminSession()) {
      subscribeAdmin();
    } else {
      await syncInternetClock();
      subscribeFirestore();
    }
    setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Error al reconectar', 'error');
  } finally {
    btn.classList.remove('spinning');
  }
}

// ============================================================
// Bootstrap
// ============================================================
async function ensureFirebase() {
  if (state.firebaseReady) return;
  if (!isFirebaseConfigured()) throw new Error('Firebase no configurado');
  await initFirebase();
  state.firebaseReady = true;
}

async function bootstrap() {
  state.session = getSession();
  setStatus('Conectando...');

  try {
    await ensureFirebase();
    await syncInternetClock();
    startMatchLockTimer();
    startLiveMinuteTimer();
  } catch (err) {
    console.error(err);
    setStatus('Sin conexión con el servidor', 'error');
    const errEl = document.getElementById('loginError');
    errEl.textContent = 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.';
    errEl.hidden = false;
    clearSession();
    applyAuthGate();
    return;
  }

  updateHeaderSession();
  if (state.session) {
    if (isAdminSession()) {
      subscribeAdmin();
      applyAuthGate();
      showAdminView();
      setStatus('Conectando...', 'loading');
    } else {
      state.selectedPerson = state.session.clave;
      subscribeFirestore();
      applyAuthGate();
      switchView('info');
      setStatus('Conectando...', 'loading');
    }
  } else {
    applyAuthGate();
    setStatus('Inicia sesión para continuar', 'loading');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initIntroVideo();
  initNavigation();
  initPodioMusic();
  document.getElementById('btnRefresh').addEventListener('click', reconnect);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('sharePredictionsToggle').addEventListener('change', handleShareToggleChange);
  document.getElementById('btnJumpCurrent').addEventListener('click', scrollToCurrentMatch);
  document.getElementById('btnLiveSyncNow')?.addEventListener('click', handleLiveSyncNow);

  let jumpTick = false;
  const onScrollOrResize = () => {
    if (jumpTick) return;
    jumpTick = true;
    requestAnimationFrame(() => { jumpTick = false; updateJumpButton(); });
  };
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('modalConfirm').addEventListener('click', handleModalConfirm);
  document.getElementById('modalCancel').addEventListener('click', handleModalCancel);
  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target.id === 'confirmModal') handleModalCancel();
  });
  bootstrap();
});
