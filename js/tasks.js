// Tasks tab: looks and works like Today, but for one-off tasks (steps and sub-steps live inside each task).
import { h, tween, shortDay, addDays, parseDay, ymd, tap, toast } from './util.js';
import { icon } from './icons.js';
import { PALETTE, hex } from './colors.js';
import { ring, segmented } from './ui.js';
import { card, taskRing } from './cards.js';
import { state, subscribe, taskSections, anytimeTasks, projectTasks, setTasksTab, saveTask, taskList, isTaskDone, setTaskDone, setTaskDay, shiftTaskDay, stepCount, taskPath, taskProgress, togetherCue, HISTORY_DAYS, MAX_AHEAD } from './store.js';
import { taskDayProgress } from './rates.js';
import { attachHold } from './hold.js';
import { createCalendar } from './calendar.js';
import { openTask } from './task-sheet.js';
import { makeTaskCard, paintTaskCard } from './task-card.js';
import { openTaskEditor } from './task-editor.js';
import { taskItems } from './task-actions.js';
import { createTimeline } from './timeline.js';
import { attachRingActions } from './ring-actions.js';

export function mountTasks(root) {
  const cal = createCalendar({ getDay: () => state.taskDay, onPick: (d) => { setTaskDay(d); cal.close(); } });
  const title = h('button', { type: 'button', class: 'day-title', 'aria-label': 'Open calendar', 'aria-expanded': 'false', onClick: () => {
    if (state.tasksTab !== 'day') return;
    cal.toggle(); title.setAttribute('aria-expanded', String(cal.isOpen));
    if (cal.isOpen) root.scrollTo?.({ top: 0, behavior: 'smooth' });
  } });
  const prev = h('button', { type: 'button', class: 'arrow left', 'aria-label': 'Previous day', onClick: () => shiftTaskDay(-1) }, icon('chevron-left', { size: 30.4, stroke: 1.58 }));
  const next = h('button', { type: 'button', class: 'arrow right', 'aria-label': 'Next day', onClick: () => shiftTaskDay(1) }, icon('chevron-left', { size: 30.4, stroke: 1.58 }));
  const view = h('button', { type: 'button', class: 'sq-btn gray', 'aria-label': 'Change view' }, icon('layout-dashboard', { filled: true, size: 26.7 }));
  const add = h('button', { type: 'button', class: 'circle-btn gray', 'aria-label': 'New task', onClick: () => openTaskEditor(state.tasksTab === 'day' ? { day: state.taskDay } : { anytime: true, project: state.tasksTab === 'projects' }) }, icon('plus', { size: 34.5, stroke: 2.09 }));
  const header = h('header', { class: 'top-bar tight' }, view, h('div', { class: 'day-nav' }, prev, title, next), add);

  const seg = segmented([['day', 'Day'], ['anytime', 'Anytime'], ['projects', 'Projects']], state.tasksTab, (v) => { tap(); cal.close(); setTasksTab(v); });
  const segWrap = h('div', { class: 'seg-wrap tasks-seg' }, seg.el);

  // week strip (Day tab): Monday to Sunday of the shown week, arrows jump a whole week
  const weekLabel = h('span', { class: 'week-label' });
  const weekPrev = h('button', { type: 'button', class: 'arrow-btn left', 'aria-label': 'Previous week', onClick: () => shiftTaskDay(-7) }, icon('chevron-left', { size: 24, stroke: 1.8 }));
  const weekNext = h('button', { type: 'button', class: 'arrow-btn right', 'aria-label': 'Next week', onClick: () => shiftTaskDay(7) }, icon('chevron-left', { size: 24, stroke: 1.8 }));
  const weekDays = h('div', { class: 'week-days' });
  const week = h('section', { class: 'week-strip', 'aria-label': 'Week' }, h('div', { class: 'week-head' }, weekPrev, weekLabel, weekNext), weekDays);
  const LET = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  function paintWeek(day) {
    const d = parseDay(day), mon = addDays(day, -((d.getDay() + 6) % 7));
    weekLabel.textContent = parseDay(addDays(mon, 3)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const lo = addDays(state.today, -HISTORY_DAYS), hi = addDays(state.today, MAX_AHEAD);
    weekPrev.disabled = addDays(mon, 6) < lo || mon <= lo; weekNext.disabled = addDays(mon, 7) > hi;
    weekDays.replaceChildren(...LET.map((l, i) => {
      const x = addDays(mon, i), list = taskSections(x).due;
      const dot = !list.length ? '' : list.every((t) => t.done_at) ? 'all' : 'some';
      return h('button', { type: 'button', class: `wd ${x === day ? 'on' : ''} ${x === state.today ? 'today' : ''}`, disabled: x < lo || x > hi, 'aria-label': shortDay(x), 'aria-pressed': String(x === day), onClick: () => { tap(); setTaskDay(x); } },
        h('span', { class: 'wd-l' }, l), h('span', { class: 'wd-n' }, String(parseDay(x).getDate())), h('i', { class: `wd-dot ${dot}` }));
    }));
  }

  const r = ring({ size: 159, stroke: 12, color: PALETTE.green, glow: true, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, num, h('span', { class: 'hero-unit' }, '%')));
  const list = h('div', { class: 'cards' });
  const listCarried = h('div', { class: 'cards' });
  const timeline = createTimeline({ scroller: root,
    onMove: (id, time) => saveTask({ id, due_time: time }).catch((e) => toast(e?.message || 'Could not move it')),
    onCreate: (time) => openTaskEditor({ day: state.taskDay, time }) });
  const divider = h('div', { class: 'divider' });
  const dividerCarried = h('div', { class: 'divider' });
  const carriedTitle = h('p', { class: 'list-title carried-title' }, 'Carried over');
  const empty = h('p', { class: 'empty-text' }, 'No tasks');
  root.append(cal.el, header, segWrap, week, hero, list, timeline.el, listCarried, empty);

  const cards = new Map();
  const make = (tk) => makeTaskCard(tk, (id) => openTask(id));

  function update() {
    const tab = state.tasksTab, isDay = tab === 'day';
    const day = isDay ? state.taskDay : state.today, isToday = day === state.today;
    const { due, carried } = isDay ? taskSections(day) : { due: tab === 'anytime' ? anytimeTasks() : projectTasks(), carried: [] };
    const all = [...due, ...carried];
    seg.set(tab);
    title.textContent = isDay ? (isToday ? 'Today' : shortDay(day)) : tab === 'anytime' ? 'Anytime' : 'Projects';
    title.classList.toggle('away', isDay && !isToday);
    title.classList.toggle('static', !isDay);
    title.setAttribute('aria-expanded', String(cal.isOpen));
    cal.refresh();
    prev.style.visibility = next.style.visibility = isDay ? '' : 'hidden';
    prev.disabled = day <= addDays(state.today, -HISTORY_DAYS);
    next.disabled = day >= addDays(state.today, MAX_AHEAD);
    week.hidden = !isDay;
    if (isDay) paintWeek(state.taskDay);
    empty.textContent = tab === 'projects' ? 'No projects yet. Tap + to start one.' : tab === 'anytime' ? 'Nothing waiting. Tap + to add a task with no day.' : 'No tasks';

    let t;
    if (isDay) t = taskDayProgress(day);
    else {
      const idx = new Map(); for (const x of taskList()) if (x.parent_id) (idx.get(x.parent_id) || idx.set(x.parent_id, []).get(x.parent_id)).push(x);
      const n = due.length, doneN = due.filter((x) => x.done_at).length, frac = n ? due.reduce((a, x) => a + (x.done_at ? 1 : taskProgress(x.id, idx)), 0) / n : 0;
      t = { frac, pct: !n ? 0 : doneN === n ? 100 : Math.min(99, Math.ceil(frac * 100)) };
    }
    r.set(t.frac);
    tween(num, t.pct);

    const before = new Map([...cards].map(([id, c]) => [id, c.el.getBoundingClientRect().top]));
    for (const [id, c] of cards) if (!all.some((x) => x.id === id)) { c.el.remove(); cards.delete(id); }
    const idx = new Map();
    for (const x of taskList()) if (x.parent_id) (idx.get(x.parent_id) || idx.set(x.parent_id, []).get(x.parent_id)).push(x);
    const build = (list) => {
      const pending = [], finished = [];
      for (const tk of list) {
        let c = cards.get(tk.id);
        if (!c) { c = make(tk); cards.set(tk.id, c); c.el.classList.add('enter'); c.el.addEventListener('animationend', () => c.el.classList.remove('enter'), { once: true }); }
        const done = paintTaskCard(c, tk, { day, idx });
        (done ? finished : pending).push(c);
      }
      return { pending, finished };
    };
    const timed = isDay ? due.filter((x) => x.due_time) : [], untimed = isDay ? due.filter((x) => !x.due_time) : due;
    const A = build(untimed), B = build(carried), T = build(timed);
    const tcards = [...T.pending, ...T.finished];
    tcards.forEach((c) => { c.timed = true; });
    // this day's tasks without a time (to do, divider, done), then the hours, then carried over (to do first, done below)
    const order = [...A.pending.map((c) => c.el), ...(A.pending.length && A.finished.length ? [divider] : []), ...A.finished.map((c) => c.el)];
    const orderCarried = carried.length ? [...(due.length ? [dividerCarried] : []), carriedTitle, ...B.pending.map((c) => c.el), ...B.finished.map((c) => c.el)] : [];
    const sync = (host, els) => { const cur = [...host.children]; if (els.length !== cur.length || els.some((el, i) => el !== cur[i])) host.replaceChildren(...els); };
    sync(list, order); sync(listCarried, orderCarried);
    timeline.el.hidden = !isDay;
    if (isDay) timeline.render(timed.map((tk) => ({ tk, c: cards.get(tk.id) })), { isToday });
    for (const [id, c] of cards) {
      const was = before.get(id);
      if (was == null || c.timed || c.el.classList.contains('enter')) continue;
      const dy = was - c.el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) {
        c.el.style.transition = 'none'; c.el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => { c.el.style.transition = ''; c.el.style.transform = ''; }));
      }
    }
    empty.hidden = isDay || all.length > 0;
    list.hidden = !untimed.length;
    listCarried.hidden = !carried.length;
  }
  subscribe(update);
  update();
}
