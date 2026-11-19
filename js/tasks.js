// Tasks tab: looks and works like Today, but for one-off tasks (steps and sub-steps live inside each task).
import { h, tween, shortDay, addDays } from './util.js';
import { icon } from './icons.js';
import { PALETTE } from './colors.js';
import { ring } from './ui.js';
import { card, taskRing, TASK_COLOR } from './cards.js';
import { state, subscribe, tasksOn, taskList, isTaskDone, setTaskDone, setTaskDay, shiftTaskDay, stepCount, taskPath, taskProgress, HISTORY_DAYS, MAX_AHEAD } from './store.js';
import { taskDayProgress } from './rates.js';
import { attachHold } from './hold.js';
import { createCalendar } from './calendar.js';
import { openTask } from './task-sheet.js';
import { openTaskEditor } from './task-editor.js';
import { taskItems } from './task-actions.js';

export function mountTasks(root) {
  const cal = createCalendar({ getDay: () => state.taskDay, onPick: (d) => { setTaskDay(d); cal.close(); } });
  const title = h('button', { type: 'button', class: 'day-title', 'aria-label': 'Open calendar', 'aria-expanded': 'false', onClick: () => {
    cal.toggle(); title.setAttribute('aria-expanded', String(cal.isOpen));
    if (cal.isOpen) root.scrollTo?.({ top: 0, behavior: 'smooth' });
  } });
  const prev = h('button', { type: 'button', class: 'arrow left', 'aria-label': 'Previous day', onClick: () => shiftTaskDay(-1) }, icon('chevron-left', { size: 30.4, stroke: 1.58 }));
  const next = h('button', { type: 'button', class: 'arrow right', 'aria-label': 'Next day', onClick: () => shiftTaskDay(1) }, icon('chevron-left', { size: 30.4, stroke: 1.58 }));
  const view = h('button', { type: 'button', class: 'sq-btn gray', 'aria-label': 'Change view' }, icon('layout-dashboard', { filled: true, size: 26.7 }));
  const add = h('button', { type: 'button', class: 'circle-btn gray', 'aria-label': 'New task', onClick: () => openTaskEditor({ day: state.taskDay }) }, icon('plus', { size: 34.5, stroke: 2.09 }));
  const header = h('header', { class: 'top-bar' }, view, h('div', { class: 'day-nav' }, prev, title, next), add);

  const r = ring({ size: 159, stroke: 12, color: PALETTE.green, glow: true, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, num, h('span', { class: 'hero-unit' }, '%')));
  const list = h('div', { class: 'cards' });
  const divider = h('div', { class: 'divider' });
  const empty = h('p', { class: 'empty-text' }, 'No tasks');
  root.append(cal.el, header, hero, list, empty);

  const cards = new Map();
  function make(t) {
    const c = card({ onClick: () => openTask(comp.t.id) });
    const tr = taskRing(() => { const cur = state.tasks.get(comp.t.id); if (cur) setTaskDone(cur, !isTaskDone(cur)).catch(() => {}); });
    c.slot.append(tr.el);
    const comp = { ...c, tr, t };
    attachHold(c.el, () => taskItems(comp.t));
    return comp;
  }

  function update() {
    const day = state.taskDay, isToday = day === state.today;
    const all = tasksOn(day);
    title.textContent = isToday ? 'Today' : shortDay(day);
    title.classList.toggle('away', !isToday);
    title.setAttribute('aria-expanded', String(cal.isOpen));
    cal.refresh();
    prev.disabled = day <= addDays(state.today, -HISTORY_DAYS);
    next.disabled = day >= addDays(state.today, MAX_AHEAD);

    const t = taskDayProgress(day);
    r.set(t.n ? t.done / t.n : 0);
    tween(num, t.pct);

    const before = new Map([...cards].map(([id, c]) => [id, c.el.getBoundingClientRect().top]));
    for (const [id, c] of cards) if (!all.some((x) => x.id === id)) { c.el.remove(); cards.delete(id); }
    const pending = [], finished = [], idx = new Map();
    for (const x of taskList()) if (x.parent_id) (idx.get(x.parent_id) || idx.set(x.parent_id, []).get(x.parent_id)).push(x);
    for (const tk of all) {
      let c = cards.get(tk.id);
      if (!c) { c = make(tk); cards.set(tk.id, c); c.el.classList.add('enter'); c.el.addEventListener('animationend', () => c.el.classList.remove('enter'), { once: true }); }
      c.t = tk;
      const done = isTaskDone(tk), sc = stepCount(tk.id), path = taskPath(tk);
      const late = !done && tk.day < day ? `Due ${shortDay(tk.day)}` : '';
      const sub = [late, path ? `in ${path}` : '', sc.n ? `${sc.done}/${sc.n} steps` : ''].filter(Boolean).join(' • ') || (tk.parent_id ? 'Step' : 'Task');
      c.set({ color: TASK_COLOR, icon: tk.icon, name: tk.title, sub, done });
      c.tr.set(done, sc.n > 0, taskProgress(tk.id, idx));
      (done ? finished : pending).push(c);
    }
    const order = [...pending.map((c) => c.el), ...(pending.length && finished.length ? [divider] : []), ...finished.map((c) => c.el)];
    const cur = [...list.children];
    if (order.length !== cur.length || order.some((el, i) => el !== cur[i])) list.replaceChildren(...order);
    for (const [id, c] of cards) {
      const was = before.get(id);
      if (was == null || c.el.classList.contains('enter')) continue;
      const dy = was - c.el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) {
        c.el.style.transition = 'none'; c.el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => { c.el.style.transition = ''; c.el.style.transform = ''; }));
      }
    }
    empty.hidden = all.length > 0;
    list.hidden = all.length === 0;
  }
  subscribe(update);
  update();
}
