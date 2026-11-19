// Reports: the 21-day completion rate for everything together, or narrowed to one habit by tapping it.
import { h, tween, shortDay } from './util.js';
import { PALETTE, hex, rateColor } from './colors.js';
import { ring } from './ui.js';
import { card, rateRing, habitSub, flag } from './cards.js';
import { state, subscribe, habitList, isScheduled, valueOf, isDone, progressOf, setViewDay } from './store.js';
import { addDays, dow, parseDay, DAY_NAMES } from './util.js';
import { attachHold } from './hold.js';
import { habitItems } from './habit-actions.js';
import { overallRate, habitRate, habitParts, pctOf, WINDOW } from './rates.js';

export function mountReports(root) {
  let filter = null; // habit id or null for "all habits"
  const title = h('h2', { class: 'screen-title' }, 'Reports');
  const header = h('header', { class: 'top-bar center-only' }, h('span'), title, h('span'));
  const r = ring({ size: 159, stroke: 12, color: PALETTE.green, glow: true, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const unit = h('span', { class: 'hero-unit' }, '%');
  const caption = h('p', { class: 'caption' });
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, num, unit));
  const dots = h('div', { class: 'mini-cal', 'aria-label': 'Last 21 days' });
  const list = h('div', { class: 'cards' });
  const empty = h('p', { class: 'empty-text' }, 'No habits');
  root.append(header, hero, caption, dots, list, empty);

  const rows = new Map(), calCells = new Map();
  let calKey = '';
  function render() {
    const all = habitList();
    empty.hidden = all.length > 0;
    [hero, caption, dots, list].forEach((e) => (e.hidden = all.length === 0));
    if (!all.length) return;
    if (filter && !state.habits.has(filter)) filter = null;
    const hb = filter ? state.habits.get(filter) : null;

    const pct = hb ? habitRate(hb) : overallRate(all);
    const color = rateColor(pct);
    r.color(color); r.set((pct ?? 0) / 100);
    tween(num, pct ?? 0);
    num.style.color = ''; // the number stays dark; the ring carries the color
    caption.textContent = hb ? hb.title : 'All habits';

    // 21-day calendar: the more of that day was done, the stronger the color. Tap a day to open it on the Today tab.
    const tint = hb ? hex(hb.color) : PALETTE.green;
    const start = addDays(state.today, -(WINDOW - 1));
    if (calKey !== start) { // build the cells once per day so colors can fade smoothly between habits
      calKey = start; calCells.clear();
      const lead = (parseDay(start).getDay() + 6) % 7; // Monday-first columns
      const cells = Array.from({ length: lead }, () => h('span', { class: 'mc-blank' }));
      for (let i = 0; i < WINDOW; i++) {
        const day = addDays(start, i);
        const b = h('button', { type: 'button', class: 'mc-day', onClick: () => { setViewDay(day); window.dispatchEvent(new CustomEvent('muna:tab', { detail: 0 })); } }, h('span', {}, String(parseDay(day).getDate())));
        calCells.set(day, b); cells.push(b);
      }
      dots.replaceChildren(...cells);
    }
    for (const [day, b] of calCells) {
      let p = null; // 0..1 of that day done, null when nothing was scheduled
      if (hb) { if (isScheduled(hb, day)) p = isDone(hb, valueOf(hb.id, day)) ? 1 : progressOf(hb, valueOf(hb.id, day)); }
      else {
        const sch = all.filter((x) => isScheduled(x, day));
        if (sch.length) p = sch.filter((x) => isDone(x, valueOf(x.id, day))).length / sch.length;
      }
      const o = p ? 0.2 + 0.8 * p : 0;
      b.style.setProperty('--c', tint); b.style.setProperty('--o', String(o));
      b.classList.toggle('off', p == null); b.classList.toggle('miss', p === 0);
      b.classList.toggle('strong', o > 0.55); b.classList.toggle('today', day === state.today);
      b.setAttribute('aria-label', `${DAY_NAMES[dow(day)]} ${shortDay(day)}${p == null ? '' : `, ${Math.round(p * 100)}% done`}`);
    }

    // habit cards
    for (const [id, c] of rows) if (!state.habits.has(id)) { c.el.remove(); rows.delete(id); }
    const els = all.map((x) => {
      let c = rows.get(x.id);
      if (!c) { c = card({ onClick: () => { filter = filter === x.id ? null : x.id; render(); window.scrollTo?.(0, 0); root.scrollTo?.({ top: 0, behavior: 'smooth' }); } }); c.rr = rateRing(); c.slot.append(c.rr.el); c.hb = x; rows.set(x.id, c);
        attachHold(c.el, () => habitItems(c.hb, { day: state.today, extra: [{ label: filter === c.hb.id ? 'Show all habits' : 'Show only this', icon: 'filter', onSelect: () => { filter = filter === c.hb.id ? null : c.hb.id; render(); } }] })); }
      c.hb = x;
      c.set({ color: hex(x.color), icon: x.icon, name: x.title, sub: habitSub(x), done: false });
      c.el.classList.toggle('selected', filter === x.id);
      c.rr.set(habitRate(x));
      return c.el;
    });
    const cur = [...list.children];
    if (els.length !== cur.length || els.some((e, i) => e !== cur[i])) list.replaceChildren(...els);
  }
  let visible = false;
  subscribe(() => { if (visible) render(); });
  render();
  return { show() { visible = true; render(); }, hide() { visible = false; } };
}
