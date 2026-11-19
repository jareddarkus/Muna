// The screen for one habit: record progress (counter or timer), see its 21-day rate, jump to edit.
import { h, tween, fmtClock, fmtDay, tap, goalLabel } from './util.js';
import { icon } from './icons.js';
import { PALETTE, hex, rateColor } from './colors.js';
import { ring, openPanel, panelBar, iconCircle } from './ui.js';
import { flag, habitSub } from './cards.js';
import { habitRate } from './rates.js';
import { state, subscribe, valueOf, progressOf, isDone, bump, setValue } from './store.js';
import { liveValue, isRunning, toggle, onTick } from './timer.js';
import { openEditor } from './editor.js';

export function openHabit(id, day = state.viewDay) {
  const first = state.habits.get(id);
  if (!first) return;
  const isToday = day === state.today, future = day > state.today;
  let unsub = () => {}, unTick = () => {};
  const panel = openPanel({ cls: 'habit-panel', onClose: () => { unsub(); unTick(); } });

  const edit = h('button', { type: 'button', class: 'pill small', onClick: () => { panel.close(); setTimeout(() => openEditor(id), 150); } }, 'Edit');
  const closeBtn = h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Close', onClick: () => panel.close() }, icon('x', { size: 28, stroke: 1.8 }));
  const circleHost = h('div', { class: 'habit-circle-host' });
  const title = h('h1', { class: 'habit-title' });
  const sub = h('p', { class: 'habit-sub' });
  const r = ring({ size: 130, stroke: 10, color: PALETTE.purple, glow: true, cls: 'hero-ring small' });
  const num = h('span', { class: 'hero-num' }, '0');
  const unit = h('span', { class: 'habit-unit' });
  const center = h('div', { class: 'hero-center col' }, num, unit);
  const controls = h('div', { class: 'habit-controls' });
  const rateEl = h('span', { class: 'stat-pill' });
  const dayPill = { hidden: isToday, textContent: '' };

  panel.el.append(panelBar(panel, { left: edit, right: closeBtn }),
    h('div', { class: 'panel-body center' },
      h('div', { class: 'habit-head' }, circleHost, h('div', { class: 'habit-head-text' }, title, sub)),
      h('div', { class: 'hero compact' }, r.el, center), controls, h('div', { class: 'stat-row' }, rateEl)));

  let built = null, shownIcon = null;
  const round = (cls, label, ic, fn) => h('button', { type: 'button', class: `big-btn ${cls}`, 'aria-label': label, onClick: () => { tap(); fn(); } }, ic);
  function build(hb) {
    const kind = hb.goal_type === 'time' ? (isToday ? 'time' : 'time-manual') : hb.target === 1 ? 'check' : 'count';
    const key = kind + hb.target;
    if (built === key) return;
    built = key; controls.replaceChildren();
    if (kind === 'check') controls.append(round('main', 'Toggle done', icon('check', { size: 37.4, stroke: 3.86 }), () => setValue(hb, valueOf(hb.id, day) >= 1 ? 0 : 1, day)));
    else if (kind === 'count') controls.append(round('side', 'Decrease', icon('minus', { size: 30, stroke: 2.2 }), () => bump(hb, -1, day)), round('main', 'Increase', icon('plus', { size: 34.5, stroke: 2.09 }), () => bump(hb, 1, day)));
    else if (kind === 'time-manual') controls.append(h('button', { type: 'button', class: 'pill small light', onClick: () => { tap(); bump(hb, -300, day); } }, '− 5 min'), h('button', { type: 'button', class: 'pill small main', onClick: () => { tap(); bump(hb, 300, day); } }, '+ 5 min'));
    else controls.append(h('button', { type: 'button', class: 'pill small light', onClick: () => { tap(); bump(hb, -300, day); } }, '− 5 min'),
      round('main play', 'Start or pause', h('span', { class: 'pp' }, h('span', { class: 'i-play' }, icon('player-play', { filled: true, size: 34 })), h('span', { class: 'i-pause' }, icon('player-pause', { filled: true, size: 34 }))), () => toggle(hb)),
      h('button', { type: 'button', class: 'pill small light', onClick: () => { tap(); bump(hb, 300, day); } }, '+ 5 min'));
    controls.querySelectorAll('button').forEach((b) => { b.disabled = future; });
  }

  function update() {
    const hb = state.habits.get(id);
    if (!hb) { panel.close(); return; }
    const color = hex(hb.color), time = hb.goal_type === 'time';
    panel.el.style.setProperty('--c', color);
    if (shownIcon !== hb.icon + hb.color) { shownIcon = hb.icon + hb.color; circleHost.replaceChildren(iconCircle(hb.icon, color, 56, 32)); }
    title.textContent = hb.title;
    sub.replaceChildren(flag(), ` ${habitSub(hb)}${isToday ? '' : ` • ${fmtDay(day, { day: 'numeric', month: 'short' })}`}`);
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
    const pct = habitRate(hb);
    rateEl.replaceChildren(h('b', { style: { color: rateColor(pct) } }, pct == null ? '–' : `${pct}%`), ' last 21 days');
  }
  unsub = subscribe(update);
  unTick = onTick(update);
  update();
}
