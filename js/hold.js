// Press and hold (or right-click), the way iOS does it: the element dips a little under your finger, then lifts and grows,
// the background blurs, and a small menu springs out next to it. A normal tap is untouched.
// Usage: attachHold(el, () => [{ label, icon, danger, onSelect }]).
import { h, haptic } from './util.js';
import { icon } from './icons.js';

const PRESS_MS = 70;      // the element starts to dip
const LIFT_MS = 320;      // lift + blur starts
const MENU_MS = 460;      // menu opens
const MOVE_LIMIT = 10;    // px of movement that means "this is a scroll"
let active = null;        // only one lifted element at a time

export function attachHold(el, getItems) {
  el.classList.add('holdable');
  let pressTimer = null, liftTimer = null, menuTimer = null, sx = 0, sy = 0, session = null, suppress = false;

  const clearTimers = () => { clearTimeout(pressTimer); clearTimeout(liftTimer); clearTimeout(menuTimer); pressTimer = liftTimer = menuTimer = null; };
  const unpress = () => el.classList.remove('hold-press');
  const abort = () => { clearTimers(); unpress(); if (session && !session.menuOpen) { session.close(); session = null; } };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select')) return;
    if (active) return;
    suppress = false; sx = e.clientX; sy = e.clientY;
    pressTimer = setTimeout(() => { pressTimer = null; el.classList.add('hold-press'); }, PRESS_MS);
    liftTimer = setTimeout(() => { liftTimer = null; session = lift(el, getItems, () => { session = null; }); suppress = true; haptic('light'); }, LIFT_MS); // once it lifts, letting go is a cancel, not a tap
    menuTimer = setTimeout(() => { menuTimer = null; if (session) { session.openMenu(); suppress = true; } }, MENU_MS);
  });
  el.addEventListener('pointermove', (e) => { if ((pressTimer || liftTimer || menuTimer || session) && Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_LIMIT) abort(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, () => { if (!session?.menuOpen) abort(); else clearTimers(); }));
  // the tap that ends a long press must not also trigger the element's normal action
  el.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } }, true);
  // desktop right-click opens the menu straight away
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents) return; // touch long-press is handled above
    if (active) return;
    clearTimers(); unpress();
    session = lift(el, getItems, () => { session = null; });
    session.openMenu(); suppress = true;
  });
}

const LIFT_SCALE = 1.06;

function lift(el, getItems, onDone) {
  // Measure the element as laid out (offsetWidth ignores transforms) and keep its centre, so the copy starts exactly
  // where the dipped original is and goes back exactly where the original will reappear. No jump either way.
  const vis = el.getBoundingClientRect();
  const w = el.offsetWidth, ht = el.offsetHeight;
  const startScale = w ? vis.width / w : 1;
  const left = vis.left + vis.width / 2 - w / 2, top = vis.top + vis.height / 2 - ht / 2;
  const rect = { left, top, right: left + w, bottom: top + ht, width: w, height: ht };

  const layer = document.getElementById('layer');
  const overlay = h('div', { class: 'hold-overlay' });
  const clone = el.cloneNode(true);
  clone.classList.remove('enter', 'holdable', 'hold-press'); clone.classList.add('hold-clone');
  clone.removeAttribute('id'); clone.removeAttribute('tabindex');
  Object.assign(clone.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${ht}px`, margin: '0', transition: 'none', transform: `scale(${startScale})` });
  const wrap = h('div', { class: 'hold-wrap' }, overlay, clone);
  layer.append(wrap);
  // hide the original instantly (its own transitions would otherwise fade it while the copy appears)
  el.style.transition = 'none'; el.style.opacity = '0'; // (not visibility: the original must stay hit-testable or a mouse press would be dropped)
  el.classList.remove('hold-press');
  active = { el };
  void clone.offsetWidth; // commit the start state, then animate
  requestAnimationFrame(() => {
    clone.style.transition = ''; clone.style.transform = '';
    clone.classList.add('lifted'); overlay.classList.add('on');
  });

  let menu = null, closed = false;
  const api = {
    menuOpen: false,
    openMenu() {
      if (closed || api.menuOpen) return;
      const items = (getItems() || []).filter(Boolean);
      if (!items.length) { api.close(); return; }
      api.menuOpen = true;
      haptic('medium');
      menu = h('div', { class: 'hold-menu', role: 'menu' }, items.map((it) =>
        h('button', { type: 'button', class: `hold-item ${it.danger ? 'danger' : ''}`, role: 'menuitem', onClick: async () => { const fn = it.onSelect; haptic(it.danger ? 'warning' : 'select'); api.close(); if (fn) setTimeout(fn, 180); } },
          h('span', {}, it.label), it.icon ? icon(it.icon, { size: 30, stroke: 1.6 }) : null)));
      wrap.append(menu);
      place();
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('on')));
      overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); api.close(); });
      overlay.style.pointerEvents = 'auto';
      document.addEventListener('keydown', onKey, true);
    },
    close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey, true);
      menu?.classList.remove('on'); overlay.classList.remove('on');
      clone.classList.add('settling'); clone.classList.remove('lifted'); // back to exactly where the original sits
      setTimeout(() => {
        el.style.opacity = ''; void el.offsetWidth; el.style.transition = '';
        requestAnimationFrame(() => { wrap.remove(); active = null; onDone?.(); });
      }, 320);
    },
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); api.close(); } };

  // menu goes below the element (or above when there is no room), tucked to the side it is closest to
  function place() {
    const vw = window.innerWidth, vh = window.innerHeight, mw = menu.offsetWidth, mh = menu.offsetHeight, gap = 12;
    const grow = rect.height * (LIFT_SCALE - 1) / 2; // the lifted element is a few % bigger
    let tp = rect.bottom + grow + gap, origin = 'top';
    if (tp + mh > vh - 20) { tp = rect.top - grow - gap - mh; origin = 'bottom'; }
    tp = Math.max(20, Math.min(tp, vh - mh - 20));
    const center = rect.left + rect.width / 2;
    const right = center > vw / 2;
    let lf = right ? rect.right - mw - 10 : rect.left + 10;
    lf = Math.max(15, Math.min(lf, vw - mw - 15));
    menu.style.left = `${lf}px`; menu.style.top = `${tp}px`;
    menu.style.transformOrigin = `${right ? 'right' : 'left'} ${origin}`;
  }
  return api;
}
