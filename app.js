// ============================================================
// CONFIGURACIÓN — Pega aquí tu config de Firebase
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
  USE_LOCAL_FALLBACK: false,
};

const SESSION_KEY = 'quiniela_session_v1';
const FIREBASE_VERSION = '10.12.0';

// ============================================================
// Firebase (carga dinámica)
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
  if (!isFirebaseConfigured()) return false;

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
  saving: false,
};

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

// ============================================================
// Login
// ============================================================
async function login(usuario, password) {
  if (!db) throw new Error('Firebase no configurado');

  const u = usuario.trim().toLowerCase();
  if (!u) throw new Error('Escribe tu usuario');

  const { doc, getDoc } = firestoreFns;
  const snap = await getDoc(doc(db, 'usuarios', u));
  if (!snap.exists()) throw new Error('Usuario no encontrado');

  const data = snap.data();
  if (data.password !== password) throw new Error('Clave incorrecta');

  const participante = state.participantes.find(p => p.clave === data.clave);
  saveSession({
    usuario: u,
    clave: data.clave,
    nombreVisible: participante ? participante.nombreVisible : data.clave,
  });

  return state.session;
}

function logout() {
  clearSession();
  updateNavForSession();
  renderLogin();
  switchView('login');
}

// ============================================================
// Transformar datos Firestore → formato app
// ============================================================
function pronosticosFromFirestore(docs, partidos) {
  const pronosticos = {};
  const meta = {};

  for (const p of state.participantes) {
    pronosticos[p.clave] = partidos.map(m => ({
      id: m.id,
      golesLocal: null,
      golesVisitante: null,
    }));
    meta[p.clave] = { items: {} };
  }

  docs.forEach(d => {
    const data = d.data();
    const clave = d.id;
    if (!pronosticos[clave]) return;

    const items = data.items || {};
    meta[clave] = {
      items,
      actualizado: data.actualizado || null,
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

function applyData(partidos, participantes, pronosticos, meta) {
  state.partidos = partidos.sort((a, b) => a.id - b.id);
  state.participantes = participantes;
  state.pronosticos = pronosticos;
  state.pronosticosMeta = meta;
  state.podio = buildPodio(state.partidos, state.participantes, state.pronosticos);

  if (!state.selectedPerson && state.podio.length) {
    state.selectedPerson = state.podio[0].clave;
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
    if (state.session) renderMiQuiniela();
    setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
  };

  unsubscribers.push(
    onSnapshot(query(collection(db, 'partidos'), orderBy('id')), snap => {
      partidos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .map(m => ({
          id: Number(m.id),
          local: m.local,
          visitante: m.visitante,
          golesLocal: m.golesLocal != null && m.golesLocal !== '' ? Number(m.golesLocal) : null,
          golesVisitante: m.golesVisitante != null && m.golesVisitante !== '' ? Number(m.golesVisitante) : null,
        }));
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
    }, err => {
      console.error(err);
      setStatus('Error al leer participantes', 'error');
    })
  );

  unsubscribers.push(
    onSnapshot(collection(db, 'pronosticos'), snap => {
      pronosticosDocs = snap.docs;
      maybeUpdate();
    }, err => {
      console.error(err);
      setStatus('Error al leer pronósticos', 'error');
    })
  );
}

// ============================================================
// Fallback local (demo)
// ============================================================
async function loadLocalFallback() {
  const res = await fetch('data/quiniela.json');
  if (!res.ok) throw new Error('No se pudo cargar data/quiniela.json');
  const data = await res.json();

  const meta = {};
  for (const p of data.participantes) {
    const items = {};
    (data.pronosticos[p.clave] || []).forEach(pr => {
      if (pr.golesLocal != null && pr.golesVisitante != null) {
        items[String(pr.id)] = { l: pr.golesLocal, v: pr.golesVisitante };
      }
    });
    meta[p.clave] = { items };
  }

  applyData(data.partidos, data.participantes, data.pronosticos, meta);
  setStatus(`Demo local · ${formatTime(new Date())}`, 'ok');
}

// ============================================================
// Guardar pronósticos
// ============================================================
async function saveMiQuiniela(formData) {
  if (!state.session) throw new Error('Debes iniciar sesión');
  if (!db) throw new Error('Firebase no configurado');

  const clave = state.session.clave;
  const meta = state.pronosticosMeta[clave] || { items: {} };
  const savedItems = meta.items || {};

  // Solo se guardan los pronósticos NUEVOS capturados (uno por uno o varios).
  const nuevos = {};
  for (const m of state.partidos) {
    if (m.golesLocal !== null) continue;            // ya jugado: no se puede pronosticar
    if (savedItems[String(m.id)]) continue;          // ya guardado antes: bloqueado
    const l = formData.get(`l_${m.id}`);
    const v = formData.get(`v_${m.id}`);
    if (l === '' || v === '' || l == null || v == null) continue; // sin capturar: se permite dejarlo para después
    const gl = Number(l);
    const gv = Number(v);
    if (!Number.isInteger(gl) || !Number.isInteger(gv) || gl < 0 || gv < 0 || gl > 20 || gv > 20) {
      throw new Error('Los goles deben ser números enteros entre 0 y 20');
    }
    nuevos[String(m.id)] = { l: gl, v: gv };
  }

  const cantidad = Object.keys(nuevos).length;
  if (cantidad === 0) {
    throw new Error('No capturaste ningún pronóstico nuevo');
  }

  const { doc, setDoc, serverTimestamp } = firestoreFns;
  await setDoc(doc(db, 'pronosticos', clave), {
    items: { ...savedItems, ...nuevos },
    actualizado: serverTimestamp(),
  }, { merge: true });

  return cantidad;
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
  const predOut = getOutcome(predL, predV);
  const realOut = getOutcome(realL, realV);
  if (predOut === realOut) pts += 3;
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
// Rendering helpers
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
  el.innerHTML = ordered.map(p => `
    <button class="person-tab ${state.selectedPerson === p.clave ? 'active' : ''}" data-person="${p.clave}">
      ${p.nombreVisible}
    </button>
  `).join('');
  el.querySelectorAll('.person-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedPerson = btn.dataset.person;
      renderPersonTabs();
      renderPersonDetail();
    });
  });
}

function renderPersonDetail() {
  const person = state.selectedPerson;
  if (!person) return;

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

  const played = state.partidos.filter(m => m.golesLocal !== null).length;
  document.getElementById('playedCount').textContent = `${played}/${state.partidos.length}`;

  document.getElementById('personContent').innerHTML = state.partidos.map(m => {
    const pr = predMap[m.id];
    const isPlayed = m.golesLocal !== null;
    const hasPred = pr && pr.golesLocal !== null && pr.golesVisitante !== null;
    const pts = isPlayed && hasPred ? calcPoints(pr.golesLocal, pr.golesVisitante, m.golesLocal, m.golesVisitante) : null;
    const predText = hasPred ? `${pr.golesLocal} - ${pr.golesVisitante}` : '—';
    const realText = isPlayed ? `${m.golesLocal} - ${m.golesVisitante}` : '—';
    let stateClass = 'state-pending';
    if (isPlayed) stateClass = pts && pts > 0 ? 'state-win' : 'state-lose';
    const ptsHTML = isPlayed
      ? `<span class="match-points pts-${pts}">+${pts} ${pts === 1 ? 'punto' : 'puntos'}</span>`
      : `<span class="match-points pts-pending">Por jugar</span>`;

    return `
      <div class="match-card ${stateClass}">
        <div class="match-teams">
          ${teamBlock(m.local, 'home')}
          <span class="match-vs">vs</span>
          ${teamBlock(m.visitante, 'away')}
        </div>
        <div class="score-grid">
          <div class="score-box pred"><div class="score-label">Pronóstico</div><div class="score-value ${hasPred ? '' : 'empty'}">${predText}</div></div>
          <div class="score-box real"><div class="score-label">Resultado</div><div class="score-value ${isPlayed ? '' : 'empty'}">${realText}</div></div>
        </div>
        <div class="match-footer">${ptsHTML}</div>
      </div>`;
  }).join('');
}

function renderLogin() {
  const err = document.getElementById('loginError');
  err.hidden = true;
  err.textContent = '';
  if (!state.session) return;
  document.getElementById('loginUsuario').value = state.session.usuario || '';
}

function renderMiQuiniela() {
  const banner = document.getElementById('miQuinielaBanner');
  const content = document.getElementById('miQuinielaContent');
  const actions = document.getElementById('miQuinielaActions');

  if (!state.session) {
    banner.innerHTML = '';
    content.innerHTML = '<div class="info-box">Inicia sesión para capturar tus pronósticos.</div>';
    actions.innerHTML = '';
    return;
  }

  const clave = state.session.clave;
  const meta = state.pronosticosMeta[clave] || { items: {} };
  const savedItems = meta.items || {};

  const guardados = Object.keys(savedItems).length;
  const porCapturar = state.partidos.filter(m => m.golesLocal === null && !savedItems[String(m.id)]);

  if (porCapturar.length > 0) {
    banner.innerHTML = `<div class="info-box info-edit">Tienes <strong>${guardados}</strong> ${guardados === 1 ? 'pronóstico guardado' : 'pronósticos guardados'} y <strong>${porCapturar.length}</strong> por capturar. Puedes guardarlos de uno en uno; cada pronóstico que guardes queda bloqueado.</div>`;
  } else if (guardados > 0) {
    banner.innerHTML = `<div class="info-box info-locked">Ya capturaste todos tus pronósticos disponibles (${guardados} guardados). Están bloqueados.</div>`;
  } else {
    banner.innerHTML = `<div class="info-box">No hay partidos disponibles para pronosticar por ahora.</div>`;
  }

  content.innerHTML = `<form id="miQuinielaForm" class="mi-form">${state.partidos.map(m => {
    const isPlayed = m.golesLocal !== null;
    const saved = savedItems[String(m.id)];
    const teams = `<div class="match-teams">${teamBlock(m.local, 'home')}<span class="match-vs">vs</span>${teamBlock(m.visitante, 'away')}</div>`;

    // Ya guardado: bloqueado, se muestra el pronóstico
    if (saved) {
      return `
        <div class="match-card form-card saved-card">
          ${teams}
          <div class="form-saved-row">
            <span class="form-saved-score">${saved.l} - ${saved.v}</span>
            <span class="saved-badge">Guardado</span>
          </div>
        </div>`;
    }

    // Jugado y sin pronóstico guardado: ya no se puede pronosticar
    if (isPlayed) {
      return `
        <div class="match-card form-card disabled-card">
          ${teams}
          <p class="form-note">Partido ya jugado — no se puede pronosticar</p>
        </div>`;
    }

    // Editable
    return `
      <div class="match-card form-card">
        ${teams}
        <div class="form-score-row">
          <div class="form-score-field">
            <label class="form-score-label">${splitFlag(m.local).name || 'Local'}</label>
            <input class="form-score-input" type="number" min="0" max="20" step="1" name="l_${m.id}" inputmode="numeric" placeholder="-">
          </div>
          <span class="form-score-sep">—</span>
          <div class="form-score-field">
            <label class="form-score-label">${splitFlag(m.visitante).name || 'Visitante'}</label>
            <input class="form-score-input" type="number" min="0" max="20" step="1" name="v_${m.id}" inputmode="numeric" placeholder="-">
          </div>
        </div>
      </div>`;
  }).join('')}</form>`;

  if (porCapturar.length > 0) {
    actions.innerHTML = `
      <p class="save-warning">Solo se guardarán los pronósticos que hayas capturado. Una vez guardados, no se pueden editar.</p>
      <button type="button" class="btn-primary btn-save" id="btnSaveQuiniela">Guardar pronósticos capturados</button>
      <p class="save-error" id="saveError" hidden></p>`;
    document.getElementById('btnSaveQuiniela').addEventListener('click', handleSaveQuiniela);
  } else {
    actions.innerHTML = '';
  }
}

function renderAll() {
  renderPodio();
  renderPersonTabs();
  renderPersonDetail();
  updateNavForSession();
}

function updateNavForSession() {
  const label = document.getElementById('navMiQuinielaLabel');
  const navBtn = document.getElementById('navMiQuiniela');
  if (state.session) {
    label.textContent = 'Mi Quiniela';
    navBtn.dataset.view = 'miquiniela';
    document.getElementById('headerSubtitle').textContent = `Hola, ${state.session.nombreVisible}`;
  } else {
    label.textContent = 'Entrar';
    navBtn.dataset.view = 'login';
    document.getElementById('headerSubtitle').textContent = 'Fase de Grupos';
  }
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

function showConfigError() {
  document.getElementById('podioContent').innerHTML = `
    <div class="error-box">
      <strong>Configuración necesaria</strong>
      <p style="margin-top:8px">Pega tu configuración de Firebase en <code>app.js</code> (CONFIG.firebase).</p>
      <p style="margin-top:8px;font-size:0.8rem">Mientras tanto, se usan los datos locales de demostración.</p>
    </div>`;
}

// ============================================================
// Event handlers
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    await login(
      document.getElementById('loginUsuario').value,
      document.getElementById('loginPassword').value
    );
    updateNavForSession();
    renderMiQuiniela();
    switchView('miquiniela');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

async function handleSaveQuiniela() {
  if (state.saving) return;
  const ok = confirm('¿Guardar los pronósticos capturados?\n\nLos que guardes ya NO podrás editarlos. Los que dejes vacíos los podrás capturar después.');
  if (!ok) return;

  const errEl = document.getElementById('saveError');
  const btn = document.getElementById('btnSaveQuiniela');
  errEl.hidden = true;
  state.saving = true;
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const form = document.getElementById('miQuinielaForm');
    const cantidad = await saveMiQuiniela(new FormData(form));
    alert(`¡${cantidad} ${cantidad === 1 ? 'pronóstico guardado' : 'pronósticos guardados'}! Ya quedaron bloqueados.`);
    renderMiQuiniela();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    state.saving = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Guardar pronósticos capturados';
    }
  }
}

