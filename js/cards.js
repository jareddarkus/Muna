// The habit card from "Main menu FINAL": 372×80 pill, 60px icon circle, title + flag line, 60px ring on the right.
import { h, goalLabel, scheduleLabel, ringNumber } from './util.js';
import { icon, habitIcon } from './icons.js';
import { PALETTE, hex, rateColor } from './colors.js';
import { ring } from './ui.js';

export const flag = (size = 12) => icon('pennant', { filled: true, size });

/** Generic card. `right` is the right-hand element (a ring button). */
export function card({ onClick }) {
  const circle = h('span', { class: 'card-circle' });
  const title = h('span', { class: 'card-title' });
  const subText = h('span', { class: 'card-sub-text' });
  const flagEl = h('span', { class: 'card-flag' }, flag());
  const text = h('span', { class: 'card-text' }, title, h('span', { class: 'card-sub' }, flagEl, subText));
  const slot = h('span', { class: 'card-right' });
  const el = h('div', { class: 'card', role: 'button', tabindex: 0, onClick, onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(e); } } }, circle, text, slot);
  let iconRef = null;
  return {
    el,
    set({ color, icon: ref, name, sub, done, showFlag = true }) {
      el.style.setProperty('--c', color);
      el.classList.toggle('done', !!done);
      if (ref && iconRef !== ref) { iconRef = ref; circle.replaceChildren(habitIcon(ref)); }
      title.textContent = name;
      subText.textContent = sub;
      flagEl.hidden = !showFlag;
    },
    slot, circle,
  };
}

/** Ring button for the Today list: number inside, or a check once the goal is reached. */
export function progressRing() {
  const r = ring({ size: 60, stroke: 6, color: PALETTE.red });
  const center = h('span', { class: 'ring-center' });
  const el = h('span', { class: 'ring-btn' }, r.el, center);
  let key = null;
  return {
    el,
    set(hb, value, p, done) {
      r.color(hex(hb.color));
      r.set(done ? 1 : p);
      el.classList.toggle('done', done);
      const k = done ? 'check' : ringNumber(hb, value);
      if (k === key) return;
      key = k;
      if (done) center.replaceChildren(icon('check', { size: 37, stroke: 3.86 }));
      else { center.textContent = k; center.classList.toggle('small', k.length > 2); }
    },
  };
}

/** Ring button for Reports: percentage inside, colored by how well the habit is going. */
export function rateRing() {
  const r = ring({ size: 60, stroke: 6, color: PALETTE.green });
  const center = h('span', { class: 'ring-center rate' });
  const el = h('span', { class: 'ring-btn' }, r.el, center);
  return {
    el,
    set(pct) {
      pct = pct === undefined ? null : pct;
      r.color(rateColor(pct));
      r.set((pct ?? 0) / 100);
      center.replaceChildren(pct == null ? '–' : h('span', {}, String(pct), h('i', {}, '%')));
    },
  };
}

export const habitSub = (hb) => `${goalLabel(hb)} • ${scheduleLabel(hb.days)}`;
