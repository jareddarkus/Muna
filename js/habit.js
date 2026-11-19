// The screen for one habit: record progress (counter or timer), see its 21-day rate, jump to edit.
import { h, tween, fmtClock, fmtDay, tap, goalLabel } from './util.js';
import { icon } from './icons.js';
import { PALETTE, hex } from './colors.js';
import { ring, openPanel, panelBar } from './ui.js';
import { state, subscribe, valueOf, progressOf, isDone, bump, setValue } from './store.js';
import { liveValue, isRunning, toggle, onTick } from './timer.js';
import { openEditor } from './editor.js';

/** Minutes added or removed by the − / + buttons: small for short goals, bigger for long ones. */
function stepFor(hb) {
  const m = (hb.target || 0) / 60;
  return m <= 10 ? 1 : m <= 20 ? 2 : m <= 60 ? 5 : m <= 180 ? 10 : 15;
}

export function openHabit(id, day = state.viewDay) {
  const first = state.habits.get(id);
  if (!first) return;
  const isToday = day === state.today, future = day > state.today;
  let unsub = () => {}, unTick = () => {};
  const panel = openPanel({ cls: 'habit-panel', onClose: () => { unsub(); unTick(); } });

  const edit = h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Edit habit', onClick: () => { panel.close(); setTimeout(() => openEditor(id), 150); } }, icon('pencil', { size: 26, stroke: 1.8 }));
  const titleEl = h('span', { class: 'habit-bar-title' });
  const closeBtn = h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Close', onClick: () => panel.close() }, icon('x', { size: 28, stroke: 1.8 }));
  const r = ring({ size: 130, stroke: 10, color: PALETTE.purple, glow: true, cls: 'hero-ring small' });
  const num = h('span', { class: 'hero-num' }, '0');
  const unit = h('span', { class: 'habit-unit' });
  const center = h('div', { class: 'hero-center col' }, num, unit);
  const controls = h('div', { class: 'habit-controls' });

  panel.el.append(panelBar(panel, { left: edit, right: closeBtn, title: titleEl }),
    h('div', { class: 'panel-body center' },
      h('div', { class: 'hero compact' }, r.el, center), controls, isToday ? null : h('p', { class: 'habit-sub center' }, fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' }))));

  let built = null;
  const round = (cls, label, ic, fn) => h('button', { type: 'button', class: `big-btn ${cls}`, 'aria-label': label, onClick: () => { tap(); fn(); } }, ic);
  function build(hb) {
    const kind = hb.goal_type === 'time' ? (isToday ? 'time' : 'time-manual') : hb.target === 1 ? 'check' : 'count';
    const step = stepFor(hb), key = kind + hb.target;
    if (built === key) return;
    built = key; controls.replaceChildren();
    if (kind === 'check') controls.append(round('main', 'Toggle done', icon('check', { size: 37.4, stroke: 3.86 }), () => setValue(hb, valueOf(hb.id, day) >= 1 ? 0 : 1, day)));
    else if (kind === 'count') controls.append(round('side', 'Decrease', icon('minus', { size: 30, stroke: 2.2 }), () => bump(hb, -1, day)), round('main', 'Increase', icon('plus', { size: 34.5, stroke: 2.09 }), () => bump(hb, 1, day)));
    else if (kind === 'time-manual') controls.append(round('side txt', `Remove ${step} minutes`, `−${step}`, () => bump(hb, -step * 60, day)), round('main txt', `Add ${step} minutes`, `+${step}`, () => bump(hb, step * 60, day)));
    else controls.append(round('side txt', `Remove ${step} minutes`, `−${step}`, () => bump(hb, -step * 60, day)),
      round('main play', 'Start or pause', h('span', { class: 'pp' }, h('span', { class: 'i-play' }, icon('player-play', { filled: true, size: 34 })), h('span', { class: 'i-pause' }, icon('player-pause', { filled: true, size: 34 }))), () => toggle(hb)),
      round('side txt', `Add ${step} minutes`, `+${step}`, () => bump(hb, step * 60, day)));
    controls.querySelectorAll('button').forEach((b) => { b.disabled = future; });
  }

  function update() {
    const hb = state.habits.get(id);
    if (!hb) { panel.close(); return; }
    const color = hex(hb.color), time = hb.goal_type === 'time';
    panel.el.style.setProperty('--c', color);
    titleEl.textContent = hb.title;
    const running = isToday && isRunning(id);
    const v = time && isToday ? liveValue(id) : valueOf(id, day);
    const done = isDone(hb, v);
    build(hb);
    r.color(color); r.set(done ? 1 : progressOf(hb, v));
    const note = future ? 'Not yet' : done ? 'Goal reached' : running ? 'Running…' : '';
    if (time) { num._v = undefined; num.textContent = fmtClock(v); unit.textContent = note || `of ${goalLabel(hb)}`; }
    else { tween(num, Math.floor(v)); unit.textContent = note || (hb.target === 1 && !hb.unit ? '' : `of ${hb.target}${hb.unit ? ` ${hb.unit}` : ''}`); }
    num.classList.toggle('small', time);
    panel.el.classList.toggle('running', running);
    panel.el.classList.toggle('done', done);
  }
  unsub = subscribe(update);
  unTick = onTick(update);
  update();
}
