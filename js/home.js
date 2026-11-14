import { h, tween, keyedList, fmtDay, fmtMinutes, fmtClock, tap } from './util.js';
import { icon, habitIcon } from './icons.js';
import { colorVars } from './colors.js';
import { ring } from './ui.js';
import { state, subscribe, habitList, isScheduled, dayStats, valueOf, progressOf, isDone, streakOf, bump, setValue, shiftViewDay, setViewDay, HISTORY_DAYS, MAX_AHEAD } from './store.js';
import { addDays } from './util.js';
import { liveValue, isRunning, onTick, discardMissing, toggle } from './timer.js';
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

const goalText = (hb) => (hb.goal_type === 'time' ? `Goal: ${fmtMinutes(hb.target)}` : hb.target === 1 && !hb.unit ? 'Goal: once' : `Goal: ${hb.target}${hb.unit ? ` ${hb.unit}` : '×'}`);
const mode = { editing: false };

function quickLog(hb) {
  const day = state.viewDay;
  if (day > state.today) return;
  tap();
  if (hb.goal_type === 'time') { day === state.today ? toggle(hb) : bump(hb, 300, day); return; }
  if (hb.target === 1) setValue(hb, valueOf(hb.id, day) >= 1 ? 0 : 1, day);
  else bump(hb, 1, day);
}

function habitRow(habit) {
  let current = habit;
  const bubble = h('span', { class: 'bubble' });
  const title = h('span', { class: 'row-title' });
  const sub = h('span', { class: 'row-sub-text' });
  const tag = h('span', { class: 'row-tag' });
  const r = ring({ size: 60, stroke: 7, cls: 'row-ring' });
  const center = h('span', { class: 'row-btn-ic' });
  const badge = h('span', { class: 'badge-streak', title: 'Day streak' }, '0');
  const quick = h('button', { type: 'button', class: 'row-btn', 'aria-label': 'Log progress', onClick: (e) => { e.stopPropagation(); quickLog(current); } }, r.el, center, badge);
  const edit = h('span', { class: 'row-edit' }, icon('pencil', { size: 20 }));
  const open = () => (mode.editing ? openEditor(current.id) : openFocus(current.id, state.viewDay));
  const el = h('div', { class: 'row', role: 'button', tabindex: 0, onClick: open, onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } },
    bubble, h('span', { class: 'row-main' }, title, h('span', { class: 'row-sub' }, h('span', { class: 'live-dot' }), sub, tag)), quick, edit);
  let iconRef = null, wasDone = null, lastStreak = null, centerKey = null;

  function setCenter(kind) {
    if (centerKey === kind) return;
    centerKey = kind;
    center.replaceChildren(icon(kind, { size: kind === 'check' ? 28 : 22 }));
  }

  return {
    el,
    update(hb) {
      current = hb;
      Object.entries(colorVars(hb.color)).forEach(([k, v]) => el.style.setProperty(k, v));
      if (iconRef !== hb.icon) { iconRef = hb.icon; bubble.replaceChildren(habitIcon(hb.icon, 24)); }
      title.textContent = hb.title;
      const day = state.viewDay, isToday = day === state.today;
      const running = isToday && isRunning(hb.id);
      const v = hb.goal_type === 'time' && isToday ? liveValue(hb.id) : valueOf(hb.id, day);
      const p = progressOf(hb, v), done = isDone(hb, v);
      const scheduled = isScheduled(hb, day);
      r.set(p);
      sub.textContent = !scheduled && hb.created_on > day ? `Starts ${fmtDay(hb.created_on, { month: 'short', day: 'numeric' })}`
        : running || (v > 0 && !done) ? progressText(hb, v, running) : goalText(hb);
      el.classList.toggle('running', running);
      el.classList.toggle('done', done);
      el.classList.toggle('off', !scheduled);
      quick.disabled = day > state.today;
      setCenter(done ? 'check' : hb.goal_type === 'time' ? (running ? 'player-pause' : 'player-play') : hb.target === 1 ? 'check' : 'plus');
      center.classList.toggle('done', done);
      if (wasDone === false && done) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      wasDone = done;
      const g = hb.group_id && state.groups.get(hb.group_id);
      tag.textContent = g ? g.name : '';
      tag.hidden = !g;
      const st = streakOf(hb);
      if (st !== lastStreak) { badge.textContent = st; lastStreak = st; }
      badge.classList.toggle('zero', st === 0);
      badge.classList.toggle('lit', done);
    },
  };
}

export function mountHome(root) {
  const titleEl = h('button', { type: 'button', class: 'home-title', 'aria-label': 'Jump to today', onClick: () => setViewDay(state.today) });
  const subEl = h('p', { class: 'home-sub' });
  const prev = h('button', { type: 'button', class: 'circle-btn white nav-circle', 'aria-label': 'Previous day', onClick: () => shiftViewDay(-1) }, icon('chevron-left', { size: 20 }));
  const next = h('button', { type: 'button', class: 'circle-btn white nav-circle', 'aria-label': 'Next day', onClick: () => shiftViewDay(1) }, icon('chevron-right', { size: 20 }));
  const editBtn = h('button', { type: 'button', class: 'circle-btn white', 'aria-label': 'Edit habits', 'aria-pressed': 'false', onClick: () => {
    mode.editing = !mode.editing; editBtn.classList.toggle('on', mode.editing); editBtn.setAttribute('aria-pressed', String(mode.editing)); root.classList.toggle('editing', mode.editing);
  } }, icon('pencil', { size: 22 }));
  const plus = h('button', { type: 'button', class: 'circle-btn white', 'aria-label': 'New habit', onClick: () => openEditor() }, icon('plus', { size: 24 }));
  const r = ring({ size: 176, stroke: 19, cls: 'hero-ring' });
  const num = h('span', { class: 'hero-num' }, '0');
  const label = h('span', { class: 'hero-label' });
  const check = h('span', { class: 'hero-check' }, icon('check', { size: 72 }));
  const hero = h('section', { class: 'hero' }, r.el, h('div', { class: 'hero-center' }, h('div', { class: 'hero-pct' }, num, h('span', { class: 'hero-unit' }, '%')), label, check));
  const list = h('div', { class: 'list' });
  const restTitle = h('h3', { class: 'section-label' }, 'Not scheduled');
  const restList = h('div', { class: 'list rest' });
  const empty = h('p', { class: 'empty-text' }, 'No habits');
  const offline = h('div', { class: 'offline', hidden: true }, 'Offline — changes will sync when you’re back');

  root.append(h('header', { class: 'home-head' }, h('div', { class: 'head-actions' }, editBtn, plus),
    h('div', { class: 'head-title' }, h('div', { class: 'head-text' }, titleEl, subEl), h('div', { class: 'head-nav' }, prev, next))), offline, hero, list, restTitle, restList, empty);

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
    label.textContent = s.n ? `${s.done} of ${s.n} done` : all.length ? 'Rest day' : '';
    const sameYear = day.slice(0, 4) === state.today.slice(0, 4);
    titleEl.textContent = isToday ? 'Today' : fmtDay(day, { weekday: 'long' });
    subEl.textContent = isToday ? '' : fmtDay(day, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    titleEl.classList.toggle('away', !isToday);
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
