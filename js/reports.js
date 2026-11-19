// Reports: the 21-day completion rate for everything together, or narrowed to one habit (or the tasks) by tapping its icon.
import { h, tween, shortDay, addDays, dow, parseDay, DAY_NAMES, tap } from './util.js';
import { PALETTE, hex, rateColor } from './colors.js';
import { ring, iconCircle } from './ui.js';
import { TASK_COLOR } from './cards.js';
import { state, subscribe, habitList, isScheduled, valueOf, isDone, progressOf, setViewDay, setTaskDay } from './store.js';
import { attachHold } from './hold.js';
import { habitItems } from './habit-actions.js';
import { overallRate, habitRate, taskRate, taskParts, WINDOW } from './rates.js';

const TASKS = '__tasks';

export function mountReports(root) {
  let filter = null; // habit id, TASKS, or null for everything
  const title = h('h2', { class: 'screen-title' }, 'Reports');
  const header = h('header', { class: 'top-bar center-only' }, h('span'), title, h('span'));
  const r = ring({ size: 159, stroke: 12, color: PALETTE.green, glow: true, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const unit = h('span', { class: 'hero-unit' }, '%');
  const caption = h('p', { class: 'caption' });
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, num, unit));
  const icons = h('div', { class: 'rep-icons', role: 'group', 'aria-label': 'Filter by habit' });
  const cal = h('div', { class: 'mini-cal', 'aria-label': 'Last 21 days' });
  const empty = h('p', { class: 'empty-text' }, 'No habits');
  root.append(header, hero, caption, icons, cal, empty);

  const chips = new Map(); // id -> { el, key }
  const calCells = new Map();
  let calKey = '';
  const toggle = (id) => { tap(); filter = filter === id ? null : id; render(); };

  function render() {
    const all = habitList(), hasTasks = state.tasks.size > 0;
    empty.hidden = all.length > 0 || hasTasks;
    [hero, caption, icons, cal].forEach((e) => (e.hidden = !empty.hidden));
    if (!empty.hidden) return;
    if (filter === TASKS && !hasTasks) filter = null;
    if (filter && filter !== TASKS && !state.habits.has(filter)) filter = null;
    const hb = filter && filter !== TASKS ? state.habits.get(filter) : null;
    const tasksOnly = filter === TASKS;

    const pct = tasksOnly ? taskRate() : hb ? habitRate(hb) : overallRate(all);
    r.color(rateColor(pct)); r.set((pct ?? 0) / 100);
    tween(num, pct ?? 0);
    num.style.color = '';
    caption.textContent = tasksOnly ? 'Tasks' : hb ? hb.title : hasTasks ? 'Everything' : 'All habits';

    // habit icons (plus one gray circle for tasks): tap to filter, tap again to clear
    const items = [...all.map((x) => ({ id: x.id, icon: x.icon, color: hex(x.color), label: x.title, hb: x })), ...(hasTasks ? [{ id: TASKS, icon: 'outline:list-check', color: TASK_COLOR, label: 'Tasks' }] : [])];
    for (const [id, c] of chips) if (!items.some((i) => i.id === id)) { c.el.remove(); chips.delete(id); }
    const els = items.map((i) => {
      const key = `${i.icon}|${i.color}`;
      let c = chips.get(i.id);
      if (!c || c.key !== key) {
        const el = h('button', { type: 'button', class: 'rep-ic', 'aria-label': i.label, onClick: () => toggle(i.id) }, iconCircle(i.icon, i.color, 60, 32));
        c = { el, key, item: i }; chips.set(i.id, c);
        if (i.hb) attachHold(el, () => habitItems(c.item.hb, { day: state.today, extra: [{ label: filter === c.item.id ? 'Show everything' : 'Show only this', icon: 'filter', onSelect: () => toggle(c.item.id) }] }));
      }
      c.item = i;
      c.el.setAttribute('aria-pressed', String(filter === i.id));
      c.el.classList.toggle('on', filter === i.id);
      c.el.classList.toggle('dim', !!filter && filter !== i.id);
      return c.el;
    });
    const cur = [...icons.children];
    if (els.length !== cur.length || els.some((e, i) => e !== cur[i])) icons.replaceChildren(...els);

    // 21-day calendar: the more of that day was done, the stronger the color. Tap a day to open it on the Today tab.
    const tint = tasksOnly ? TASK_COLOR : hb ? hex(hb.color) : PALETTE.green;
    const start = addDays(state.today, -(WINDOW - 1));
    if (calKey !== start) { // build the cells once per day so colors can fade smoothly between habits
      calKey = start; calCells.clear();
      const lead = (parseDay(start).getDay() + 6) % 7; // Monday-first columns
      const cells = Array.from({ length: lead }, () => h('span', { class: 'mc-blank' }));
      for (let i = 0; i < WINDOW; i++) {
        const day = addDays(start, i);
        const b = h('button', { type: 'button', class: 'mc-day', onClick: () => { (filter === TASKS ? openTasksDay : openHomeDay)(day); } }, h('span', {}, String(parseDay(day).getDate())));
        calCells.set(day, b); cells.push(b);
      }
      cal.replaceChildren(...cells);
    }
    const tp = tasksOnly ? new Map(taskParts().days.map((d) => [d.day, d])) : null;
    for (const [day, b] of calCells) {
      let p = null; // 0..1 of that day done, null when nothing was scheduled
      if (tasksOnly) { const d = tp.get(day); if (d?.n) p = d.done / d.n; }
      else if (hb) { if (isScheduled(hb, day)) p = isDone(hb, valueOf(hb.id, day)) ? 1 : progressOf(hb, valueOf(hb.id, day)); }
      else {
        const sch = all.filter((x) => isScheduled(x, day));
        const t = taskParts().days.find((d) => d.day === day);
        const n = sch.length + (t?.n || 0);
        if (n) p = (sch.filter((x) => isDone(x, valueOf(x.id, day))).length + (t?.done || 0)) / n;
      }
      const o = p ? 0.2 + 0.8 * p : 0;
      b.style.setProperty('--c', tint); b.style.setProperty('--o', String(o));
      b.classList.toggle('off', p == null); b.classList.toggle('miss', p === 0);
      b.classList.toggle('strong', o > 0.55); b.classList.toggle('today', day === state.today);
      b.setAttribute('aria-label', `${DAY_NAMES[dow(day)]} ${shortDay(day)}${p == null ? '' : `, ${Math.round(p * 100)}% done`}`);
    }
  }
  function openHomeDay(day) { setViewDay(day); window.dispatchEvent(new CustomEvent('muna:tab', { detail: 0 })); }
  function openTasksDay(day) { setTaskDay(day); window.dispatchEvent(new CustomEvent('muna:tab', { detail: 1 })); }
  let visible = false;
  subscribe(() => { if (visible) render(); });
  render();
  return { show() { visible = true; render(); }, hide() { visible = false; } };
}
