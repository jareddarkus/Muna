// The "focus mode" pop-up for a single habit: log progress or run a timer.
import { h, tween, fmtClock, fmtMinutes, fmtDay, tap } from './util.js';
import { icon, habitIcon } from './icons.js';
import { colorVars } from './colors.js';
import { ring, openSheet, sheetHeader, closeButton, avatar } from './ui.js';
import { state, subscribe, valueOf, progressOf, isDone, streakOf, bump, setValue, membersOf, profileOf } from './store.js';
import { liveValue, isRunning, toggle, onTick } from './timer.js';
import { openEditor } from './editor.js';

export function openFocus(id, day = state.today) {
  const isToday = day === state.today, future = day > state.today;
  const first = state.habits.get(id);
  if (!first) return;
  let unsub = () => {}, unTick = () => {};
  const sheet = openSheet({ cls: 'focus', onClose: () => { unsub(); unTick(); } });
  Object.entries(colorVars(first.color)).forEach(([k, v]) => sheet.el.style.setProperty(k, v));

  const editLabel = h('span', {}, 'Edit');
  const edit = h('button', { type: 'button', class: 'pill-btn', onClick: () => { sheet.close(); setTimeout(() => openEditor(id), 120); } }, icon('pencil', { size: 17 }), editLabel);
  const bubble = h('div', { class: 'bubble xl' });
  const dayPill = h('div', { class: 'f-day', hidden: isToday }, fmtDay(day, { weekday: 'long', month: 'short', day: 'numeric' }));
  const title = h('h1', { class: 'f-title' });
  const meta = h('p', { class: 'f-meta' });
  const r = ring({ size: 248, stroke: 22, cls: 'focus-ring' });
  const num = h('span', { class: 'f-num' }, '0');
  const of = h('span', { class: 'f-of' });
  const status = h('span', { class: 'f-status' });
  const center = h('div', { class: 'f-center' }, num, of, status);
  const controls = h('div', { class: 'f-controls' });
  const streak = h('div', { class: 'streak-pill' }, icon('flame', { size: 18, filled: true }), h('span', { class: 'sp-n' }));
  const mates = h('section', { class: 'mates', hidden: true });

  sheet.el.append(sheetHeader({ left: edit, right: closeButton(sheet) }),
    h('div', { class: 'f-body' }, bubble, dayPill, title, meta, h('div', { class: 'f-ring' }, r.el, center), controls, streak, mates));

  let built = null, iconRef = null;
  function build(habit) {
    const kind = habit.goal_type === 'time' ? (isToday ? 'time' : 'time-manual') : habit.target === 1 ? 'check' : 'count';
    if (built === kind + habit.target) return;
    built = kind + habit.target;
    controls.replaceChildren();
    const round = (cls, label, ic, fn) => h('button', { type: 'button', class: `round-btn ${cls}`, 'aria-label': label, onClick: () => { tap(); fn(); } }, ic);
    if (kind === 'check') {
      controls.append(round('big go', 'Toggle done', icon('check', { size: 40 }), () => { const v = valueOf(habit.id, day); setValue(habit, v >= 1 ? 0 : 1, day); }));
    } else if (kind === 'count') {
      controls.append(
        round('ghost', 'Decrease', icon('minus', { size: 26 }), () => bump(habit, -1, day)),
        round('big go', 'Increase', icon('plus', { size: 40 }), () => bump(habit, +1, day)));
    } else if (kind === 'time-manual') {
      controls.append(
        h('button', { type: 'button', class: 'pill-btn wide', onClick: () => { tap(); bump(habit, -300, day); } }, icon('minus', { size: 16 }), '5 min'),
        h('button', { type: 'button', class: 'pill-btn wide go', onClick: () => { tap(); bump(habit, +300, day); } }, icon('plus', { size: 16 }), '5 min'));
    } else {
      controls.append(
        h('button', { type: 'button', class: 'pill-btn wide', onClick: () => { tap(); bump(habit, -300, day); } }, icon('minus', { size: 16 }), '5 min'),
        round('big go playpause', 'Start or pause', h('span', { class: 'pp' }, h('span', { class: 'i-play' }, icon('player-play', { size: 38, filled: true })), h('span', { class: 'i-pause' }, icon('player-pause', { size: 38, filled: true }))), () => toggle(habit)),
        h('button', { type: 'button', class: 'pill-btn wide', onClick: () => { tap(); bump(habit, +300, day); } }, icon('plus', { size: 16 }), '5 min'));
    }
    controls.querySelectorAll('button').forEach((b) => { b.disabled = future; });
  }

  function update() {
    const habit = state.habits.get(id);
    if (!habit) { sheet.close(); return; }
    Object.entries(colorVars(habit.color)).forEach(([k, v]) => sheet.el.style.setProperty(k, v));
    if (iconRef !== habit.icon) { iconRef = habit.icon; bubble.replaceChildren(habitIcon(habit.icon, 44)); }
    title.textContent = habit.title;
    editLabel.textContent = habit.owner_id === state.me.id ? 'Edit' : 'Reminder'; // members of a shared habit can only set their own reminder
    const time = habit.goal_type === 'time';
    const running = isToday && isRunning(id);
    const v = time && isToday ? liveValue(id) : valueOf(id, day);
    const done = isDone(habit, v);
    build(habit);
    r.set(progressOf(habit, v));
    if (time) { num._v = undefined; num.textContent = fmtClock(v); of.textContent = `of ${fmtMinutes(habit.target)}`; }
    else { tween(num, Math.floor(v)); of.textContent = habit.target === 1 && !habit.unit ? '' : `of ${habit.target}${habit.unit ? ` ${habit.unit}` : ''}`; }
    num.classList.toggle('small', time && v >= 3600);
    status.textContent = future ? 'Come back on this day' : done ? 'Goal reached' : running ? 'Running…' : '';
    sheet.el.classList.toggle('done', done);
    sheet.el.classList.toggle('running', running);
    const g = habit.group_id && state.groups.get(habit.group_id);
    meta.textContent = [time ? `Goal ${fmtMinutes(habit.target)}` : habit.target === 1 && !habit.unit ? 'Once a day' : `Goal ${habit.target}${habit.unit ? ` ${habit.unit}` : ''}`, g && `Shared with ${g.name}`].filter(Boolean).join(' · ');
    const s = streakOf(habit);
    streak.querySelector('.sp-n').textContent = `${s} day streak`;
    streak.classList.toggle('zero', s === 0);

    // everyone else in the group
    const others = g ? membersOf(g.id).filter((m) => m.user_id !== state.me.id) : [];
    mates.hidden = others.length === 0;
    if (others.length) {
      mates.replaceChildren(h('h3', { class: 'section-label' }, `${g.name} today`), h('div', { class: 'mates-row' }, others.map((m) => {
        const p = profileOf(m.user_id), mv = valueOf(id, day, m.user_id), md = isDone(habit, mv);
        return h('div', { class: `mate ${md ? 'done' : ''}` }, h('div', { class: 'mate-av' }, avatar(p, 44), md && h('span', { class: 'mate-check' }, icon('check', { size: 12 }))), h('span', { class: 'mate-name' }, p.display_name?.split(' ')[0] || `@${p.username}`),
          h('span', { class: 'mate-val' }, habit.goal_type === 'time' ? fmtMinutes(mv) : `${mv}${habit.target > 1 ? `/${habit.target}` : ''}`));
      })));
    }
  }
  unsub = subscribe(update);
  unTick = onTick(update);
  update();
}
