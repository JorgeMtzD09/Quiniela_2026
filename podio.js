/**
 * Podio 3D scene with HTML labels.
 */

export const RANK_COLORS = {
  1: '#F4C84A',
  2: '#B8C3CE',
  3: '#C97A3E',
};

export const FIELD_ACCENT_COLORS = ['#2F80ED', '#7BBF21', '#14A7B8', '#6B8EEC', '#19A974', '#9A6BF2'];

export const FIELD_POSITIONS = [
  { left: 78, top: 25 },
  { left: 38, top: 66 },
  { left: 20, top: 42 },
  { left: 73, top: 72 },
  { left: 52, top: 34 },
  { left: 87, top: 54 },
  { left: 28, top: 79 },
  { left: 58, top: 55 },
];

const BALL_SVG = `<svg class="ball-svg" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="ballShade" cx="30%" cy="22%" r="72%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="52%" stop-color="#e7edf2"/>
      <stop offset="100%" stop-color="#9ea8b2"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="29" fill="url(#ballShade)"/>
  <path fill="#20242b" d="m32 10 8.1 6-3.1 9.4H27l-3.1-9.4L32 10z"/>
  <path fill="#20242b" d="m32 27 8.8 6.5-3.4 10.3H26.6l-3.4-10.3L32 27z"/>
  <path fill="none" stroke="#353a42" stroke-width="2.2" stroke-linecap="round" d="m24 16-9 8m25-8 9 8M23 34l-10 3m28-3 10 3M27 44l-5 10m15-10 5 10"/>
</svg>`;

export function getRankColor(rank) {
  if (rank === 1) return RANK_COLORS[1];
  return FIELD_ACCENT_COLORS[(rank - 2) % FIELD_ACCENT_COLORS.length];
}

export function groupByRank(leaderboard) {
  const groups = new Map();
  const sorted = [...leaderboard].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'es'));
  for (const participant of sorted) {
    if (!groups.has(participant.rank)) groups.set(participant.rank, []);
    groups.get(participant.rank).push(participant);
  }
  return groups;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function namesHtml(group) {
  if (group.length > 1) {
    return group
      .map(p => `<span class="tie-name">${escapeHtml(p.name)}</span>`)
      .join('');
  }

  return group
    .map(p => `<span>${escapeHtml(p.name)}</span>`)
    .join('');
}

function buildFallbackBalls(group, rank) {
  const accent = getRankColor(rank);
  return `
    <div class="ball-cluster count-${Math.min(group.length, 4)}" aria-hidden="true">
      ${group.map(() => `
        <span class="ball-token" style="--accent: ${accent}">
          <span class="ball-aura"></span>
          ${BALL_SVG}
        </span>`).join('')}
    </div>`;
}

function buildSharedCard(rank, group, context) {
  const accent = getRankColor(rank);
  const tie = group.length > 1;
  const points = group[0]?.points ?? 0;
  if (context === 'on-podium') {
    return `
    <article class="rank-card rank-${rank} ${context}${tie ? ' is-tie' : ''}" style="--accent: ${accent}">
      <div class="rank-card-points-header">${points} pts</div>
      <div class="rank-card-name">${namesHtml(group)}</div>
      ${tie ? `<div class="tie-chip">${group.length} empatados</div>` : ''}
    </article>`;
  }

  return `
    <article class="rank-card rank-${rank} ${context}${tie ? ' is-tie' : ''}" style="--accent: ${accent}">
      <div class="rank-card-meta">
        <span>${points} pts</span>
      </div>
      <div class="rank-card-name">${namesHtml(group)}</div>
      ${tie ? `<div class="tie-chip">${group.length} empatados</div>` : ''}
    </article>`;
}

function buildPodiumLabel(rank, group) {
  const hasPeople = group.length > 0;
  return `
    <div class="podium-label slot-${rank}${hasPeople ? '' : ' is-empty'} tie-count-${Math.min(group.length, 4)}" data-rank="${rank}">
      ${hasPeople ? buildSharedCard(rank, group, 'on-podium') : '<span></span>'}
      ${hasPeople ? buildFallbackBalls(group, rank) : '<span></span>'}
    </div>`;
}

