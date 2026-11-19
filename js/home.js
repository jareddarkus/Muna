// Today: header with day arrows, the big ring (today only), pending habits, a divider, then completed habits in their own color.
import { h, tween, fmtDay, shortDay, addDays } from './util.js';
import { icon } from './icons.js';
import { PALETTE, hex } from './colors.js';
import { ring } from './ui.js';
import { card, progressRing, habitSub } from './cards.js';
import { state, subscribe, habitList, isScheduled, valueOf, progressOf, isDone, shiftViewDay, setViewDay, HISTORY_DAYS, MAX_AHEAD } from './store.js';
import { todayProgress } from './rates.js';
import { liveValue, isRunning, onTick, discardMissing } from './timer.js';
import { openHabit } from './habit.js';
import { openEditor } from './editor.js';
import { attachHold } from './hold.js';
import { habitItems } from './habit-actions.js';
import { createCalendar } from './calendar.js';

export function mountHome(root) {
  const cal = createCalendar({ getDay: () => state.viewDay, onPick: (d) => { setViewDay(d); cal.close(); } });
  const title = h('button', { type: 'button', class: 'day-title', 'aria-label': 'Open calendar', 'aria-expanded': 'false', onClick: () => {
    cal.toggle(); title.setAttribute('aria-expanded', String(cal.isOpen));
    if (cal.isOpen) root.scrollTo?.({ top: 0, behavior: 'smooth' });
  } });
  const prev = h('button', { type: 'button', class: 'arrow left', 'aria-label': 'Previous day', onClick: () => shiftViewDay(-1) }, icon('chevron-left', { size: 30.4, stroke: 1.58 }));
  const next = h('button', { type: 'button', class: 'arrow right', 'aria-label': 'Next day', onClick: () => shiftViewDay(1) }, icon('chevron-left', { size: 30.4, stroke: 1.58 }));
  const view = h('button', { type: 'button', class: 'sq-btn gray', 'aria-label': 'Change view' }, icon('layout-dashboard', { filled: true, size: 26.7 }));
  const add = h('button', { type: 'button', class: 'circle-btn gray', 'aria-label': 'New habit', onClick: () => openEditor() }, icon('plus', { size: 34.5, stroke: 2.09 }));
  const header = h('header', { class: 'top-bar' }, view, h('div', { class: 'day-nav' }, prev, title, next), add);

  const r = ring({ size: 159, stroke: 12, color: PALETTE.green, glow: true, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, num, h('span', { class: 'hero-unit' }, '%')));

  const list = h('div', { class: 'cards' });
  const divider = h('div', { class: 'divider' });
  const empty = h('p', { class: 'empty-text' }, 'No habits');
  root.append(cal.el, header, hero, list, empty);

  const cards = new Map(); // habit id -> component
  function make(hb) {
    const c = card({ onClick: () => openHabit(hb.id, state.viewDay) });
    const rb = progressRing();
    c.slot.append(rb.el);
    const comp = { ...c, rb, hb };
    attachHold(c.el, () => habitItems(comp.hb));
    return comp;
  }

  function update() {
    const day = state.viewDay, isToday = day === state.today;
    const all = habitList().filter((x) => isScheduled(x, day));
    discardMissing(new Set(habitList().map((x) => x.id)));

    // title + arrows
    title.textContent = isToday ? 'Today' : shortDay(day);
    title.classList.toggle('away', !isToday);
    title.setAttribute('aria-expanded', String(cal.isOpen));
    cal.refresh();
    prev.disabled = day <= addDays(state.today, -HISTORY_DAYS);
    next.disabled = day >= addDays(state.today, MAX_AHEAD);

    // ring: today only
    const t = todayProgress(day);
    r.set(t.n ? t.done / t.n : 0);
    tween(num, t.pct);

    // cards
    const before = new Map([...cards].map(([id, c]) => [id, c.el.getBoundingClientRect().top]));
    for (const [id, c] of cards) if (!all.some((x) => x.id === id)) { c.el.remove(); cards.delete(id); }
    const pending = [], finished = [];
    for (const hb of all) {
      let c = cards.get(hb.id);
      if (!c) { c = make(hb); cards.set(hb.id, c); c.el.classList.add('enter'); c.el.addEventListener('animationend', () => c.el.classList.remove('enter'), { once: true }); }
      c.hb = hb;
      const live = hb.goal_type === 'time' && isToday;
      const v = live ? liveValue(hb.id) : valueOf(hb.id, day);
      const done = isDone(hb, v);
      c.set({ color: hex(hb.color), icon: hb.icon, name: hb.title, sub: habitSub(hb), done });
      c.rb.set(hb, v, progressOf(hb, v), done);
      c.el.classList.toggle('running', live && isRunning(hb.id));
      (done ? finished : pending).push(c);
    }
    const order = [...pending.map((c) => c.el), ...(pending.length && finished.length ? [divider] : []), ...finished.map((c) => c.el)];
    const cur = [...list.children];
    if (order.length !== cur.length || order.some((el, i) => el !== cur[i])) list.replaceChildren(...order);
    // slide cards that changed position (e.g. a habit that was just completed)
    for (const [id, c] of cards) {
      const was = before.get(id);
      if (was == null || c.el.classList.contains('enter')) continue;
      const dy = was - c.el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) {
        c.el.style.transition = 'none'; c.el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => { c.el.style.transition = ''; c.el.style.transform = ''; }));
      }
    }
    empty.hidden = habitList().length > 0;
    list.hidden = all.length === 0;
  }
  subscribe(update);
  onTick(update);
  update();
}
