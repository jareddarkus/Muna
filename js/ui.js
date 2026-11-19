// Shared building blocks: progress rings (exact Figma geometry), panels, avatars, segmented control, switch.
import { h, clamp } from './util.js';
import { icon, habitIcon } from './icons.js';
import { PALETTE, COLORS } from './colors.js';

// ───────────── rings ─────────────
// Big ring: 159px box, 12px stroke, track #E9E5EF, green arc with a soft glow. Small ring: 60px box, 6px stroke.
let ringId = 0;
export function ring({ size = 159, stroke = 12, color = PALETTE.green, glow = false, cls = '' } = {}) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, id = `rg${ringId++}`, c = size / 2;
  const el = h('div', { class: `ring ${cls}`, style: { width: `${size}px`, height: `${size}px` } });
  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" overflow="visible" aria-hidden="true">
    ${glow ? `<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="${color}" flood-opacity=".5" class="glow"/></filter></defs>` : ''}
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${PALETTE.track}" stroke-width="${stroke}"/>
    <circle class="ring-bar" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 ${c} ${c})" ${glow ? `filter="url(#${id})"` : ''}/></svg>`;
  const bar = el.querySelector('.ring-bar'), shadow = el.querySelector('.glow');
  return {
    el,
    set(p) { p = clamp(p, 0, 1); bar.style.strokeDashoffset = C * (1 - p); bar.style.opacity = p < 0.004 ? 0 : 1; },
    color(col) { bar.setAttribute('stroke', col); shadow?.setAttribute('flood-color', col); },
  };
}

// ───────────── avatar ─────────────
export function avatar(p, size = 40) {
  const name = (p?.display_name || p?.username || '?').trim();
  let hash = 0; for (const ch of p?.id || name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const el = h('span', { class: 'avatar', style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px`, '--av': PALETTE[COLORS[hash % COLORS.length]] } }, (p?.username || name)[0]?.toUpperCase());
  if (p?.avatar_url) {
    const img = h('img', { src: p.avatar_url, alt: '', referrerPolicy: 'no-referrer', draggable: false });
    img.addEventListener('error', () => img.remove());
    el.append(img);
  }
  return el;
}

// ───────────── segmented control ─────────────
export function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  el.append(h('span', { class: 'seg-thumb' }));
  const btns = options.map(([v, label]) => {
    const b = h('button', { type: 'button', class: 'seg-btn', role: 'tab', onClick: () => { set(v); onChange(v); } }, label);
    el.append(b); return [v, b];
  });
  el.style.setProperty('--n', options.length);
  function set(v) {
    value = v;
    el.style.setProperty('--i', Math.max(0, options.findIndex(([x]) => x === v)));
    btns.forEach(([x, b]) => b.classList.toggle('on', x === v));
  }
  set(value);
  return { el, set };
}

// ───────────── switch ─────────────
export function toggleSwitch(on, onChange) {
  const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!on) }, h('span', { class: 'knob' }));
  const api = { el: b, set(v) { on = !!v; b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); }, get: () => on };
  b.addEventListener('click', () => { if (!b.disabled) onChange(!on, api); });
  api.set(on);
  return api;
}

// ───────────── panels (slide-up screens) ─────────────
const stack = [];
export function openPanel({ cls = '', onClose } = {}) {
  const backdrop = h('div', { class: 'backdrop' });
  const panel = h('div', { class: `panel ${cls}`, role: 'dialog', 'aria-modal': 'true' });
  const wrap = h('div', { class: 'panel-wrap' }, backdrop, panel);
  document.getElementById('layer').append(wrap);
  document.body.classList.add('panel-open');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  let closed = false;
  const api = {
    el: panel,
    close() {
      if (closed) return; closed = true;
      stack.splice(stack.indexOf(api), 1);
      wrap.classList.remove('open'); wrap.classList.add('closing');
      setTimeout(() => { wrap.remove(); if (!stack.length) document.body.classList.remove('panel-open'); }, 320);
      onClose?.();
    },
  };
  stack.push(api);
  backdrop.addEventListener('click', () => api.close());
  return api;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
export const closeAllPanels = () => [...stack].forEach((p) => p.close());

/** Top bar used by every panel: round-square back button on the left, optional title and right slot. */
export function panelBar(api, { title, right, back = true } = {}) {
  return h('header', { class: 'panel-bar' },
    back ? h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Back', onClick: () => api.close() }, icon('chevron-left', { size: 30, stroke: 1.6 })) : h('span'),
    h('h2', {}, title || ''), h('div', { class: 'bar-right' }, right));
}

/** Two-tap destructive button: first tap arms it, second confirms. */
export function dangerButton(label, armedLabel, onConfirm, cls = '') {
  let armed = false, timer;
  const b = h('button', { type: 'button', class: `pill danger ${cls}` }, label);
  b.addEventListener('click', async () => {
    if (!armed) { armed = true; b.classList.add('armed'); b.textContent = armedLabel; timer = setTimeout(reset, 3000); return; }
    clearTimeout(timer); b.disabled = true;
    try { await onConfirm(); } catch (e) { b.disabled = false; reset(); throw e; }
  });
  function reset() { armed = false; b.classList.remove('armed'); b.textContent = label; }
  return b;
}

/** Small colored circle holding a Tabler icon (white) — used for habits and groups. */
export function iconCircle(ref, color, size = 60, iconSize) {
  const el = h('span', { class: 'icon-circle', style: { width: `${size}px`, height: `${size}px`, background: color } });
  el.append(habitIcon(ref, iconSize || Math.round(size * 0.57)));
  return el;
}