function buildFieldLabel(rank, group, index) {
  const pos = FIELD_POSITIONS[index % FIELD_POSITIONS.length];
  return `
    <div class="field-marker" data-rank="${rank}" data-field-index="${index}" style="--label-x: ${pos.left}%; --label-y: ${pos.top}%; --accent: ${getRankColor(rank)}">
      ${buildSharedCard(rank, group, 'on-field')}
      <span class="field-tail" aria-hidden="true"></span>
      ${buildFallbackBalls(group, rank)}
    </div>`;
}

function buildOverlay(leaderboard) {
  const groups = groupByRank(leaderboard);
  const fieldGroups = [...groups.entries()].filter(([rank]) => rank > 1);

  return `
    <div class="podio-overlay">
      <section class="podium-labels" aria-label="Primeros lugares">
        <div class="podium-label-row">
          ${buildPodiumLabel(1, groups.get(1) || [])}
        </div>
      </section>
      <section class="field-labels" aria-label="Resto de participantes">
        ${fieldGroups.map(([rank, group], index) => buildFieldLabel(rank, group, index)).join('')}
      </section>
    </div>`;
}

let activeScene = null;
let lastLeaderboardSig = '';

function loadingHTML() {
  return `
    <div class="podio-loading" role="status" aria-live="polite">
      <img class="podio-loading-logo" src="assets/loading-logo.gif" alt="">
      <span class="podio-loading-text">Cargando...</span>
    </div>`;
}

export function mapAppPodioToLeaderboard(podio) {
  return podio.map(p => ({
    id: p.clave,
    name: p.nombre,
    points: p.puntos,
    rank: p.rank,
  }));
}

export async function renderPodiumScreen(container, leaderboard, options = {}) {
  if (!container) return;

  const sig = leaderboard.map(p => `${p.id}:${p.rank}:${p.points}`).join('|');
  const force = options.animate || options.force;

  if (!leaderboard.length) {
    lastLeaderboardSig = '';
    activeScene?.dispose();
    activeScene = null;
    container.innerHTML = loadingHTML();
    container.classList.remove('podio-3d-mode', 'podio-has-webgl');
    return;
  }

  if (sig === lastLeaderboardSig && activeScene && !force) {
    requestAnimationFrame(() => activeScene?.resize());
    return;
  }

  lastLeaderboardSig = sig;
  activeScene?.dispose();
  activeScene = null;

  container.innerHTML = `
    <div class="podio-stage" role="img" aria-label="Tabla del podio de la quiniela">
      <canvas class="podio-webgl" aria-hidden="true"></canvas>
      ${buildOverlay(leaderboard)}
      ${loadingHTML()}
    </div>`;
  container.classList.add('podio-3d-mode');
  container.classList.remove('podio-has-webgl');

  try {
    const { PodioScene } = await import('./podio-scene.js');
    const canvas = container.querySelector('.podio-webgl');
    activeScene = new PodioScene(canvas, leaderboard);
    container.classList.add('podio-has-webgl');
    container.querySelector('.podio-loading')?.remove();
  } catch (err) {
    console.warn('Escena 3D no disponible, usando fallback HTML:', err);
    container.querySelector('.podio-loading')?.remove();
  }
}

export function disposePodiumScene() {
  activeScene?.dispose();
  activeScene = null;
  lastLeaderboardSig = '';
}

export const DEMO_LEADERBOARD = [
  { id: '1', name: 'Abi', points: 63, rank: 1 },
  { id: '2', name: 'Tety', points: 59, rank: 2 },
  { id: '3', name: 'Angel', points: 56, rank: 3 },
  { id: '4', name: 'Abuelo', points: 52, rank: 4 },
  { id: '5', name: 'Coque', points: 49, rank: 5 },
];

export const DEMO_LEADERBOARD_TIE = [
  { id: '1', name: 'Abi', points: 63, rank: 1 },
  { id: '2', name: 'Tety', points: 59, rank: 2 },
  { id: '3', name: 'Angel', points: 59, rank: 2 },
  { id: '4', name: 'Abuelo', points: 56, rank: 3 },
  { id: '5', name: 'Coque', points: 52, rank: 4 },
];

export const DEMO_LEADERBOARD_TRIPLE_TIE = [
  { id: '1', name: 'Abi', points: 63, rank: 1 },
  { id: '2', name: 'Tety', points: 59, rank: 2 },
  { id: '3', name: 'Angel', points: 59, rank: 2 },
  { id: '4', name: 'Abuelo', points: 59, rank: 2 },
  { id: '5', name: 'Coque', points: 52, rank: 3 },
];
