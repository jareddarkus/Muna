import { h, tween, keyedList, fmtDay, fmtMinutes, fmtClock, pct } from './util.js';
import { icon, habitIcon } from './icons.js';
import { colorVars } from './colors.js';
import { ring } from './ui.js';
import { state, subscribe, habitList, isScheduled, dayStats, valueOf, progressOf, isDone, streakOf, shiftViewDay, setViewDay, HISTORY_DAYS, MAX_AHEAD } from './store.js';
import { addDays } from './util.js';
import { liveValue, isRunning, onTick, discardMissing } from './timer.js';
import { openFocus } from './focus.js';
import { openEditor } from './editor.js';

export function progressText(h_, v, running) {
  if (h_.goal_type === 'time') {
    const left = running ? fmtClock(v) : fmtMinutes(v);
    return `${left} / ${fmtMinutes(h_.target)}`;
  }
  if (h_.target === 1 && !h_.unit) return isDone(h_, v) ? 'Done' : 'Not yet';
  return `${Math.floor(v)} / ${h_.target}${h_.unit ? ` ${h_.unit}` : ''}`;
}

function habitRow(habit) {
  const fill = h('span', { class: 'row-fill' });
  const bubble = h('span', { class: 'bubble' });
  const title = h('span', { class: 'row-title' });
  const sub = h('span', { class: 'row-sub-text' });
  const tag = h('span', { class: 'row-tag' });
  const streak = h('span', { class: 'streak', title: 'Day streak' }, h('span', { class: 'streak-n' }, '0'));
  const el = h('button', { type: 'button', class: 'row', onClick: () => openFocus(habit.id, state.viewDay) },
    fill, bubble, h('span', { class: 'row-main' }, title, h('span', { class: 'row-sub' }, h('span', { class: 'live-dot' }), sub, tag)), streak);
  let iconRef = null, wasDone = null, lastStreak = null;
  const n = streak.firstChild;

  return {
    el,
    update(hb) {
      Object.entries(colorVars(hb.color)).forEach(([k, v]) => el.style.setProperty(k, v));
      if (iconRef !== hb.icon) { iconRef = hb.icon; bubble.replaceChildren(habitIcon(hb.icon, 24)); }
      title.textContent = hb.title;
      const day = state.viewDay, isToday = day === state.today;
      const running = isToday && isRunning(hb.id);
      const v = hb.goal_type === 'time' && isToday ? liveValue(hb.id) : valueOf(hb.id, day);
      const p = progressOf(hb, v), done = isDone(hb, v);
      const scheduled = isScheduled(hb, day);
      fill.style.transform = `scaleX(${p})`;
      sub.textContent = !scheduled && hb.created_on > day ? `Starts ${fmtDay(hb.created_on, { month: 'short', day: 'numeric' })}` : progressText(hb, v, running);
      el.classList.toggle('running', running);
      el.classList.toggle('done', done);
      el.classList.toggle('off', !scheduled);
      if (wasDone === false && done) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      wasDone = done;
      const g = hb.group_id && state.groups.get(hb.group_id);
      tag.textContent = g ? g.name : '';
      tag.hidden = !g;
      const s = streakOf(hb);
      if (s !== lastStreak) { n.textContent = s; lastStreak = s; }
      streak.classList.toggle('zero', s === 0);
      streak.classList.toggle('lit', done);
    },
  };
}

export function mountHome(root) {
  const navTitle = h('div', { class: 'nav-title' });
  const navSub = h('div', { class: 'nav-sub' });
  const prev = h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Previous day', onClick: () => shiftViewDay(-1) }, icon('chevron-left', { size: 22 }));
  const next = h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Next day', onClick: () => shiftViewDay(1) }, icon('chevron-right', { size: 22 }));
  const navBtn = h('button', { type: 'button', class: 'nav-label', 'aria-label': 'Jump to today', onClick: () => setViewDay(state.today) }, navTitle, navSub);
  const plus = h('button', { type: 'button', class: 'circle-btn plus', 'aria-label': 'New habit', onClick: () => openEditor() }, icon('plus', { size: 26 }));
  const r = ring({ size: 232, stroke: 18, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const label = h('span', { class: 'hero-label' });
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, h('div', { class: 'hero-pct' }, num, h('span', { class: 'hero-unit' }, '%')), label));
  const list = h('div', { class: 'list' });
  const restTitle = h('h3', { class: 'section-label' }, 'Not scheduled');
  const restList = h('div', { class: 'list rest' });
  const empty = h('p', { class: 'empty-text' }, 'No habits');
  const offline = h('div', { class: 'offline', hidden: true }, 'Offline — changes will sync when you’re back');

  root.append(h('header', { class: 'top home-top' }, h('span'), h('div', { class: 'daynav' }, prev, navBtn, next), plus), offline, hero, list, restTitle, restList, empty);

  const syncMain = keyedList(list, habitRow);
  const syncRest = keyedList(restList, habitRow);
  let first = true;

  function update() {
    const all = habitList();
    discardMissing(new Set(all.map((x) => x.id)));
    const day = state.viewDay, isToday = day === state.today;
    const today = all.filter((x) => isScheduled(x, day));
    const rest = all.filter((x) => !isScheduled(x, day));
    const s = dayStats(day, all);
    // live timers count toward the ring too
    let p = s.p ?? 0;
    if (isToday && s.n && today.some((x) => isRunning(x.id))) p = today.reduce((a, x) => a + progressOf(x, x.goal_type === 'time' ? liveValue(x.id) : valueOf(x.id)), 0) / s.n;
    r.set(p);
    tween(num, Math.round(p * 100));
    hero.classList.toggle('complete', s.n > 0 && s.done === s.n);
    label.textContent = s.n ? (s.done === s.n ? 'All done — nice' : `${s.done} of ${s.n} done`) : all.length ? 'Rest day' : '';
    const sameYear = day.slice(0, 4) === state.today.slice(0, 4);
    navTitle.textContent = isToday ? 'Today' : fmtDay(day, { weekday: 'long' });
    navSub.textContent = isToday ? fmtDay(day, { weekday: 'short', month: 'short', day: 'numeric' }) : fmtDay(day, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    navBtn.classList.toggle('away', !isToday);
    prev.disabled = day <= addDays(state.today, -HISTORY_DAYS);
    next.disabled = day >= addDays(state.today, MAX_AHEAD);
    syncMain(today); syncRest(rest);
    restTitle.hidden = restList.hidden = rest.length === 0;
    empty.hidden = all.length > 0;
    list.hidden = today.length === 0;
    offline.hidden = state.online;
    if (first) { first = false; root.classList.add('ready'); }
  }
  subscribe(update);
  onTick(update);
  update();
  return { update };
}
