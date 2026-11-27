// Hair is built ONLY from strokes and transparent gradients, never a filled cap.
// This file is independent of WebGL so texture pixels can be regression-tested.
export const TEXTURE_SIZE = 640;
export const HAIR_BOUNDS = Object.freeze({ left: -.85, right: .85, top: .85, bottom: -.8 });
export const STRAND_PROFILES = {
  curls: { height: .46, width: 1.12, fringe: .025, kind: 'curls', count: 440, fade: 0 },
  buzz: { height: .24, width: 1.02, fringe: 0, kind: 'stubble', count: 0, fade: .05 },
  classic: { height: .40, width: 1.05, fringe: .015, kind: 'combed', count: 2300, fade: 0 },
  scissor: { height: .42, width: 1.10, fringe: .025, kind: 'natural', count: 2200, fade: 0 },
  junior: { height: .28, width: .98, fringe: .07, kind: 'fringe', count: 1900, fade: 0 },
  texture: { height: .39, width: 1.08, fringe: .04, kind: 'waves', count: 2400, fade: .12 },
  crew: { height: .26, width: 1.00, fringe: .01, kind: 'short', count: 1700, fade: .08 },
  skin: { height: .37, width: 1.02, fringe: 0, kind: 'swept', count: 1900, fade: .14 },
  high: { height: .40, width: 1.04, fringe: .015, kind: 'natural', count: 2000, fade: .10 },
  low: { height: .40, width: 1.10, fringe: .02, kind: 'swept', count: 2100, fade: -.22 },
  mid: { height: .38, width: 1.06, fringe: .02, kind: 'natural', count: 2100, fade: -.02 },
  lines: { height: .33, width: 1.04, fringe: .01, kind: 'short', count: 1900, fade: .06 },
  flat: { height: .37, width: .99, fringe: .005, kind: 'flat', count: 2100, fade: .09 },
  crop: { height: .29, width: 1.03, fringe: .10, kind: 'fringe', count: 2300, fade: .08 },
  mohawk: { height: .58, width: .43, fringe: .01, kind: 'crest', count: 1900, fade: .17 },
  mullet: { height: .32, width: 1.07, fringe: .03, kind: 'natural', count: 1900, fade: 0, nape: true },
  pompadour: { height: .60, width: 1.08, fringe: 0, kind: 'pompadour', count: 2500, fade: .04 },
  quiff: { height: .50, width: 1.02, fringe: .015, kind: 'quiff', count: 2300, fade: .06 },
  taper: { height: .37, width: 1.10, fringe: .02, kind: 'combed', count: 2200, fade: -.30 },
  undercut: { height: .43, width: 1.04, fringe: 0, kind: 'disconnected', count: 2300, fade: .16 },
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function seedFor(key) { let seed = 2166136261; for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619); return seed; }
export function colorPalette(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Tono de cabello no válido.');
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return {
    color(light = 0, alpha = 1) {
      const adjusted = rgb.map(c => Math.round(clamp(light < 0 ? c * (1 + light) : c + (255 - c) * light, 0, 255)));
      return `rgba(${adjusted.join(',')},${clamp(alpha, 0, 1)})`;
    },
  };
}
export function defaultSurface(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
function context(surface) {
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la textura capilar.');
  ctx.setTransform(surface.width / 1.7, 0, 0, -surface.height / 1.65, surface.width / 2, surface.height * .85 / 1.65);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; return ctx;
}
export function hairline(x, profile) {
  const temples = Math.pow(Math.min(1, Math.abs(x) / .5), 3);
  const sideburn = Math.pow(clamp((Math.abs(x) - .40) / .12, 0, 1), 1.4) * .18;
  return -.16 * temples - profile.fringe * (1 - temples) - sideburn;
}
function crown(x, p) {
  return p.height * Math.sqrt(Math.max(.015, 1 - (x / (p.width * .5)) ** 2));
}
function strandPaint(ctx, palette, x, y, rand, low = false) {
  const gradient = ctx.createLinearGradient(x - .12, y + .10, x + .10, y - .10);
  const variation = rand() * .07;
  gradient.addColorStop(0, palette.color(low ? -.65 : .10 + variation));
  gradient.addColorStop(.35, palette.color(low ? -.45 : .035 + variation));
  gradient.addColorStop(1, palette.color(low ? -.75 : -.22 - variation));
  return gradient;
}
function loop(ctx, x, y, rx, ry, phase, turns, rand) {
  // Cubic Hermite segments with perturbed radii avoid perfect circles/rings.
  const points = [], steps = Math.ceil(turns * 10);
  const tilt = (rand() - .5) * .8;
  for (let j = 0; j <= steps; j++) {
    const t = j / steps, angle = phase + t * Math.PI * 2 * turns;
    const radius = .70 + .24 * Math.sin(angle * 2.3 + phase) + .10 * t;
    points.push([x + Math.cos(angle) * rx * radius + tilt * Math.sin(angle) * ry,
      y + Math.sin(angle) * ry * radius + (t - .5) * ry * .45]);
  }
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let j = 0; j < points.length - 1; j++) {
    const prev = points[Math.max(0, j - 1)], a = points[j], b = points[j + 1], next = points[Math.min(points.length - 1, j + 2)];
    ctx.bezierCurveTo(a[0] + (b[0] - prev[0]) / 6, a[1] + (b[1] - prev[1]) / 6,
      b[0] - (next[0] - a[0]) / 6, b[1] - (next[1] - a[1]) / 6, ...b);
  }
  ctx.stroke();
}
function curls(rear, front, p, palette, rand, stats) {
  // Back-to-front clumps; dark strands between curls, no smooth undercoat.
  const clumps = Array.from({ length: p.count }, () => {
    const x = (rand() - .5) * p.width * .92;
    const bottom = hairline(x, p), y = bottom + rand() * (crown(x, p) - bottom);
    return { x, y, rx: .025 + rand() * .028, ry: .018 + rand() * .025, phase: rand() * Math.PI * 2 };
  }).sort((a, b) => b.y - a.y);
  for (const clump of clumps) {
    for (let layer = 0; layer < 8; layer++) {
      const ctx = layer < 3 ? rear : front;
      const low = layer < 3;
      const x = clump.x + (rand() - .5) * .012, y = clump.y + (rand() - .5) * .012;
      ctx.globalAlpha = low ? .48 + rand() * .25 : .38 + rand() * .45;
      ctx.lineWidth = low ? .005 + rand() * .003 : .0011 + rand() * .0015;
      ctx.strokeStyle = strandPaint(ctx, palette, x, y, rand, low);
      loop(ctx, x, y, clump.rx * (.75 + layer * .055), clump.ry, clump.phase + layer * .12,
        .75 + rand() * .7, rand);
      stats.strands++; stats.curls++;
    }
  }
}
function directional(rear, front, key, p, palette, rand, stats) {
  for (let i = 0; i < p.count; i++) {
    const x = (rand() - .5) * p.width * .94;
    const bottom = hairline(x, p), top = crown(x, p);
    const y = bottom + rand() * Math.max(.02, top - bottom);
    const ctx = i < p.count * .38 ? rear : front;
    const low = ctx === rear;
    const length = .06 + rand() * .10;
    const side = x > .12 ? 1 : -1;
    let points;
    switch (p.kind) {
      case 'combed': points = [[x, y], [x + side * .05, y + .12], [x + side * .14, y + .09], [x + side * .19, y - .01]]; break;
      case 'swept': case 'disconnected':
        points = [[x, y], [x - .07, y + .12], [x + .10, y + .14], [x + .19, y + .025]]; break;
      case 'pompadour': points = [[x, bottom + rand() * .12], [x - .09, top + .10], [x + .22, top + .03], [x + .25, y * .52]]; break;
      case 'quiff': points = [[x, y * .6], [x - .05, y + .16], [x + .02, top + .06], [x + .06 + rand() * .10, top + rand() * .06]]; break;
      case 'crest': points = [[x * .7, y * .5], [x * .8, y + .17], [x * .3, top], [x * .75 + (rand() - .5) * .05, top + rand() * .065]]; break;
      case 'fringe': points = [[x, y + .02], [x - .045, y - .025], [x + .02, bottom + .02], [x + .015, bottom + (rand() - .5) * .012]]; break;
      case 'flat': points = [[x, y * .8], [x - .008, y + .05], [x + .009, p.height - .02], [x + .006, p.height + (rand() - .5) * .014]]; break;
      case 'short': points = [[x, y], [x - .008, y + .02], [x + .012, y + .035], [x + .018, y + .045]]; break;
      case 'waves': points = [[x, y], [x - length * .5, y + length], [x + length, y + length * .7], [x + length * .6, y + length * .1]]; break;
      default: points = [[x, y], [x - .025, y + length * .6], [x + length * .5, y + length], [x + length * .7, y + length * .5]];
    }
    ctx.globalAlpha = low ? .35 + rand() * .35 : .32 + rand() * .46;
    ctx.lineWidth = low ? .003 + rand() * .003 : .0008 + rand() * .0013;
    ctx.strokeStyle = strandPaint(ctx, palette, x, y, rand, low);
    ctx.beginPath(); ctx.moveTo(...points[0]); ctx.bezierCurveTo(...points[1], ...points[2], ...points[3]); ctx.stroke(); stats.strands++;
  }
  if (p.nape) {
    for (let i = 0; i < 1600; i++) {
      const x = (rand() - .5) * .98, y = .04 + rand() * .18;
      rear.globalAlpha = .30 + rand() * .40; rear.lineWidth = .001 + rand() * .002;
      rear.strokeStyle = strandPaint(rear, palette, x, y, rand, i % 3 === 0);
      rear.beginPath(); rear.moveTo(x, y); rear.bezierCurveTo(x * 1.25, -.17, x * 1.3, -.49,
        x * 1.27 + (rand() - .5) * .04, -.60 - rand() * .09); rear.stroke(); stats.strands++;
    }
  }
}
function stubble(ctx, key, p, palette, rand, stats) {
  for (let i = 0; i < 18000; i++) {
    const x = (rand() - .5) * 1.1, y = -.43 + rand() * .82;
    const top = key === 'buzz' ? crown(x, p) : .37 * Math.sqrt(Math.max(0, 1 - (x / .56) ** 2));
    if (y > top || (Math.abs(x) < .40 && y < hairline(x, p))) continue;
    const start = key === 'taper' ? -.30 : p.fade;
    const density = key === 'buzz' ? .75 : clamp((y - start + .18) / .45, 0, 1);
    if (rand() > density) continue;
    ctx.globalAlpha = (.10 + rand() * .36) * density;
    ctx.lineWidth = .0008 + rand() * .0012; ctx.strokeStyle = palette.color(-.25 + rand() * .35);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - .001, y + .002,
      x + (rand() - .5) * .004, y + .0015 + rand() * .006); ctx.stroke(); stats.stubble++; stats.strands++;
  }
}
function flyaways(ctx, p, palette, rand, stats) {
  for (let i = 0; i < 160; i++) {
    const x = (rand() - .5) * p.width * .92, y = crown(x, p) * (.90 + rand() * .12);
    ctx.strokeStyle = palette.color(.02 + rand() * .10); ctx.globalAlpha = .12 + rand() * .24;
    ctx.lineWidth = .0008 + rand() * .0006;
    ctx.beginPath(); ctx.moveTo(x, y - .02); ctx.bezierCurveTo(x - .012, y + .025, x + .018, y + .04,
      x + .02 + rand() * .02, y + .015); ctx.stroke(); stats.strands++;
  }
}
function etchedLines(ctx) {
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 3; i++) {
    const y = -.06 - i * .045;
    const gradient = ctx.createLinearGradient(.41, 0, .56, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(.25, 'rgba(0,0,0,.85)'); gradient.addColorStop(.8, 'rgba(0,0,0,.85)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = gradient; ctx.lineWidth = .01; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(.41, y); ctx.bezierCurveTo(.46, y + .02, .5, y - .03, .56, y - .01); ctx.stroke();
  }
  ctx.restore();
}
function applyHairline(surface, profile, factory) {
  const mask = factory(surface.width, surface.height), ctx = context(mask);
  const dx = 1.7 / surface.width;
  for (let i = 0; i < surface.width; i++) {
    const x = -.85 + i * dx;
    const baseline = hairline(x, profile);
    const soft = .045 + (Math.abs(x) > .38 ? .025 : 0);
    const upper = profile.kind === 'flat' ? profile.height + .018 : crown(clamp(x, -profile.width * .42, profile.width * .42), profile) + .10;
    const lower = baseline - soft, span = upper - lower;
    const gradient = ctx.createLinearGradient(0, lower, 0, upper);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(clamp(2 * soft / span, .01, .75), 'rgba(255,255,255,1)');
    gradient.addColorStop(clamp(1 - .045 / span, .76, .99), 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x, -.8, dx + .0001, 1.65);
  }
  const target = surface.getContext('2d'); target.save(); target.resetTransform();
  target.globalAlpha = 1; target.globalCompositeOperation = 'destination-in'; target.drawImage(mask, 0, 0); target.restore();
  mask.width = 1; mask.height = 1;
}
function softShadow(ctx, x, y, rx, ry, strength) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(18,12,9,${strength})`);
  gradient.addColorStop(.45, `rgba(18,12,9,${strength * .45})`);
  gradient.addColorStop(1, 'rgba(18,12,9,0)');
  ctx.fillStyle = gradient; ctx.globalAlpha = 1; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}
export function generateHairTextures(key, tone, { size = TEXTURE_SIZE, createSurface = defaultSurface } = {}) {
  const p = STRAND_PROFILES[key];
  if (!p) throw new Error(`Filtro desconocido: ${key}`);
  const started = performance.now(), palette = colorPalette(tone), rand = random(seedFor(key));
  const rear = createSurface(size, size), front = createSurface(size, size), shadow = createSurface(size, size);
  const backCtx = context(rear), frontCtx = context(front), shadowCtx = context(shadow);
  const stats = { strands: 0, curls: 0, stubble: 0 };
  if (p.kind === 'curls') curls(backCtx, frontCtx, p, palette, rand, stats);
  else {
    if (p.fade || p.kind === 'stubble') stubble(backCtx, key, p, palette, rand, stats);
    if (p.count) directional(backCtx, frontCtx, key, p, palette, rand, stats);
  }
  if (p.kind !== 'stubble') flyaways(frontCtx, p, palette, rand, stats);
  if (!p.nape) applyHairline(rear, p, createSurface);
  applyHairline(front, p, createSurface);
  if (key === 'lines') { etchedLines(backCtx); etchedLines(frontCtx); }
  const strength = p.kind === 'stubble' ? .009 : .04;
  for (let i = 0; i < 25; i++) {
    const x = -.42 + i * .035;
    softShadow(shadowCtx, x, hairline(x, p) - .014, .055, .031, strength);
  }
  softShadow(shadowCtx, -.45, -.16, .055, .09, strength * 1.5);
  softShadow(shadowCtx, .45, -.16, .055, .09, strength * 1.5);
  return { rear, front, shadow, stats: { ...stats, milliseconds: performance.now() - started }, profile: p };
}
