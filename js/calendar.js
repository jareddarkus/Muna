// Drop-down month calendar for the Today screen: slides out above the header, tap a day to jump there.
import { h, parseDay, addDays, ymd, tap } from './util.js';
import { icon } from './icons.js';
import { state, HISTORY_DAYS, MAX_AHEAD } from './store.js';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday first

export function createCalendar({ getDay, onPick }) {
  let open = false, month = null; // month = first day of the shown month (a Date)
  const label = h('h3', { class: 'cal-month' });
  const prev = h('button', { type: 'button', class: 'arrow-btn left', 'aria-label': 'Previous month', onClick: () => shift(-1) }, icon('chevron-left', { size: 26, stroke: 1.8 }));
  const next = h('button', { type: 'button', class: 'arrow-btn right', 'aria-label': 'Next month', onClick: () => shift(1) }, icon('chevron-left', { size: 26, stroke: 1.8 }));
  const grid = h('div', { class: 'cal-grid' });
  const inner = h('div', { class: 'cal-card' },
    h('div', { class: 'cal-head' }, prev, label, next),
    h('div', { class: 'cal-week' }, ...LETTERS.map((l) => h('span', {}, l))),
    grid);
  const el = h('section', { class: 'cal-drop', 'aria-label': 'Calendar', inert: true }, h('div', { class: 'cal-clip' }, inner));

  const lo = () => addDays(state.today, -HISTORY_DAYS), hi = () => addDays(state.today, MAX_AHEAD);
  const first = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

  function shift(n) { month = new Date(month.getFullYear(), month.getMonth() + n, 1); render(); }

  function render() {
    const sel = getDay();
    label.textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const monthStart = ymd(month), monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    prev.disabled = monthStart <= lo(); next.disabled = monthEnd >= hi();
    const lead = (month.getDay() + 6) % 7; // blanks before the 1st (Monday-first)
    const days = parseDay(monthEnd).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'cal-blank' }));
    for (let d = 1; d <= days; d++) {
      const day = ymd(new Date(month.getFullYear(), month.getMonth(), d));
      const cls = ['cal-day', day === sel ? 'sel' : '', day === state.today ? 'today' : ''].join(' ').trim();
      const b = h('button', { type: 'button', class: cls, 'aria-label': parseDay(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), 'aria-current': day === sel ? 'date' : 'false', onClick: () => { tap(); onPick(day); } }, String(d));
      b.disabled = day < lo() || day > hi();
      cells.push(b);
    }
    grid.replaceChildren(...cells);
  }

  return {
    el,
    get isOpen() { return open; },
    open() { month = first(parseDay(getDay())); render(); open = true; el.inert = false; el.classList.add('open'); },
    close() { open = false; el.inert = true; el.classList.remove('open'); },
    toggle() { open ? this.close() : this.open(); },
    refresh() { if (open) render(); },
  };
}
