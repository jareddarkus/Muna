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
const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"]), .switch, .step-mid';
/** tapClose: a tap on anything that isn't a control (blank space, labels, card backgrounds) closes the panel. */
export function openPanel({ cls = '', onClose, tapClose = false, swipe = true } = {}) {
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
  if (swipe) enableSwipeDown(panel, backdrop, api);
  if (tapClose) panel.addEventListener('click', (e) => { if (!e.target.closest?.(INTERACTIVE)) api.close(); }, true); // capture: decide before any handler redraws the DOM
  return api;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
export const closeAllPanels = () => [...stack].forEach((p) => p.close());

/** Top bar used by every panel: optional left item, centered title, and a round X (close) in the top-right corner. */
export function panelBar(api, { title, right, left, back = true } = {}) {
  // every screen closes with an X in the top-right corner; anything that used to sit there moves to the left
  const x = back ? h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Close', onClick: () => api.close() }, icon('x', { size: 28, stroke: 1.8 })) : null;
  const leftSlot = left || (x ? right : null) || h('span');
  const rightSlot = x ? (left ? [right, x] : x) : right;
  return h('header', { class: 'panel-bar' }, leftSlot, h('h2', {}, title || ''), h('div', { class: 'bar-right' }, rightSlot));
}

/** Confirmation pop-up. Resolves true when the person confirms, false on cancel / outside tap / Escape. */
export function confirmDialog({ title, message = '', confirm = 'Delete', cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const done = (v) => {
      wrap.classList.remove('open'); wrap.classList.add('closing');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => wrap.remove(), 260);
      prevFocus?.focus?.({ preventScroll: true });
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    const ok = h('button', { type: 'button', class: 'pill danger-solid', onClick: () => done(true) }, confirm);
    const no = h('button', { type: 'button', class: 'pill light', onClick: () => done(false) }, cancel);
    const wrap = h('div', { class: 'dialog-wrap', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'backdrop', onClick: () => done(false) }),
      h('div', { class: 'dialog' }, h('h3', {}, title), message ? h('p', {}, message) : null, h('div', { class: 'dialog-actions' }, no, ok)));
    document.getElementById('layer').append(wrap);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('open'); no.focus({ preventScroll: true }); }));
  });
}

/** Destructive button: opens the confirmation pop-up first. `message` explains what will happen. */
export function dangerButton(label, message, onConfirm, cls = '', confirm = 'Delete') {
  const b = h('button', { type: 'button', class: `pill danger ${cls}` }, label);
  b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: `${label}?`, message, confirm: confirm === 'Delete' && !/^delete/i.test(label) ? label.replace(/\?$/, '') : confirm }))) return;
    b.disabled = true;
    try { await onConfirm(); } catch (e) { console.error(e); } finally { b.disabled = false; }
  });
  return b;
}

/** Small colored circle holding a Tabler icon (white) — used for habits and groups. */
export function iconCircle(ref, color, size = 60, iconSize) {
  const el = h('span', { class: 'icon-circle', style: { width: `${size}px`, height: `${size}px`, background: color } });
  el.append(habitIcon(ref, iconSize || Math.round(size * 0.57)));
  return el;
}

/** Pull a panel down to close it (like an iOS sheet). Inside scrolling content it only starts once the content is at the top. */
function enableSwipeDown(panel, backdrop, api) {
  let startY = 0, startX = 0, lastY = 0, lastT = 0, vel = 0, scroller = null, mode = 'idle', dy = 0;
  const skip = (t) => t.closest?.('input, textarea, select, .crop-stage, .chips.scroll, [contenteditable="true"]');
  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || skip(e.target)) { mode = 'skip'; return; }
    const t = e.touches[0];
    startY = lastY = t.clientY; startX = t.clientX; lastT = e.timeStamp; vel = 0; dy = 0; mode = 'idle';
    scroller = e.target.closest?.('.panel-body, .picker-scroll, .group-content, .scroll-y') || null;
    if (scroller && !panel.contains(scroller)) scroller = null;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (mode === 'skip') return;
    const t = e.touches[0];
    if (mode === 'idle') {
      const down = t.clientY - startY, side = Math.abs(t.clientX - startX);
      if (down > 8 && down > side * 1.2 && (!scroller || scroller.scrollTop <= 0)) {
        mode = 'drag'; startY = t.clientY; lastY = t.clientY; dy = 0;
        panel.style.transition = 'none'; backdrop.style.transition = 'none';
      } else if (down < -8 || side > 14) { mode = 'skip'; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    dy = Math.max(0, t.clientY - startY);
    const dt = e.timeStamp - lastT; if (dt > 0) vel = (t.clientY - lastY) / dt; lastY = t.clientY; lastT = e.timeStamp;
    panel.style.transform = `translate(-50%, ${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / (panel.offsetHeight * 0.8)));
  }, { passive: false });
  const end = () => {
    if (mode !== 'drag') { mode = 'idle'; return; }
    mode = 'idle';
    const close = dy > 110 || vel > 0.6;
    panel.style.transition = ''; backdrop.style.transition = '';
    if (close) { panel.style.transform = ''; backdrop.style.opacity = ''; api.close(); return; }
    panel.style.transition = 'transform .4s var(--ease)'; panel.style.transform = ''; backdrop.style.opacity = '';
    setTimeout(() => { panel.style.transition = ''; }, 420);
  };
  panel.addEventListener('touchend', end, { passive: true });
  panel.addEventListener('touchcancel', end, { passive: true });
}
