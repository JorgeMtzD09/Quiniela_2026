import { formatDateCDMX, dayKeyCDMX, formatDayHeaderCDMX } from './fixtures-data.js';

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
const MATCH_LOCK_INTERVAL_MS = 30000;

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
  session: null,
  firebaseReady: false,
  editingMatchId: null,
  pendingSave: null,
  adminEditingId: null,
  adminPendingSave: null,
  clockOffset: 0,
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

function formatMatchDate(d) {
  if (!d) return 'Fecha por definir';
  return formatDateCDMX(d);
}

function matchDatetimeHTML(m) {
  return `<div class="match-datetime">${formatMatchDate(m.fecha)}</div>`;
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
  clearSession();
  state.selectedPerson = null;
  state.editingMatchId = null;
  state.pendingSave = null;
  state.partidos = [];
  state.participantes = [];
  state.pronosticos = {};
  state.pronosticosMeta = {};
  state.podio = [];
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

function renderPodio() {
  const el = document.getElementById('podioContent');
  if (!state.podio.length) {
    el.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Cargando podio...</div>';
    return;
  }
  el.innerHTML = state.podio.map(p => `
    <div class="podio-card rank-${p.rank <= 3 ? p.rank : ''}">
      <div class="podio-rank">${p.rank}</div>
      ${p.rank <= 3 ? `<div class="podio-medal">${getMedal(p.rank)}</div>` : '<div class="podio-medal"></div>'}
      <div class="podio-info">
        <div class="podio-name">${p.nombre}</div>
        <div class="podio-detail">${p.jugados} partidos jugados</div>
      </div>
      <div class="podio-points">${p.puntos}<span>pts</span></div>
    </div>
  `).join('');
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

function renderPersonDetail() {
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

  document.getElementById('personContent').innerHTML = renderMatchesByDay(
    state.partidos, { isOwn, savedItems, predMap }
  );

  attachEditingListeners();
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
  const hasPred = pr && pr.golesLocal !== null && pr.golesVisitante !== null;
  const pts = isPlayed && hasPred ? calcPoints(pr.golesLocal, pr.golesVisitante, m.golesLocal, m.golesVisitante) : null;
  const predL = hasPred ? pr.golesLocal : '–';
  const predV = hasPred ? pr.golesVisitante : '–';
  const realL = isPlayed ? m.golesLocal : '–';
  const realV = isPlayed ? m.golesVisitante : '–';
  let stateClass = 'state-pending';
  if (isPlayed) stateClass = pts && pts > 0 ? 'state-win' : 'state-lose';
  let ptsHTML;
  if (isPlayed) {
    ptsHTML = `<span class="match-points pts-${pts}">+${pts} ${pts === 1 ? 'punto' : 'puntos'}</span>`;
  } else if (saved) {
    ptsHTML = `<span class="match-points pts-saved">Guardado</span>`;
  } else {
    ptsHTML = `<span class="match-points pts-pending">Por jugar</span>`;
  }

  return `
    <div class="match-card ${stateClass}">
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

function renderMatchesByDay(partidos, ctx) {
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
        ${g.matches.map(m => buildMatchCard(m, ctx)).join('')}
      </div>
    </div>`).join('');
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
}

function showAdminView() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('viewAdmin').classList.add('active');
}

function renderAll() {
  renderPodio();
  renderPersonTabs();
  if (state.editingMatchId === null) renderPersonDetail();
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
// Navegación
// ============================================================
function switchView(viewKey) {
  const views = { podio: 'viewPodio', quiniela: 'viewQuiniela' };
  const target = views[viewKey] ? viewKey : 'podio';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === target));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(views[target]).classList.add('active');
  if (target === 'quiniela') renderPersonDetail();
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
      switchView('podio');
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
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('modalConfirm').addEventListener('click', handleModalConfirm);
  document.getElementById('modalCancel').addEventListener('click', handleModalCancel);
  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target.id === 'confirmModal') handleModalCancel();
  });
  bootstrap();
});
