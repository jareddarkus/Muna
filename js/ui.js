// Reusable UI building blocks: sheets, progress rings, avatars, segmented controls.
import { h, clamp } from './util.js';
import { icon } from './icons.js';

// ───────────── progress ring ─────────────
let ringId = 0;
export function ring({ size = 200, stroke = 14, cls = '' } = {}) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, id = `rg${ringId++}`;
  const el = h('div', { class: `ring ${cls}`, style: { width: `${size}px`, height: `${size}px` } });
  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient></defs>
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  const bar = el.querySelector('.ring-bar');
  return {
    el,
    set(p) { p = clamp(p, 0, 1); bar.style.strokeDashoffset = C * (1 - p); bar.style.opacity = p < 0.004 ? 0 : 1; },
  };
}

// ───────────── avatar ─────────────
const AV = ['#FF7A70', '#FFB04D', '#3CC78A', '#6BDDF7', '#68A4FF', '#BA94FF', '#FF93CB', '#C9A074'];
export function avatar(p, size = 40) {
  const name = (p?.display_name || p?.username || '?').trim();
  let hash = 0; for (const ch of p?.id || name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const el = h('span', { class: 'avatar', style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px`, '--av': AV[hash % AV.length] } }, name[0]?.toUpperCase());
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
  const thumb = h('span', { class: 'seg-thumb' });
  el.append(thumb);
  const btns = options.map(([v, label]) => {
    const b = h('button', { type: 'button', class: 'seg-btn', role: 'tab', onClick: () => { set(v); onChange(v); } }, label);
    el.append(b); return [v, b];
  });
  el.style.setProperty('--n', options.length);
  function set(v) {
    value = v;
    const i = Math.max(0, options.findIndex(([x]) => x === v));
    el.style.setProperty('--i', i);
    btns.forEach(([x, b]) => b.classList.toggle('on', x === v));
  }
  set(value);
  return { el, set };
}

// ───────────── sheets ─────────────
const stack = [];
function layer() { return document.getElementById('layer'); }

export function openSheet({ cls = '', onClose } = {}) {
  const backdrop = h('div', { class: 'backdrop' });
  const sheet = h('div', { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true' });
  const grab = h('div', { class: 'grab' });
  sheet.append(grab);
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, sheet);
  layer().append(wrap);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));

  let closed = false;
  const api = {
    el: sheet,
    close() {
      if (closed) return; closed = true;
      stack.splice(stack.indexOf(api), 1);
      wrap.classList.remove('open'); wrap.classList.add('closing');
      sheet.style.transform = ''; sheet.style.transition = '';
      setTimeout(() => { wrap.remove(); if (!stack.length) document.body.classList.remove('sheet-open'); }, 280);
      onClose?.();
    },
  };
  stack.push(api);
  backdrop.addEventListener('click', () => api.close());

  // drag the top of a sheet down to dismiss
  let y0 = null, dy = 0, t0 = 0;
  sheet.addEventListener('pointerdown', (e) => {
    const r = sheet.getBoundingClientRect();
    if (e.clientY - r.top > 56 || e.target.closest('input,textarea,button')) return;
    y0 = e.clientY; dy = 0; t0 = performance.now(); sheet.setPointerCapture(e.pointerId); sheet.style.transition = 'none';
  });
  sheet.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
  const end = () => {
    if (y0 == null) return;
    const fast = dy / (performance.now() - t0) > 0.6;
    y0 = null; sheet.style.transition = '';
    if (dy > 120 || (fast && dy > 30)) api.close(); else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
  return api;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });

/** Sheet header: optional left/right slots with a centered title. */
export function sheetHeader({ title, left, right }) {
  return h('header', { class: 'sheet-head' }, h('div', { class: 'sh-side' }, left), h('h2', {}, title || ''), h('div', { class: 'sh-side right' }, right));
}
export const closeButton = (api) => h('button', { type: 'button', class: 'circle-btn small', 'aria-label': 'Close', onClick: () => api.close() }, icon('x', { size: 20 }));
export const backButton = (api) => h('button', { type: 'button', class: 'circle-btn small', 'aria-label': 'Back', onClick: () => api.close() }, icon('chevron-left', { size: 20 }));

/** Two-tap destructive button: first tap arms it, second confirms. */
export function dangerButton(label, armedLabel, onConfirm, cls = '') {
  let armed = false, timer;
  const b = h('button', { type: 'button', class: `btn danger ${cls}` }, label);
  b.addEventListener('click', async () => {
    if (!armed) { armed = true; b.classList.add('armed'); b.textContent = armedLabel; timer = setTimeout(reset, 3000); return; }
    clearTimeout(timer); b.disabled = true;
    try { await onConfirm(); } catch (e) { b.disabled = false; reset(); throw e; }
  });
  function reset() { armed = false; b.classList.remove('armed'); b.textContent = label; }
  return b;
}
