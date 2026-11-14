// Timers for "time" habits. They keep running while the pop-up is closed, even across reloads.
import { state, setValue, valueOf } from './store.js';
import { todayStr } from './util.js';

const KEY = 'muna.timers';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (t) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} };

const listeners = new Set();
let ticker;
function schedule() {
  const running = Object.keys(read()).length > 0;
  if (running && !ticker) ticker = setInterval(() => listeners.forEach((f) => f()), 1000);
  if (!running && ticker) { clearInterval(ticker); ticker = null; }
  listeners.forEach((f) => f());
}
export const onTick = (fn) => { listeners.add(fn); schedule(); return () => listeners.delete(fn); };

export const isRunning = (id) => !!read()[id];
export const runningCount = () => Object.keys(read()).length;
/** Seconds logged for the habit today, including the live timer. */
export function liveValue(id, day = state.today) {
  const t = read()[id];
  const base = valueOf(id, day);
  return t && t.day === day ? base + (Date.now() - t.start) / 1000 : base;
}
export function start(habit) {
  const t = read();
  t[habit.id] = { start: Date.now(), day: state.today };
  write(t); schedule();
}
export function stop(habit) {
  const t = read();
  const r = t[habit.id];
  if (!r) return;
  delete t[habit.id]; write(t);
  const elapsed = Math.min(12 * 3600, (Date.now() - r.start) / 1000);
  setValue(habit, valueOf(habit.id, r.day) + elapsed, r.day);
  schedule();
}
export const toggle = (habit) => (isRunning(habit.id) ? stop(habit) : start(habit));
export function discardMissing(ids) {
  const t = read(); let changed = false;
  for (const id of Object.keys(t)) if (!ids.has(id)) { delete t[id]; changed = true; }
  if (changed) { write(t); schedule(); }
}
