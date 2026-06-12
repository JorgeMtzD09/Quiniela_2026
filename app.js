// ============================================================
// CONFIGURACIÓN — Reemplaza con tu ID de Google Sheet
// ============================================================
const CONFIG = {
  SHEET_ID: '1vwX_s2GgYJ-dlX8zUcRqLavQYT6crxavuRuiH7M5-1w', // <-- Pega aquí el ID de tu Google Sheet
  REFRESH_INTERVAL: 60_000, // Auto-refresco cada 60 segundos
  USE_LOCAL_DATA: true,     // true = usa data/quiniela.json como fallback
};

// ============================================================
// Estado global
// ============================================================
let state = {
  partidos: [],
  participantes: [],
  pronosticos: {},
  podio: [],
  selectedPerson: null,
  lastUpdate: null,
  loading: false,
};

// ============================================================
// CSV Parser (para Google Sheets gviz)
// ============================================================
function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const lines = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      current += '\x00';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(line.split('\x00').map(cell => cell.trim()));
  }
  return rows;
}

function parseNumber(val) {
  if (val === '' || val === undefined || val === null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ============================================================
// Data fetching
// ============================================================
async function fetchSheetCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error al cargar "${sheetName}": ${res.status}`);
  return res.text();
}

async function fetchLocalJSON() {
  const res = await fetch('data/quiniela.json');
  if (!res.ok) throw new Error('No se pudo cargar data/quiniela.json');
  return res.json();
}

async function loadFromGoogleSheet() {
  const [partidosCSV, pronosticosCSV, participantesCSV] = await Promise.all([
    fetchSheetCSV('Partidos'),
    fetchSheetCSV('Pronosticos'),
    fetchSheetCSV('Participantes'),
  ]);

  const partidosRows = parseCSV(partidosCSV);
  const pronosticosRows = parseCSV(pronosticosCSV);
  const participantesRows = parseCSV(participantesCSV);

  const partidos = [];
  for (let i = 1; i < partidosRows.length; i++) {
    const r = partidosRows[i];
    if (!r[0]) continue;
    partidos.push({
      id: parseNumber(r[0]),
      grupo: r[1] || '',
      local: r[2],
      visitante: r[3],
      golesLocal: parseNumber(r[4]),
      golesVisitante: parseNumber(r[5]),
    });
  }

  const participantes = [];
  for (let i = 1; i < participantesRows.length; i++) {
    const r = participantesRows[i];
    if (!r[0]) continue;
    participantes.push({ clave: r[0], nombreVisible: r[1] });
  }

  const pronosticos = {};
  const header = pronosticosRows[0];
  const personCols = {};
  for (const p of participantes) {
    personCols[p.clave] = {
      l: header.indexOf(`${p.clave}_L`),
      v: header.indexOf(`${p.clave}_V`),
    };
    pronosticos[p.clave] = [];
  }

  for (let i = 1; i < pronosticosRows.length; i++) {
    const r = pronosticosRows[i];
    const id = parseNumber(r[0]);
    if (!id) continue;
    for (const p of participantes) {
      const cols = personCols[p.clave];
      pronosticos[p.clave].push({
        id,
        golesLocal: parseNumber(r[cols.l]),
        golesVisitante: parseNumber(r[cols.v]),
      });
    }
  }

  return { partidos, participantes, pronosticos };
}

async function loadFromLocalJSON(data) {
  return {
    partidos: data.partidos,
    participantes: data.participantes,
    pronosticos: data.pronosticos,
  };
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

function getWinnerLabel(golesL, golesV) {
  const out = getOutcome(golesL, golesV);
  if (out === 'L') return { text: 'Local', class: 'local' };
  if (out === 'V') return { text: 'Visitante', class: 'visitante' };
  return { text: 'Empate', class: 'empate' };
}

function buildPodio(partidos, participantes, pronosticos) {
  const scores = participantes.map(p => {
    let total = 0;
    let played = 0;
    let aciertos = 0;
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

    return {
      clave: p.clave,
      nombre: p.nombreVisible,
      puntos: total,
      jugados: played,
      aciertos,
    };
  });

  scores.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'));

  let rank = 0;
  let prevPts = null;
  const podio = scores.map(s => {
    if (s.puntos !== prevPts) {
      rank += 1;
      prevPts = s.puntos;
    }
    return { ...s, rank };
  });

  return podio;
}

// ============================================================
// Rendering
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
      <div class="podio-points">
        ${p.puntos}
        <span>pts</span>
      </div>
    </div>
  `).join('');
}

