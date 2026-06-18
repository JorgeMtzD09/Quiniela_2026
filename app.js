import {
  formatDateCDMX, dayKeyCDMX, formatDayHeaderCDMX, formatDayTabCDMX,
  GROUP_LETTERS, computeGroupStandings, parseApiStandings, mergeStandings,
  displayTeamName, teamFlag, getMatchGroup,
} from './fixtures-data.js';

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
};

const SESSION_KEY = 'quiniela_session_v1';
const FIREBASE_VERSION = '10.12.0';
const CLOCK_SYNC_URL = 'https://worldtimeapi.org/api/timezone/America/Mexico_City';
const STANDINGS_API_URL = 'https://wcup2026.org/api/data.php?action=standings';
const STANDINGS_POLL_MS = 60000;
const MATCH_LOCK_INTERVAL_MS = 30000;
// Duración aproximada de un partido (90' + medio tiempo + descuentos + margen) = 2h
const MATCH_DURATION_MS = 120 * 60 * 1000;

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
  clockOffset: 0,
  apiStandings: null,
  apiStandingsAt: null,
  activeView: 'info',
  gruposPollTimer: null,
};

let matchLockTimer = null;

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

// Partido en juego: ya inició, sigue dentro de la ventana de 1h45 y aún sin resultado final
function matchLive(m) {
  if (!m?.fecha) return false;
  if (m.golesLocal !== null) return false;
  const start = m.fecha.getTime();
  const now = nowMs();
  return now >= start && now < start + MATCH_DURATION_MS;
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
  stopGruposPolling();
  clearSession();
  state.selectedPerson = null;
  state.editingMatchId = null;
  state.pendingSave = null;
  state.partidos = [];
  state.participantes = [];
  state.pronosticos = {};
  state.pronosticosMeta = {};
  state.podio = [];
  state.apiStandings = null;
  state.apiStandingsAt = null;
  closeModal();
  document.body.classList.remove('admin-mode');
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
    meta[p.clave] = { items: {} };
  }

  docs.forEach(d => {
    const data = d.data();
    const clave = d.id;
    if (!pronosticos[clave]) return;

    const items = data.items || {};
    meta[clave] = { items, actualizado: data.actualizado || null };

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

  const maybeUpdate = () => {
    if (!partidos.length || !participantes.length) return;
    const { pronosticos, meta } = pronosticosFromFirestore(pronosticosDocs, partidos);
    applyData(partidos, participantes, pronosticos, meta);
    renderAll();
    setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
  };

  unsubscribers.push(
    onSnapshot(query(collection(db, 'partidos'), orderBy('id')), snap => {
      partidos = snap.docs.map(d => ({ id: d.id, ...d.data() })).map(m => ({
        id: Number(m.id),
        local: m.local,
        visitante: m.visitante,
        golesLocal: m.golesLocal != null && m.golesLocal !== '' ? Number(m.golesLocal) : null,
        golesVisitante: m.golesVisitante != null && m.golesVisitante !== '' ? Number(m.golesVisitante) : null,
        fecha: parsePartidoFecha(m.fecha),
      }));
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
    fecha: parsePartidoFecha(m.fecha),
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

async function saveMatchResult(docId, gl, gv) {
  if (!isAdminSession()) throw new Error('Sin permisos de admin');
  if (!db) throw new Error('Sin conexión');

  const { doc, updateDoc } = firestoreFns;
  await updateDoc(doc(db, 'partidos', docId), {
    golesLocal: gl,
    golesVisitante: gv,
  });
}

function buildAdminMatchCard(m) {
  const isPlayed = m.golesLocal !== null;
  const glVal = m.golesLocal != null ? m.golesLocal : '';
  const gvVal = m.golesVisitante != null ? m.golesVisitante : '';
  const teams = `<div class="match-teams">${teamBlock(m.local, 'home')}<span class="match-vs">vs</span>${teamBlock(m.visitante, 'away')}</div>`;
  const statusHTML = isPlayed
    ? `<span class="match-points pts-saved">Resultado: ${m.golesLocal} - ${m.golesVisitante}</span>`
    : `<span class="match-points pts-pending">Sin resultado</span>`;

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
  });
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
  state.adminPendingSave = { docId, gl: validated.gl, gv: validated.gv };
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
  state.adminPendingSave = { docId, gl: null, gv: null, reset: true };
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
  const { docId, gl, gv, reset } = pending;
  const btn = document.getElementById('modalConfirm');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    await saveMatchResult(docId, gl, gv);
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
  if (!m || m.golesLocal !== null) throw new Error('Ese partido ya no se puede pronosticar');
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
      if (m.golesLocal === null) continue;
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

function getMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

let lastPodioSig = '';

function podioSignature() {
  return state.podio.map(p => `${p.clave}:${p.rank}:${p.puntos}`).join('|');
}

function buildPodioMarcador(p, { last = false } = {}) {
  const rankClass = p.rank <= 3 ? `rank-${p.rank}` : '';
  const lastClass = last ? 'rank-last' : '';
  return `
    <div class="podium-marcador ${rankClass} ${lastClass}">
      <div class="marcador-header">
        <span class="marcador-rank">${p.rank}º</span>
        <span class="marcador-pts">${p.puntos} pts</span>
      </div>
      <div class="marcador-name">${p.nombre}</div>
    </div>`;
}

function buildPodioStackEntry(person, { baseDelay, animate, stackIndex, stackDelay = 340 }) {
  const delay = baseDelay + stackIndex * stackDelay;
  return `
    <div class="podium-stack-entry" style="--podio-delay: ${delay}ms; --stack-i: ${stackIndex}">
      <div class="podium-marcador-wrap ${animate ? 'podio-reveal-marcador' : ''}" style="--podio-delay: ${delay}ms">
        ${buildPodioMarcador(person)}
      </div>
      <div class="podium-ball-wrap ${animate ? 'podio-anim-drop' : ''}" style="--podio-delay: ${delay}ms">
        <div class="podium-ball ${animate ? 'podio-anim-bounce' : ''}" style="--podio-delay: ${delay}ms" aria-hidden="true">
          <span class="ball-skin">⚽</span>
        </div>
      </div>
    </div>`;
}

function buildPodioSlot(rank, people, baseDelay, animate) {
  const blockClass = `podium-block block-${rank} rank-${rank}`;
  const list = Array.isArray(people) ? people : (people ? [people] : []);
  const tieClass = list.length > 1 ? `podium-slot-tied podium-tie-${Math.min(list.length, 5)}` : '';

  if (!list.length) {
    return `
      <div class="podium-slot slot-${rank} podium-slot-empty">
        <div class="${blockClass}"></div>
      </div>`;
  }

  const stacked = list.map((person, i) =>
    buildPodioStackEntry(person, { baseDelay, animate, stackIndex: i })
  ).join('');

  return `
    <div class="podium-slot slot-${rank} ${tieClass}" style="--podio-delay: ${baseDelay}ms; --tie-count: ${list.length}">
      <div class="podium-stack">
        ${stacked}
      </div>
      <div class="${blockClass}">
        <span class="podium-medal">${getMedal(rank)}</span>
      </div>
    </div>`;
}

function getPodiumByRank(podio) {
  const byRank = { 1: [], 2: [], 3: [] };
  podio.forEach(p => {
    if (p.rank <= 3) byRank[p.rank].push(p);
  });
  return byRank;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const FIELD_SLOT_W = 26;
const FIELD_SLOT_H = 34;
const FIELD_SLOT_PAD = 4;
const FIELD_SLOT_GAP = 2;

function rectsOverlap(a, b, gap = FIELD_SLOT_GAP) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function gridFieldPlacement(player, placed) {
  const stepX = FIELD_SLOT_W + FIELD_SLOT_GAP;
  const stepY = FIELD_SLOT_H + FIELD_SLOT_GAP;
  for (let y = FIELD_SLOT_PAD; y + FIELD_SLOT_H <= 100 - FIELD_SLOT_PAD; y += stepY) {
    for (let x = FIELD_SLOT_PAD; x + FIELD_SLOT_W <= 100 - FIELD_SLOT_PAD; x += stepX) {
      const rect = { x, y, w: FIELD_SLOT_W, h: FIELD_SLOT_H };
      if (placed.every(p => !rectsOverlap(rect, p.rect))) {
        return { player, x, y, rect };
      }
    }
  }
  const n = placed.length;
  const cols = Math.max(1, Math.floor((100 - FIELD_SLOT_PAD * 2) / stepX));
  const x = FIELD_SLOT_PAD + (n % cols) * stepX * 0.85;
  const y = FIELD_SLOT_PAD + Math.floor(n / cols) * stepY * 0.85;
  return { player, x, y, rect: { x, y, w: FIELD_SLOT_W, h: FIELD_SLOT_H } };
}

function layoutFieldPlayers(players) {
  if (!players.length) return new Map();
  const order = shuffleInPlace([...players]);
  const placed = [];

  for (const player of order) {
    let spot = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = FIELD_SLOT_PAD + Math.random() * (100 - FIELD_SLOT_W - FIELD_SLOT_PAD * 2);
      const y = FIELD_SLOT_PAD + Math.random() * (100 - FIELD_SLOT_H - FIELD_SLOT_PAD * 2);
      const rect = { x, y, w: FIELD_SLOT_W, h: FIELD_SLOT_H };
      if (placed.every(p => !rectsOverlap(rect, p.rect))) {
        spot = { player, x, y, rect };
        break;
      }
    }
    if (!spot) spot = gridFieldPlacement(player, placed);
    placed.push(spot);
  }

  return new Map(placed.map(p => [p.player.clave, p]));
}

function buildPodioFieldEntry(p, { delay, animate, last, index, placement }) {
  const posStyle = placement
    ? `left: ${placement.x.toFixed(2)}%; top: ${placement.y.toFixed(2)}%;`
    : '';
  if (last) {
    return `
    <div class="podio-field-entry rank-last ${animate ? 'podio-anim-last-roll' : ''}" style="--podio-delay: ${delay}ms; --field-i: ${index}; ${posStyle}">
      <div class="podium-marcador-wrap ${animate ? 'podio-reveal-marcador-rest podio-reveal-marcador-sad' : ''}" style="--podio-delay: ${delay}ms">
        ${buildPodioMarcador(p, { last: true })}
      </div>
      <div class="podium-ball-wrap">
        <div class="podium-ball" aria-hidden="true">
          <span class="ball-skin">⚽</span>
        </div>
      </div>
    </div>`;
  }
  return `
    <div class="podio-field-entry" style="--podio-delay: ${delay}ms; --field-i: ${index}; ${posStyle}">
      <div class="podium-marcador-wrap ${animate ? 'podio-reveal-marcador-rest' : ''}" style="--podio-delay: ${delay}ms">
        ${buildPodioMarcador(p, { last: false })}
      </div>
      <div class="podium-ball-wrap ${animate ? 'podio-anim-drop' : ''}" style="--podio-delay: ${delay}ms">
        <div class="podium-ball podio-anim-bounce" style="--podio-delay: ${delay}ms" aria-hidden="true">
          <span class="ball-skin">⚽</span>
        </div>
      </div>
    </div>`;
}

function buildPodioRest(rest, animate, maxRank) {
  if (!rest.length) return '';
  const regular = rest.filter(p => p.rank !== maxRank);
  const lastOnes = rest.filter(p => p.rank === maxRank);
  const allField = [...regular, ...lastOnes];
  const placements = layoutFieldPlayers(allField);

  let delay = 1100;
  const regularHtml = regular.map((p, i) => {
    const html = buildPodioFieldEntry(p, {
      delay,
      animate,
      last: false,
      index: i,
      placement: placements.get(p.clave),
    });
    delay += 420;
    return html;
  }).join('');

  let lastDelay = delay + (regular.length ? 180 : 0);
  const lastHtml = lastOnes.map((p, i) => {
    const html = buildPodioFieldEntry(p, {
      delay: lastDelay,
      animate,
      last: true,
      index: regular.length + i,
      placement: placements.get(p.clave),
    });
    lastDelay += 280;
    return html;
  }).join('');

  return `
    <div class="podio-field">
      <div class="podio-field-grass" aria-hidden="true"></div>
      <div class="podio-field-lines" aria-hidden="true"></div>
      <div class="podio-field-players">
        ${regularHtml}${lastHtml}
      </div>
    </div>`;
}

const PODIO_FIELD_SETTLE_MS = 2800;
const PODIO_LAST_SETTLE_MS = 3600;
let podioFieldTimers = [];

function setupPodioFieldSettle(container, animate) {
  podioFieldTimers.forEach(clearTimeout);
  podioFieldTimers = [];
  if (!animate) {
    container.querySelectorAll('.podio-field-entry .podium-marcador-wrap').forEach(el => {
      el.classList.add('marcador-visible');
    });
    return;
  }
  container.querySelectorAll('.podio-field-entry').forEach(entry => {
    const delay = parseInt(entry.style.getPropertyValue('--podio-delay') || '0', 10);
    const settleMs = entry.classList.contains('rank-last') ? PODIO_LAST_SETTLE_MS : PODIO_FIELD_SETTLE_MS;
    podioFieldTimers.push(setTimeout(() => {
      entry.querySelector('.podium-marcador-wrap')?.classList.add('marcador-visible');
    }, delay + settleMs));
  });
}

function renderPodio(forceAnimate = false) {
  const el = document.getElementById('podioContent');
  if (!state.podio.length) {
    podioFieldTimers.forEach(clearTimeout);
    podioFieldTimers = [];
    el.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Cargando podio...</div>';
    el.classList.remove('podio-animate');
    lastPodioSig = '';
    return;
  }

  const sig = podioSignature();
  const animate = forceAnimate || sig !== lastPodioSig;
  lastPodioSig = sig;

  const maxRank = Math.max(...state.podio.map(p => p.rank));
  const byRank = getPodiumByRank(state.podio);
  const rest = state.podio.filter(p => p.rank > 3);
  const topDelays = { 2: 0, 1: 450, 3: 900 };
  const hasPodiumTies = [1, 2, 3].some(r => byRank[r].length > 1);

  el.innerHTML = `
    <div class="podio-stage">
      <div class="podio-podium ${hasPodiumTies ? 'podio-podium-tied' : ''}">
        ${buildPodioSlot(2, byRank[2], topDelays[2], animate)}
        ${buildPodioSlot(1, byRank[1], topDelays[1], animate)}
        ${buildPodioSlot(3, byRank[3], topDelays[3], animate)}
      </div>
      ${buildPodioRest(rest, animate, maxRank)}
    </div>`;

  el.classList.toggle('podio-animate', animate);
  setupPodioFieldSettle(el, animate);
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
    const played = state.partidos.filter(m => m.golesLocal !== null).length;
    playedCountEl.textContent = `${played}/${state.partidos.length}`;
  }

  const ctx = { isOwn, savedItems, predMap };
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

// El primer partido que aún no tiene resultado: el primero en estatus
// "Guardado" (con pronóstico) o "Por jugar" (sin pronóstico), es decir,
// el primero después del último ya jugado con resultado.
function getCurrentMatchId() {
  const target = state.partidos.find(m => m.golesLocal === null);
  return target ? target.id : null;
}

// Devuelve la tarjeta del primer partido pendiente, si existe y la vista
// Quiniela está activa.
function getCurrentMatchCard() {
  const quinielaActive = document.getElementById('viewQuiniela')?.classList.contains('active');
  if (!quinielaActive) return null;
  const id = getCurrentMatchId();
  if (id === null) return null;
  return document.querySelector(`#personContent .match-card[data-match-id="${id}"]`);
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

  const quinielaActive = document.getElementById('viewQuiniela')?.classList.contains('active');
  if (!quinielaActive) {
    btn.hidden = true;
    return;
  }

  const id = getCurrentMatchId();
  if (id === null) { btn.hidden = true; return; }

  const card = getCurrentMatchCard();
  if (!card) {
    btn.hidden = false;
    btn.classList.remove('points-up');
    return;
  }

  const sticky = document.querySelector('#viewQuiniela .quiniela-sticky');
  const nav = document.getElementById('bottomNav');
  const regionTop = sticky ? sticky.getBoundingClientRect().bottom : 0;
  const navTop = nav && nav.style.display !== 'none' ? nav.getBoundingClientRect().top : window.innerHeight;
  const regionBottom = Math.min(window.innerHeight, navTop);

  const rect = card.getBoundingClientRect();
  const visible = rect.bottom > regionTop + 8 && rect.top < regionBottom - 8;

  if (visible) { btn.hidden = true; return; }

  btn.hidden = false;
  // Si la tarjeta está por debajo de la zona visible, la flecha apunta abajo;
  // si está por arriba, apunta arriba.
  const pointsUp = rect.top < regionTop;
  btn.classList.toggle('points-up', pointsUp);
}

// Hace scroll suave hasta el primer partido pendiente, compensando la barra fija.
function scrollToCurrentMatch() {
  const dayChanged = ensureDayForCurrentMatch();
  const scrollToCard = () => {
    const card = getCurrentMatchCard();
    if (!card) return;

    const sticky = document.querySelector('#viewQuiniela .quiniela-sticky');
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

function buildMatchCard(m, { isOwn, savedItems, predMap }) {
  const isPlayed = m.golesLocal !== null;
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
  const isLive = !isPlayed && matchLive(m);
  const hasPred = pr && pr.golesLocal !== null && pr.golesVisitante !== null;
  const pts = isPlayed && hasPred ? calcPoints(pr.golesLocal, pr.golesVisitante, m.golesLocal, m.golesVisitante) : 0;
  const predL = hasPred ? pr.golesLocal : '–';
  const predV = hasPred ? pr.golesVisitante : '–';
  const realL = isPlayed ? m.golesLocal : '–';
  const realV = isPlayed ? m.golesVisitante : '–';
  let stateClass = 'state-pending';
  if (isPlayed) stateClass = pts && pts > 0 ? 'state-win' : 'state-lose';
  else if (isLive) stateClass = 'state-live';
  let ptsHTML;
  if (isPlayed) {
    ptsHTML = `<span class="match-points pts-${pts}">+${pts} ${pts === 1 ? 'punto' : 'puntos'}</span>`;
  } else if (isLive) {
    ptsHTML = `<span class="match-points pts-live"><span class="live-ball">⚽</span> Jugando ahora</span>`;
  } else if (saved) {
    ptsHTML = `<span class="match-points pts-saved">Guardado</span>`;
  } else {
    ptsHTML = `<span class="match-points pts-pending">Por jugar</span>`;
  }

  return `
    <div class="match-card ${stateClass}" data-match-id="${m.id}">
      ${matchDatetimeHTML(m)}
      ${teams}
      <div class="score-rows">
        <div class="score-row pred">
          <span class="score-num ${hasPred ? '' : 'empty'}">${predL}</span>
          <span class="score-row-label">Pronóstico</span>
          <span class="score-num ${hasPred ? '' : 'empty'}">${predV}</span>
        </div>
        <div class="score-row real">
          <span class="score-num ${isPlayed ? '' : 'empty'}">${realL}</span>
          <span class="score-row-label">Resultado</span>
          <span class="score-num ${isPlayed ? '' : 'empty'}">${realV}</span>
        </div>
      </div>
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

  if (!logged) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('viewLogin').classList.add('active');
  } else if (admin) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('viewAdmin').classList.add('active');
  }
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
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === target));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(views[target]).classList.add('active');
  if (target === 'quiniela') {
    renderDayTabs();
    renderPersonDetail();
    stopGruposPolling();
  } else if (target === 'grupos') {
    renderGrupos();
    startGruposPolling();
  } else {
    stopGruposPolling();
  }
  if (target === 'podio') renderPodio(true);
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
  initNavigation();
  document.getElementById('btnRefresh').addEventListener('click', reconnect);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnJumpCurrent').addEventListener('click', scrollToCurrentMatch);

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
