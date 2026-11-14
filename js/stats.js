// Progress screen: rounded bar chart, streaks, a heatmap and a per-habit filter.
import { h, addDays, parseDay, diffDays, dow, fmtDay, pct, tween } from './util.js';
import { icon, habitIcon } from './icons.js';
import { colorVars, COLORS } from './colors.js';
import { segmented } from './ui.js';
import { state, subscribe, habitList, isScheduled, dayStats, valueOf, progressOf, isDone, streakOf, bestStreakOf, HISTORY_DAYS } from './store.js';

const RANGES = { week: 7, month: 30, year: 365 };
const W = 340, CH = 132, LABEL_H = 22;

export function mountStats(root) {
  let filter = 'all', range = 'week', selected = null, animate = true;

  const chips = h('div', { class: 'filter-chips' });
  const rangeSeg = segmented([['week', 'Week'], ['month', 'Month'], ['year', 'Year']], range, (v) => { range = v; selected = null; animate = true; render(); });
  const big = h('div', { class: 'big-num' }, h('span', { class: 'bn' }, '0'), h('span', { class: 'bn-unit' }, '%'));
  const bigLabel = h('div', { class: 'big-label' });
  const chart = h('div', { class: 'chart' });
  const tiles = h('div', { class: 'tiles' });
  const heat = h('section', { class: 'card heat-card' });
  const perHabit = h('section', { class: 'per-habit' });
  const empty = h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, icon('clipboard-data', { size: 30 })), h('h3', {}, 'Nothing to chart yet'), h('p', {}, 'Add a habit and come back tomorrow.'));

  root.append(h('header', { class: 'top' }, h('div', {}, h('h1', {}, 'Progress'), h('p', { class: 'date' }, 'How you’re doing'))),
    chips, rangeSeg.el,
    h('section', { class: 'card chart-card' }, h('div', { class: 'chart-head' }, big, bigLabel), chart),
    tiles, heat, perHabit, empty);

  const list = () => (filter === 'all' ? habitList() : habitList().filter((x) => x.id === filter));
  const habit = () => state.habits.get(filter);
  const accent = () => (filter !== 'all' && habit() ? colorVars(habit().color) : { '--c1': '#68A4FF', '--c2': '#7C4DFF' });

  function dayP(day) {
    if (filter === 'all') return dayStats(day).p;
    const hb = habit();
    return hb && isScheduled(hb, day) ? progressOf(hb, valueOf(hb.id, day)) : null;
  }
  function dayComplete(day) { // true / false / null (nothing scheduled)
    if (filter === 'all') { const s = dayStats(day); return s.n ? s.done === s.n : null; }
    const hb = habit();
    return hb && isScheduled(hb, day) ? isDone(hb, valueOf(hb.id, day)) : null;
  }
  const firstDay = () => habitList().reduce((m, x) => (x.created_on < m ? x.created_on : m), state.today);

  function streaks() {
    const start = filter === 'all' ? firstDay() : habit()?.created_on || state.today;
    const span = Math.min(HISTORY_DAYS, diffDays(start, state.today));
    let cur = 0, best = 0, run = 0;
    for (let i = 0; i <= span; i++) { // newest first; today may still be pending
      const c = dayComplete(addDays(state.today, -i));
      if (c === null) continue;
      if (c) cur++; else if (i > 0) break;
    }
    for (let i = span; i >= 0; i--) { const c = dayComplete(addDays(state.today, -i)); if (c === null) continue; if (c) best = Math.max(best, ++run); else run = 0; }
    return { cur, best };
  }

  function series() {
    if (range === 'year') {
      const out = [], t = parseDay(state.today);
      for (let m = 11; m >= 0; m--) {
        const first = new Date(t.getFullYear(), t.getMonth() - m, 1), last = new Date(t.getFullYear(), t.getMonth() - m + 1, 0);
        let sum = 0, n = 0;
        for (let d = new Date(first); d <= last && d <= t; d.setDate(d.getDate() + 1)) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const p = dayP(key); if (p != null) { sum += p; n++; }
        }
        out.push({ p: n ? sum / n : null, label: first.toLocaleDateString(undefined, { month: 'narrow' }), title: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) });
      }
      return out;
    }
    const n = RANGES[range];
    return Array.from({ length: n }, (_, i) => {
      const day = addDays(state.today, -(n - 1 - i));
      return { p: dayP(day), day, label: range === 'week' ? 'SMTWTFS'[dow(day)] : parseDay(day).getDate(), title: fmtDay(day) };
    });
  }

  function drawChart(data) {
    const n = data.length, gap = range === 'month' ? 4 : range === 'year' ? 9 : 14;
    const bw = (W - gap * (n - 1)) / n, rx = Math.min(bw / 2, 12);
    const labelEvery = range === 'month' ? 5 : 1;
    let svg = `<svg viewBox="0 0 ${W} ${CH + LABEL_H}" class="bars ${animate ? 'animate' : ''}" role="img" aria-label="Completion per ${range === 'year' ? 'month' : 'day'}"><defs><linearGradient id="bg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient></defs>`;
    data.forEach((d, i) => {
      const x = i * (bw + gap), ph = d.p == null ? 0 : Math.max(d.p * CH, d.p > 0 ? bw : 0);
      svg += `<g class="bar ${i === selected ? 'sel' : ''}" data-i="${i}"><rect class="hit" x="${x - gap / 2}" y="0" width="${bw + gap}" height="${CH + LABEL_H}"/>
        <rect class="track" x="${x}" y="0" width="${bw}" height="${CH}" rx="${rx}"/>
        ${ph ? `<rect class="fill" x="${x}" y="${CH - ph}" width="${bw}" height="${ph}" rx="${rx}" style="animation-delay:${i * (range === 'month' ? 10 : 25)}ms"/>` : ''}
        ${(i % labelEvery === 0 || i === n - 1) && (labelEvery === 1 || i < n - 2) ? `<text x="${x + bw / 2}" y="${CH + 16}" text-anchor="middle">${d.label}</text>` : ''}</g>`;
    });
    chart.innerHTML = svg + '</svg>';
    chart.querySelectorAll('.bar').forEach((g) => g.addEventListener('pointerdown', () => { selected = +g.dataset.i; animate = false; render(); }));
    chart.querySelectorAll('.bar').forEach((g) => g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { selected = +g.dataset.i; animate = false; render(); } }));
  }

  function drawHeat() {
    const weeks = 18, end = state.today;
    const startCol = addDays(end, -dow(end) - (weeks - 1) * 7);
    let html = '<div class="heat-grid">';
    for (let c = 0; c < weeks; c++) for (let r = 0; r < 7; r++) {
      const day = addDays(startCol, c * 7 + r);
      if (day > end) { html += '<span class="hc none"></span>'; continue; }
      const p = dayP(day);
      html += `<span class="hc ${p == null ? 'empty' : p === 0 ? 'zero' : ''}" style="${p ? `--a:${(0.22 + 0.78 * p).toFixed(2)}` : ''}" title="${fmtDay(day)}${p != null ? ' · ' + pct(p) : ''}"></span>`;
    }
    heat.innerHTML = '<h3 class="card-title">Last 18 weeks</h3>' + html + '</div>';
  }

  function render() {
    const all = habitList();
    if (filter !== 'all' && !state.habits.has(filter)) filter = 'all';
    empty.hidden = all.length > 0;
    [...root.querySelectorAll('.chart-card, .tiles, .heat-card, .per-habit')].forEach((e) => (e.hidden = all.length === 0));
    rangeSeg.el.hidden = chips.hidden = all.length === 0;
    root.style.setProperty('--c1', accent()['--c1']); root.style.setProperty('--c2', accent()['--c2']);

    // filter chips
    chips.replaceChildren(
      h('button', { type: 'button', class: `fchip ${filter === 'all' ? 'on' : ''}`, onClick: () => { filter = 'all'; selected = null; animate = true; render(); } }, 'All habits'),
      ...all.map((x) => h('button', { type: 'button', class: `fchip ${filter === x.id ? 'on' : ''}`, style: colorVars(x.color), onClick: () => { filter = x.id; selected = null; animate = true; render(); } }, h('span', { class: 'fchip-ic' }, habitIcon(x.icon, 16)), x.title)));
    const active = chips.querySelector('.on'); if (active && animate) requestAnimationFrame(() => active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }));
    if (!all.length) return;

    const data = series();
    if (selected == null || selected >= data.length) selected = data.length - 1;
    drawChart(data);
    const sel = data[selected];
    tween(big.firstChild, sel.p == null ? 0 : Math.round(sel.p * 100));
    bigLabel.textContent = `${sel.title}${sel.p == null ? ' · nothing scheduled' : ''}`;

    const valid = data.filter((d) => d.p != null);
    const avg = valid.length ? valid.reduce((a, d) => a + d.p, 0) / valid.length : 0;
    const st = streaks();
    const days = range === 'year' ? RANGES.year : RANGES[range];
    let doneDays = 0; for (let i = 0; i < days; i++) if (dayComplete(addDays(state.today, -i)) === true) doneDays++;
    tiles.replaceChildren(
      tile('flame', st.cur, 'Streak', true), tile('bolt', st.best, 'Best'),
      tile('circle-check', doneDays, filter === 'all' ? 'Perfect days' : 'Days done'));
    tiles.dataset.avg = pct(avg);
    drawHeat();

    perHabit.replaceChildren();
    if (filter === 'all') {
      perHabit.append(h('h3', { class: 'section-label' }, 'Habits'));
      const n = RANGES[range];
      for (const x of all) {
        let sum = 0, cnt = 0;
        for (let i = 0; i < n; i++) { const d = addDays(state.today, -i); if (isScheduled(x, d)) { sum += progressOf(x, valueOf(x.id, d)); cnt++; } }
        const rate = cnt ? sum / cnt : 0;
        perHabit.append(h('button', { type: 'button', class: 'mini-row', style: colorVars(x.color), onClick: () => { filter = x.id; selected = null; animate = true; render(); root.scrollTo?.(0, 0); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
          h('span', { class: 'bubble sm' }, habitIcon(x.icon, 18)),
          h('span', { class: 'mini-main' }, h('span', { class: 'mini-title' }, x.title), h('span', { class: 'mini-bar' }, h('span', { style: { transform: `scaleX(${rate})` } }))),
          h('span', { class: 'mini-pct' }, cnt ? pct(rate) : '—'), h('span', { class: 'streak small' + (streakOf(x) ? '' : ' zero') }, h('span', { class: 'streak-n' }, streakOf(x)))));
      }
    }
    animate = false;
  }
  function tile(ic, n, label, lit) { return h('div', { class: `tile ${lit && n ? 'lit' : ''}` }, h('span', { class: 'tile-ic' }, icon(ic, { size: 18, filled: false })), h('span', { class: 'tile-n' }, n), h('span', { class: 'tile-l' }, label)); }

  let visible = false;
  subscribe(() => { if (visible) render(); });
  render();
  return { show() { visible = true; animate = true; render(); }, hide() { visible = false; } };
}
