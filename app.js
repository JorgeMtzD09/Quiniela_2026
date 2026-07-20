import {
  formatDateCDMX, dayKeyCDMX, formatDayHeaderCDMX, formatDayTabCDMX,
  GROUP_LETTERS, computeGroupStandings, parseApiStandings, mergeStandings,
  displayTeamName, teamFlag, getMatchGroup, teamsMatch, etToDate,
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
  features: {
    knockoutEnabled: true,
    knockoutScoreByAdvancingTeam: true,
  },
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
const EXTRAS_MUSIC_SRC = 'assets/extras-song.mp3';
const PODIO_MUSIC_VOLUME = 0.54;
const MATCH_DATE_TOLERANCE_MS = 12 * 60 * 60 * 1000;
// Duración aproximada de un partido (90' + medio tiempo + descuentos + margen) = 2h
const MATCH_DURATION_MS = 120 * 60 * 1000;
const CLIENT_LIVE_SYNC_BEFORE_MS = 30 * 60 * 1000;
const CLIENT_LIVE_SYNC_AFTER_MS = MATCH_DURATION_MS + 30 * 60 * 1000;
const LIVE_SYNC_STALE_MS = 3 * 60 * 1000;
const KNOCKOUT_ID_START = 73;
const KNOCKOUT_ZOOM_MAX = 1.55;
const KNOCKOUT_CARD_WIDTH = 330;
const KNOCKOUT_COL_GAP = 96;
const KNOCKOUT_SLOT_HEIGHT = 400;
const KNOCKOUT_CARD_MID = 122;
const KNOCKOUT_BOARD_PADDING_X = 36;
const KNOCKOUT_BOARD_PADDING_TOP = 82;
const KNOCKOUT_PINCH_SENSITIVITY = 1.8;
const KNOCKOUT_WHEEL_ZOOM_SPEED = 0.006;
const KNOCKOUT_FOCUS_ZOOM = 1.05;
const EXTRA_PARTICIPANT_LIMIT = 4;
const BONUS_EXCLUDED_PARTICIPANTS = ['coque'];
const EXTRA_RANGE_OPTIONS = [
  ['0-5', '0-5'],
  ['6-10', '6-10'],
  ['11-15', '11-15'],
  ['16+', '16+'],
];
const EXTRA_SAVE_FIELDS = [
  'local_tirosPorteria',
  'local_tirosEsquina',
  'local_atajadas',
  'local_fuerasJuego',
  'local_faltas',
  'local_amarillas',
  'local_rojas',
  'local_minutoGol',
  'local_autorGol',
  'visitante_tirosPorteria',
  'visitante_tirosEsquina',
  'visitante_atajadas',
  'visitante_fuerasJuego',
  'visitante_faltas',
  'visitante_amarillas',
  'visitante_rojas',
  'visitante_minutoGol',
  'visitante_autorGol',
  'penales',
  'enfocanInfantino',
  'alguienLesiona',
  'seRevisaVar',
  'personaLlorando',
  'balonAlPoste',
  'golAnulado',
  'segundaAmarilla',
  'penalEnPartido',
  'golCabeza',
  'golFueraArea',
  'golTiempoAgregado',
  'suplenteAnota',
  'tarjetaBanca',
  'horaFinPartido',
];

const EXTRA_TEAM_QUESTION_DEFS = [
  { suffix: 'tirosPorteria', label: 'Tiros a porteria', type: 'range', min: 0, max: 80 },
  { suffix: 'tirosEsquina', label: 'Tiros de esquina', type: 'range', min: 0, max: 80 },
  { suffix: 'atajadas', label: 'Atajadas', type: 'range', min: 0, max: 40 },
  { suffix: 'fuerasJuego', label: 'Fueras de juego', type: 'range', min: 0, max: 30 },
  { suffix: 'faltas', label: 'Faltas cometidas', type: 'number', min: 0, max: 60 },
  { suffix: 'amarillas', label: 'Tarjetas amarillas', type: 'number', min: 0, max: 20 },
  { suffix: 'rojas', label: 'Tarjetas rojas', type: 'number', min: 0, max: 10 },
  { suffix: 'minutoGol', label: 'Minuto del primer gol', type: 'minute', min: 1, max: 130 },
  { suffix: 'autorGol', label: 'Autor del primer gol', type: 'scorer' },
];

const EXTRA_GENERAL_QUESTIONS = [
  { key: 'penales', label: 'Habrá tanda de penales', type: 'select' },
  { key: 'enfocanInfantino', label: 'Enfocan a Infantino', type: 'select' },
  { key: 'alguienLesiona', label: 'Alguien se lesiona', type: 'select' },
  { key: 'seRevisaVar', label: 'Se revisa el VAR', type: 'select' },
  { key: 'personaLlorando', label: 'Enfocan una persona llorando', type: 'select' },
  { key: 'balonAlPoste', label: 'Balón al poste o travesaño', type: 'select' },
  { key: 'golAnulado', label: 'Hay gol anulado', type: 'select' },
  { key: 'segundaAmarilla', label: 'Hay expulsión por segunda amarilla', type: 'select' },
  { key: 'penalEnPartido', label: 'Hay penal en el partido', type: 'select' },
  { key: 'golCabeza', label: 'Hay gol de cabeza', type: 'select' },
  { key: 'golFueraArea', label: 'Hay gol fuera del área', type: 'select' },
  { key: 'golTiempoAgregado', label: 'Hay gol en tiempo agregado', type: 'select' },
  { key: 'suplenteAnota', label: 'Anota un jugador que entró de cambio', type: 'select' },
  { key: 'tarjetaBanca', label: 'Hay tarjeta para alguien de la banca', type: 'select' },
];

const EXTRA_SPECIAL_QUESTIONS = [
  { key: 'horaFinPartido', label: '¿A qué hora acaba el partido?', type: 'time', points: 2 },
];

const EXTRA_LINEUPS_URL = 'https://www.google.com/search?q=spain+vs+argentina&sca_esv=fced48e86b6f134d&biw=1176&bih=668&sxsrf=APpeQnuLk8sSpwpmWGPt0SA-zL96kqJpXg%3A1784235287518&ei=F0VZauKrH-uhkPIPrtSfyAg&ved=0ahUKEwiik4i0itiVAxXrEEQIHS7qB4kQ4dUDCBA&uact=5&oq=spain+vs+argentina&gs_lp=Egxnd3Mtd2l6LXNlcnAiEnNwYWluIHZzIGFyZ2VudGluYTIKEAAYgAQYigUYQzIKEAAYgAQYigUYQzIKEAAYgAQYigUYQzIKEAAYgAQYigUYQzIFEAAYgAQyBRAAGIAEMgUQABiABDIFEAAYgAQyBRAAGIAEMgUQABiABEilBlDEA1jEA3ACeAGQAQCYAVygAVyqAQExuAEDyAEA-AEBmAIDoAJuwgIKEAAYRxjWBBiwA8ICFxAuGNwGGLgGGNoGGNgCGMgDGLAD2AEBmAMAiAYBkAYLugYECAEYGZIHATOgB58FsgcBMbgHYsIHBTAuMS4yyAcNgAgB&sclient=gws-wiz-serp#sie=m;/g/11xmtnn25b;2;/m/030q7;ln;fp;1;;;;-1';

const EXTRA_ROSTERS = {
  espana: {
    Porteros: ['Unai Simon', 'David Raya', 'Joan Garcia'],
    Defensas: ['Pedro Porro', 'Marcos Llorente', 'Aymeric Laporte', 'Pau Cubarsi', 'Marc Pubill', 'Eric Garcia', 'Marc Cucurella', 'Alejandro Grimaldo'],
    Medios: ['Rodrigo Hernandez', 'Martin Zubimendi', 'Pedri Gonzalez', 'Fabian Ruiz', 'Mikel Merino', 'Pablo Paez Gavi', 'Alex Baena'],
    Delanteros: ['Mikel Oyarzabal', 'Lamine Yamal', 'Ferran Torres', 'Borja Iglesias', 'Dani Olmo', 'Victor Munoz', 'Nico Williams', 'Yeremy Pino'],
  },
  argentina: {
    Porteros: ['Emiliano Martinez', 'Geronimo Rulli', 'Juan Musso'],
    Defensas: ['Gonzalo Montiel', 'Nahuel Molina', 'Lisandro Martinez', 'Nicolas Otamendi', 'Leonardo Balerdi', 'Cristian Romero', 'Nicolas Tagliafico', 'Facundo Medina'],
    Medios: ['Giovani Lo Celso', 'Leandro Paredes', 'Rodrigo De Paul', 'Exequiel Palacios', 'Enzo Fernandez', 'Alexis Mac Allister', 'Valentin Barco'],
    Delanteros: ['Lionel Messi', 'Nicolas Gonzalez', 'Giuliano Simeone', 'Lautaro Martinez', 'Jose Manuel Lopez', 'Julian Alvarez', 'Thiago Almada', 'Nico Paz'],
  },
};

const KNOCKOUT_ROUNDS = [
  { key: 'r32', title: 'De 32', className: 'round-r32' },
  { key: 'r16', title: 'Octavos', className: 'round-r16' },
  { key: 'qf', title: 'Cuartos', className: 'round-qf' },
  { key: 'sf', title: 'Semifinales', className: 'round-sf' },
  { key: 'final', title: 'Final', className: 'round-final' },
  { key: 'sf-right', title: 'Semifinales', className: 'round-sf' },
  { key: 'qf-right', title: 'Cuartos', className: 'round-qf' },
  { key: 'r16-right', title: 'Octavos', className: 'round-r16' },
  { key: 'r32-right', title: 'De 32', className: 'round-r32' },
];

const KNOCKOUT_BASE_MATCHES = [
  { id: 73, round: 'r32', roundOrder: 0, local: '🇿🇦 Sudáfrica', visitante: '🇨🇦 Canadá', date: '2026-06-28', timeET: '13:00' },
  { id: 75, round: 'r32', roundOrder: 1, local: '🇳🇱 Países Bajos', visitante: '🇲🇦 Marruecos', date: '2026-06-29', timeET: '21:00' },
  { id: 74, round: 'r32', roundOrder: 2, local: '🇩🇪 Alemania', visitante: '🇵🇾 Paraguay', date: '2026-06-29', timeET: '16:30' },
  { id: 77, round: 'r32', roundOrder: 3, local: '🇫🇷 Francia', visitante: '🇸🇪 Suecia', date: '2026-06-30', timeET: '17:00' },
  { id: 76, round: 'r32', roundOrder: 4, local: '🇧🇷 Brasil', visitante: '🇯🇵 Japón', date: '2026-06-29', timeET: '13:00' },
  { id: 78, round: 'r32', roundOrder: 5, local: '🇨🇮 Costa de Marfil', visitante: '🇳🇴 Noruega', date: '2026-06-30', timeET: '13:00' },
  { id: 79, round: 'r32', roundOrder: 6, local: '🇲🇽 México', visitante: '🇪🇨 Ecuador', date: '2026-06-30', timeET: '21:00' },
  { id: 80, round: 'r32', roundOrder: 7, local: '🏴 Inglaterra', visitante: '🇨🇩 RD Congo', date: '2026-07-01', timeET: '12:00' },
  { id: 83, round: 'r32-right', roundOrder: 0, local: '🇵🇹 Portugal', visitante: '🇭🇷 Croacia', date: '2026-07-02', timeET: '19:00' },
  { id: 84, round: 'r32-right', roundOrder: 1, local: '🇪🇸 España', visitante: '🇦🇹 Austria', date: '2026-07-02', timeET: '15:00' },
  { id: 81, round: 'r32-right', roundOrder: 2, local: '🇺🇸 Estados Unidos', visitante: '🇧🇦 Bosnia y Herzegovina', date: '2026-07-01', timeET: '20:00' },
  { id: 82, round: 'r32-right', roundOrder: 3, local: '🇧🇪 Bélgica', visitante: '🇸🇳 Senegal', date: '2026-07-01', timeET: '16:00' },
  { id: 86, round: 'r32-right', roundOrder: 4, local: '🇦🇷 Argentina', visitante: '🇨🇻 Cabo Verde', date: '2026-07-03', timeET: '18:00' },
  { id: 88, round: 'r32-right', roundOrder: 5, local: '🇦🇺 Australia', visitante: '🇪🇬 Egipto', date: '2026-07-03', timeET: '14:00' },
  { id: 85, round: 'r32-right', roundOrder: 6, local: '🇨🇭 Suiza', visitante: '🇩🇿 Argelia', date: '2026-07-02', timeET: '23:00' },
  { id: 87, round: 'r32-right', roundOrder: 7, local: '🇨🇴 Colombia', visitante: '🇬🇭 Ghana', date: '2026-07-03', timeET: '21:30' },
  { id: 89, round: 'r16', roundOrder: 0, sourceA: 73, sourceB: 75, local: '🏳️ Ganador Partido 73', visitante: '🏳️ Ganador Partido 75', date: '2026-07-04', timeET: '13:00' },
  { id: 90, round: 'r16', roundOrder: 1, sourceA: 74, sourceB: 77, local: '🏳️ Ganador Partido 74', visitante: '🏳️ Ganador Partido 77', date: '2026-07-04', timeET: '16:00' },
  { id: 91, round: 'r16', roundOrder: 2, sourceA: 76, sourceB: 78, local: '🏳️ Ganador Partido 76', visitante: '🏳️ Ganador Partido 78', date: '2026-07-05', timeET: '13:00' },
  { id: 92, round: 'r16', roundOrder: 3, sourceA: 79, sourceB: 80, local: '🏳️ Ganador Partido 79', visitante: '🏳️ Ganador Partido 80', date: '2026-07-05', timeET: '16:00' },
  { id: 93, round: 'r16-right', roundOrder: 0, sourceA: 83, sourceB: 84, local: '🏳️ Ganador Partido 83', visitante: '🏳️ Ganador Partido 84', date: '2026-07-06', timeET: '13:00' },
  { id: 94, round: 'r16-right', roundOrder: 1, sourceA: 81, sourceB: 82, local: '🏳️ Ganador Partido 81', visitante: '🏳️ Ganador Partido 82', date: '2026-07-06', timeET: '16:00' },
  { id: 95, round: 'r16-right', roundOrder: 2, sourceA: 86, sourceB: 88, local: '🏳️ Ganador Partido 86', visitante: '🏳️ Ganador Partido 88', date: '2026-07-07', timeET: '13:00' },
  { id: 96, round: 'r16-right', roundOrder: 3, sourceA: 85, sourceB: 87, local: '🏳️ Ganador Partido 85', visitante: '🏳️ Ganador Partido 87', date: '2026-07-07', timeET: '16:00' },
  { id: 97, round: 'qf', roundOrder: 0, sourceA: 89, sourceB: 90, local: '🏳️ Ganador Partido 89', visitante: '🏳️ Ganador Partido 90', date: '2026-07-09', timeET: '15:00' },
  { id: 98, round: 'qf', roundOrder: 1, sourceA: 93, sourceB: 94, local: '🏳️ Ganador Partido 93', visitante: '🏳️ Ganador Partido 94', date: '2026-07-10', timeET: '15:00' },
  { id: 99, round: 'qf-right', roundOrder: 0, sourceA: 91, sourceB: 92, local: '🏳️ Ganador Partido 91', visitante: '🏳️ Ganador Partido 92', date: '2026-07-10', timeET: '18:00' },
  { id: 100, round: 'qf-right', roundOrder: 1, sourceA: 95, sourceB: 96, local: '🏳️ Ganador Partido 95', visitante: '🏳️ Ganador Partido 96', date: '2026-07-11', timeET: '15:00' },
  {
    id: 101,
    round: 'sf',
    roundOrder: 0,
    sourceA: 97,
    sourceB: 98,
    local: '🏳️ Ganador Partido 97',
    visitante: '🏳️ Ganador Partido 98',
    date: '2026-07-14',
    timeET: '20:00',
  },
  {
    id: 102,
    round: 'sf-right',
    roundOrder: 0,
    sourceA: 99,
    sourceB: 100,
    local: '🏳️ Ganador Partido 99',
    visitante: '🏳️ Ganador Partido 100',
    date: '2026-07-15',
    timeET: '20:00',
  },
  {
    id: 103,
    round: 'final',
    roundOrder: 0,
    sourceA: 101,
    sourceB: 102,
    local: '🏳️ Ganador Partido 101',
    visitante: '🏳️ Ganador Partido 102',
    date: '2026-07-19',
    timeET: '18:00',
  },
  {
    id: 104,
    round: 'third',
    roundOrder: 0,
    sourceA: 101,
    sourceB: 102,
    local: '🏳️ Perdedor Partido 101',
    visitante: '🏳️ Perdedor Partido 102',
    date: '2026-07-18',
    timeET: '18:00',
  },
];

const KNOCKOUT_VISUAL_LAYOUT = {
  76: { round: 'r32-right', roundOrder: 0 },
  78: { round: 'r32-right', roundOrder: 1 },
  79: { round: 'r32-right', roundOrder: 2 },
  80: { round: 'r32-right', roundOrder: 3 },
  83: { round: 'r32', roundOrder: 4 },
  84: { round: 'r32', roundOrder: 5 },
  81: { round: 'r32', roundOrder: 6 },
  82: { round: 'r32', roundOrder: 7 },
  91: { round: 'r16-right', roundOrder: 0 },
  92: { round: 'r16-right', roundOrder: 1 },
  93: { round: 'r16', roundOrder: 2 },
  94: { round: 'r16', roundOrder: 3 },
};

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
  if (isValidMatchStatus(m?.estado)) {
    if (m.estado === MATCH_STATUS.PENDING && matchInLiveWindow(m)) return MATCH_STATUS.LIVE;
    return m.estado;
  }
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

function isKnockoutMatch(m) {
  return !!m?.round || Number(m?.id) >= KNOCKOUT_ID_START;
}

function matchTied(gl, gv) {
  return gl !== null && gv !== null && Number(gl) === Number(gv);
}

function normalizedWinner(value) {
  return String(value || '').trim() || null;
}

function isPlaceholderTeam(team) {
  const normalized = normalizedWinner(team);
  return normalized?.includes('Ganador Partido') || normalized?.includes('Perdedor Partido') || false;
}

function knockoutTeamsResolved(m) {
  if (!isKnockoutMatch(m) || (!m?.sourceA && !m?.sourceB)) return true;
  return !isPlaceholderTeam(m.local) && !isPlaceholderTeam(m.visitante);
}

function inferredWinner(m, gl = m?.golesLocal, gv = m?.golesVisitante) {
  const explicit = normalizedWinner(m?.ganador);
  if (explicit) return explicit;
  if (gl !== null && gv !== null && gl === gv && Number.isInteger(m?.definicionLocal) && Number.isInteger(m?.definicionVisitante)) {
    return winnerFromScore(m.local, m.visitante, m.definicionLocal, m.definicionVisitante);
  }
  if (gl === null || gv === null || gl === gv) return null;
  return gl > gv ? m.local : m.visitante;
}

function inferredPredictionWinner(pr, match) {
  const explicit = normalizedWinner(pr?.ganador);
  if (explicit) return explicit;
  if (!pr || !match) return null;
  if (pr.golesLocal === null || pr.golesVisitante === null) return null;
  if (pr.golesLocal === pr.golesVisitante) {
    if (Number.isInteger(pr.definicionLocal) && Number.isInteger(pr.definicionVisitante)) {
      return winnerFromScore(match.local, match.visitante, pr.definicionLocal, pr.definicionVisitante);
    }
    return null;
  }
  return winnerFromScore(match.local, match.visitante, pr.golesLocal, pr.golesVisitante);
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

function knockoutEnabled() {
  return CONFIG.features?.knockoutEnabled === true;
}

function syncFeatureFlags() {
  document.querySelectorAll('[data-feature="knockout"]').forEach(el => {
    const enabled = knockoutEnabled();
    el.hidden = !enabled;
    el.classList.toggle('feature-hidden', !enabled);
  });
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
  extras: {},
  podio: [],
  selectedPerson: null,
  selectedDay: null,
  finalesSelectedDay: null,
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
  adminSection: 'results',
  adminPredictionPerson: null,
  activeView: 'info',
  gruposPollTimer: null,
  knockoutZoom: 0.86,
  focusedFinalesMatchId: null,
  finalesMode: 'bracket',
  extrasSaving: false,
  extrasDrafts: {},
  playerPicker: null,
  adminExtrasPerson: null,
  selectedExtrasPerson: null,
};

let matchLockTimer = null;
let liveMinuteTimer = null;
let lastRenderedLiveMinuteLabel = '';
let clientLiveSyncDisabledForSession = false;
let finalesGesturesReady = false;
let finalesPinch = null;

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
let podioMusicAudioSrc = null;
let podioMusicFadeFrame = null;
let podioMusicToken = 0;
let podioMusicManuallyPaused = false;

function getActiveMusicSrc() {
  return state.activeView === 'extras' ? EXTRAS_MUSIC_SRC : PODIO_MUSIC_SRC;
}

function getPodioMusicAudio() {
  const source = getActiveMusicSrc();
  if (podioMusicAudio && podioMusicAudioSrc === source) return podioMusicAudio;

  if (podioMusicAudio) {
    podioMusicAudio.pause();
    podioMusicAudio.src = '';
  }

  podioMusicAudioSrc = source;
  podioMusicAudio = new Audio(source);
  podioMusicAudio.loop = true;
  podioMusicAudio.preload = 'auto';
  podioMusicAudio.volume = 0;
  podioMusicAudio.addEventListener('error', () => {
    console.warn('No se pudo cargar la música de esta pantalla.');
  });
  return podioMusicAudio;
}

function podioMusicViewActive() {
  return state.activeView === 'podio' || state.activeView === 'extras';
}

function setPodioAudioGate(visible) {
  const gate = document.getElementById('podioAudioGate');
  if (!gate) return;
  gate.hidden = !(visible && state.activeView === 'podio');
}

function updatePodioAudioPauseButton() {
  const button = document.getElementById('podioAudioPause');
  if (!button) return;
  button.hidden = !podioMusicViewActive();
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
  if (!podioMusicViewActive()) return;
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
    if (token !== podioMusicToken || !podioMusicViewActive()) {
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

function stopPodioMusic(durationMs = 650) {
  setPodioAudioGate(false);
  podioMusicManuallyPaused = false;
  updatePodioAudioPauseButton();
  if (!podioMusicAudio) return;
  const token = ++podioMusicToken;
  if (durationMs <= 0) {
    if (podioMusicFadeFrame) {
      cancelAnimationFrame(podioMusicFadeFrame);
      podioMusicFadeFrame = null;
    }
    podioMusicAudio.pause();
    podioMusicAudio.volume = 0;
    try {
      podioMusicAudio.currentTime = 0;
    } catch (err) {
      console.warn('No se pudo reiniciar la música del podio:', err);
    }
    return;
  }
  fadePodioMusicTo(0, durationMs, token);
}

function pausePodioMusic() {
  if (!podioMusicViewActive()) return;

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
  if (!podioMusicViewActive()) return;

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
    if (token !== podioMusicToken || !podioMusicViewActive()) {
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
    } else if (podioMusicViewActive()) {
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

function formatMatchDateParts(d) {
  const formatted = formatMatchDate(d);
  const parts = formatted.split(',');
  if (parts.length < 2) return { date: formatted, time: '' };
  return {
    date: parts[0].trim(),
    time: parts.slice(1).join(',').trim(),
  };
}

function matchDatetimeHTML(m) {
  const letter = getMatchGroup(m.local, m.visitante);
  const groupHTML = letter
    ? `<span class="match-group-chip">Grupo ${letter}</span>`
    : m.roundTitle
      ? `<span class="match-group-chip">${m.roundTitle}</span>`
    : '';
  const dateParts = formatMatchDateParts(m.fecha);
  const dateHTML = `
    <span class="match-datetime-text">
      <span class="match-date-line">${dateParts.date}</span>
      ${dateParts.time ? `<span class="match-time-line">${dateParts.time}</span>` : ''}
    </span>`;
  return `<div class="match-datetime">${groupHTML}${dateHTML}</div>`;
}

function datetimeLocalValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDatetimeLocalValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameMinuteDate(a, b) {
  if (!a && !b) return true;
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);
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

function apiFootballErrorMessage(err) {
  return String(err?.message || err || '');
}

function isApiFootballQuotaError(err) {
  return /request limit|reached the request limit|quota|too many requests|API-Football 429/i.test(apiFootballErrorMessage(err));
}

function isApiFootballSeasonBlockedError(err) {
  return /free plans do not have access to this season|do not have access to this season|try from 2022 to 2024|API-Football 403/i.test(apiFootballErrorMessage(err));
}

function isApiFootballHardBlockError(err) {
  return isApiFootballQuotaError(err) || isApiFootballSeasonBlockedError(err);
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
      if (isApiFootballHardBlockError(err)) throw err;
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
  if (!force && clientLiveSyncDisabledForSession) return false;
  const last = Number(localStorage.getItem(CLIENT_LIVE_SYNC_KEY) || 0);
  if (!force && now - last < CLIENT_LIVE_SYNC_COOLDOWN_MS) return false;

  const relevantMatches = resolvedMatchesForSystem().filter(matchRelevantForClientSync);
  const dates = clientSyncDates(relevantMatches);
  if (!dates.length) return false;

  localStorage.setItem(CLIENT_LIVE_SYNC_KEY, String(now));
  let providerFixtures;
  try {
    providerFixtures = await fetchClientLiveFixtures(dates);
  } catch (err) {
    if (!force) clientLiveSyncDisabledForSession = true;
    throw err;
  }
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
  clientLiveSyncDisabledForSession = true;
  if (isApiFootballQuotaError(err)) {
    setStatus('API de marcadores sin cuota por hoy', 'error');
  } else if (isApiFootballSeasonBlockedError(err)) {
    setStatus('API de marcadores no disponible para temporada 2026', 'error');
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
  stopPodioMusic(0);
  clearSession();
  state.activeView = 'info';
  state.selectedPerson = null;
  state.selectedExtrasPerson = null;
  state.extrasDrafts = {};
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
  updatePodioAudioPauseButton();
  applyAuthGate();
}

// ============================================================
// Transformar datos Firestore → formato app
// ============================================================
function pronosticosFromFirestore(docs, partidos, participantes = state.participantes) {
  const pronosticos = {};
  const meta = {};
  const predictionMatches = partidos;

  for (const p of participantes) {
    pronosticos[p.clave] = predictionMatches.map(m => ({ id: m.id, golesLocal: null, golesVisitante: null }));
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

    pronosticos[clave] = predictionMatches.map(m => {
      const item = items[String(m.id)];
      return {
        id: m.id,
        golesLocal: item && item.l != null ? Number(item.l) : null,
        golesVisitante: item && item.v != null ? Number(item.v) : null,
        ganador: item && item.ganador ? String(item.ganador) : null,
        definicion: item && item.definicion ? String(item.definicion) : null,
        definicionLocal: item && item.defL != null ? Number(item.defL) : null,
        definicionVisitante: item && item.defV != null ? Number(item.defV) : null,
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
  const settingsBtn = document.getElementById('btnQuinielaSettings');

  const show = !!state.session && !isAdminSession()
    && knockoutEnabled() && state.activeView === 'finales';
  document.body.classList.toggle('finales-status-mode', show);
  document.body.classList.toggle('finales-list-mode', show && state.finalesMode === 'list');
  if (settingsBtn) settingsBtn.hidden = !show;
  if (!wrap || !toggle || !text) return;
  wrap.hidden = !show;
  if (!show) return;

  const enabled = ownSharePreference();
  toggle.checked = enabled;
  toggle.disabled = state.sharePreferenceSaving;
  text.textContent = 'Compartir pronósticos';
  wrap.classList.toggle('is-saving', state.sharePreferenceSaving);
}

function openSettingsModal() {
  if (!(state.session && !isAdminSession() && state.activeView === 'finales')) return;
  renderShareToggle();
  syncSettingsLiveStatus();
  document.getElementById('settingsModal').hidden = false;
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.hidden = true;
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
  let extrasDocs = [];

  const maybeUpdate = () => {
    if (!partidos.length || !participantes.length) return;
    const { pronosticos, meta } = pronosticosFromFirestore(pronosticosDocs, partidos, participantes);
    applyData(partidos, participantes, pronosticos, meta);

    state.extras = {};
    extrasDocs.forEach(d => {
      state.extras[d.id] = d.data();
    });

    renderAll();
    setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
    syncLiveScoresFromClient({ silent: true }).catch(handleClientLiveSyncError);
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

  unsubscribers.push(
    onSnapshot(collection(db, 'extras'), snap => {
      extrasDocs = snap.docs;
      maybeUpdate();
    }, err => { console.error(err); setStatus('Error al leer extras', 'error'); })
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
    round: m.round || null,
    roundOrder: Number.isFinite(Number(m.roundOrder)) ? Number(m.roundOrder) : 0,
    roundTitle: m.roundTitle || knockoutRoundTitle(m.round),
    sourceA: m.sourceA != null ? Number(m.sourceA) : null,
    sourceB: m.sourceB != null ? Number(m.sourceB) : null,
    ganador: normalizedWinner(m.ganador),
    definicion: m.definicion || null,
    definicionLocal: m.defL != null ? Number(m.defL) : null,
    definicionVisitante: m.defV != null ? Number(m.defV) : null,
  };
}

function subscribeAdmin() {
  if (!db) return;
  teardownListeners();
  const { collection, onSnapshot, query, orderBy } = firestoreFns;
  let partidos = [];
  let participantes = [];
  let pronosticosDocs = [];
  let extrasDocs = [];

  const maybeUpdate = () => {
    if (!partidos.length) return;
    const { pronosticos, meta } = pronosticosFromFirestore(pronosticosDocs, partidos, participantes);
    applyData(partidos, participantes, pronosticos, meta);

    state.extras = {};
    extrasDocs.forEach(d => {
      state.extras[d.id] = d.data();
    });

    if (state.adminEditingId === null) renderAdmin();
    setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
  };

  unsubscribers.push(
    onSnapshot(query(collection(db, 'partidos'), orderBy('id')), snap => {
      partidos = snap.docs.map(parsePartidoDoc).sort((a, b) => a.id - b.id);
      maybeUpdate();
    }, err => {
      console.error(err);
      setStatus('Error al leer partidos', 'error');
    })
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

  unsubscribers.push(
    onSnapshot(collection(db, 'extras'), snap => {
      extrasDocs = snap.docs;
      maybeUpdate();
    }, err => { console.error(err); setStatus('Error al leer extras', 'error'); })
  );
}

async function saveMatchResult(docId, gl, gv, estado = null, ganador = null, definicion = null, defL = null, defV = null, fecha = null) {
  if (!isAdminSession()) throw new Error('Sin permisos de admin');
  if (!db) throw new Error('Sin conexión');

  const { doc, updateDoc } = firestoreFns;
  const m = findAdminMatchByDocId(docId);

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

  const update = {
    golesLocal: gl,
    golesVisitante: gv,
    estado: nextStatus,
    faseEnVivo: nextStatus === MATCH_STATUS.HALFTIME ? 'medio_tiempo' : null,
  };
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    update.fecha = fecha;
  }

  if (isKnockoutMatch(m)) {
    update.ganador = gl === null || gv === null ? null : normalizedWinner(ganador) || winnerFromScore(m.local, m.visitante, gl, gv);
    update.definicion = definicion || null;
    update.defL = null;
    update.defV = null;
    if (gl !== null && gv !== null && matchTied(gl, gv) && definicion) {
      const validatedDefinition = validateDefinitionScore(defL, defV, m, update.ganador, definicion, gl, gv);
      if (validatedDefinition.error) throw new Error(validatedDefinition.error);
      update.ganador = validatedDefinition.ganador;
      update.defL = validatedDefinition.defL;
      update.defV = validatedDefinition.defV;
    }
  }

  await updateDoc(doc(db, 'partidos', docId), update);
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
  const dateVal = datetimeLocalValue(m.fecha);
  const actualWinner = isPlayed && isKnockoutMatch(m) ? inferredWinner(m) : null;
  const teams = `<div class="match-teams">${teamBlock(m.local, 'home', actualWinner)}<span class="match-vs">vs</span>${teamBlock(m.visitante, 'away', actualWinner)}</div>`;
  const statusHTML = isPlayed && hasScore
    ? `<span class="match-points pts-saved">Finalizado: ${m.golesLocal} - ${m.golesVisitante}</span>`
    : isHalftime
      ? `<span class="match-points pts-halftime">Medio tiempo</span>`
        : status === MATCH_STATUS.LIVE
          ? `<span class="match-points pts-live"><span class="live-ball">⚽</span> ${displayLiveMinute(m)}</span>`
          : `<span class="match-points pts-pending">Sin resultado</span>`;
  const definitionLabel = m.definicion === 'penales'
    ? 'Definición por penales'
    : m.definicion === 'te'
      ? 'Definición en tiempo extra'
      : '';
  const definitionHTML = definitionLabel
    ? `<div class="match-definition admin-definition">${definitionLabel}${Number.isInteger(m.definicionLocal) && Number.isInteger(m.definicionVisitante) ? ` · ${m.definicionLocal} - ${m.definicionVisitante}` : ''}</div>`
    : '';
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
      <label class="admin-datetime-field">
        <span>Fecha y hora (MX)</span>
        <input class="admin-datetime-input" type="datetime-local" name="admin_fecha_${m.docId}" value="${dateVal}">
      </label>
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
      ${definitionHTML}
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

function resolvedMatchesForSystem() {
  const resolvedById = new Map(
    knockoutResolvedMatches().map(match => [Number(match.id), match])
  );
  return state.partidos.map(match => {
    if (!isKnockoutMatch(match)) return match;
    const resolved = resolvedById.get(Number(match.id));
    return resolved ? { ...match, ...resolved, docId: match.docId } : match;
  });
}

function adminResolvedMatches() {
  return resolvedMatchesForSystem();
}

function findAdminMatchByDocId(docId) {
  return adminResolvedMatches().find(match => match.docId === docId)
    || state.partidos.find(match => match.docId === docId)
    || null;
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

function validateDefinitionScore(defL, defV, m, ganador = null, definicion = null, regularL = null, regularV = null) {
  if (!Number.isInteger(defL) || !Number.isInteger(defV) || defL < 0 || defV < 0 || defL > 20 || defV > 20) {
    return { error: 'Escribe el marcador de la definición con números entre 0 y 20.' };
  }
  if (defL === defV) {
    return { error: 'El marcador de la definición no puede quedar empatado.' };
  }
  if (definicion === 'te') {
    if (!Number.isInteger(regularL) || !Number.isInteger(regularV)) {
      return { error: 'Escribe primero el marcador regular.' };
    }
    if (defL < regularL || defV < regularV) {
      return { error: 'En tiempo extra, el marcador final no puede ser menor que el marcador regular.' };
    }
  }
  const winnerByDefinition = winnerFromScore(m.local, m.visitante, defL, defV);
  if (ganador && normalizedWinner(ganador) !== normalizedWinner(winnerByDefinition)) {
    return { error: 'El marcador de la definición debe coincidir con el equipo que avanza.' };
  }
  return { defL, defV, ganador: winnerByDefinition };
}

function definitionChoiceHTML(selectedDefinition = 'te', fieldName = 'definition') {
  const selected = selectedDefinition || 'te';
  return `
    <div class="definition-choice" data-field="${fieldName}">
      <div class="winner-choice-label">Definición</div>
      <div class="winner-choice-options two-cols">
        <button type="button" class="definition-choice-btn${selected === 'te' ? ' active' : ''}" data-definition="te">Tiempo extra</button>
        <button type="button" class="definition-choice-btn${selected === 'penales' ? ' active' : ''}" data-definition="penales">Penales</button>
      </div>
    </div>`;
}

function definitionScoreHTML(m, scoreLocal = '', scoreVisitante = '') {
  return `
    <div class="definition-score">
      <div class="winner-choice-label">Marcador de la definición</div>
      <div class="definition-score-teams">
        <span>${m.local}</span>
        <span>${m.visitante}</span>
      </div>
      <div class="definition-score-row">
        <input class="definition-score-input" type="number" min="0" max="20" step="1" inputmode="numeric" name="def_l" placeholder="-" value="${scoreLocal}">
        <span class="form-score-sep">—</span>
        <input class="definition-score-input" type="number" min="0" max="20" step="1" inputmode="numeric" name="def_v" placeholder="-" value="${scoreVisitante}">
      </div>
    </div>`;
}

function winnerChoiceHTML(m, selectedWinner = null, fieldName = 'winner') {
  if (!isKnockoutMatch(m)) return '';
  const selected = normalizedWinner(selectedWinner);
  const teams = [m.local, m.visitante].filter(Boolean);
  return `
    <div class="winner-choice" data-field="${fieldName}">
      <div class="winner-choice-label">Equipo que avanza</div>
      <div class="winner-choice-options">
        ${teams.map(team => `
          <button type="button" class="winner-choice-btn${selected === team ? ' active' : ''}" data-winner="${team}">
            ${team}
          </button>`).join('')}
      </div>
    </div>`;
}

function attachWinnerChoiceListeners(root = document) {
  root.querySelectorAll('.winner-choice').forEach(group => {
    group.querySelectorAll('.winner-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.dataset.value = btn.dataset.winner;
        group.querySelectorAll('.winner-choice-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (state.pendingSave) state.pendingSave.ganador = btn.dataset.winner;
        if (state.adminPendingSave) state.adminPendingSave.ganador = btn.dataset.winner;
      });
    });
  });
  root.querySelectorAll('.definition-choice').forEach(group => {
    group.querySelectorAll('.definition-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.dataset.value = btn.dataset.definition;
        group.querySelectorAll('.definition-choice-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (state.pendingSave) state.pendingSave.definicion = btn.dataset.definition;
        if (state.adminPendingSave) state.adminPendingSave.definicion = btn.dataset.definition;
      });
    });
  });
  root.querySelectorAll('.definition-score-input').forEach(input => {
    input.addEventListener('input', () => {
      const wrap = input.closest('.definition-score');
      if (!wrap) return;
      const lRaw = wrap.querySelector('input[name="def_l"]')?.value ?? '';
      const vRaw = wrap.querySelector('input[name="def_v"]')?.value ?? '';
      const defL = lRaw === '' ? null : Number(lRaw);
      const defV = vRaw === '' ? null : Number(vRaw);
      if (state.pendingSave) {
        state.pendingSave.defL = Number.isInteger(defL) ? defL : null;
        state.pendingSave.defV = Number.isInteger(defV) ? defV : null;
      }
      if (state.adminPendingSave) {
        state.adminPendingSave.defL = Number.isInteger(defL) ? defL : null;
        state.adminPendingSave.defV = Number.isInteger(defV) ? defV : null;
      }
    });
  });
}

function adminSaveWillFinalize(m, gl, gv, estado) {
  if (gl === null || gv === null) return false;
  if (estado === MATCH_STATUS.FINAL) return true;
  if (estado === MATCH_STATUS.PENDING) return !matchInLiveWindow(m);
  return false;
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
  const m = findAdminMatchByDocId(docId);
  // validar partido y estado
  if (!m || !isValidMatchStatus(status)) return;
  const currentStatus = normalizeMatchStatus(m);
  if (currentStatus === status) return;
  // No se puede finalizar sin marcador
  if (status === MATCH_STATUS.FINAL && !matchHasScore(m)) {
    showToast('Primero captura el resultado para finalizar el partido.', true);
    return;
  }
  if (status === MATCH_STATUS.FINAL && isKnockoutMatch(m) && matchTied(m.golesLocal, m.golesVisitante) && !m.ganador) {
    openAdminConfirm(docId, status);
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
    const m = findAdminMatchByDocId(docId);
    const card = document.querySelector(`.editable-admin-card[data-doc-id="${docId}"]`);
    if (card && m) {
      const lInp = card.querySelector(`input[name="admin_l_${docId}"]`);
      const vInp = card.querySelector(`input[name="admin_v_${docId}"]`);
      const fechaInp = card.querySelector(`input[name="admin_fecha_${docId}"]`);
      if (lInp) lInp.value = m.golesLocal != null ? m.golesLocal : '';
      if (vInp) vInp.value = m.golesVisitante != null ? m.golesVisitante : '';
      if (fechaInp) fechaInp.value = datetimeLocalValue(m.fecha);
    }
  }
}

function openAdminConfirm(docId, estadoOverride = null) {
  const card = document.querySelector(`.editable-admin-card[data-doc-id="${docId}"]`);
  if (!card) return;
  const lRaw = card.querySelector(`input[name="admin_l_${docId}"]`).value;
  const vRaw = card.querySelector(`input[name="admin_v_${docId}"]`).value;
  const fechaRaw = card.querySelector(`input[name="admin_fecha_${docId}"]`)?.value || '';

  const m = findAdminMatchByDocId(docId);
  const fecha = parseDatetimeLocalValue(fechaRaw);
  if (!fecha) { alert('Elige una fecha y hora válida.'); return; }
  const hasAnyScore = lRaw !== '' || vRaw !== '';
  let validated = { gl: null, gv: null };
  if (hasAnyScore) {
    validated = validateScoreInputs(lRaw, vRaw);
    if (validated.error) { alert(validated.error); return; }
  }
  const scheduleChanged = !sameMinuteDate(m?.fecha, fecha);
  if (!hasAnyScore && !scheduleChanged) {
    showToast('No hay cambios por guardar.', true);
    return;
  }
  // Determinar el estado que se intenta guardar desde los botones activos. Si no hay, usa estado actual.
  let estado = estadoOverride || card.querySelector('.admin-phase-opt.active')?.dataset.status;
  if (!isValidMatchStatus(estado)) {
    estado = normalizeMatchStatus(m);
  }
  const needsWinner = isKnockoutMatch(m)
    && matchTied(validated.gl, validated.gv)
    && adminSaveWillFinalize(m, validated.gl, validated.gv, estado);
  const inferred = isKnockoutMatch(m) ? winnerFromScore(m.local, m.visitante, validated.gl, validated.gv) : null;
  state.adminPendingSave = {
    docId,
    gl: validated.gl,
    gv: validated.gv,
    estado,
    fecha,
    ganador: needsWinner ? null : inferred,
    definicion: needsWinner ? 'te' : null,
    defL: null,
    defV: null,
  };
  const titleEl = document.querySelector('#confirmModal .modal-title');
  const warnEl = document.querySelector('#confirmModal .modal-warn');
  if (titleEl) titleEl.textContent = 'Confirmar resultado';
  if (warnEl) warnEl.textContent = needsWinner
    ? 'Elige si fue en tiempo extra o penales y captura el marcador de la definición.'
    : 'Puedes corregir el resultado las veces que necesites.';
  const scoreLabel = hasAnyScore ? `${validated.gl} - ${validated.gv}` : 'Sin marcador';
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-match">
      <span class="modal-team">${m.local}</span>
      <span class="modal-score">${scoreLabel}</span>
      <span class="modal-team">${m.visitante}</span>
    </div>
    ${scheduleChanged ? `<p class="modal-small-note">${formatMatchDate(m.fecha)} → ${formatMatchDate(fecha)}</p>` : ''}
    ${needsWinner ? `${definitionChoiceHTML('te', 'admin-definition')}${definitionScoreHTML(m)}` : ''}`;
  attachWinnerChoiceListeners(document.getElementById('modalBody'));
  document.getElementById('confirmModal').hidden = false;
}

function openAdminResetConfirm(docId) {
  const m = findAdminMatchByDocId(docId);
  if (!m) return;
  state.adminPendingSave = {
    docId,
    gl: null,
    gv: null,
    reset: true,
    estado: MATCH_STATUS.PENDING,
    ganador: null,
    definicion: null,
    defL: null,
    defV: null,
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
  const { docId, gl, gv, reset, estado, fecha } = pending;
  const btn = document.getElementById('modalConfirm');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const match = findAdminMatchByDocId(docId);
    let winnerToSave = pending.ganador;
    if (!reset && isKnockoutMatch(match) && matchTied(gl, gv) && !pending.definicion) {
      showToast('Elige si fue en tiempo extra o penales.', true);
      return;
    }
    if (!reset && isKnockoutMatch(match) && matchTied(gl, gv)) {
      const validatedDefinition = validateDefinitionScore(pending.defL, pending.defV, match, null, pending.definicion, gl, gv);
      if (validatedDefinition.error) {
        showToast(validatedDefinition.error, true);
        return;
      }
      winnerToSave = validatedDefinition.ganador;
    }
    await saveMatchResult(docId, gl, gv, estado, winnerToSave, pending.definicion, pending.defL, pending.defV, fecha);
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
  renderAdminShell();

  if (state.adminSection === 'predictions') {
    renderAdminPredictions();
  } else if (state.adminSection === 'extras') {
    renderAdminExtras();
  } else {
    if (!state.partidos.length) {
      el.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Cargando partidos...</div>';
      return;
    }
    el.innerHTML = renderAdminMatchesByDay(adminResolvedMatches());
    attachAdminListeners();
  }
  updateJumpButton();
}

function renderAdminShell() {
  const title = document.getElementById('adminSectionTitle');
  const syncHint = document.getElementById('adminSyncHint');
  const syncBtn = document.getElementById('btnLiveSyncNow');
  const toolbar = document.getElementById('adminPredictionsToolbar');
  if (title) {
    if (state.adminSection === 'predictions') {
      title.textContent = 'Editar pronósticos';
    } else if (state.adminSection === 'extras') {
      title.textContent = 'Resultados Bonus';
    } else {
      title.textContent = 'Capturar resultados';
    }
  }
  if (syncHint) syncHint.hidden = state.adminSection !== 'results';
  if (syncBtn) syncBtn.hidden = state.adminSection !== 'results';
  if (toolbar) toolbar.hidden = state.adminSection !== 'predictions';
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminSection === state.adminSection);
  });
}

function adminPredictionMatches() {
  return state.partidos
    .filter(isKnockoutMatch)
    .sort(compareMatchesChronologically);
}

function ensureAdminPredictionPerson() {
  if (state.adminPredictionPerson && state.participantes.some(p => p.clave === state.adminPredictionPerson)) return;
  state.adminPredictionPerson = state.participantes[0]?.clave || null;
}

function renderAdminPredictionPersonSelect() {
  const select = document.getElementById('adminPredictionPerson');
  if (!select) return;
  ensureAdminPredictionPerson();
  select.innerHTML = state.participantes.map(p => `
    <option value="${p.clave}" ${p.clave === state.adminPredictionPerson ? 'selected' : ''}>${p.nombreVisible}</option>
  `).join('');
}

function buildAdminPredictionCard(match, pred, savedItem) {
  const glVal = pred?.golesLocal != null ? pred.golesLocal : '';
  const gvVal = pred?.golesVisitante != null ? pred.golesVisitante : '';
  const defLVal = pred?.definicionLocal != null ? pred.definicionLocal : '';
  const defVVal = pred?.definicionVisitante != null ? pred.definicionVisitante : '';
  const isTie = glVal !== '' && gvVal !== '' && Number(glVal) === Number(gvVal);
  const definition = pred?.definicion || savedItem?.definicion || 'te';
  const teams = `<div class="match-teams">${teamBlock(match.local, 'home')}<span class="match-vs">vs</span>${teamBlock(match.visitante, 'away')}</div>`;
  return `
    <div class="match-card form-card editable-admin-prediction-card" data-match-id="${match.id}">
      ${matchDatetimeHTML(match)}
      ${teams}
      <div class="form-score-row">
        <div class="form-score-field">
          <input class="form-score-input admin-pred-score-input" type="number" min="0" max="20" step="1"
                 name="admin_pred_l_${match.id}" inputmode="numeric" placeholder="-" value="${glVal}">
        </div>
        <span class="form-score-sep">—</span>
        <div class="form-score-field">
          <input class="form-score-input admin-pred-score-input" type="number" min="0" max="20" step="1"
                 name="admin_pred_v_${match.id}" inputmode="numeric" placeholder="-" value="${gvVal}">
        </div>
      </div>
      <div class="admin-prediction-definition" ${isTie ? '' : 'hidden'}>
        ${definitionChoiceHTML(definition, `admin-pred-definition-${match.id}`)}
        ${definitionScoreHTML(match, defLVal, defVVal)}
      </div>
      <div class="admin-footer">
        <span class="match-points ${savedItem ? 'pts-saved' : 'pts-pending'}">${savedItem ? 'Guardado' : 'Sin pronóstico'}</span>
      </div>
      <div class="edit-actions">
        <button type="button" class="btn-secondary btn-clear-admin-prediction">Limpiar</button>
        <button type="button" class="btn-primary btn-save-admin-prediction">Guardar</button>
      </div>
    </div>`;
}

function renderAdminPredictions() {
  const el = document.getElementById('adminContent');
  if (!el) return;
  renderAdminPredictionPersonSelect();
  if (!state.adminPredictionPerson) {
    el.innerHTML = '<div class="loading">No hay participantes.</div>';
    return;
  }

  const meta = state.pronosticosMeta[state.adminPredictionPerson] || { items: {} };
  const savedItems = meta.items || {};
  const preds = state.pronosticos[state.adminPredictionPerson] || [];
  const predMap = {};
  preds.forEach(pr => { predMap[pr.id] = pr; });
  const matches = knockoutResolvedMatches(predMap)
    .filter(m => adminPredictionMatches().some(x => x.id === m.id))
    .sort(compareMatchesChronologically);

  el.innerHTML = renderAdminPredictionMatchesByDay(matches, predMap, savedItems);
  attachAdminPredictionListeners();
}

function adminPredictionPredMap(person = state.adminPredictionPerson) {
  const preds = state.pronosticos[person] || [];
  const predMap = {};
  preds.forEach(pr => { predMap[pr.id] = pr; });
  return predMap;
}

function findAdminPredictionMatch(matchId) {
  return knockoutResolvedMatches(adminPredictionPredMap())
    .find(m => Number(m.id) === Number(matchId))
    || findResolvedKnockoutMatch(matchId)
    || findAnyMatch(matchId);
}

function renderAdminPredictionMatchesByDay(matches, predMap, savedItems) {
  const groups = [];
  const indexByKey = new Map();
  const SIN_FECHA = '__sin_fecha__';
  const ordered = [...matches].sort(compareMatchesChronologically);
  for (const m of ordered) {
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
        ${g.matches.map(m => buildAdminPredictionCard(m, predMap[m.id], savedItems[String(m.id)])).join('')}
      </div>
    </div>`).join('');
}

function attachAdminPredictionListeners() {
  document.querySelectorAll('.editable-admin-prediction-card').forEach(card => {
    const matchId = Number(card.dataset.matchId);
    const updateDefinitionVisibility = () => {
      const lRaw = card.querySelector(`input[name="admin_pred_l_${matchId}"]`)?.value ?? '';
      const vRaw = card.querySelector(`input[name="admin_pred_v_${matchId}"]`)?.value ?? '';
      const definition = card.querySelector('.admin-prediction-definition');
      const tied = lRaw !== '' && vRaw !== '' && Number(lRaw) === Number(vRaw);
      if (definition) definition.hidden = !tied;
    };
    card.querySelectorAll('.admin-pred-score-input').forEach(input => {
      input.addEventListener('input', updateDefinitionVisibility);
    });
    attachWinnerChoiceListeners(card);
    card.querySelector('.btn-save-admin-prediction')?.addEventListener('click', () => saveAdminPrediction(matchId));
    card.querySelector('.btn-clear-admin-prediction')?.addEventListener('click', () => clearAdminPrediction(matchId));
  });
}

function readDefinitionScoreFromCard(card) {
  const lRaw = card.querySelector('input[name="def_l"]')?.value ?? '';
  const vRaw = card.querySelector('input[name="def_v"]')?.value ?? '';
  return {
    defL: lRaw === '' ? null : Number(lRaw),
    defV: vRaw === '' ? null : Number(vRaw),
  };
}

async function writeAdminPredictionItems(person, items) {
  if (!isAdminSession()) throw new Error('Sin permisos de admin');
  if (!db) throw new Error('Sin conexión');
  const { doc, setDoc, serverTimestamp } = firestoreFns;
  const meta = state.pronosticosMeta[person] || { items: {}, compartirPronosticos: true };
  await setDoc(doc(db, 'pronosticos', person), {
    items,
    compartirPronosticos: meta.compartirPronosticos !== false,
    actualizado: serverTimestamp(),
  }, { merge: true });
}

async function saveAdminPrediction(matchId) {
  const person = state.adminPredictionPerson;
  const card = document.querySelector(`.editable-admin-prediction-card[data-match-id="${matchId}"]`);
  const match = findAdminPredictionMatch(matchId);
  if (!person || !card || !match) return;

  const lRaw = card.querySelector(`input[name="admin_pred_l_${matchId}"]`)?.value ?? '';
  const vRaw = card.querySelector(`input[name="admin_pred_v_${matchId}"]`)?.value ?? '';
  const validated = validateScoreInputs(lRaw, vRaw);
  if (validated.error) {
    showToast(validated.error, true);
    return;
  }

  const item = { l: validated.gl, v: validated.gv };
  if (isKnockoutMatch(match)) {
    if (matchTied(validated.gl, validated.gv)) {
      const definition = card.querySelector('.definition-choice-btn.active')?.dataset.definition || 'te';
      const { defL, defV } = readDefinitionScoreFromCard(card);
      const validatedDefinition = validateDefinitionScore(defL, defV, match, null, definition, validated.gl, validated.gv);
      if (validatedDefinition.error) {
        showToast(validatedDefinition.error, true);
        return;
      }
      item.ganador = validatedDefinition.ganador;
      item.definicion = definition;
      item.defL = validatedDefinition.defL;
      item.defV = validatedDefinition.defV;
    } else {
      item.ganador = winnerFromScore(match.local, match.visitante, validated.gl, validated.gv);
    }
  }

  try {
    const meta = state.pronosticosMeta[person] || { items: {} };
    await writeAdminPredictionItems(person, {
      ...(meta.items || {}),
      [String(matchId)]: item,
    });
    showToast('Pronóstico guardado', false);
  } catch (err) {
    showToast(err.message || 'No se pudo guardar el pronóstico', true);
  }
}

async function clearAdminPrediction(matchId) {
  const person = state.adminPredictionPerson;
  if (!person) return;
  const ok = confirm('¿Limpiar este pronóstico?');
  if (!ok) return;
  try {
    const meta = state.pronosticosMeta[person] || { items: {} };
    const nextItems = { ...(meta.items || {}) };
    delete nextItems[String(matchId)];
    await writeAdminPredictionItems(person, nextItems);
    showToast('Pronóstico limpiado', false);
  } catch (err) {
    showToast(err.message || 'No se pudo limpiar el pronóstico', true);
  }
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
      handleClientLiveSyncError(err);
      if (isApiFootballQuotaError(err)) {
        showToast('API-Football ya no tiene cuota por hoy.', true);
      } else if (isApiFootballSeasonBlockedError(err)) {
        showToast('Tu plan de API-Football no permite consultar temporada 2026.', true);
      } else {
        showToast('No se pudo actualizar desde API-Football.', true);
      }
    });
}

// ============================================================
// Guardar un pronóstico (por partido)
// ============================================================
async function saveSingleMatch(matchId, gl, gv, ganador = null, definicion = null, defL = null, defV = null) {
  if (!state.session) throw new Error('Inicia sesión');
  if (!db) throw new Error('Sin conexión');

  await syncInternetClock();

  const clave = state.session.clave;
  const meta = state.pronosticosMeta[clave] || { items: {} };
  const saved = meta.items || {};

  if (saved[String(matchId)]) throw new Error('Ese pronóstico ya está guardado');

  const m = findAnyMatch(matchId);
  if (!m || matchHasScore(m)) throw new Error('Ese partido ya no se puede pronosticar');
  if (!knockoutTeamsResolved(m)) throw new Error('Esta llave todavía no está cerrada. Podrás pronosticar cuando ambos equipos estén definidos.');
  if (matchStarted(m)) throw new Error('Ya cerró el tiempo para pronosticar este partido');

  const { doc, setDoc, serverTimestamp } = firestoreFns;
  const item = { l: gl, v: gv };
  if (isKnockoutMatch(m)) {
    const winner = normalizedWinner(ganador) || winnerFromScore(m.local, m.visitante, gl, gv);
    if (winner) item.ganador = winner;
    if (matchTied(gl, gv) && definicion) {
      const validatedDefinition = validateDefinitionScore(defL, defV, m, winner, definicion, gl, gv);
      if (validatedDefinition.error) throw new Error(validatedDefinition.error);
      item.definicion = definicion;
      item.defL = validatedDefinition.defL;
      item.defV = validatedDefinition.defV;
    }
  }

  await setDoc(doc(db, 'pronosticos', clave), {
    items: { ...saved, [String(matchId)]: item },
    actualizado: serverTimestamp(),
  }, { merge: true });
}

// ============================================================
// Scoring
// ============================================================
function scoreByAdvancingTeamEnabled() {
  return CONFIG.features?.knockoutScoreByAdvancingTeam !== false;
}

function getOutcome(golesL, golesV) {
  if (golesL === null || golesV === null) return null;
  if (golesL > golesV) return 'L';
  if (golesL < golesV) return 'V';
  return 'E';
}

function calcKnockoutPointsLegacy(pr, match) {
  if (!pr || !matchHasScore(match)) return 0;
  const predL = pr.golesLocal;
  const predV = pr.golesVisitante;
  const realL = match.golesLocal;
  const realV = match.golesVisitante;
  if (realL === null || realV === null) return null;
  if (predL === null || predV === null) return 0;

  let pts = 0;
  if (getOutcome(predL, predV) === getOutcome(realL, realV)) {
    pts += 3;
  }
  if (predL === realL && predV === realV) pts += 1;
  return pts;
}

function calcKnockoutPointsByAdvancingTeam(pr, match) {
  if (!pr || !matchHasScore(match)) return 0;
  const predL = pr.golesLocal;
  const predV = pr.golesVisitante;
  const realL = match.golesLocal;
  const realV = match.golesVisitante;
  if (realL === null || realV === null) return null;
  if (predL === null || predV === null) return 0;

  let pts = 0;
  const predWinner = normalizedWinner(inferredPredictionWinner(pr, match));
  const realWinner = normalizedWinner(inferredWinner(match));
  if (predWinner && realWinner && predWinner === realWinner) {
    pts += 3;
  }
  if (predL === realL && predV === realV) pts += 1;
  return pts;
}

function calcKnockoutPoints(pr, match) {
  return scoreByAdvancingTeamEnabled()
    ? calcKnockoutPointsByAdvancingTeam(pr, match)
    : calcKnockoutPointsLegacy(pr, match);
}

function buildPodio(partidos, participantes, pronosticos) {
  const scores = participantes.map(p => {
    let total = 0, played = 0, aciertos = 0;
    const preds = pronosticos[p.clave] || [];
    const predMap = {};
    preds.forEach(pr => { predMap[pr.id] = pr; });

    for (const m of partidos) {
      if (!isKnockoutMatch(m)) continue;
      // Solo contar partidos finalizados con marcador definitivo para puntuar
      if (!matchFinalized(m) || !matchHasScore(m)) continue;
      played++;
      const pr = predMap[m.id];
      if (pr) {
        const pts = calcKnockoutPoints(pr, m) || 0;
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

function teamBlock(str, side, winner = null) {
  const { flag, name } = splitFlag(str);
  const isWinner = normalizedWinner(str) === normalizedWinner(winner);
  return `
    <div class="match-team ${side}${isWinner ? ' is-winner' : ''}">
      <span class="team-flag">${flag}</span>
      <span class="team-name">
        <span class="team-name-text">${name}</span>
        ${isWinner ? '<span class="team-winner-check" aria-label="Ganador">✓</span>' : ''}
      </span>
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
  const containers = [
    document.getElementById('personTabs'),
    document.getElementById('finalesPersonTabs'),
  ].filter(Boolean);
  if (!containers.length) return;
  const ordered = state.podio.length
    ? state.podio.map(p => ({ clave: p.clave, nombreVisible: p.nombre }))
    : state.participantes;
  const html = ordered.map(p => {
    const isMe = state.session && state.session.clave === p.clave;
    return `
    <button class="person-tab ${state.selectedPerson === p.clave ? 'active' : ''}" data-person="${p.clave}">
      ${p.nombreVisible}${isMe ? ' <span class="tab-me">(tú)</span>' : ''}
    </button>`;
  }).join('');
  containers.forEach(el => {
    el.innerHTML = html;
    el.querySelectorAll('.person-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.editingMatchId !== null) {
          const ok = confirm('Tienes un pronóstico sin guardar. ¿Descartarlo y cambiar de persona?');
          if (!ok) return;
          state.editingMatchId = null;
        }
        state.selectedPerson = btn.dataset.person;
        renderPersonTabs();
        if (knockoutEnabled() && state.activeView === 'finales') renderFinales();
        else if (state.activeView !== 'quiniela') renderPersonDetail();
      });
    });
  });
}

function renderPersonDetail({ resetScroll = false } = {}) {
  const scrollY = resetScroll ? null : window.scrollY;
  const person = state.selectedPerson;
  if (!person) return;
  const summaryEl = document.getElementById('personSummary');
  const contentEl = document.getElementById('personContent');
  if (!summaryEl || !contentEl) return;

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

  summaryEl.innerHTML = `
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
  contentEl.innerHTML = renderMatchesFlat(dayMatches, ctx);

  attachEditingListeners(contentEl);
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
  if (document.getElementById('viewAdmin')?.classList.contains('active')) {
    return state.adminSection === 'results' ? 'admin' : null;
  }
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
  const canSeePrediction = canViewPredictionForMatch(m, { isOwn, sharesPredictions });
  const saved = savedItems[String(m.id)];
  const pr = predMap[m.id];
  const actualWinner = isPlayed && isKnockoutMatch(m) ? inferredWinner(m) : null;
  const teams = `
        <div class="client-matchup-panel">
          <div class="match-teams">${teamBlock(m.local, 'home', actualWinner)}<span class="match-vs">vs</span>${teamBlock(m.visitante, 'away', actualWinner)}</div>
        </div>`;
  const teamsResolved = knockoutTeamsResolved(m);

  // Editable: es tu propia quiniela, partido no jugado, sin pronóstico guardado y antes del kickoff
  if (isOwn && !isPlayed && !saved && !matchStarted(m) && teamsResolved) {
    return `
      <div class="match-card client-match-card form-card editable-card" data-match-id="${m.id}">
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
  const pts = isPlayed && hasPred ? calcKnockoutPoints(pr, m) : 0;
  const predL = hasPred ? pr.golesLocal : '–';
  const predV = hasPred ? pr.golesVisitante : '–';
  const realL = hasRealScore ? m.golesLocal : '–';
  const realV = hasRealScore ? m.golesVisitante : '–';
  const predWinnerChip = hasPred && isKnockoutMatch(m) && matchTied(pr.golesLocal, pr.golesVisitante)
    ? winnerChipHTML('Pasa', inferredPredictionWinner(pr, m), pr.definicion || 'te', pr.definicionLocal, pr.definicionVisitante)
    : '';
  const realWinnerChip = hasRealScore && isKnockoutMatch(m) && matchTied(m.golesLocal, m.golesVisitante)
    ? winnerChipHTML('Pasó', inferredWinner(m), m.definicion, m.definicionLocal, m.definicionVisitante)
    : '';
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
  } else if (!teamsResolved) {
    ptsHTML = `<span class="match-points pts-waiting">Llave por definir</span>`;
  } else {
    ptsHTML = `<span class="match-points pts-pending">Por jugar</span>`;
  }

  return `
    <div class="match-card client-match-card ${stateClass}" data-match-id="${m.id}">
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
          ${predWinnerChip}
        </div>
        <div class="score-row real">
          <span class="score-num ${hasRealScore ? '' : 'empty'}">${realL}</span>
          <span class="score-row-label">Resultado</span>
          <span class="score-num ${hasRealScore ? '' : 'empty'}">${realV}</span>
          ${realWinnerChip}
        </div>
      </div>
      `}
      <div class="match-footer">${ptsHTML}</div>
    </div>`;
}

function renderMatchesFlat(partidos, ctx) {
  return partidos.map(m => buildMatchCard(m, ctx)).join('');
}

function canViewPredictionForMatch(match, { isOwn, sharesPredictions }) {
  if (isOwn || sharesPredictions !== false) return true;
  return matchLive(match) || matchHalftime(match) || matchFinalized(match);
}

function knockoutRoundTitle(roundKey) {
  if (roundKey === 'third') return 'Tercer lugar';
  return KNOCKOUT_ROUNDS.find(r => r.key === roundKey)?.title || 'Fase final';
}

function isBracketRound(roundKey) {
  return KNOCKOUT_ROUNDS.some(r => r.key === roundKey);
}

function isFinalesRound(roundKey) {
  return isBracketRound(roundKey) || roundKey === 'third';
}

function matchTimeValue(match) {
  const time = match?.fecha instanceof Date ? match.fecha.getTime() : NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareMatchesChronologically(a, b) {
  return matchTimeValue(a) - matchTimeValue(b) || Number(a.id) - Number(b.id);
}

function normalizeKnockoutMatch(base, overrides = {}) {
  const date = base.fecha || (base.date && base.timeET ? etToDate(base.date, base.timeET) : null);
  return {
    docId: base.docId || `ko-${base.id}`,
    id: base.id,
    local: overrides.local || base.local || `🏳️ Ganador ${base.sourceA || ''}`.trim(),
    visitante: overrides.visitante || base.visitante || `🏳️ Ganador ${base.sourceB || ''}`.trim(),
    golesLocal: overrides.golesLocal ?? base.golesLocal ?? null,
    golesVisitante: overrides.golesVisitante ?? base.golesVisitante ?? null,
    estado: overrides.estado || base.estado || null,
    faseEnVivo: overrides.faseEnVivo ?? base.faseEnVivo ?? null,
    fecha: date,
    round: base.round,
    roundOrder: base.roundOrder,
    roundTitle: knockoutRoundTitle(base.round),
    sourceA: base.sourceA,
    sourceB: base.sourceB,
    ganador: overrides.ganador ?? base.ganador ?? null,
    definicion: overrides.definicion ?? base.definicion ?? null,
    definicionLocal: overrides.definicionLocal ?? base.definicionLocal ?? base.defL ?? null,
    definicionVisitante: overrides.definicionVisitante ?? base.definicionVisitante ?? base.defV ?? null,
  };
}

function baseKnockoutMatches() {
  return KNOCKOUT_BASE_MATCHES.map(m => normalizeKnockoutMatch(m));
}

function applyKnockoutVisualLayout(match) {
  const layout = KNOCKOUT_VISUAL_LAYOUT[match.id];
  return layout ? { ...match, ...layout } : match;
}

function knockoutMatchesSource() {
  const fromFirestore = state.partidos.filter(isKnockoutMatch);
  return (fromFirestore.length ? fromFirestore : baseKnockoutMatches()).map(applyKnockoutVisualLayout);
}

function findAnyMatch(matchId) {
  const id = Number(matchId);
  if (id >= KNOCKOUT_ID_START) {
    return findResolvedKnockoutMatch(id)
      || state.partidos.find(x => x.id === id)
      || knockoutMatchesSource().find(x => x.id === id)
      || null;
  }

  return state.partidos.find(x => x.id === id)
    || knockoutMatchesSource().find(x => x.id === id)
    || null;
}

function winnerFromScore(local, visitante, gl, gv) {
  if (gl === null || gv === null || gl === gv) return null;
  return gl > gv ? local : visitante;
}

function loserFromWinner(match, winner) {
  const normalized = normalizedWinner(winner);
  if (!match || !normalized) return null;
  if (normalizedWinner(match.local) === normalized) return match.visitante;
  if (normalizedWinner(match.visitante) === normalized) return match.local;
  return null;
}

function winnerDefinitionText(definicion) {
  if (definicion === 'penales') return 'Penales';
  if (definicion === 'te') return 'Tiempo Extra';
  return null;
}

function winnerChipHTML(prefix, winner, definicion, scoreLocal = null, scoreVisitante = null) {
  const selected = normalizedWinner(winner);
  if (!selected) return '';
  const { flag, name } = splitFlag(selected);
  const suffix = winnerDefinitionText(definicion);
  const hasDefinitionScore = Number.isInteger(scoreLocal) && Number.isInteger(scoreVisitante);
  const label = suffix
    ? `En ${suffix}`
    : `${prefix} ${flag ? `<span class="winner-chip-flag">${flag}</span>` : ''}<span>${name || selected}</span>${suffix ? ` <span>en ${suffix}</span>` : ''}`;
  return `
    <div class="winner-chip ${hasDefinitionScore ? 'has-definition-score' : ''}">
      ${hasDefinitionScore ? `<span class="winner-chip-score">${scoreLocal}</span>` : ''}
      <span class="winner-chip-text">${label}</span>
      ${hasDefinitionScore ? `<span class="winner-chip-score">${scoreVisitante}</span>` : ''}
    </div>`;
}

function knockoutResolvedMatches(predMap = {}) {
  const resolved = new Map();
  const sourceMatches = knockoutMatchesSource();
  for (const base of sourceMatches) {
    const sourceHome = base.sourceA ? resolved.get(base.sourceA) : null;
    const sourceAway = base.sourceB ? resolved.get(base.sourceB) : null;
    const pr = predMap[base.id];
    const sourceAResult = base.round === 'third' ? sourceHome?.loser : sourceHome?.winner;
    const sourceBResult = base.round === 'third' ? sourceAway?.loser : sourceAway?.winner;
    const sourceLabel = base.round === 'third' ? 'Perdedor' : 'Ganador';
    const local = sourceAResult || base.local || `🏳️ ${sourceLabel} Partido ${base.sourceA}`;
    const visitante = sourceBResult || base.visitante || `🏳️ ${sourceLabel} Partido ${base.sourceB}`;
    const match = normalizeKnockoutMatch(base, { local, visitante });
    const predictedWinner = inferredPredictionWinner(pr, match);
    const actualWinner = matchFinalized(match) ? inferredWinner(match) : null;
    const winner = actualWinner || null;
    const loser = loserFromWinner(match, winner);
    match.predictedWinner = predictedWinner;
    match.actualWinner = actualWinner;
    resolved.set(base.id, { ...match, winner, loser });
  }
  return sourceMatches.map(base => resolved.get(base.id));
}

function findResolvedKnockoutMatch(matchId) {
  const id = Number(matchId);
  return knockoutResolvedMatches().find(m => m?.id === id) || null;
}

function championInfo(knockoutMatches) {
  const final = knockoutMatches.find(m => m.id === 103);
  const champion = final?.winner || 'Campeón por definir';
  const leaders = final?.winner
    ? state.podio.filter(p => p.rank === 1)
    : [];
  const quinielaWinner = leaders.length
    ? leaders.map(p => p.nombre).join(', ')
    : '-';
  return { champion, quinielaWinner };
}

function buildChampionHeader(knockoutMatches) {
  const { champion, quinielaWinner } = championInfo(knockoutMatches);
  const { flag, name } = splitFlag(champion);
  return `
    <div class="finales-winner-card finales-quiniela-card">
      <div class="finales-winner-label">Ganador de la quiniela</div>
      <div class="finales-quiniela-name">
        <span class="finales-crown" aria-hidden="true">♕</span>
        <span>${quinielaWinner}</span>
      </div>
    </div>
    <div class="finales-champion">
      <div class="finales-champion-label">Campeón del mundo</div>
      <div class="finales-champion-team">
        <span class="finales-champion-flag">${flag || '🏳️'}</span>
        <span>${name || champion}</span>
      </div>
    </div>`;
}

function buildWorldCupStage(knockoutMatches) {
  const finalMatch = knockoutMatches.find(m => m.id === 103);
  const hasWinner = !!finalMatch?.winner;
  return `
    <div class="finales-cup-stage">
      ${buildChampionHeader(knockoutMatches)}
      <div class="finales-cup-wrap ${hasWinner ? 'has-winner' : ''}" aria-hidden="true">
        <span class="finales-particle p1"></span>
        <span class="finales-particle p2"></span>
        <span class="finales-particle p3"></span>
        <img class="finales-cup-img" src="assets/world-cup.png" alt="">
      </div>
    </div>`;
}

function knockoutCardWrap(match, ctx) {
  return `
    <div class="bracket-match" data-match-id="${match.id}" style="--match-top: ${knockoutTop(match)}px;">
      ${buildMatchCard(match, ctx)}
    </div>`;
}

function knockoutTop(match) {
  const round = match.round;
  const order = match.roundOrder || 0;
  if (round === 'r32' || round === 'r32-right') return order * KNOCKOUT_SLOT_HEIGHT;
  if (round === 'r16' || round === 'r16-right') return (order * 2 + 0.5) * KNOCKOUT_SLOT_HEIGHT;
  if (round === 'qf' || round === 'qf-right') return (order * 4 + 1.5) * KNOCKOUT_SLOT_HEIGHT;
  if (round === 'sf' || round === 'sf-right') return 3.5 * KNOCKOUT_SLOT_HEIGHT;
  if (round === 'third') return 4.42 * KNOCKOUT_SLOT_HEIGHT;
  return 3.5 * KNOCKOUT_SLOT_HEIGHT;
}

function knockoutColumnIndex(roundKey) {
  if (roundKey === 'third') return knockoutColumnIndex('final');
  return KNOCKOUT_ROUNDS.findIndex(r => r.key === roundKey);
}

function knockoutPoint(match, side) {
  const col = knockoutColumnIndex(match.round);
  const x = col * (KNOCKOUT_CARD_WIDTH + KNOCKOUT_COL_GAP)
    + (side === 'right' ? KNOCKOUT_CARD_WIDTH : 0);
  const y = knockoutTop(match) + KNOCKOUT_CARD_MID;
  return { x, y };
}

function connectorPath(fromMatch, toMatch) {
  const fromCol = knockoutColumnIndex(fromMatch.round);
  const toCol = knockoutColumnIndex(toMatch.round);
  const fromLeftSide = fromCol < toCol;
  const start = knockoutPoint(fromMatch, fromLeftSide ? 'right' : 'left');
  const end = knockoutPoint(toMatch, fromLeftSide ? 'left' : 'right');
  const middle = fromLeftSide
    ? start.x + (end.x - start.x) * 0.5
    : end.x + (start.x - end.x) * 0.5;
  return `M ${start.x} ${start.y} H ${middle} V ${end.y} H ${end.x}`;
}

function buildKnockoutConnectors(knockoutMatches) {
  const byId = new Map(knockoutMatches.map(m => [m.id, m]));
  const paths = [];
  for (const match of knockoutMatches) {
    if (match.round === 'third') continue;
    if (!match.sourceA || !match.sourceB) continue;
    const sourceA = byId.get(match.sourceA);
    const sourceB = byId.get(match.sourceB);
    if (sourceA) paths.push(connectorPath(sourceA, match));
    if (sourceB) paths.push(connectorPath(sourceB, match));
  }
  return `
    <svg class="bracket-connectors" viewBox="0 0 ${knockoutBoardInnerWidth()} ${knockoutBoardInnerHeight()}" aria-hidden="true">
      ${paths.map(d => `<path d="${d}"></path>`).join('')}
    </svg>`;
}

function todayKeyCDMX() {
  return cdmxDateKey(new Date(nowMs()));
}

function getFinalesDayGroups(matches) {
  const groups = [];
  const indexByKey = new Map();
  const SIN_FECHA = '__sin_fecha__';
  const ordered = [...matches].sort(compareMatchesChronologically);
  for (const m of ordered) {
    const key = m.fecha ? dayKeyCDMX(m.fecha) : SIN_FECHA;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        tabLabel: m.fecha ? formatDayTabCDMX(m.fecha) : 'Sin fecha',
        headerLabel: m.fecha ? formatDayHeaderCDMX(m.fecha) : 'Fecha por definir',
        matches: [],
      });
    }
    groups[indexByKey.get(key)].matches.push(m);
  }
  return groups;
}

function ensureFinalesSelectedDay(matches) {
  const groups = getFinalesDayGroups(matches);
  if (!groups.length) return null;
  if (state.finalesSelectedDay && groups.some(g => g.key === state.finalesSelectedDay)) return state.finalesSelectedDay;
  const today = todayKeyCDMX();
  state.finalesSelectedDay = groups.some(g => g.key === today) ? today : groups[0].key;
  return state.finalesSelectedDay;
}

function centerActiveFinalesDayTab() {
  const container = document.getElementById('finalesDayTabs');
  if (!container) return;
  const active = container.querySelector('.day-tab.active');
  if (!active) return;
  requestAnimationFrame(() => {
    const target = active.offsetLeft - container.clientWidth / 2 + active.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  });
}

function renderFinalesDayTabs(matches) {
  const el = document.getElementById('finalesDayTabs');
  if (!el) return;
  const show = state.finalesMode === 'list';
  el.hidden = !show;
  if (!show) {
    el.innerHTML = '';
    return;
  }
  const groups = getFinalesDayGroups(matches);
  if (!groups.length) {
    el.innerHTML = '';
    return;
  }
  ensureFinalesSelectedDay(matches);
  el.innerHTML = groups.map(g => `
    <button type="button" class="day-tab ${state.finalesSelectedDay === g.key ? 'active' : ''}" data-day="${g.key}">
      ${g.tabLabel}
    </button>`).join('');
  el.querySelectorAll('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.day === state.finalesSelectedDay) return;
      if (state.editingMatchId !== null) {
        const ok = confirm('Tienes un pronóstico sin guardar. ¿Descartarlo y cambiar de fecha?');
        if (!ok) return;
        state.editingMatchId = null;
        state.pendingSave = null;
      }
      state.finalesSelectedDay = btn.dataset.day;
      renderFinales();
    });
  });
  centerActiveFinalesDayTab();
}

function renderFinalesList(knockoutMatches, ctx) {
  const selectedDay = ensureFinalesSelectedDay(knockoutMatches);
  const groups = getFinalesDayGroups(knockoutMatches);
  const selectedGroup = groups.find(g => g.key === selectedDay);
  const dayMatches = (selectedGroup?.matches || [])
    .sort(compareMatchesChronologically);
  const label = selectedGroup?.headerLabel || 'Fecha por definir';

  if (!dayMatches.length) {
    return `
      <div class="finales-list">
        <div class="day-group">
          <h3 class="day-header">${label}</h3>
          <div class="finales-empty-list">
            <strong>No hay partidos</strong>
            <span>Elige otra fecha o cambia a Llave para ver toda la fase final.</span>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="finales-list">
      <div class="day-group">
        <h3 class="day-header">${label}</h3>
        <div class="day-matches">
          ${renderMatchesFlat(dayMatches, ctx)}
        </div>
      </div>
    </div>`;
}

function knockoutBoardInnerWidth() {
  return KNOCKOUT_ROUNDS.length * KNOCKOUT_CARD_WIDTH
    + (KNOCKOUT_ROUNDS.length - 1) * KNOCKOUT_COL_GAP;
}

function knockoutBoardInnerHeight() {
  return 8 * KNOCKOUT_SLOT_HEIGHT + KNOCKOUT_CARD_MID;
}

function knockoutBoardTotalWidth() {
  return knockoutBoardInnerWidth() + KNOCKOUT_BOARD_PADDING_X * 2;
}

function knockoutBoardTotalHeight() {
  return knockoutBoardInnerHeight() + KNOCKOUT_BOARD_PADDING_TOP + 120;
}

function finalesFitZoom() {
  const viewport = document.getElementById('finalesViewport');
  if (!viewport) return 0.5;
  const widthZoom = viewport.clientWidth / knockoutBoardTotalWidth();
  const heightZoom = viewport.clientHeight / knockoutBoardTotalHeight();
  return Math.min(KNOCKOUT_ZOOM_MAX, Math.min(widthZoom, heightZoom));
}

function finalesMinZoom() {
  return Math.max(0.08, finalesFitZoom());
}

function clampFinalesZoom(value) {
  return Math.max(finalesMinZoom(), Math.min(KNOCKOUT_ZOOM_MAX, value));
}

function applyFinalesZoom() {
  const board = document.getElementById('finalesBoard');
  if (!board) return;
  const totalWidth = knockoutBoardTotalWidth();
  const totalHeight = knockoutBoardTotalHeight();
  const zoom = state.knockoutZoom;
  board.style.setProperty('--finales-zoom', zoom);
  board.style.setProperty('--bracket-scaled-width', `${Math.ceil(totalWidth * zoom)}px`);
  board.style.setProperty('--bracket-scaled-height', `${Math.ceil(totalHeight * zoom)}px`);
  board.style.setProperty('--bracket-offset-x', `${KNOCKOUT_BOARD_PADDING_X * zoom}px`);
  board.style.setProperty('--bracket-offset-y', `${KNOCKOUT_BOARD_PADDING_TOP * zoom}px`);
}

function setFinalesZoom(nextZoom, origin = null) {
  const viewport = document.getElementById('finalesViewport');
  const previousZoom = state.knockoutZoom;
  const next = Number(clampFinalesZoom(nextZoom).toFixed(4));
  if (!viewport || Math.abs(next - previousZoom) < 0.001) return;

  const rect = viewport.getBoundingClientRect();
  const originX = origin ? origin.clientX - rect.left : viewport.clientWidth / 2;
  const originY = origin ? origin.clientY - rect.top : viewport.clientHeight / 2;
  const sceneX = (viewport.scrollLeft + originX) / previousZoom;
  const sceneY = (viewport.scrollTop + originY) / previousZoom;

  state.knockoutZoom = next;
  applyFinalesZoom();

  viewport.scrollLeft = sceneX * next - originX;
  viewport.scrollTop = sceneY * next - originY;
}

function renderFinales() {
  const board = document.getElementById('finalesBoard');
  if (!board) return;
  const viewport = document.getElementById('finalesViewport');
  const person = state.selectedPerson || state.session?.clave;
  const isOwn = !!(state.session && state.session.clave === person);
  const meta = state.pronosticosMeta[person] || { items: {} };
  const savedItems = meta.items || {};
  const sharesPredictions = meta.compartirPronosticos !== false;
  const preds = state.pronosticos[person] || [];
  const predMap = {};
  preds.forEach(pr => { predMap[pr.id] = pr; });

  const bracketPredMap = (isOwn || sharesPredictions !== false) ? predMap : {};
  const knockoutMatches = knockoutResolvedMatches(bracketPredMap)
    .filter(m => isFinalesRound(m.round));
  const bracketMatches = knockoutMatches.filter(m => isBracketRound(m.round));
  const ctx = { isOwn, savedItems, predMap, sharesPredictions };

  document.querySelectorAll('.finales-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.finalesMode === state.finalesMode);
  });
  document.body.classList.toggle('finales-list-mode', state.finalesMode === 'list');
  document.querySelector('.finales-controls')?.toggleAttribute('hidden', state.finalesMode !== 'bracket');
  viewport?.classList.toggle('is-list-mode', state.finalesMode === 'list');
  board.classList.toggle('is-list-mode', state.finalesMode === 'list');
  renderFinalesDayTabs(knockoutMatches);

  if (state.finalesMode === 'list') {
    board.innerHTML = renderFinalesList(knockoutMatches, ctx);
    attachEditingListeners(board);
    attachFinalesCardCentering(board);
    updateFinalesNavButtons();
    return;
  }

  const columns = KNOCKOUT_ROUNDS.map(round => {
    const matches = bracketMatches
      .filter(m => m.round === round.key)
      .sort((a, b) => a.roundOrder - b.roundOrder);
    const thirdPlace = round.key === 'final'
      ? knockoutMatches.find(m => m.round === 'third')
      : null;
    const cup = round.key === 'final' ? buildWorldCupStage(knockoutMatches) : '';
    return `
      <section class="bracket-round ${round.className}" data-round="${round.key}">
        <h3 class="bracket-round-title">${round.title}</h3>
        <div class="bracket-round-matches">
          ${cup}
          ${matches.map(m => knockoutCardWrap(m, ctx)).join('')}
          ${thirdPlace ? knockoutCardWrap(thirdPlace, ctx) : ''}
        </div>
      </section>`;
  }).join('');

  state.knockoutZoom = clampFinalesZoom(state.knockoutZoom);
  board.style.setProperty('--finales-zoom', state.knockoutZoom);
  board.style.setProperty('--bracket-card-width', `${KNOCKOUT_CARD_WIDTH}px`);
  board.style.setProperty('--bracket-col-gap', `${KNOCKOUT_COL_GAP}px`);
  board.style.setProperty('--bracket-inner-width', `${knockoutBoardInnerWidth()}px`);
  board.style.setProperty('--bracket-inner-height', `${knockoutBoardInnerHeight()}px`);
  board.style.setProperty('--bracket-pad-x', `${KNOCKOUT_BOARD_PADDING_X}px`);
  board.style.setProperty('--bracket-pad-top', `${KNOCKOUT_BOARD_PADDING_TOP}px`);
  board.innerHTML = `
    <div class="bracket-canvas">
      ${buildKnockoutConnectors(bracketMatches)}
      <div class="bracket-grid">${columns}</div>
    </div>`;
  applyFinalesZoom();
  initFinalesGestures();
  attachEditingListeners(document.getElementById('finalesBoard'));
  attachFinalesCardCentering(document.getElementById('finalesBoard'));
  updateFinalesNavButtons();
}

function focusFinalesMatch(matchId, options = {}) {
  const behavior = options.behavior || 'auto';
  const viewport = document.getElementById('finalesViewport');
  const match = knockoutMatchesSource().find(m => m.id === matchId);
  if (!viewport || !match) return;
  const card = document.querySelector(`#finalesBoard .bracket-match[data-match-id="${matchId}"] .match-card`);
  if (!card) return;
  const tabs = document.getElementById('finalesPersonTabs');
  const nav = document.getElementById('bottomNav');
  const viewportRect = viewport.getBoundingClientRect();
  const visibleTop = Math.max(viewportRect.top, tabs?.getBoundingClientRect().bottom || viewportRect.top);
  const visibleBottom = Math.min(
    viewportRect.bottom,
    nav && nav.style.display !== 'none' ? nav.getBoundingClientRect().top : viewportRect.bottom
  );
  const zoom = clampFinalesZoom(KNOCKOUT_FOCUS_ZOOM);
  const col = knockoutColumnIndex(match.round);
  const cardCenterX = (
    KNOCKOUT_BOARD_PADDING_X
    + col * (KNOCKOUT_CARD_WIDTH + KNOCKOUT_COL_GAP)
    + KNOCKOUT_CARD_WIDTH / 2
  ) * zoom;
  const cardCenterY = (
    KNOCKOUT_BOARD_PADDING_TOP
    + knockoutTop(match)
    + (card.offsetHeight || KNOCKOUT_CARD_MID * 2) / 2
  ) * zoom;
  const visibleCenterY = (visibleTop - viewportRect.top) + (visibleBottom - visibleTop) / 2;

  state.focusedFinalesMatchId = match.id;
  if (behavior === 'smooth') {
    setFinalesZoom(zoom);
  } else {
    state.knockoutZoom = zoom;
    applyFinalesZoom();
  }

  viewport.scrollTo({
    left: Math.max(0, cardCenterX - viewport.clientWidth / 2),
    top: Math.max(0, cardCenterY - visibleCenterY),
    behavior,
  });

  updateFinalesNavButtons();
}

function centerFinalesCard(matchId) {
  const viewport = document.getElementById('finalesViewport');
  if (!viewport || !matchId) return;
  if (state.finalesMode === 'bracket') {
    focusFinalesMatch(Number(matchId), { behavior: 'auto' });
    return;
  }

  state.focusedFinalesMatchId = Number(matchId);
  updateFinalesNavButtons();
  requestAnimationFrame(() => {
    const card = document.querySelector(`#finalesBoard .match-card[data-match-id="${matchId}"]`);
    if (!card) return;
    const tabs = document.getElementById('finalesPersonTabs');
    const nav = document.getElementById('bottomNav');
    const cardRect = card.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const visibleTop = Math.max(viewportRect.top, tabs?.getBoundingClientRect().bottom || viewportRect.top);
    const visibleBottom = Math.min(
      viewportRect.bottom,
      nav && nav.style.display !== 'none' ? nav.getBoundingClientRect().top : viewportRect.bottom
    );
    const visibleCenterY = visibleTop + (visibleBottom - visibleTop) / 2;
    const deltaY = (cardRect.top + cardRect.height / 2) - visibleCenterY;

    viewport.scrollTo({
      top: Math.max(0, viewport.scrollTop + deltaY),
      behavior: 'smooth',
    });
  });
}

function attachFinalesCardCentering(root = document) {
  if (!root || root.dataset.cardCenteringReady === 'true') return;
  root.dataset.cardCenteringReady = 'true';

  const findCard = target => target.closest?.('.match-card[data-match-id]');

  root.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    const card = findCard(e.target);
    if (!card) return;
    centerFinalesCard(card.dataset.matchId);
  });

  root.addEventListener('focusin', e => {
    if (!e.target.matches('input, textarea, select')) return;
    const card = findCard(e.target);
    if (!card) return;
    centerFinalesCard(card.dataset.matchId);
  });
}

function orderedFinalesMatches() {
  return knockoutMatchesSource()
    .filter(m => isFinalesRound(m.round))
    .sort(compareMatchesChronologically);
}

function getFinalesJumpTargetMatch() {
  const ordered = orderedFinalesMatches();
  const liveTarget = ordered.find(m => !matchFinalized(m) && (matchLive(m) || matchHalftime(m)));
  if (liveTarget) return liveTarget;
  const now = nowMs();
  return ordered.find(m => !matchFinalized(m) && m.fecha && m.fecha.getTime() >= now)
    || ordered.find(m => !matchFinalized(m) && !matchHasScore(m))
    || ordered.find(m => !matchFinalized(m))
    || null;
}

function visibleFinalesMatchId() {
  if (state.finalesMode !== 'bracket') return null;
  const viewport = document.getElementById('finalesViewport');
  if (!viewport) return null;
  const cards = [...document.querySelectorAll('#finalesBoard .bracket-match[data-match-id] .match-card')];
  if (!cards.length) return null;
  const tabs = document.getElementById('finalesPersonTabs');
  const nav = document.getElementById('bottomNav');
  const viewportRect = viewport.getBoundingClientRect();
  const visibleTop = Math.max(viewportRect.top, tabs?.getBoundingClientRect().bottom || viewportRect.top);
  const visibleBottom = Math.min(
    viewportRect.bottom,
    nav && nav.style.display !== 'none' ? nav.getBoundingClientRect().top : viewportRect.bottom
  );
  const visibleCenterX = viewportRect.left + viewportRect.width / 2;
  const visibleCenterY = visibleTop + (visibleBottom - visibleTop) / 2;
  let best = null;
  let bestDistance = Infinity;

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom < visibleTop || rect.top > visibleBottom || rect.right < viewportRect.left || rect.left > viewportRect.right) continue;
    const dx = (rect.left + rect.width / 2) - visibleCenterX;
    const dy = (rect.top + rect.height / 2) - visibleCenterY;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Number(card.closest('.bracket-match')?.dataset.matchId);
    }
  }
  return Number.isFinite(best) ? best : null;
}

function currentFinalesIndex() {
  const ordered = orderedFinalesMatches();
  if (!ordered.length) return { ordered, index: -1 };
  const visibleId = visibleFinalesMatchId();
  const focusedId = visibleId ?? state.focusedFinalesMatchId;
  let index = focusedId == null ? -1 : ordered.findIndex(m => m.id === focusedId);
  if (index === -1) {
    const target = getFinalesJumpTargetMatch();
    index = target ? ordered.findIndex(m => m.id === target.id) : 0;
  }
  return { ordered, index };
}

function updateFinalesNavButtons() {
  const prev = document.getElementById('btnFinalesPrev');
  const next = document.getElementById('btnFinalesNext');
  const current = document.getElementById('btnFinalesCurrent');
  if (!prev || !next || !current) return;
  if (state.finalesMode !== 'bracket') {
    prev.disabled = true;
    next.disabled = true;
    current.disabled = true;
    return;
  }
  const { ordered, index } = currentFinalesIndex();
  prev.disabled = !ordered.length || index <= 0;
  next.disabled = !ordered.length || index < 0 || index >= ordered.length - 1;
  current.disabled = !getFinalesJumpTargetMatch();
}

function setFinalesMode(mode) {
  const nextMode = mode === 'list' ? 'list' : 'bracket';
  if (state.finalesMode === nextMode) return;
  if (state.editingMatchId !== null) {
    const ok = confirm('Tienes un pronóstico sin guardar. ¿Descartarlo y cambiar de modo?');
    if (!ok) return;
    state.editingMatchId = null;
    state.pendingSave = null;
  }
  state.finalesMode = nextMode;
  renderFinales();
}

function focusFinalesRelative(step) {
  if (state.finalesMode !== 'bracket') return;
  const { ordered, index } = currentFinalesIndex();
  if (!ordered.length) return;
  const nextIndex = Math.max(0, Math.min(ordered.length - 1, index + step));
  const target = ordered[nextIndex];
  if (!target) return;
  focusFinalesMatch(target.id, { behavior: 'smooth' });
}

function focusCurrentFinalesMatch() {
  if (state.finalesMode !== 'bracket') return;
  const target = getFinalesJumpTargetMatch();
  if (!target) return;
  focusFinalesMatch(target.id, { behavior: 'smooth' });
}

function initFinalesGestures() {
  if (finalesGesturesReady) return;
  const viewport = document.getElementById('finalesViewport');
  if (!viewport) return;
  finalesGesturesReady = true;

  const pointers = new Map();
  let dragPointerId = null;
  let lastDragPoint = null;
  let didDrag = false;
  let navUpdateFrame = null;

  const pointerDistance = () => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
  };

  const pointerCenter = () => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return null;
    return {
      clientX: (pts[0].clientX + pts[1].clientX) / 2,
      clientY: (pts[0].clientY + pts[1].clientY) / 2,
    };
  };

  viewport.addEventListener('wheel', e => {
    if (state.finalesMode !== 'bracket') return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * KNOCKOUT_WHEEL_ZOOM_SPEED);
    setFinalesZoom(state.knockoutZoom * factor, { clientX: e.clientX, clientY: e.clientY });
  }, { passive: false });

  viewport.addEventListener('scroll', () => {
    if (state.finalesMode !== 'bracket') return;
    if (navUpdateFrame !== null) return;
    navUpdateFrame = requestAnimationFrame(() => {
      navUpdateFrame = null;
      updateFinalesNavButtons();
    });
  }, { passive: true });

  viewport.addEventListener('pointerdown', e => {
    if (state.finalesMode !== 'bracket') return;
    if (e.target.closest('input, button, textarea, select')) return;
    pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    viewport.setPointerCapture?.(e.pointerId);
    didDrag = false;

    if (pointers.size === 1) {
      dragPointerId = e.pointerId;
      lastDragPoint = { clientX: e.clientX, clientY: e.clientY };
      viewport.classList.add('is-dragging');
    } else if (pointers.size === 2) {
      finalesPinch = {
        distance: pointerDistance(),
        zoom: state.knockoutZoom,
      };
      viewport.classList.add('is-dragging');
    }
  });

  viewport.addEventListener('pointermove', e => {
    if (state.finalesMode !== 'bracket') return;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (pointers.size >= 2 && finalesPinch) {
      e.preventDefault();
      const distance = pointerDistance();
      const center = pointerCenter();
      if (distance > 0 && center) {
        const ratio = distance / finalesPinch.distance;
        setFinalesZoom(finalesPinch.zoom * Math.pow(ratio, KNOCKOUT_PINCH_SENSITIVITY), center);
        didDrag = true;
      }
      return;
    }

    if (dragPointerId === e.pointerId && lastDragPoint) {
      const dx = e.clientX - lastDragPoint.clientX;
      const dy = e.clientY - lastDragPoint.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) didDrag = true;
      viewport.scrollLeft -= dx;
      viewport.scrollTop -= dy;
      lastDragPoint = { clientX: e.clientX, clientY: e.clientY };
    }
  }, { passive: false });

  const endPointer = e => {
    pointers.delete(e.pointerId);
    viewport.releasePointerCapture?.(e.pointerId);
    finalesPinch = null;
    if (pointers.size === 0) {
      dragPointerId = null;
      lastDragPoint = null;
      viewport.classList.remove('is-dragging');
      return;
    }
    const remaining = [...pointers.entries()][0];
    dragPointerId = remaining[0];
    lastDragPoint = remaining[1];
  };

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('click', e => {
    if (!didDrag) return;
    e.preventDefault();
    e.stopPropagation();
    didDrag = false;
  }, true);

  window.addEventListener('resize', () => {
    if (state.activeView !== 'finales' || state.finalesMode !== 'bracket') return;
    const next = clampFinalesZoom(state.knockoutZoom);
    if (next !== state.knockoutZoom) state.knockoutZoom = next;
    applyFinalesZoom();
  });
}