function switchView(viewKey) {
  const views = {
    podio: 'viewPodio',
    personas: 'viewPersonas',
    login: 'viewLogin',
    miquiniela: 'viewMiQuiniela',
  };
  const target = viewKey === 'login' && state.session ? 'miquiniela' : viewKey;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === target || (target === 'miquiniela' && b.dataset.view === 'miquiniela'));
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(views[target]).classList.add('active');
  if (target === 'miquiniela') renderMiQuiniela();
  if (target === 'login') renderLogin();
}

function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'miquiniela' && !state.session) {
        switchView('login');
        return;
      }
      switchView(view);
    });
  });
}

async function reconnect() {
  const btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  setStatus('Reconectando...');
  try {
    if (state.firebaseReady) {
      subscribeFirestore();
      setStatus(`En vivo · ${formatTime(new Date())}`, 'ok');
    } else {
      await bootstrap();
    }
  } catch (err) {
    setStatus('Error al reconectar', 'error');
    console.error(err);
  } finally {
    btn.classList.remove('spinning');
  }
}

// ============================================================
// Bootstrap
// ============================================================
async function bootstrap() {
  state.session = getSession();
  setStatus('Conectando...');

  try {
    if (isFirebaseConfigured()) {
      const ok = await initFirebase();
      if (ok) {
        state.firebaseReady = true;
        subscribeFirestore();
        setStatus('Conectando en tiempo real...', 'loading');
        return;
      }
    }

    if (CONFIG.USE_LOCAL_FALLBACK) {
      await loadLocalFallback();
      renderAll();
      updateNavForSession();
      renderMiQuiniela();
      return;
    }

    showConfigError();
    setStatus('Sin configurar', 'error');
  } catch (err) {
    console.error(err);
    if (CONFIG.USE_LOCAL_FALLBACK) {
      try {
        await loadLocalFallback();
        renderAll();
        updateNavForSession();
        renderMiQuiniela();
        setStatus(`Demo local (fallback) · ${formatTime(new Date())}`, 'ok');
        return;
      } catch { /* fall through */ }
    }
    setStatus('Error al cargar', 'error');
    document.getElementById('podioContent').innerHTML = `
      <div class="error-box"><strong>Error</strong><p style="margin-top:8px">${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  document.getElementById('btnRefresh').addEventListener('click', reconnect);
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('btnLogout').addEventListener('click', logout);
  bootstrap();
});
