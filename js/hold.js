// Press and hold (or right-click): the element lifts a little, the background blurs, then a small menu appears next to it.
// A normal tap is untouched. Usage: attachHold(el, () => [{ label, icon, danger, onSelect }]).
import { h } from './util.js';
import { icon } from './icons.js';

const LIFT_MS = 260;      // when the lift + blur starts
const MENU_MS = 560;      // when the menu opens
const MOVE_LIMIT = 10;    // px of movement that means "this is a scroll"
let active = null;        // only one lifted element at a time

export function attachHold(el, getItems) {
  el.classList.add('holdable');
  let liftTimer = null, menuTimer = null, sx = 0, sy = 0, session = null, suppress = false;

  const clearTimers = () => { clearTimeout(liftTimer); clearTimeout(menuTimer); liftTimer = menuTimer = null; };
  const abort = () => { clearTimers(); if (session && !session.menuOpen) { session.close(); session = null; } };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select')) return;
    if (active) return;
    suppress = false; sx = e.clientX; sy = e.clientY;
    liftTimer = setTimeout(() => { liftTimer = null; session = lift(el, getItems, () => { session = null; }); }, LIFT_MS);
    menuTimer = setTimeout(() => { menuTimer = null; if (session) { session.openMenu(); suppress = true; } }, MENU_MS);
  });
  el.addEventListener('pointermove', (e) => { if ((liftTimer || menuTimer || session) && Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_LIMIT) abort(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, () => { if (!session?.menuOpen) abort(); else clearTimers(); }));
  // the tap that ends a long press must not also trigger the element's normal action
  el.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } }, true);
  // keyboard / desktop right-click opens the menu straight away
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents) return; // touch long-press is handled above
    if (active) return;
    clearTimers();
    session = lift(el, getItems, () => { session = null; });
    session.openMenu(); suppress = true;
  });
}

function lift(el, getItems, onDone) {
  const rect = el.getBoundingClientRect();
  const layer = document.getElementById('layer');
  const overlay = h('div', { class: 'hold-overlay' });
  const clone = el.cloneNode(true);
  clone.classList.remove('enter', 'holdable'); clone.classList.add('hold-clone');
  clone.removeAttribute('id'); clone.removeAttribute('tabindex');
  Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0' });
  const wrap = h('div', { class: 'hold-wrap' }, overlay, clone);
  layer.append(wrap);
  el.style.opacity = '0'; // (not visibility: the original must stay hit-testable or a mouse press would be dropped)
  active = { el };
  requestAnimationFrame(() => requestAnimationFrame(() => { overlay.classList.add('on'); clone.classList.add('lifted'); }));

  let menu = null, closed = false;
  const api = {
    menuOpen: false,
    openMenu() {
      if (closed || api.menuOpen) return;
      const items = (getItems() || []).filter(Boolean);
      if (!items.length) { api.close(); return; }
      api.menuOpen = true;
      try { navigator.vibrate?.(12); } catch {}
      menu = h('div', { class: 'hold-menu', role: 'menu' }, items.map((it) =>
        h('button', { type: 'button', class: `hold-item ${it.danger ? 'danger' : ''}`, role: 'menuitem', onClick: async () => { const fn = it.onSelect; api.close(); if (fn) setTimeout(fn, 180); } },
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
      menu?.classList.remove('on'); overlay.classList.remove('on'); clone.classList.remove('lifted');
      setTimeout(() => { el.style.opacity = ''; wrap.remove(); active = null; onDone?.(); }, 300);
    },
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); api.close(); } };

  // menu goes below the element (or above when there is no room), tucked to the side it is closest to
  function place() {
    const vw = window.innerWidth, vh = window.innerHeight, mw = menu.offsetWidth, mh = menu.offsetHeight, gap = 12;
    const grow = rect.height * 0.02; // the lifted element is ~4% bigger
    let top = rect.bottom + grow + gap, origin = 'top';
    if (top + mh > vh - 20) { top = rect.top - grow - gap - mh; origin = 'bottom'; }
    top = Math.max(20, Math.min(top, vh - mh - 20));
    const center = rect.left + rect.width / 2;
    const right = center > vw / 2;
    let left = right ? rect.right - mw - 10 : rect.left + 10;
    left = Math.max(15, Math.min(left, vw - mw - 15));
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
    menu.style.transformOrigin = `${right ? 'right' : 'left'} ${origin}`;
  }
  return api;
}
