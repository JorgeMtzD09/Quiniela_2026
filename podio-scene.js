import * as THREE from './vendor/three.module.js';
import { groupByRank } from './podio.js';

const PODIUM = {
  1: { x: 0, z: -1.25, w: 1.02, h: 0.94, d: 0.7, color: 0xd49a13, dark: 0x7a4d05 },
  2: { x: -1.5, z: -1.08, w: 0.82, h: 0.68, d: 0.64, color: 0xaeb8c4, dark: 0x66717c },
  3: { x: 1.5, z: -1, w: 0.82, h: 0.56, d: 0.64, color: 0xb76328, dark: 0x713211 },
};

const FIELD = { width: 3.55, depth: 2.24, x: 0, z: 2.05 };

const METAL_PALETTES = {
  1: ['#BF953F', '#FCF6BA', '#B38728', '#FBF5B7', '#AA771C'],
  2: ['#8E9AA6', '#F8FAFC', '#AEB8C2', '#FFFFFF', '#6F7A86'],
  3: ['#8C3F18', '#FFD0A3', '#B85E26', '#F2A463', '#713012'],
};

function makeRoundedRectShape(w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function makeRoundedBox(w, h, d, radius) {
  const shape = makeRoundedRectShape(w, h, radius);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSize: radius * 0.38,
    bevelThickness: radius * 0.38,
    bevelSegments: 8,
    curveSegments: 12,
  });
  geo.center();
  return geo;
}

function createFieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 620;
  const ctx = canvas.getContext('2d');

  const stripe = canvas.width / 8;
  for (let i = 0; i < 8; i++) {
    const grad = ctx.createLinearGradient(i * stripe, 0, (i + 1) * stripe, canvas.height);
    grad.addColorStop(0, i % 2 ? '#56b24f' : '#449d46');
    grad.addColorStop(1, i % 2 ? '#247c39' : '#1f6e35');
    ctx.fillStyle = grad;
    ctx.fillRect(i * stripe, 0, stripe + 1, canvas.height);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillRect(x, y, 1, 1);
  }

  const m = 54;
  const w = canvas.width - m * 2;
  const h = canvas.height - m * 2;
  ctx.strokeStyle = 'rgba(235,248,238,0.78)';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.strokeRect(m, m, w, h);

  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, m);
  ctx.lineTo(canvas.width / 2, canvas.height - m);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 78, 0, Math.PI * 2);
  ctx.stroke();

  const boxW = 142;
  const boxH = 264;
  const smallW = 62;
  const smallH = 136;
  ctx.strokeRect(m, (canvas.height - boxH) / 2, boxW, boxH);
  ctx.strokeRect(canvas.width - m - boxW, (canvas.height - boxH) / 2, boxW, boxH);
  ctx.strokeRect(m, (canvas.height - smallH) / 2, smallW, smallH);
  ctx.strokeRect(canvas.width - m - smallW, (canvas.height - smallH) / 2, smallW, smallH);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createBallTexture(onLoad) {
  const texture = new THREE.TextureLoader().load('./assets/ballon.png', loaded => {
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.anisotropy = 8;
    onLoad?.();
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGrayBallTexture(onLoad) {
  const texture = new THREE.TextureLoader().load('./assets/ballon.png', loaded => {
    const image = loaded.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const red = pixels.data[i];
      const green = pixels.data[i + 1];
      const blue = pixels.data[i + 2];
      const gray = red * 0.24 + green * 0.58 + blue * 0.18;
      pixels.data[i] = gray * 0.78;
      pixels.data[i + 1] = gray * 0.82;
      pixels.data[i + 2] = gray * 0.9;
    }
    ctx.putImageData(pixels, 0, 0);

    texture.image = canvas;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    onLoad?.();
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMetalTexture(rank) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  paintMetalSurface(ctx, canvas, rank);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function paintMetalSurface(ctx, canvas, rank) {
  const stops = METAL_PALETTES[rank];
  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, stops[0]);
  base.addColorStop(0.25, stops[1]);
  base.addColorStop(0.5, stops[2]);
  base.addColorStop(0.75, stops[3]);
  base.addColorStop(1, stops[4]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.18;
  for (let i = -8; i < 18; i++) {
    const streak = ctx.createLinearGradient(0, 0, canvas.width, 0);
    streak.addColorStop(0, 'rgba(255,255,255,0)');
    streak.addColorStop(0.5, 'rgba(255,255,255,0.34)');
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = streak;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(i * 48, canvas.height);
    ctx.lineTo(i * 48 + canvas.width * 0.7, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function createShineTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(110, 70, 18, 160, 140, 220);
  glow.addColorStop(0, 'rgba(255,255,255,0.58)');
  glow.addColorStop(0.22, 'rgba(255,255,255,0.22)');
  glow.addColorStop(0.58, 'rgba(255,255,255,0.08)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rim = ctx.createLinearGradient(0, 0, 0, canvas.height);
  rim.addColorStop(0, 'rgba(255,255,255,0.32)');
  rim.addColorStop(0.18, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSpotBeamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const beam = ctx.createLinearGradient(0, 0, 0, canvas.height);
  beam.addColorStop(0, 'rgba(122, 231, 255, 0.46)');
  beam.addColorStop(0.22, 'rgba(98, 205, 255, 0.18)');
  beam.addColorStop(1, 'rgba(98, 205, 255, 0)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.42, 0);
  ctx.lineTo(canvas.width * 0.58, 0);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const core = ctx.createRadialGradient(canvas.width / 2, 60, 12, canvas.width / 2, 160, 260);
  core.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
  core.addColorStop(0.45, 'rgba(112, 222, 255, 0.12)');
  core.addColorStop(1, 'rgba(112, 222, 255, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 122);
  glow.addColorStop(0, 'rgba(255, 247, 205, 0.95)');
  glow.addColorStop(0.2, 'rgba(122, 236, 255, 0.58)');
  glow.addColorStop(0.48, 'rgba(37, 155, 212, 0.18)');
  glow.addColorStop(0.74, 'rgba(37, 155, 212, 0.05)');
  glow.addColorStop(1, 'rgba(37, 155, 212, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStadiumBackdropTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 448;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#130905');
  base.addColorStop(0.34, '#251007');
  base.addColorStop(0.68, '#071724');
  base.addColorStop(1, '#04111d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cupGlow = ctx.createRadialGradient(320, 130, 8, 320, 162, 162);
  cupGlow.addColorStop(0, 'rgba(255, 196, 64, 0.72)');
  cupGlow.addColorStop(0.3, 'rgba(255, 118, 24, 0.36)');
  cupGlow.addColorStop(1, 'rgba(255, 118, 24, 0)');
  ctx.fillStyle = cupGlow;
  ctx.fillRect(156, 0, 328, 324);

  const cup = ctx.createLinearGradient(262, 94, 381, 286);
  cup.addColorStop(0, 'rgba(255, 220, 107, 0.44)');
  cup.addColorStop(0.45, 'rgba(255, 136, 25, 0.34)');
  cup.addColorStop(1, 'rgba(120, 49, 11, 0.1)');
  ctx.fillStyle = cup;
  ctx.beginPath();
  ctx.ellipse(320, 106, 61, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(274, 127);
  ctx.bezierCurveTo(282, 206, 295, 275, 320, 306);
  ctx.bezierCurveTo(345, 275, 358, 206, 366, 127);
  ctx.bezierCurveTo(349, 153, 291, 153, 274, 127);
  ctx.fill();

  const crowd = ctx.createLinearGradient(0, 315, 0, 510);
  crowd.addColorStop(0, 'rgba(255, 167, 54, 0.18)');
  crowd.addColorStop(0.42, 'rgba(28, 37, 45, 0.66)');
  crowd.addColorStop(1, 'rgba(3, 14, 23, 0.94)');
  ctx.fillStyle = crowd;
  ctx.fillRect(0, 194, canvas.width, 130);

  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * canvas.width;
    const y = 188 + Math.random() * 106;
    const size = 0.5 + Math.random() * 1.7;
    ctx.fillStyle = Math.random() > 0.62 ? 'rgba(255, 177, 72, 0.55)' : 'rgba(255, 244, 205, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const drawLightRow = (startX, endX, y, warm = true) => {
    const count = 13;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = startX + (endX - startX) * t;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 24);
      glow.addColorStop(0, warm ? 'rgba(255, 225, 160, 0.9)' : 'rgba(115, 225, 255, 0.82)');
      glow.addColorStop(0.34, warm ? 'rgba(255, 146, 44, 0.28)' : 'rgba(82, 206, 255, 0.24)');
      glow.addColorStop(1, 'rgba(255, 180, 80, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 26, y - 26, 52, 52);
    }
  };
  drawLightRow(26, 188, 152, true);
  drawLightRow(452, 614, 152, true);

  const vignette = ctx.createRadialGradient(320, 212, 112, 320, 224, 374);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.72, 'rgba(0,0,0,0.24)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.64)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function drawLaurel(ctx, cx, cy, side, color, scale = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.86;
  ctx.lineWidth = 5 * scale;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(cx + side * 42 * scale, cy + 132 * scale);
  ctx.bezierCurveTo(
    cx + side * 146 * scale, cy + 90 * scale,
    cx + side * 198 * scale, cy - 22 * scale,
    cx + side * 164 * scale, cy - 144 * scale
  );
  ctx.stroke();

  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const y = cy + 102 * scale - t * 216 * scale;
    const curve = Math.sin(t * Math.PI) * 52 * scale;
    const x = cx + side * (92 * scale + curve + t * 46 * scale);
    const leafAngle = side * (-0.72 + t * 0.46);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(leafAngle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 * scale, 25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function createPodiumFrontTexture(rank) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  paintMetalSurface(ctx, canvas, rank);

  const textGradients = {
    1: ['#b87907', '#7a4c00', '#4d3100'],
    2: ['#9aa6b2', '#5f6b76', '#39434d'],
    3: ['#df8a4c', '#9b4316', '#5b2608'],
  };
  const [light, mid, dark] = textGradients[rank];
  const symbolGradient = ctx.createLinearGradient(0, 180, 0, 520);
  symbolGradient.addColorStop(0, light);
  symbolGradient.addColorStop(0.52, mid);
  symbolGradient.addColorStop(1, dark);

  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  drawLaurel(ctx, 384, 402, -1, symbolGradient, 1.02);
  drawLaurel(ctx, 384, 402, 1, symbolGradient, 1.02);

  ctx.font = '950 330px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeText(String(rank), 384, 375);
  ctx.fillStyle = symbolGradient;
  ctx.fillText(String(rank), 384, 375);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(start, end, value) {
  return start + (end - start) * value;
}

function podiumBallPosition(rank, index = 0, total = 1) {
  const cfg = PODIUM[rank];
  const offsets = ballClusterOffset(index, total, true);
  return {
    x: cfg.x + offsets.x,
    y: cfg.h - 0.42,
    z: cfg.z - 0.03 + offsets.z,
  };
}

function ballClusterOffset(index, total, onPodium) {
  if (total <= 1) return { x: 0, z: 0 };

  const scale = onPodium ? 1 : 0.9;
  const layouts = {
    2: [
      { x: -0.2, z: 0 },
      { x: 0.2, z: 0 },
    ],
    3: [
      { x: -0.23, z: 0.06 },
      { x: 0.23, z: 0.06 },
      { x: 0, z: -0.28 },
    ],
    4: [
      { x: -0.2, z: 0.08 },
      { x: 0.2, z: 0.08 },
      { x: -0.2, z: -0.22 },
      { x: 0.2, z: -0.22 },
    ],
  };

  const layout = layouts[Math.min(total, 4)];
  const point = layout[index % layout.length];
  return { x: point.x * scale, z: point.z * scale };
}

function ballSize(rank, total, onPodium) {
  if (!onPodium) return total > 1 ? 0.12 : 0.145;
  if (total === 1) return rank === 1 ? 0.24 : 0.225;
  if (total === 2) return rank === 1 ? 0.19 : 0.18;
  return rank === 1 ? 0.175 : 0.165;
}

function fieldCardFootprint(peopleCount) {
  const tieExtra = Math.min(Math.max(peopleCount - 1, 0), 3);
  return {
    width: 1.28 + tieExtra * 0.14,
    depth: 0.96 + tieExtra * 0.14,
  };
}

export class PodioScene {
  constructor(canvas, leaderboard) {
    this.canvas = canvas;
    this.leaderboard = leaderboard;
    this.disposed = false;
    this.objects = [];
    this.entryObjects = [];
    this.ballGroups = [];
    this.shineObjects = [];
    this.galaObjects = [];
    this.textures = [];
    this.labelTargets = [];
    this.startTime = performance.now();
    this.fieldRankPositions = this.createFieldRankPositions();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071320);
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 50);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.ballTexture = createBallTexture(() => this.resize());
    this.sadBallTexture = createGrayBallTexture(() => this.resize());
    this.fieldTexture = createFieldTexture();
    this.backdropTexture = createStadiumBackdropTexture();
    this.textures.push(this.backdropTexture);

    this.addLights();
    this.buildScene();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.resize();
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  add(object) {
    this.scene.add(object);
    this.objects.push(object);
    return object;
  }

  addEntryObject(object, delay = 0) {
    object.userData.baseY = object.position.y;
    object.userData.entryDelay = delay;
    this.entryObjects.push(object);
    return object;
  }

  screenPoint(vector, yOffset = 0) {
    const parent = this.canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const projected = vector.clone().project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height + yOffset,
    };
  }

  registerLabel(selector, vector, yOffset = 0) {
    const element = this.canvas.parentElement.querySelector(selector);
    if (!element) return;
    this.labelTargets.push({ element, vector, yOffset });
  }

  updateLabels() {
    this.labelTargets.forEach(target => {
      const point = this.screenPoint(target.vector, target.yOffset);
      target.element.style.setProperty('--label-x', `${point.x}px`);
      target.element.style.setProperty('--label-y', `${point.y}px`);
      target.element.classList.add('is-aligned');
    });
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff4df, 0x0a2a3e, 1.02));

    const key = new THREE.DirectionalLight(0xfff4df, 2.95);
    key.position.set(3.3, 5.2, 4.1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x83e7ff, 1.15);
    rim.position.set(-3.5, 2.5, -2.3);
    this.scene.add(rim);

    const leftSpot = new THREE.SpotLight(0x7ee7ff, 4.2, 8, Math.PI / 7, 0.55, 1.35);
    leftSpot.position.set(-2.8, 3.6, -2.6);
    leftSpot.target.position.set(-0.25, 0.45, -1.05);
    leftSpot.castShadow = false;
    this.scene.add(leftSpot);
    this.scene.add(leftSpot.target);

    const rightSpot = new THREE.SpotLight(0xffc66b, 3.3, 8, Math.PI / 7, 0.55, 1.35);
    rightSpot.position.set(2.8, 3.4, -2.4);
    rightSpot.target.position.set(0.25, 0.5, -1.05);
    rightSpot.castShadow = false;
    this.scene.add(rightSpot);
    this.scene.add(rightSpot.target);
  }

  buildScene() {
    this.addGalaBackdrop();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 9),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.035, 0.55);
    floor.receiveShadow = true;
    this.add(floor);

    this.addPodiums();
    this.addField();
    this.addBalls();
    this.registerLabels();
  }

  addGalaBackdrop() {
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 4.55),
      new THREE.MeshBasicMaterial({
        map: this.backdropTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    backdrop.position.set(0, 1.36, -3.35);
    this.add(backdrop);

    const stageFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 4.8),
      new THREE.MeshPhysicalMaterial({
        color: 0x062235,
        roughness: 0.48,
        metalness: 0.08,
        transparent: true,
        opacity: 0.72,
      })
    );
    stageFloor.rotation.x = -Math.PI / 2;
    stageFloor.position.set(0, -0.052, -0.62);
    stageFloor.receiveShadow = true;
    this.add(stageFloor);

    const beamTexture = createSpotBeamTexture();
    const glowTexture = createGlowTexture();
    this.textures.push(beamTexture, glowTexture);

    [
      { x: -1.45, y: 1.62, z: -2.58, rot: -0.48, scaleX: 1.08, color: 0x7ee7ff, opacity: 0.54 },
      { x: -0.75, y: 1.5, z: -2.54, rot: -0.24, scaleX: 0.85, color: 0xc7f8ff, opacity: 0.34 },
      { x: 1.45, y: 1.62, z: -2.58, rot: 0.48, scaleX: 1.08, color: 0xffc66b, opacity: 0.42 },
      { x: 0.75, y: 1.5, z: -2.54, rot: 0.24, scaleX: 0.85, color: 0xffe2a6, opacity: 0.28 },
    ].forEach(config => {
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(config.scaleX, 3.8),
        new THREE.MeshBasicMaterial({
          map: beamTexture,
          color: config.color,
          transparent: true,
          opacity: config.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      beam.position.set(config.x, config.y, config.z);
      beam.rotation.z = config.rot;
      beam.userData.baseOpacity = config.opacity;
      this.add(beam);
      this.galaObjects.push(beam);
    });

    [
      { x: -2.45, y: 2.78, color: 0x7ee7ff },
      { x: 2.45, y: 2.78, color: 0xffc66b },
    ].forEach(config => {
      const rig = new THREE.Group();
      rig.position.set(config.x, config.y, -2.82);
      rig.rotation.z = config.x < 0 ? -0.28 : 0.28;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const lamp = new THREE.Mesh(
            new THREE.CircleGeometry(0.075, 24),
            new THREE.MeshBasicMaterial({
              map: glowTexture,
              color: config.color,
              transparent: true,
              opacity: 0.92,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          );
          lamp.position.set((col - 1.5) * 0.18, (row - 1) * -0.16, 0);
          lamp.userData.baseOpacity = 0.76 + (row + col) * 0.025;
          rig.add(lamp);
        }
      }
      this.add(rig);
      this.galaObjects.push(rig);
    });
  }

  createFieldRankPositions() {
    const groups = [...groupByRank(this.leaderboard).entries()].filter(([rank]) => rank > 1);
    const positions = new Map();
    const placed = [];

    const boundsFor = footprint => ({
      minX: FIELD.x - FIELD.width / 2 + footprint.width / 2 + 0.18,
      maxX: FIELD.x + FIELD.width / 2 - footprint.width / 2 - 0.18,
      minZ: FIELD.z - FIELD.depth / 2 + footprint.depth / 2 + 0.14,
      maxZ: FIELD.z + FIELD.depth / 2 - footprint.depth / 2 - 0.14,
    });

    const frameFor = (x, z, footprint) => {
      const bounds = boundsFor(footprint);
      const cx = Math.max(bounds.minX, Math.min(bounds.maxX, x));
      const cz = Math.max(bounds.minZ, Math.min(bounds.maxZ, z));
      return {
        x: cx,
        z: cz,
        ...footprint,
        left: cx - footprint.width / 2,
        right: cx + footprint.width / 2,
        top: cz - footprint.depth / 2,
        bottom: cz + footprint.depth / 2,
      };
    };

    const overlaps = (a, b) => (
      a.left < b.right + 0.2 &&
      a.right + 0.2 > b.left &&
      a.top < b.bottom + 0.2 &&
      a.bottom + 0.2 > b.top
    );

    const hasRoomFor = candidate => placed.every(other => !overlaps(candidate, other));

    const randomFrame = footprint => {
      const bounds = boundsFor(footprint);
      return frameFor(
        bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ),
        footprint
      );
    };

    groups.forEach(([rank, people], index) => {
      const footprint = fieldCardFootprint(people.length);
      const bounds = boundsFor(footprint);
      const fallbackSlots = [
        { x: bounds.minX, z: bounds.minZ },
        { x: bounds.maxX, z: bounds.maxZ },
        { x: bounds.maxX, z: bounds.minZ },
        { x: bounds.minX, z: bounds.maxZ },
        { x: FIELD.x, z: bounds.minZ },
        { x: FIELD.x, z: bounds.maxZ },
      ].sort(() => Math.random() - 0.5);

      const candidates = [];
      if (placed.length) {
        placed.forEach(frame => {
          const oppositeX = frame.x <= FIELD.x ? bounds.maxX : bounds.minX;
          const oppositeZ = frame.z <= FIELD.z ? bounds.maxZ : bounds.minZ;
          candidates.push(frameFor(oppositeX, frame.z, footprint));
          candidates.push(frameFor(oppositeX, oppositeZ, footprint));
          candidates.push(frameFor(frame.x, oppositeZ, footprint));
        });
      }

      fallbackSlots.forEach(slot => candidates.push(frameFor(slot.x, slot.z, footprint)));
      for (let attempt = 0; attempt < 80; attempt++) {
        candidates.push(randomFrame(footprint));
      }

      candidates.sort((a, b) => {
        if (!placed.length) return Math.random() - 0.5;
        const distanceToPlaced = candidate => Math.min(...placed.map(frame => (
          Math.hypot(candidate.x - frame.x, candidate.z - frame.z)
        )));
        return distanceToPlaced(b) - distanceToPlaced(a);
      });

      let chosen = null;
      for (const candidate of candidates) {
        if (hasRoomFor(candidate)) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) chosen = candidates[index % candidates.length] || randomFrame(footprint);

      placed.push(chosen);
      positions.set(rank, { x: chosen.x, z: chosen.z });
    });

    return positions;
  }

  registerLabels() {
    const groups = groupByRank(this.leaderboard);

    [1].forEach(rank => {
      const podiumGroup = groups.get(rank) || [];
      if (!podiumGroup.length) return;
      const cfg = PODIUM[rank];
      const xOffset = 0;
      const yOffset = podiumGroup.length >= 3 ? 28 : 24;
      this.registerLabel(
        `.podium-label[data-rank="${rank}"]`,
        new THREE.Vector3(cfg.x + xOffset, cfg.h + 0.18, cfg.z - 0.02),
        yOffset
      );
    });

    [...groups.entries()]
      .filter(([rank]) => rank > 1)
      .forEach(([rank, people], groupIndex) => {
        if (!people.length) return;
        const world = this.fieldRankPositions.get(rank);
        if (!world) return;
        this.registerLabel(
          `.field-marker[data-field-index="${groupIndex}"][data-rank="${rank}"]`,
          new THREE.Vector3(world.x, 0.27, world.z),
          -18
        );
      });
  }

  addPodiums() {
  }

  addField() {
    const base = new THREE.Mesh(
      makeRoundedBox(FIELD.width + 0.18, 0.18, FIELD.depth + 0.2, 0.12),
      new THREE.MeshPhysicalMaterial({
        color: 0x21733a,
        roughness: 0.7,
        metalness: 0.05,
      })
    );
    base.position.set(FIELD.x, -0.09, FIELD.z);
    base.castShadow = true;
    base.receiveShadow = true;
    this.add(base);
    this.addEntryObject(base, 0.18);

    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.width, FIELD.depth, 1, 1),
      new THREE.MeshStandardMaterial({
        map: this.fieldTexture,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(FIELD.x, 0.012, FIELD.z);
    field.receiveShadow = true;
    this.add(field);
    this.addEntryObject(field, 0.2);

    this.addFieldLines();
  }

  addFieldLines() {
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xeaf7ee,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });
    const y = 0.04;
    const thickness = 0.025;
    const halfW = FIELD.width * 0.44;
    const halfD = FIELD.depth * 0.39;

    const addLine = (x, z, w, d) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.014, d), lineMaterial);
      mesh.position.set(x, y, z);
      this.add(mesh);
      this.addEntryObject(mesh, 0.28);
      return mesh;
    };

    const addRect = (cx, cz, w, d) => {
      addLine(cx, cz - d / 2, w, thickness);
      addLine(cx, cz + d / 2, w, thickness);
      addLine(cx - w / 2, cz, thickness, d);
      addLine(cx + w / 2, cz, thickness, d);
    };

    addRect(FIELD.x, FIELD.z, halfW * 2, halfD * 2);
    addLine(FIELD.x, FIELD.z, thickness, halfD * 2);

    const circle = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.014, 8, 72),
      lineMaterial
    );
    circle.rotation.x = Math.PI / 2;
    circle.position.set(FIELD.x, y + 0.004, FIELD.z);
    this.add(circle);
    this.addEntryObject(circle, 0.32);

    addRect(FIELD.x - halfW + 0.38, FIELD.z, 0.76, 0.82);
    addRect(FIELD.x + halfW - 0.38, FIELD.z, 0.76, 0.82);
    addRect(FIELD.x - halfW + 0.15, FIELD.z, 0.3, 0.42);
    addRect(FIELD.x + halfW - 0.15, FIELD.z, 0.3, 0.42);
  }

  addBall(x, y, z, rank, size = 0.22, options = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.userData.baseX = x;
    group.userData.baseY = y;
    group.userData.baseZ = z;
    group.userData.rank = rank;
    group.userData.onField = Boolean(options.onField);
    group.userData.isLast = Boolean(options.isLast);

    if (options.winner) {
      const glowTexture = createGlowTexture();
      this.textures.push(glowTexture);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 3.35, size * 3.35),
        new THREE.MeshBasicMaterial({
          map: glowTexture,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.z = -0.015;
      glow.userData.isWinnerGlow = true;
      group.add(glow);
    }

    const ball = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 2.25, size * 2.25),
      new THREE.MeshStandardMaterial({
        map: options.isLast ? this.sadBallTexture : this.ballTexture,
        transparent: true,
        alphaTest: 0.08,
        roughness: 0.52,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
    );
    ball.castShadow = true;
    group.userData.ball = ball;
    group.add(ball);

    if (options.onField) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const zDrift = (Math.random() - 0.5) * 0.56;
      group.userData.entryDelay = 0.34 + (options.fieldIndex || 0) * 0.18 + (options.ballIndex || 0) * 0.08 + Math.random() * 0.1;
      group.userData.entryDuration = options.isLast ? 2.65 : 1.55;
      group.userData.fromX = FIELD.x + side * (FIELD.width * 0.72 + 0.62);
      group.userData.fromY = y + (options.isLast ? 0.52 : 0.78);
      group.userData.fromZ = z + zDrift;
      group.userData.rollSide = -side;
      group.position.set(group.userData.fromX, group.userData.fromY, group.userData.fromZ);
    }

    this.add(group);
    if (!options.onField) {
      this.addEntryObject(group, 0.24 + rank * 0.025);
    }
    this.ballGroups.push(group);
    return group;
  }

  addBalls() {
    const groups = groupByRank(this.leaderboard);
    const lastRank = this.leaderboard.reduce((max, person) => Math.max(max, person.rank || 0), 0);

    [1].forEach(rank => {
      const people = groups.get(rank) || [];
      people.forEach((_, index) => {
        const size = ballSize(rank, people.length, true);
        const pos = podiumBallPosition(rank, index, people.length);
        this.addBall(pos.x, pos.y + size * 1.125 + 0.07, pos.z, rank, size, { winner: true });
      });
    });

    [...groups.entries()]
      .filter(([rank]) => rank > 1)
      .forEach(([rank, people], groupIndex) => {
        const pos = this.fieldRankPositions.get(rank);
        if (!pos) return;
        people.forEach((_, index) => {
          const offsets = ballClusterOffset(index, people.length, false);
          const world = {
            x: pos.x + offsets.x,
            z: pos.z + offsets.z,
          };
          const size = ballSize(rank, people.length, false);
          this.addBall(world.x, 0.18, world.z, rank, size, {
            onField: true,
            isLast: rank === lastRank,
            fieldIndex: groupIndex,
            ballIndex: index,
          });
        });
      });
  }

  fitCamera() {
    const parent = this.canvas.parentElement;
    const w = Math.max(parent?.clientWidth || 360, 320);
    const h = Math.max(parent?.clientHeight || 640, 520);
    const aspect = w / h;

    this.camera.aspect = aspect;
    if (aspect < 0.62) {
      this.camera.fov = 38;
      this.camera.position.set(0, 5.1, 9.35);
      this.camera.lookAt(0, 0.28, 0.58);
    } else {
      this.camera.fov = 33;
      this.camera.position.set(0, 4.9, 9.1);
      this.camera.lookAt(0, 0.28, 0.62);
    }
    this.camera.updateProjectionMatrix();
  }

  resize() {
    if (this.disposed) return;
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || 0;
    const h = parent?.clientHeight || 0;
    if (!w || !h) return;
    this.fitCamera();
    this.renderer.setSize(w, h, false);
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now();
    const time = now * 0.001;
    const elapsed = (now - this.startTime) / 1000;

    this.entryObjects.forEach(object => {
      const delay = object.userData.entryDelay || 0;
      const progress = clamp01((elapsed - delay) / 0.68);
      const eased = easeOutCubic(progress);
      object.position.y = (object.userData.baseY || 0) - (1 - eased) * 0.26;
    });

    this.ballGroups.forEach((group, index) => {
      const delay = group.userData.entryDelay || 0;
      if (group.userData.onField) {
        const duration = group.userData.entryDuration || 1.5;
        const progress = clamp01((elapsed - delay) / duration);
        const eased = easeOutCubic(progress);
        const sadWeight = group.userData.isLast ? 0.45 : 1;
        const rollFloat = Math.sin(time * 1.15 + index * 0.8) * 0.01 * sadWeight;
        const bounce = Math.sin(progress * Math.PI) * (group.userData.isLast ? 0.035 : 0.075);
        group.position.x = lerp(group.userData.fromX, group.userData.baseX, eased);
        group.position.z = lerp(group.userData.fromZ, group.userData.baseZ, eased);
        group.position.y = lerp(group.userData.fromY, group.userData.baseY, eased) + bounce + rollFloat;
        group.lookAt(this.camera.position);
        group.rotateZ((progress * Math.PI * (group.userData.isLast ? 2.25 : 4.4) + time * 0.28) * group.userData.rollSide);
        return;
      }

      const progress = clamp01((elapsed - delay) / 0.7);
      const eased = easeOutCubic(progress);
      const float = Math.sin(time * 1.6 + index * 0.75) * 0.024;
      group.position.y = group.userData.baseY - (1 - eased) * 0.3 + float;
      group.lookAt(this.camera.position);
      group.rotateZ(time * 1.35 + index * 0.45);
      const glow = group.children.find(child => child.userData?.isWinnerGlow);
      if (glow) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.15 + index * 0.65);
        glow.material.opacity = 0.48 + pulse * 0.28;
        const scale = 1 + pulse * 0.16;
        glow.scale.set(scale, scale, 1);
      }
    });
    this.shineObjects.forEach(shine => {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.35 + shine.userData.rank * 1.4);
      shine.position.x = shine.userData.baseX;
      shine.material.opacity = (shine.userData.rank === 1 ? 0.18 : 0.14) + pulse * (shine.userData.rank === 1 ? 0.16 : 0.12);
      const scale = 1 + pulse * 0.025;
      shine.scale.set(scale, scale, 1);
    });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();

    this.objects.forEach(object => {
      this.scene.remove(object);
      object.traverse?.(child => {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
          else child.material.dispose();
        }
      });
    });
    this.ballTexture?.dispose();
    this.sadBallTexture?.dispose();
    this.fieldTexture?.dispose();
    this.textures.forEach(texture => texture.dispose());
    this.renderer.dispose();
  }
}
