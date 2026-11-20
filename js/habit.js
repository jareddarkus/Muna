// The screen for one habit: record progress (counter or timer), see its 21-day rate, jump to edit.
import { h, tween, fmtClock, fmtDay, tap, goalLabel, tapAmount, minuteStep, countStep } from './util.js';
import { icon } from './icons.js';
import { PALETTE, hex } from './colors.js';
import { ring, openPanel, panelBar } from './ui.js';
import { state, subscribe, valueOf, progressOf, isDone, bump, setValue } from './store.js';
import { liveValue, isRunning, toggle, onTick } from './timer.js';
import { openEditor } from './editor.js';
import { attachRingActions } from './ring-actions.js';
import { togetherStrip } from './together.js';

export function openHabit(id, day = state.viewDay) {
  const first = state.habits.get(id);
  if (!first) return;
  const isToday = day === state.today, future = day > state.today;
  let unsub = () => {}, unTick = () => {};
  const panel = openPanel({ cls: 'habit-panel', onClose: () => { unsub(); unTick(); }, tapClose: true });

  const edit = h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Edit habit', onClick: () => { panel.close(); setTimeout(() => openEditor(id), 150); } }, icon('pencil', { size: 26, stroke: 1.8 }));
  const titleEl = h('span', { class: 'habit-bar-title' });
  const r = ring({ size: 130, stroke: 10, color: PALETTE.purple, glow: true, cls: 'hero-ring small' });
  const num = h('span', { class: 'hero-num' }, '0');
  const unit = h('span', { class: 'habit-unit' });
  const center = h('div', { class: 'hero-center col' }, num, unit);
  const controls = h('div', { class: 'habit-controls' });
  // the big circle does what the ring on the Today card does: tap = +1 (or +1 minute), hold = fill it up and complete
  const heroBtn = h('div', { class: 'hero compact', role: 'button', tabindex: 0, 'aria-label': 'Add one, or hold to complete' }, r.el, center);
  const ringState = { filling: false };
  const curValue = () => { const hb = state.habits.get(id); return !hb ? 0 : hb.goal_type === 'time' && isToday ? liveValue(id) : valueOf(id, day); };
  attachRingActions(heroBtn, { ring: r, state: ringState,
    getProgress: () => { const hb = state.habits.get(id); return !hb ? 0 : isDone(hb, curValue()) ? 1 : progressOf(hb, curValue()); },
    isDone: () => { const hb = state.habits.get(id); return !hb || future || isDone(hb, curValue()); },
    onTap: () => { const hb = state.habits.get(id); if (hb && !future) bump(hb, tapAmount(hb), day); },
    onComplete: () => { const hb = state.habits.get(id); if (hb) setValue(hb, hb.target, day); } });

  panel.el.append(panelBar(panel, { left: edit, title: titleEl }),
    h('div', { class: 'panel-body center' },
      heroBtn, controls, togetherStrip('habit', id), isToday ? null : h('p', { class: 'habit-sub center' }, fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' }))));

  let built = null;
  const round = (cls, label, ic, fn) => h('button', { type: 'button', class: `big-btn ${cls}`, 'aria-label': label, onClick: () => { tap(); fn(); } }, ic);
  function build(hb) {
    const kind = hb.goal_type === 'time' ? (isToday ? 'time' : 'time-manual') : hb.target === 1 ? 'check' : 'count';
    const step = minuteStep(hb.target), cstep = countStep(hb.target), key = kind + hb.target;
    if (built === key) return;
    built = key; controls.replaceChildren();
    if (kind === 'check') controls.append(round('main', 'Toggle done', icon('check', { size: 37.4, stroke: 3.86 }), () => setValue(hb, valueOf(hb.id, day) >= 1 ? 0 : 1, day)));
    else if (kind === 'count') controls.append(round('side', 'Decrease', icon('minus', { size: 30, stroke: 2.2 }), () => bump(hb, -cstep, day)), round('main', 'Increase', icon('plus', { size: 34.5, stroke: 2.09 }), () => bump(hb, cstep, day)));
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
    r.color(color); if (!ringState.filling) r.set(done ? 1 : progressOf(hb, v));
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