// ============================================================
// Edición por partido (uno a la vez)
// ============================================================
function attachEditingListeners(root = document) {
  root.querySelectorAll('.editable-card').forEach(card => {
    const id = Number(card.dataset.matchId);
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      enterEditMode(id);
    });
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

  const m = findAnyMatch(matchId);
  if (!knockoutTeamsResolved(m)) {
    showToast('Esta llave todavía no está cerrada. Podrás pronosticar cuando ambos equipos estén definidos.', true);
    return;
  }
  const needsWinner = isKnockoutMatch(m) && matchTied(gl, gv);
  state.pendingSave = {
    matchId,
    gl,
    gv,
    ganador: needsWinner ? null : winnerFromScore(m.local, m.visitante, gl, gv),
    definicion: needsWinner ? 'te' : null,
    defL: null,
    defV: null,
  };
  const titleEl = document.querySelector('#confirmModal .modal-title');
  const warnEl = document.querySelector('#confirmModal .modal-warn');
  if (titleEl) titleEl.textContent = 'Confirmar pronóstico';
  if (warnEl) warnEl.textContent = needsWinner
    ? 'Elige si será en tiempo extra o penales y el marcador de la definición. Una vez guardado, no podrás editar este pronóstico.'
    : 'Una vez guardado, no podrás editar este pronóstico.';
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-match">
      <span class="modal-team">${m.local}</span>
      <span class="modal-score">${gl} - ${gv}</span>
      <span class="modal-team">${m.visitante}</span>
    </div>
    ${needsWinner ? `${definitionChoiceHTML('te', 'prediction-definition')}${definitionScoreHTML(m)}` : ''}`;
  attachWinnerChoiceListeners(document.getElementById('modalBody'));
  document.getElementById('confirmModal').hidden = false;
}

function closeModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.hidden = true;
}

async function handleModalConfirm() {
  if (state.adminPendingSave) return handleAdminModalConfirm();
  if (!state.pendingSave) return;
  const { matchId, gl, gv, ganador, definicion, defL, defV } = state.pendingSave;
  const btn = document.getElementById('modalConfirm');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const m = findAnyMatch(matchId);
    if (isKnockoutMatch(m) && matchTied(gl, gv) && !definicion) {
      showToast('Elige si será en tiempo extra o penales.', true);
      return;
    }
    let winnerToSave = ganador;
    if (isKnockoutMatch(m) && matchTied(gl, gv)) {
      const validatedDefinition = validateDefinitionScore(defL, defV, m, null, definicion, gl, gv);
      if (validatedDefinition.error) {
        showToast(validatedDefinition.error, true);
        return;
      }
      winnerToSave = validatedDefinition.ganador;
    }
    await saveSingleMatch(matchId, gl, gv, winnerToSave, definicion, defL, defV);
    state.editingMatchId = null;
    state.pendingSave = null;
    closeModal();
    if (knockoutEnabled() && state.activeView === 'finales') renderFinales();
    else renderPersonDetail();
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
  renderAdmin();
}

function renderAll() {
  renderPodio();
  renderDayTabs();
  renderPersonTabs();
  if (state.activeView === 'quiniela' && state.editingMatchId === null) renderPersonDetail();
  if (state.activeView === 'grupos') renderGrupos();
  if (knockoutEnabled() && state.activeView === 'finales') renderFinales();
  if (state.activeView === 'extras') renderExtras();
  updateHeaderSession();
  renderShareToggle();
}

// ============================================================
// Status
// ============================================================
function syncSettingsLiveStatus() {
  const source = document.getElementById('statusText');
  const target = document.getElementById('settingsLiveStatusText');
  if (source && target) target.textContent = source.textContent || 'En vivo';
}

function setStatus(text, type = 'loading') {
  const dot = document.querySelector('.status-main .status-dot');
  document.getElementById('statusText').textContent = text;
  if (dot) dot.className = 'status-dot' + (type === 'ok' ? ' ok' : type === 'error' ? ' error' : '');
  syncSettingsLiveStatus();
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
// Puntos Extra (Reto del Partido) Lógica
// ============================================================
function areExtrasLocked() {
  return state.extras.resultados?.cerrado === true;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isBonusParticipant(p) {
  const values = [p?.clave, p?.nombreVisible, p?.usuario].map(normalizeText);
  return !values.some(value => BONUS_EXCLUDED_PARTICIPANTS.some(excluded =>
    value === excluded || value.startsWith(`${excluded} `)
  ));
}

function getBonusParticipants() {
  return state.participantes.filter(isBonusParticipant);
}

function matchScorer(pred, real) {
  const p = normalizeText(pred);
  const r = normalizeText(real);
  if (!p || !r) return false;
  return p === r || p.includes(r) || r.includes(p);
}

function getExtraFinalMatch() {
  return findResolvedKnockoutMatch(103)
    || state.partidos.find(m => Number(m.id) === 103)
    || baseKnockoutMatches().find(m => Number(m.id) === 103)
    || null;
}

function getExtraFinalTeams() {
  const match = getExtraFinalMatch();
  return {
    local: match?.local || 'Equipo local',
    visitante: match?.visitante || 'Equipo visitante',
  };
}

function extraTeamFields(prefix, teamName) {
  return EXTRA_TEAM_QUESTION_DEFS.map(q => ({
    ...q,
    key: `${prefix}_${q.suffix}`,
    section: teamName,
  }));
}

function extraQuestions() {
  const teams = getExtraFinalTeams();
  return [
    ...extraTeamFields('local', teams.local),
    ...extraTeamFields('visitante', teams.visitante),
    ...EXTRA_GENERAL_QUESTIONS.map(q => ({ ...q, section: 'General' })),
    ...EXTRA_SPECIAL_QUESTIONS.map(q => ({ ...q, section: 'Especial' })),
  ];
}

function getRangeForValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n <= 5) return '0-5';
  if (n <= 10) return '6-10';
  if (n <= 15) return '11-15';
  return '16+';
}

function formatExtraValue(value, question, { forResult = false } = {}) {
  if (value === 'no_anotan') return question.type === 'scorer' ? 'Ninguno' : 'No anotan';
  if (question.type === 'select') return value === 'si' ? 'Si' : value === 'no' ? 'No' : '-';
  if (question.type === 'time') return value ? `${value} PM` : '-';
  if (question.type === 'range' && forResult && value !== undefined && value !== null && value !== '') {
    return `${value} (${getRangeForValue(value)})`;
  }
  return value !== undefined && value !== null && value !== '' ? value : '-';
}

function extraAnswerCorrect(predVal, realVal, question) {
  if (realVal === undefined || realVal === null || realVal === '') return false;
  if (predVal === undefined || predVal === null || predVal === '') return false;
  if (question.type === 'range') return String(predVal) === getRangeForValue(realVal);
  if (question.type === 'number') return Number(predVal) === Number(realVal);
  if (question.type === 'minute') {
    if (realVal === 'no_anotan' || predVal === 'no_anotan') return realVal === predVal;
    return Number(predVal) === Number(realVal);
  }
  if (question.type === 'scorer') {
    if (realVal === 'no_anotan' || predVal === 'no_anotan') return realVal === predVal;
    return matchScorer(predVal, realVal);
  }
  if (question.type === 'time') return String(predVal).trim() === String(realVal).trim();
  return String(predVal).toLowerCase().trim() === String(realVal).toLowerCase().trim();
}

function normalizeBonusTime(value) {
  const text = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*PM)?$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return '';
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getExtraTotalPoints() {
  return extraQuestions().reduce((sum, question) => sum + (question.points || 1), 0) + 3;
}

function getExtrasScores() {
  const resultados = state.extras['resultados'] || {};
  const questions = extraQuestions();
  const scores = getBonusParticipants().map(p => {
    const preds = state.extras[p.clave] || {};
    const customHits = Array.isArray(resultados.customAciertos?.[p.clave])
      ? resultados.customAciertos[p.clave]
      : [];
    let total = 0;

    const details = questions.map(question => {
      const pred = preds[question.key];
      const real = resultados[question.key];
      const correct = extraAnswerCorrect(pred, real, question);
      if (correct) total += question.points || 1;
      return { ...question, pred, real, correct };
    });
    total += customHits.filter(Boolean).length;

    return {
      clave: p.clave,
      nombre: p.nombreVisible,
      puntos: total,
      details
    };
  });

  scores.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'));

  let rank = 0, prevPts = null;
  return scores.map(s => {
    if (s.puntos !== prevPts) { rank += 1; prevPts = s.puntos; }
    return { ...s, rank };
  });
}

function cleanCustomPredictions(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(item => item.slice(0, 300));
}

function cleanExtraPayload(data, { admin = false } = {}) {
  const payload = {};
  const questions = extraQuestions();
  for (const question of questions) {
    const value = data[question.key];
    if (question.type === 'select') {
      if (value === undefined || value === null || value === '') continue;
      if (value !== 'si' && value !== 'no') throw new Error(`Elige Si o No para ${question.label}.`);
      payload[question.key] = value;
      continue;
    }
    if (question.type === 'time') {
      const text = normalizeBonusTime(value);
      if (!text) continue;
      payload[question.key] = text;
      continue;
    }
    if (question.type === 'range' && !admin) {
      if (value === undefined || value === null || value === '') continue;
      if (!EXTRA_RANGE_OPTIONS.some(([key]) => key === value)) throw new Error(`Elige un rango para ${question.label}.`);
      payload[question.key] = value;
      continue;
    }
    if (question.type === 'scorer') {
      const text = String(value || '').trim();
      if (!text) continue;
      payload[question.key] = text === 'no_anotan' ? 'no_anotan' : text.slice(0, 80);
      continue;
    }
    if (question.type === 'minute') {
      if (value === 'no_anotan') {
        payload[question.key] = 'no_anotan';
        continue;
      }
      if (value === undefined || value === null || value === '') continue;
      const n = Number(value);
      if (!Number.isInteger(n) || n < question.min || n > question.max) throw new Error(`Revisa ${question.label}.`);
      payload[question.key] = n;
      continue;
    }
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < question.min || n > question.max) throw new Error(`Revisa ${question.label}.`);
    payload[question.key] = n;
  }
  if (admin) {
    payload.customAciertos = data.customAciertos && typeof data.customAciertos === 'object'
      ? data.customAciertos
      : {};
    payload.cerrado = data.cerrado === true;
  } else {
    const customPredicciones = cleanCustomPredictions(data.customPredicciones);
    if (customPredicciones.length) payload.customPredicciones = customPredicciones;
  }
  return payload;
}

async function saveExtras(data) {
  if (!state.session) throw new Error('Inicia sesión');
  if (!db) throw new Error('Sin conexión');

  await syncInternetClock();

  if (areExtrasLocked()) throw new Error('Las respuestas del Bonus ya están cerradas.');

  const clave = state.session.clave;
  const { doc, setDoc } = firestoreFns;
  const payload = cleanExtraPayload(data);

  state.extrasSaving = true;
  if (state.activeView === 'extras') renderExtras();

  try {
    await setDoc(doc(db, 'extras', clave), {
      ...payload,
      actualizado: new Date().toISOString()
    }, { merge: true });
    showToast('Respuestas bonus guardadas', false);
  } catch (err) {
    showToast(err.message || 'No se pudieron guardar las respuestas', true);
    throw err;
  } finally {
    state.extrasSaving = false;
    if (state.activeView === 'extras') renderExtras();
  }
}

async function saveAdminExtras(data) {
  if (!isAdminSession()) throw new Error('No autorizado');
  if (!db) throw new Error('Sin conexión');

  const { doc, setDoc } = firestoreFns;
  const payload = cleanExtraPayload(data, { admin: true });

  try {
    await setDoc(doc(db, 'extras', 'resultados'), {
      ...payload,
      actualizado: new Date().toISOString()
    }, { merge: true });
    showToast('Resultados del reto guardados', false);
  } catch (err) {
    showToast(err.message || 'No se pudieron guardar los resultados', true);
    throw err;
  }
}

function renderExtrasTeamsHeader() {
  const { local, visitante } = getExtraFinalTeams();
  const localParts = splitFlag(local);
  const visitorParts = splitFlag(visitante);
  return `
    <div class="extras-teams-header">
      <div class="extras-team-card">
        <span class="extras-team-flag">${escapeHTML(localParts.flag || '')}</span>
        <span class="extras-team-name">${escapeHTML(localParts.name || local)}</span>
      </div>
      <span class="extras-vs">vs</span>
      <div class="extras-team-card">
        <span class="extras-team-flag">${escapeHTML(visitorParts.flag || '')}</span>
        <span class="extras-team-name">${escapeHTML(visitorParts.name || visitante)}</span>
      </div>
    </div>`;
}

function renderExtrasLeaderboard(scores) {
  const totalQuestions = getExtraTotalPoints();
  return `
    <div class="extras-leaderboard-card">
      <h3 class="extras-section-title">Tabla de posiciones</h3>
      <table class="extras-leaderboard-table">
        <thead>
          <tr>
            <th>Lugar</th>
            <th>Participante</th>
            <th>Aciertos</th>
          </tr>
        </thead>
        <tbody>
          ${scores.map(s => `
            <tr class="${s.rank === 1 && s.puntos > 0 ? 'is-winner' : ''}">
              <td><span class="extras-rank-number">${s.rank}º</span></td>
              <td><div class="extras-user-cell">${escapeHTML(s.nombre)}</div></td>
              <td><span class="extras-points-cell">${s.puntos}/${totalQuestions}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderRangeSelect(id, value, disabled = false) {
  const selectedValue = value || '';
  return `
    <select class="extras-input-control" id="${id}" ${disabled ? 'disabled' : ''}>
      <option value="" ${selectedValue === '' ? 'selected' : ''}></option>
      ${EXTRA_RANGE_OPTIONS.map(([key, label]) => `
        <option value="${key}" ${selectedValue === key ? 'selected' : ''}>${label}</option>`).join('')}
    </select>`;
}

function rosterKeyForTeam(teamName) {
  const normalized = normalizeText(teamName);
  if (normalized.includes('espana') || normalized.includes('spain')) return 'espana';
  if (normalized.includes('argentina')) return 'argentina';
  return null;
}

function renderScorerPicker(id, teamName, value, { disabled = false, admin = false } = {}) {
  const roster = EXTRA_ROSTERS[rosterKeyForTeam(teamName)];
  if (!roster) {
    const className = admin ? 'admin-extras-input' : 'extras-input-control';
    return `<input class="${className}" type="text" id="${id}" placeholder="Nombre" value="${escapeHTML(value)}" ${disabled ? 'disabled' : ''}>`;
  }
  const selected = String(value || '');
  const label = selected || 'Elegir jugador';
  return `
    <input type="hidden" id="${id}" value="${escapeHTML(selected)}" ${disabled ? 'disabled' : ''}>
    <button class="extras-player-picker-btn ${admin ? 'admin-player-picker-btn' : ''} ${selected ? 'has-value' : ''}" type="button"
            data-player-picker="${id}" data-team-name="${escapeHTML(teamName)}" ${disabled ? 'disabled' : ''}>
      ${escapeHTML(label)}
    </button>`;
}

function renderExtraSideControl(questionDef, prefix, teamName, values, { admin = false, disabled = false } = {}) {
  const key = `${prefix}_${questionDef.suffix}`;
  const id = `${admin ? 'adm_ext' : 'ext'}_${key}`;
  const value = values[key] ?? '';
  const isNone = value === 'no_anotan';
  const inputClass = admin ? 'admin-extras-input' : 'extras-input-control';
  let control = '';

  if (questionDef.type === 'range' && !admin) {
    control = renderRangeSelect(id, value, disabled);
  } else if (questionDef.type === 'scorer') {
    const scorerControl = renderScorerPicker(id, teamName, isNone ? '' : value, { disabled: isNone || disabled, admin });
    control = `
      ${scorerControl}
      <label class="checkbox-inline-row extras-none-row">
        <input type="checkbox" id="${id}_none" data-none-target="${id}" ${isNone ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>Ninguno</span>
      </label>`;
  } else if (questionDef.type === 'minute') {
    control = `
      <input class="${inputClass}" type="number" id="${id}" min="${questionDef.min}" max="${questionDef.max}" placeholder="Min" value="${isNone ? '' : escapeHTML(value)}" ${isNone || disabled ? 'disabled' : ''}>
      <label class="checkbox-inline-row extras-none-row">
        <input type="checkbox" id="${id}_none" data-none-target="${id}" ${isNone ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>No anotan</span>
      </label>`;
  } else {
    control = `<input class="${inputClass}" type="number" id="${id}" min="${questionDef.min}" max="${questionDef.max}" placeholder="-" value="${escapeHTML(value)}" ${disabled ? 'disabled' : ''}>`;
  }

  return `
    <div class="extras-side-control">
      ${control}
    </div>`;
}

function renderExtraQuestionRows(values, { admin = false, disabled = false } = {}) {
  const { local, visitante } = getExtraFinalTeams();
  return EXTRA_TEAM_QUESTION_DEFS.map(q => `
    <section class="extras-question-card">
      <h4 class="extras-question-title">${escapeHTML(q.label)}</h4>
      <div class="extras-dual-controls">
        ${renderExtraSideControl(q, 'local', local, values, { admin, disabled })}
        ${renderExtraSideControl(q, 'visitante', visitante, values, { admin, disabled })}
      </div>
    </section>`).join('');
}

function renderExtraGeneralQuestions(values, { admin = false, disabled = false } = {}) {
  const inputClass = admin ? 'admin-extras-input' : 'extras-input-control';
  const idPrefix = admin ? 'adm_ext' : 'ext';
  return `
    <section class="extras-section-block extras-general-block">
      <h4 class="extras-team-section-title">General</h4>
      <div class="extras-general-grid">
        ${EXTRA_GENERAL_QUESTIONS.map(q => `
          <div class="extras-field-group">
            <label class="extras-input-label" for="${idPrefix}_${q.key}">${escapeHTML(q.label)}</label>
            <select class="${inputClass}" id="${idPrefix}_${q.key}" ${disabled ? 'disabled' : ''}>
              <option value="" ${values[q.key] !== 'si' && values[q.key] !== 'no' ? 'selected' : ''}></option>
              <option value="no" ${values[q.key] === 'no' ? 'selected' : ''}>No</option>
              <option value="si" ${values[q.key] === 'si' ? 'selected' : ''}>Si</option>
            </select>
          </div>`).join('')}
      </div>
    </section>`;
}

function renderExtraSpecialQuestions(values, { admin = false, disabled = false } = {}) {
  const inputClass = admin ? 'admin-extras-input' : 'extras-input-control';
  const idPrefix = admin ? 'adm_ext' : 'ext';
  return `
    <section class="extras-section-block extras-special-block">
      <h4 class="extras-team-section-title">Especial · 2 puntos</h4>
      ${EXTRA_SPECIAL_QUESTIONS.map(q => `
        <div class="extras-field-group">
          <label class="extras-input-label" for="${idPrefix}_${q.key}">${escapeHTML(q.label)}</label>
          <div class="extras-time-control">
            <select class="${inputClass}" id="${idPrefix}_${q.key}_hour" ${disabled ? 'disabled' : ''}>
              <option value="" ${!normalizeBonusTime(values[q.key]) ? 'selected' : ''}></option>
              ${Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(hour => `
                <option value="${hour}" ${normalizeBonusTime(values[q.key]).slice(0, 2) === hour ? 'selected' : ''}>${hour}</option>`).join('')}
            </select>
            <span class="extras-time-separator">:</span>
            <select class="${inputClass}" id="${idPrefix}_${q.key}_minute" ${disabled ? 'disabled' : ''}>
              <option value="" ${!normalizeBonusTime(values[q.key]) ? 'selected' : ''}></option>
              ${Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(minute => `
                <option value="${minute}" ${normalizeBonusTime(values[q.key]).slice(3, 5) === minute ? 'selected' : ''}>${minute}</option>`).join('')}
            </select>
            <span class="extras-time-meridiem">PM</span>
          </div>
        </div>`).join('')}
    </section>`;
}

function renderCustomPredictionsForm(values, disabled = false) {
  const items = Array.isArray(values.customPredicciones) ? values.customPredicciones : [];
  return `
    <section class="extras-section-block extras-custom-block">
      <h4 class="extras-team-section-title">Predicciones entre participantes</h4>
      <p class="extras-custom-hint">Escribe hasta tres cosas concretas que crees que pasaran entre ustedes viendo la final. Ejemplos: Abuelo se duerme, llegamos tarde a ver el partido.</p>
      ${[0, 1, 2].map(i => `
        <div class="extras-field-group">
          <label class="extras-input-label" for="ext_custom_${i}">Prediccion ${i + 1}</label>
          <textarea class="extras-input-control extras-custom-textarea" id="ext_custom_${i}" maxlength="300" rows="1"
                    ${disabled ? 'disabled' : ''}>${escapeHTML(items[i] || '')}</textarea>
        </div>`).join('')}
    </section>`;
}

function resizeAutoTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function canDraftCurrentExtrasForm() {
  return !!(
    state.session?.clave
    && state.selectedExtrasPerson === state.session.clave
    && !areExtrasLocked()
    && document.getElementById('extrasForm')
  );
}

function persistCurrentExtrasDraft() {
  if (!canDraftCurrentExtrasForm()) return;
  state.extrasDrafts[state.session.clave] = readExtrasFormData();
}

function getExtrasFormValues(clave) {
  const saved = state.extras[clave] || {};
  if (clave !== state.session?.clave) return saved;
  const draft = state.extrasDrafts[clave];
  return draft ? { ...saved, ...draft } : saved;
}

function ensureSelectedExtrasPerson() {
  const participants = getBonusParticipants();
  if (state.selectedExtrasPerson && participants.some(p => p.clave === state.selectedExtrasPerson)) return;
  state.selectedExtrasPerson = participants.some(p => p.clave === state.session?.clave)
    ? state.session.clave
    : participants[0]?.clave || null;
}

function renderExtrasPersonTabs() {
  ensureSelectedExtrasPerson();
  return `
    <div class="person-tabs extras-person-tabs">
      ${getBonusParticipants().map(p => {
        const isMe = state.session?.clave === p.clave;
        return `
          <button type="button" class="person-tab ${state.selectedExtrasPerson === p.clave ? 'active' : ''}" data-extra-person="${p.clave}">
            ${escapeHTML(p.nombreVisible)}${isMe ? ' <span class="tab-me">(tu)</span>' : ''}
          </button>`;
      }).join('')}
    </div>`;
}

function renderExtrasForm() {
  ensureSelectedExtrasPerson();
  const person = state.participantes.find(p => p.clave === state.selectedExtrasPerson);
  const userPreds = getExtrasFormValues(state.selectedExtrasPerson);
  const isOwn = state.session?.clave === state.selectedExtrasPerson;
  const isSaving = !!state.extrasSaving;
  const locked = areExtrasLocked();
  const readOnly = !isOwn || locked || isSaving;
  return `
    <div class="extras-form-card">
      <h3 class="extras-section-title">${isOwn ? 'Tus predicciones' : `Predicciones de ${escapeHTML(person?.nombreVisible || 'participante')}`}</h3>
      <form id="extrasForm">
        <div class="extras-question-list">
          ${renderExtraQuestionRows(userPreds, { disabled: readOnly })}
        </div>
        ${renderExtraGeneralQuestions(userPreds, { disabled: readOnly })}
        ${renderCustomPredictionsForm(userPreds, readOnly)}
        ${renderExtraSpecialQuestions(userPreds, { disabled: readOnly })}
        ${isOwn && !locked ? `<button type="submit" class="btn-primary extras-save-btn" ${isSaving ? 'disabled' : ''}>
          ${isSaving ? 'Guardando...' : 'Guardar predicciones'}
        </button>` : '<p class="extras-lock-hint">Solo puedes editar tus propias predicciones antes del inicio de la final.</p>'}
      </form>
    </div>`;
}

function renderExtrasStickyHeader() {
  return `
    <div class="extras-sticky-header">
      ${renderExtrasPersonTabs()}
      ${renderExtrasTeamsHeader()}
    </div>`;
}

function setExtraNoneControl(checkbox) {
  const input = document.getElementById(checkbox.dataset.noneTarget);
  if (!input) return;
  input.disabled = checkbox.checked || state.extrasSaving;
  if (checkbox.checked) input.value = '';
  const button = document.querySelector(`[data-player-picker="${checkbox.dataset.noneTarget}"]`);
  if (button) {
    button.disabled = checkbox.checked || state.extrasSaving;
    if (checkbox.checked) {
      button.textContent = 'Elegir jugador';
      button.classList.remove('has-value');
    }
  }
}

function closePlayerPicker() {
  const modal = document.getElementById('playerPickerModal');
  if (modal) modal.hidden = true;
  state.playerPicker = null;
}

function renderPlayerPickerList(filter = '') {
  const list = document.getElementById('playerPickerList');
  if (!list || !state.playerPicker) return;
  const { roster, inputId } = state.playerPicker;
  const selected = document.getElementById(inputId)?.value || '';
  const needle = normalizeText(filter);
  const groups = Object.entries(roster)
    .map(([group, players]) => ({
      group,
      players: players.filter(player => !needle || normalizeText(player).includes(needle)),
    }))
    .filter(group => group.players.length);

  if (!groups.length) {
    list.innerHTML = '<div class="player-picker-empty">Sin resultados</div>';
    return;
  }

  list.innerHTML = groups.map(({ group, players }) => `
    <section class="player-picker-group">
      <h4>${escapeHTML(group)}</h4>
      <div class="player-picker-options">
        ${players.map(player => `
          <button type="button" class="player-picker-option ${selected === player ? 'active' : ''}" data-player="${escapeHTML(player)}">
            ${escapeHTML(player)}
          </button>`).join('')}
      </div>
    </section>`).join('');

  list.querySelectorAll('.player-picker-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      const trigger = document.querySelector(`[data-player-picker="${inputId}"]`);
      if (input) input.value = btn.dataset.player;
      if (trigger) {
        trigger.textContent = btn.dataset.player;
        trigger.classList.add('has-value');
      }
      persistCurrentExtrasDraft();
      closePlayerPicker();
    });
  });
}

function openPlayerPicker(inputId, teamName) {
  const roster = EXTRA_ROSTERS[rosterKeyForTeam(teamName)];
  if (!roster) return;
  state.playerPicker = { inputId, teamName, roster };
  const title = document.getElementById('playerPickerTitle');
  const search = document.getElementById('playerPickerSearch');
  const lineupsLink = document.getElementById('playerPickerLineupsLink');
  const team = splitFlag(teamName);
  if (title) title.textContent = `Autor del primer gol · ${team.name || teamName}`;
  if (lineupsLink) lineupsLink.href = EXTRA_LINEUPS_URL;
  if (search) search.value = '';
  renderPlayerPickerList('');
  const modal = document.getElementById('playerPickerModal');
  if (modal) modal.hidden = false;
  requestAnimationFrame(() => search?.focus());
}

function readExtrasFormData() {
  const data = {};
  for (const key of EXTRA_SAVE_FIELDS) {
    const el = document.getElementById(`ext_${key}`);
    const none = document.getElementById(`ext_${key}_none`);
    if (none?.checked) data[key] = 'no_anotan';
    else if (el) data[key] = el.value;
  }
  for (const question of EXTRA_SPECIAL_QUESTIONS) {
    const hour = document.getElementById(`ext_${question.key}_hour`)?.value || '';
    const minute = document.getElementById(`ext_${question.key}_minute`)?.value || '';
    data[question.key] = hour && minute ? `${hour}:${minute}` : '';
  }
  data.customPredicciones = [0, 1, 2].map(i => document.getElementById(`ext_custom_${i}`)?.value || '');
  return data;
}

function renderExtrasComparison(resultados) {
  const questions = extraQuestions();
  const participants = getBonusParticipants().slice(0, EXTRA_PARTICIPANT_LIMIT);
  return `
    <div class="extras-comparison-wrapper">
      <h3 class="extras-section-title">Comparativa de predicciones</h3>
      <table class="extras-comparison-table">
        <thead>
          <tr>
            <th class="col-question">Pregunta</th>
            <th class="col-result">Resultado</th>
            ${participants.map(p => `<th>${escapeHTML(p.nombreVisible)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${questions.map(q => `
            <tr>
              <td class="col-question">${escapeHTML(q.section)} · ${escapeHTML(q.label)}</td>
              <td class="col-result">${escapeHTML(formatExtraValue(resultados[q.key], q, { forResult: true }))}</td>
              ${participants.map(p => {
                const pred = state.extras[p.clave]?.[q.key];
                const hasReal = resultados[q.key] !== undefined && resultados[q.key] !== null && resultados[q.key] !== '';
                const hasPred = pred !== undefined && pred !== null && pred !== '';
                const cls = hasReal && hasPred ? (extraAnswerCorrect(pred, resultados[q.key], q) ? 'guess-correct' : 'guess-incorrect') : '';
                return `<td class="${cls}">${escapeHTML(formatExtraValue(pred, q))}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
      ${renderCustomPredictionsComparison(resultados)}
      <p class="extras-lock-hint"><span>Bonus cerrado</span> Las respuestas ya se pueden comparar.</p>
    </div>`;
}

function renderCustomPredictionsComparison(resultados) {
  const participants = getBonusParticipants().slice(0, EXTRA_PARTICIPANT_LIMIT);
  const hasAny = participants.some(p => cleanCustomPredictions(state.extras[p.clave]?.customPredicciones).length);
  if (!hasAny) return '';
  return `
    <div class="extras-custom-comparison">
      <h4 class="extras-team-section-title">Predicciones entre participantes</h4>
      ${participants.map(p => {
        const items = cleanCustomPredictions(state.extras[p.clave]?.customPredicciones);
        const hits = Array.isArray(resultados.customAciertos?.[p.clave]) ? resultados.customAciertos[p.clave] : [];
        if (!items.length) return '';
        return `
          <div class="extras-custom-person">
            <strong>${escapeHTML(p.nombreVisible)}</strong>
            ${items.map((item, index) => `
              <div class="extras-custom-result ${hits[index] ? 'guess-correct' : 'guess-incorrect'}">
                <span>${escapeHTML(item)}</span>
                <b>${hits[index] ? 'Atino' : 'No atino'}</b>
              </div>`).join('')}
          </div>`;
      }).join('')}
    </div>`;
}

function renderExtras() {
  if (state.activeView !== 'extras') return;
  const el = document.getElementById('extrasContent');
  if (!el) return;

  const scores = getExtrasScores();
  const locked = areExtrasLocked();
  const resultados = state.extras['resultados'] || {};
  el.innerHTML = renderExtrasLeaderboard(scores)
    + renderExtrasStickyHeader()
    + (locked ? renderExtrasComparison(resultados) : renderExtrasForm());

  el.querySelectorAll('[data-extra-person]').forEach(button => {
    button.addEventListener('click', e => {
      const nextPerson = e.currentTarget.dataset.extraPerson;
      if (!nextPerson || nextPerson === state.selectedExtrasPerson) return;
      persistCurrentExtrasDraft();
      state.selectedExtrasPerson = nextPerson;
      renderExtras();
    });
  });

  const form = document.getElementById('extrasForm');
  if (form) {
    form.querySelectorAll('[data-player-picker]').forEach(button => {
      button.addEventListener('click', e => {
        openPlayerPicker(e.currentTarget.dataset.playerPicker, e.currentTarget.dataset.teamName);
      });
    });
    form.querySelectorAll('[data-none-target]').forEach(checkbox => {
      checkbox.addEventListener('change', e => {
        setExtraNoneControl(e.currentTarget);
      });
    });
    form.querySelectorAll('.extras-custom-textarea').forEach(textarea => {
      resizeAutoTextarea(textarea);
      textarea.addEventListener('input', e => {
        resizeAutoTextarea(e.currentTarget);
        persistCurrentExtrasDraft();
      });
    });
    form.addEventListener('input', persistCurrentExtrasDraft);
    form.addEventListener('change', persistCurrentExtrasDraft);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        persistCurrentExtrasDraft();
        await saveExtras(readExtrasFormData());
      } catch (err) {
        // error toast handled in saveExtras
      }
    });
  }
}

function readAdminExtrasFormData() {
  const data = {};
  for (const key of EXTRA_SAVE_FIELDS) {
    const el = document.getElementById(`adm_ext_${key}`);
    const none = document.getElementById(`adm_ext_${key}_none`);
    if (none?.checked) data[key] = 'no_anotan';
    else if (el) data[key] = el.value;
  }
  for (const question of EXTRA_SPECIAL_QUESTIONS) {
    const hour = document.getElementById(`adm_ext_${question.key}_hour`)?.value || '';
    const minute = document.getElementById(`adm_ext_${question.key}_minute`)?.value || '';
    data[question.key] = hour && minute ? `${hour}:${minute}` : '';
  }
  data.customAciertos = {
    ...((state.extras.resultados || {}).customAciertos || {}),
  };
  if (state.adminExtrasPerson) {
    data.customAciertos[state.adminExtrasPerson] = [0, 1, 2].map(i =>
      document.getElementById(`adm_custom_${state.adminExtrasPerson}_${i}`)?.checked === true
    );
  }
  data.cerrado = document.getElementById('adm_ext_cerrado')?.checked === true;
  return data;
}

function renderAdminCustomPredictions(resultados) {
  const participants = getBonusParticipants();
  if (!state.adminExtrasPerson || !participants.some(p => p.clave === state.adminExtrasPerson)) {
    state.adminExtrasPerson = participants[0]?.clave || null;
  }
  const selected = participants.find(p => p.clave === state.adminExtrasPerson);
  const items = selected ? cleanCustomPredictions(state.extras[selected.clave]?.customPredicciones) : [];
  const hits = selected && Array.isArray(resultados.customAciertos?.[selected.clave])
    ? resultados.customAciertos[selected.clave]
    : [];

  return `
    <div class="admin-custom-predictions">
      <h3 class="admin-extras-title">Predicciones entre participantes</h3>
      <p class="extras-custom-hint">Elige participante y marca Atino solo en las predicciones que si se cumplieron.</p>
      <div class="person-tabs admin-custom-tabs">
        ${participants.map(p => `
          <button type="button" class="person-tab ${p.clave === state.adminExtrasPerson ? 'active' : ''}" data-admin-extra-person="${p.clave}">
            ${escapeHTML(p.nombreVisible)}
          </button>`).join('')}
      </div>
      <section class="extras-section-block admin-custom-person">
        <h4 class="extras-team-section-title">${selected ? `Predicciones de ${escapeHTML(selected.nombreVisible)}` : 'Predicciones'}</h4>
        ${items.length ? items.map((item, index) => `
          <label class="admin-custom-row">
            <span>${escapeHTML(item)}</span>
            <input type="checkbox" id="adm_custom_${selected.clave}_${index}" ${hits[index] ? 'checked' : ''}>
            <b>Atino</b>
          </label>`).join('') : '<p class="admin-custom-empty">Aun no ha guardado predicciones personales.</p>'}
      </section>
    </div>`;
}

function renderAdminExtras() {
  const el = document.getElementById('adminContent');
  if (!el) return;

  const resultados = state.extras['resultados'] || {};

  el.innerHTML = `
    <div class="admin-extras-card">
      <h3 class="admin-extras-title">Capturar Resultados Reales del Reto</h3>
      ${renderExtrasTeamsHeader()}
      <form id="adminExtrasForm">
        <div class="extras-question-list">
          ${renderExtraQuestionRows(resultados, { admin: true })}
        </div>
        ${renderExtraGeneralQuestions(resultados, { admin: true })}
        ${renderAdminCustomPredictions(resultados)}
        ${renderExtraSpecialQuestions(resultados, { admin: true })}
        <label class="admin-extras-lock-row">
          <input type="checkbox" id="adm_ext_cerrado" ${resultados.cerrado === true ? 'checked' : ''}>
          <span>Cerrar Bonus y mostrar comparativa</span>
        </label>

        <div class="admin-extras-actions">
          <button type="submit" class="btn-primary" id="btnSaveAdminExtras">Guardar Resultados</button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById('adminExtrasForm');
  if (form) {
    form.querySelectorAll('[data-admin-extra-person]').forEach(button => {
      button.addEventListener('click', e => {
        const nextPerson = e.currentTarget.dataset.adminExtraPerson;
        if (!nextPerson || nextPerson === state.adminExtrasPerson) return;
        const currentData = readAdminExtrasFormData();
        state.extras.resultados = {
          ...(state.extras.resultados || {}),
          ...currentData,
          customAciertos: {
            ...((state.extras.resultados || {}).customAciertos || {}),
            ...(currentData.customAciertos || {}),
          },
        };
        state.adminExtrasPerson = nextPerson;
        renderAdminExtras();
      });
    });
    form.querySelectorAll('[data-player-picker]').forEach(button => {
      button.addEventListener('click', e => {
        openPlayerPicker(e.currentTarget.dataset.playerPicker, e.currentTarget.dataset.teamName);
      });
    });
    form.querySelectorAll('[data-none-target]').forEach(checkbox => {
      checkbox.addEventListener('change', e => {
        const input = document.getElementById(e.currentTarget.dataset.noneTarget);
        if (!input) return;
        input.disabled = e.currentTarget.checked;
        if (e.currentTarget.checked) input.value = '';
        const button = document.querySelector(`[data-player-picker="${e.currentTarget.dataset.noneTarget}"]`);
        if (button) {
          button.disabled = e.currentTarget.checked;
          if (e.currentTarget.checked) {
            button.textContent = 'Elegir jugador';
            button.classList.remove('has-value');
          }
        }
      });
    });
    form.addEventListener('input', () => {
      const currentData = readAdminExtrasFormData();
      state.extras.resultados = {
        ...(state.extras.resultados || {}),
        ...currentData,
        customAciertos: {
          ...((state.extras.resultados || {}).customAciertos || {}),
          ...(currentData.customAciertos || {}),
        },
      };
    });
    form.addEventListener('change', () => {
      const currentData = readAdminExtrasFormData();
      state.extras.resultados = {
        ...(state.extras.resultados || {}),
        ...currentData,
        customAciertos: {
          ...((state.extras.resultados || {}).customAciertos || {}),
          ...(currentData.customAciertos || {}),
        },
      };
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btnSaveAdminExtras');
      btn.disabled = true;
      btn.textContent = 'Guardando...';

      try {
        await saveAdminExtras(readAdminExtrasFormData());
      } catch (err) {
        // error toast handled in saveAdminExtras
      } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Resultados';
      }
    });
  }
}

// ============================================================
// Navegación
// ============================================================
function switchView(viewKey) {
  const views = { podio: 'viewPodio', quiniela: 'viewQuiniela', info: 'viewInfo', grupos: 'viewGrupos', extras: 'viewExtras' };
  if (knockoutEnabled()) views.finales = 'viewFinales';
  const target = views[viewKey] ? viewKey : 'info';
  state.activeView = target;
  document.body.classList.toggle('podio-mode', target === 'podio');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === target));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(views[target]).classList.add('active');
  if (target === 'quiniela') {
    stopGruposPolling();
  } else if (knockoutEnabled() && target === 'finales') {
    renderFinales();
    stopGruposPolling();
  } else if (target === 'grupos') {
    renderGrupos();
    startGruposPolling();
  } else if (target === 'extras') {
    renderExtras();
    stopGruposPolling();
  } else {
    stopGruposPolling();
  }
  updatePodioAudioPauseButton();
  renderShareToggle();
  if (target === 'podio' || target === 'extras') {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    podioMusicManuallyPaused = false;
    startPodioMusic();
    if (target === 'podio') renderPodio(true);
  } else {
    disposePodiumScene();
    stopPodioMusic();
  }
  if (target === 'quiniela' || target === 'finales' || target === 'extras') {
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
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
      state.selectedExtrasPerson = state.session.clave;
      subscribeFirestore();
      switchView(knockoutEnabled() ? 'finales' : 'quiniela');
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
      state.selectedExtrasPerson = state.session.clave;
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
  syncFeatureFlags();
  initNavigation();
  initPodioMusic();
  document.getElementById('btnRefresh').addEventListener('click', reconnect);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('sharePredictionsToggle').addEventListener('change', handleShareToggleChange);
  document.getElementById('btnQuinielaSettings')?.addEventListener('click', openSettingsModal);
  document.getElementById('settingsClose')?.addEventListener('click', closeSettingsModal);
  document.getElementById('btnJumpCurrent').addEventListener('click', scrollToCurrentMatch);
  document.getElementById('btnLiveSyncNow')?.addEventListener('click', handleLiveSyncNow);
  document.getElementById('btnFinalesPrev')?.addEventListener('click', () => focusFinalesRelative(-1));
  document.getElementById('btnFinalesCurrent')?.addEventListener('click', focusCurrentFinalesMatch);
  document.getElementById('btnFinalesNext')?.addEventListener('click', () => focusFinalesRelative(1));
  document.getElementById('btnFinalesBracketMode')?.addEventListener('click', () => setFinalesMode('bracket'));
  document.getElementById('btnFinalesListMode')?.addEventListener('click', () => setFinalesMode('list'));
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.adminEditingId !== null) {
        const ok = confirm('Tienes un resultado en edición. ¿Descartarlo y cambiar de sección?');
        if (!ok) return;
        state.adminEditingId = null;
      }
      state.adminSection = btn.dataset.adminSection;
      renderAdmin();
    });
  });
  document.getElementById('adminPredictionPerson')?.addEventListener('change', e => {
    state.adminPredictionPerson = e.currentTarget.value;
    renderAdminPredictions();
  });

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
  document.getElementById('playerPickerSearch')?.addEventListener('input', e => {
    renderPlayerPickerList(e.currentTarget.value);
  });
  document.getElementById('playerPickerCancel')?.addEventListener('click', closePlayerPicker);
  document.getElementById('playerPickerModal')?.addEventListener('click', e => {
    if (e.target.id === 'playerPickerModal') closePlayerPicker();
  });
  document.getElementById('settingsModal')?.addEventListener('click', e => {
    if (e.target.id === 'settingsModal') closeSettingsModal();
  });
  bootstrap();
});
