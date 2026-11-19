// Reports: the 21-day completion rate for everything together, or narrowed to one habit by tapping it.
import { h, tween, shortDay } from './util.js';
import { PALETTE, hex, rateColor } from './colors.js';
import { ring } from './ui.js';
import { card, rateRing, habitSub, flag } from './cards.js';
import { state, subscribe, habitList } from './store.js';
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
  const dots = h('div', { class: 'dots', 'aria-label': 'Last 21 days' });
  const list = h('div', { class: 'cards' });
  const empty = h('p', { class: 'empty-text' }, 'No habits');
  root.append(header, hero, caption, dots, list, empty);

  const rows = new Map();
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

    // 21 days
    dots.replaceChildren(...Array.from({ length: WINDOW }, (_, i) => {
      let cls = 'dot', bg = '', label = '';
      if (hb) {
        const d = habitParts(hb).days[i];
        label = shortDay(d.day);
        if (!d.scheduled) cls += ' off'; else if (d.done) bg = hex(hb.color); else if (d.counted) cls += ' miss'; else cls += ' off';
      } else {
        let s = 0, dn = 0, day;
        for (const x of all) { const d = habitParts(x).days[i]; day = d.day; if (d.counted) { s++; if (d.done) dn++; } }
        label = shortDay(day);
        if (!s) cls += ' off'; else bg = rateColor(pctOf(dn, s));
      }
      return h('span', { class: cls, title: label, style: bg ? { background: bg } : {} });
    }));

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
