// Habit icons: the full Tabler set (outline + filled), loaded lazily in small shards.
import { UI } from './ui-icons.js';
import { sz } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const OUT_ATTRS = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

function svg(markup, filled, size, stroke = 2) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', sz(size));
  el.setAttribute('height', sz(size));
  el.setAttribute('aria-hidden', 'true');
  if (filled) el.setAttribute('fill', 'currentColor');
  else for (const [k, v] of Object.entries({ ...OUT_ATTRS, 'stroke-width': String(stroke) })) el.setAttribute(k, v);
  el.innerHTML = markup || '';
  return el;
}

/** Built-in interface icon (instant, synchronous). */
export function icon(name, { filled = false, size = 24, stroke = 2 } = {}) {
  const i = UI[name];
  return svg(i && (filled && i.f ? i.f : i.o), filled && !!i?.f, size, stroke);
}

// ── habit icons (a ref looks like "outline:home" or "filled:home") ──
const shards = new Map();
let indexPromise;
export const parseRef = (ref) => { const [style, name] = String(ref || 'outline:circle-check').split(':'); return { style: style === 'filled' ? 'filled' : 'outline', name: name || 'circle-check' }; };
const shardOf = (name) => (/^[a-z]/.test(name) ? name[0] : '_');

function loadShard(style, name) {
  const key = `${style === 'filled' ? 'f' : 'o'}/${shardOf(name)}`;
  if (!shards.has(key)) {
    const entry = { data: null, promise: null };
    entry.promise = fetch(`icons/${key}.json`).then((r) => r.json()).then((d) => (entry.data = d)).catch(() => { shards.delete(key); return {}; });
    shards.set(key, entry);
  }
  return shards.get(key);
}

/** Habit icon element. Fills in as soon as its shard arrives (usually instantly from cache). */
export function habitIcon(ref, size = 34, stroke = 1.4) {
  const { style, name } = parseRef(ref);
  const filled = style === 'filled';
  const shard = loadShard(style, name);
  const host = svg(shard.data?.[name], filled, size, stroke);
  if (!shard.data) shard.promise.then((d) => { host.innerHTML = d[name] || ''; });
  return host;
}

/** Search index of every icon: [name, keywords, flags(1 outline | 2 filled)]. */
export function loadIndex() {
  indexPromise ??= fetch('icons/index.json').then((r) => r.json()).then((j) => j.icons);
  return indexPromise;
}

/** Icons matching the words (outline and filled together). Returns index rows. */
export function searchIcons(all, query) {
  const q = query.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  if (!q) return all;
  const terms = q.split(' ');
  const out = [];
  for (const i of all) {
    const name = i[0].replace(/-/g, ' ');
    let s = 0;
    if (name === q) s = 100;
    else if (name.startsWith(q)) s = 70;
    else if (name.includes(q)) s = 45;
    else if (terms.every((t) => name.includes(t) || i[1].includes(t))) s = 20;
    if (s) out.push([s, i]);
  }
  return out.sort((a, b) => b[0] - a[0] || a[1][0].length - b[1][0].length).map((x) => x[1]);
}
/** One cell per style: each icon shows up as outline and, when it exists, filled right next to it. */
export const iconRefs = (rows) => rows.flatMap((i) => [...(i[2] & 1 ? [`outline:${i[0]}`] : []), ...(i[2] & 2 ? [`filled:${i[0]}`] : [])]);
