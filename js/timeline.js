// Day timeline on the Tasks tab: hours with soft lines, each task sits at its time.
// Drag the little time chip on the left to move a task in 15-minute steps; tap an empty spot to add a task at that time.
import { h, haptic } from './util.js';
import { habitIcon } from './icons.js';

const HOUR = 80;   // px per hour (a task card is exactly one hour tall)
const STEP = 15;   // minutes
const pad = (n) => String(n).padStart(2, '0');
export const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
export const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const px = (min, start) => ((min - start * 60) * HOUR) / 60;

/** scroller: the screen element that scrolls. onMove(id, 'HH:MM'), onCreate('HH:MM'). */
export function createTimeline({ scroller, onMove, onCreate }) {
  const grid = h('div', { class: 'tl-grid' });
  const el = h('section', { class: 'timeline', 'aria-label': 'Hours' }, grid);
  const nowLine = h('div', { class: 'tl-now', 'aria-hidden': 'true' }, h('i'));
  const items = new Map(); // task id -> { wrap, chipText }
  let start = 6, end = 23, rangeKey = '', today = false, drag = null;

  grid.addEventListener('click', (e) => {
    if (e.target.closest('.tl-item')) return;
    const r = grid.getBoundingClientRect();
    const min = Math.max(start * 60, Math.min(end * 60 - STEP, start * 60 + Math.floor(((e.clientY - r.top) * 60) / HOUR / STEP) * STEP));
    onCreate?.(fmtTime(min));
  });

  function paintLines() {
    const key = `${start}-${end}`;
    if (key === rangeKey) return;
    rangeKey = key;
    const kids = [];
    for (let hr = start; hr <= end; hr++) {
      const y = (hr - start) * HOUR;
      kids.push(h('div', { class: 'tl-line', style: { top: `${y}px` } }), h('span', { class: 'tl-label', style: { top: `${y}px` } }, `${pad(hr % 24)}:00`));
      if (hr < end) kids.push(h('div', { class: 'tl-line half', style: { top: `${y + HOUR / 2}px` } }));
    }
    grid.querySelectorAll('.tl-line, .tl-label').forEach((n) => n.remove());
    grid.prepend(...kids);
    grid.style.height = `${(end - start) * HOUR + 30}px`;
  }

  /** list: [{ tk, c }] — tasks of the day that have a time (c is the task card). */
  function render(list, { isToday }) {
    today = isToday;
    const mins = list.map(({ tk }) => toMin(tk.due_time));
    start = Math.min(6, ...mins.map((m) => Math.floor(m / 60)));
    end = Math.max(23, ...mins.map((m) => Math.min(24, Math.floor(m / 60) + 2)));
    paintLines();

    // overlapping tasks share the width (a task takes one hour)
    const sorted = [...list].sort((a, b) => toMin(a.tk.due_time) - toMin(b.tk.due_time) || (a.tk.created_at < b.tk.created_at ? -1 : 1));
    const placed = []; let cluster = [], clusterEnd = -1;
    const flush = () => { const n = Math.max(1, ...cluster.map((x) => x.lane + 1)); cluster.forEach((x) => { x.n = n; }); placed.push(...cluster); cluster = []; };
    for (const it of sorted) {
      const m = toMin(it.tk.due_time);
      if (cluster.length && m >= clusterEnd) flush();
      const used = new Set(cluster.filter((x) => toMin(x.tk.due_time) + 60 > m).map((x) => x.lane));
      let lane = 0; while (used.has(lane)) lane++;
      cluster.push({ ...it, lane }); clusterEnd = Math.max(clusterEnd, m + 60);
    }
    if (cluster.length) flush();

    const keep = new Set(placed.map((x) => x.tk.id));
    for (const [id, o] of items) if (!keep.has(id)) { o.wrap.remove(); items.delete(id); }
    for (const it of placed) {
      let o = items.get(it.tk.id);
      if (!o) { o = makeItem(it.tk.id); items.set(it.tk.id, o); grid.append(o.wrap); }
      if (o.card !== it.c.el) { o.card?.remove(); o.card = it.c.el; o.wrap.prepend(it.c.el); }
      const m = toMin(it.tk.due_time);
      o.min = m;
      o.wrap.style.setProperty('--lane', it.lane); o.wrap.style.setProperty('--n', it.n);
      o.wrap.classList.toggle('narrow', it.n > 1);
      if (!drag || drag.id !== it.tk.id) { o.wrap.style.top = `${px(m, start)}px`; o.chipText.textContent = fmtTime(m); }
    }
    placeNow();
  }

  function placeNow() {
    const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    const show = today && m >= start * 60 && m <= end * 60;
    if (show) { nowLine.style.top = `${px(m, start)}px`; if (!nowLine.isConnected) grid.append(nowLine); } else nowLine.remove();
  }

  function makeItem(id) {
    const chipText = h('span', {});
    const chip = h('button', { type: 'button', class: 'tl-chip', 'aria-label': 'Drag to change the time' }, habitIcon('outline:grip-vertical', 14, 2.2), chipText);
    const wrap = h('div', { class: 'tl-item' }, chip);
    const o = { wrap, chipText, chip, card: null, min: 0 };
    chip.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      try { chip.setPointerCapture(e.pointerId); } catch {}
      drag = { id, startY: e.clientY, lastY: e.clientY, startScroll: scroller.scrollTop, startMin: o.min, snapped: o.min, raf: 0 };
      wrap.classList.add('drag'); haptic('light');
      const loop = () => {
        if (!drag) return;
        const edge = 120, bottom = window.innerHeight - 170;
        if (drag.lastY < edge) scroller.scrollTop -= 9; else if (drag.lastY > bottom) scroller.scrollTop += 9;
        const dy = drag.lastY - drag.startY + (scroller.scrollTop - drag.startScroll);
        const lo = start * 60, hi = end * 60 - STEP;
        const raw = Math.max(lo, Math.min(hi, drag.startMin + (dy * 60) / HOUR));
        const snapped = Math.round(raw / STEP) * STEP;
        wrap.style.top = `${px(raw, start)}px`;
        if (snapped !== drag.snapped) { drag.snapped = snapped; chipText.textContent = fmtTime(snapped); haptic('light'); }
        drag.raf = requestAnimationFrame(loop);
      };
      loop();
    });
    chip.addEventListener('pointermove', (e) => { if (drag?.id === id) drag.lastY = e.clientY; });
    const end_ = () => {
      if (!drag || drag.id !== id) return;
      cancelAnimationFrame(drag.raf);
      const { snapped, startMin } = drag; drag = null;
      wrap.classList.remove('drag');
      o.min = snapped; wrap.style.top = `${px(snapped, start)}px`; chipText.textContent = fmtTime(snapped);
      if (snapped !== startMin) onMove?.(id, fmtTime(snapped));
    };
    chip.addEventListener('pointerup', end_); chip.addEventListener('pointercancel', end_);
    chip.addEventListener('contextmenu', (e) => e.preventDefault());
    return o;
  }

  setInterval(placeNow, 60000);
  return { el, render };
}