function renderPersonTabs() {
  const el = document.getElementById('personTabs');
  const ordered = state.podio.length
    ? state.podio.map(p => ({ clave: p.clave, nombreVisible: p.nombre }))
    : state.participantes;
  el.innerHTML = ordered.map(p => `
    <button class="person-tab ${state.selectedPerson === p.clave ? 'active' : ''}"
            data-person="${p.clave}">
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

  const participante = state.participantes.find(p => p.clave === person);
  const preds = state.pronosticos[person] || [];
  const predMap = {};
  preds.forEach(pr => { predMap[pr.id] = pr; });

  const podioEntry = state.podio.find(p => p.clave === person);
  const puntos = podioEntry ? podioEntry.puntos : 0;
  const rank = podioEntry ? podioEntry.rank : '-';
  const aciertos = podioEntry ? podioEntry.aciertos : 0;
  const jugados = podioEntry ? podioEntry.jugados : 0;

  document.getElementById('personSummary').innerHTML = `
    <div class="summary-stat">
      <span class="summary-value">${puntos}</span>
      <span class="summary-label">Puntos</span>
    </div>
    <div class="summary-stat">
      <span class="summary-value">${rank}º</span>
      <span class="summary-label">Posición</span>
    </div>
    <div class="summary-stat">
      <span class="summary-value">${aciertos}<small>/${jugados}</small></span>
      <span class="summary-label">Aciertos</span>
    </div>
  `;

  const played = state.partidos.filter(m => m.golesLocal !== null).length;
  document.getElementById('playedCount').textContent = `${played}/${state.partidos.length}`;

  const el = document.getElementById('personContent');
  el.innerHTML = state.partidos.map(m => {
    const pr = predMap[m.id];
    const isPlayed = m.golesLocal !== null;
    const hasPred = pr && pr.golesLocal !== null && pr.golesVisitante !== null;
    const pts = isPlayed && hasPred
      ? calcPoints(pr.golesLocal, pr.golesVisitante, m.golesLocal, m.golesVisitante)
      : null;

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
          <div class="score-box pred">
            <div class="score-label">Pronóstico</div>
            <div class="score-value ${hasPred ? '' : 'empty'}">${predText}</div>
          </div>
          <div class="score-box real">
            <div class="score-label">Resultado</div>
            <div class="score-value ${isPlayed ? '' : 'empty'}">${realText}</div>
          </div>
        </div>
        <div class="match-footer">
          ${ptsHTML}
        </div>
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderPodio();
  renderPersonTabs();
  renderPersonDetail();
}

// ============================================================
// Status & loading
// ============================================================
function setStatus(text, type = 'loading') {
  const dot = document.querySelector('.status-dot');
  const el = document.getElementById('statusText');
  dot.className = 'status-dot' + (type === 'ok' ? ' ok' : type === 'error' ? ' error' : '');
  el.textContent = text;
}

function showConfigError() {
  document.getElementById('podioContent').innerHTML = `
    <div class="error-box">
      <strong>Configuración necesaria</strong>
      <p style="margin-top:8px">Abre <code>app.js</code> y pega tu ID de Google Sheet en <code>CONFIG.SHEET_ID</code>.</p>
      <p style="margin-top:8px;font-size:0.8rem">Mientras tanto, se usan los datos locales de demostración.</p>
    </div>
  `;
}

// ============================================================
// Data load orchestration
// ============================================================
async function loadData() {
  if (state.loading) return;
  state.loading = true;

  const btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  setStatus('Actualizando...');

  try {
    let data;

    if (CONFIG.SHEET_ID) {
      data = await loadFromGoogleSheet();
      setStatus(`Actualizado ${formatTime(new Date())}`, 'ok');
    } else if (CONFIG.USE_LOCAL_DATA) {
      const json = await fetchLocalJSON();
      data = await loadFromLocalJSON(json);
      setStatus(`Demo local · ${formatTime(new Date())}`, 'ok');
    } else {
      showConfigError();
      setStatus('Sin configurar', 'error');
      return;
    }

    state.partidos = data.partidos;
    state.participantes = data.participantes;
    state.pronosticos = data.pronosticos;
    state.podio = buildPodio(state.partidos, state.participantes, state.pronosticos);
    state.lastUpdate = new Date();

    if (!state.selectedPerson && state.podio.length) {
      state.selectedPerson = state.podio[0].clave;
    }

    renderAll();
  } catch (err) {
    console.error('Error loading data:', err);
    setStatus('Error al cargar', 'error');

    if (CONFIG.USE_LOCAL_DATA && !CONFIG.SHEET_ID) {
      try {
        const json = await fetchLocalJSON();
        const data = await loadFromLocalJSON(json);
        state.partidos = data.partidos;
        state.participantes = data.participantes;
        state.pronosticos = data.pronosticos;
        state.podio = buildPodio(state.partidos, state.participantes, state.pronosticos);
        if (!state.selectedPerson && state.podio.length) state.selectedPerson = state.podio[0].clave;
        renderAll();
        setStatus(`Demo local (fallback) · ${formatTime(new Date())}`, 'ok');
      } catch {
        document.getElementById('podioContent').innerHTML = `
          <div class="error-box">
            <strong>Error al cargar datos</strong>
            <p style="margin-top:8px">${err.message}</p>
          </div>
        `;
      }
    }
  } finally {
    state.loading = false;
    btn.classList.remove('spinning');
  }
}

function formatTime(date) {
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Navigation
// ============================================================
function initNavigation() {
  const views = { podio: 'viewPodio', personas: 'viewPersonas' };

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(views[view]).classList.add('active');
    });
  });
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  document.getElementById('btnRefresh').addEventListener('click', loadData);
  loadData();
  setInterval(loadData, CONFIG.REFRESH_INTERVAL);
});
