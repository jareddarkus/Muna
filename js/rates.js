// The 21-day completion rate. Must stay identical to the database functions (rate_parts / pct_of / avg_pct).
import { state, habitList, valueOf, isDone, taskList } from './store.js';
import { addDays, dow } from './util.js';

export const WINDOW = 21;
/** 100 only when everything is done; otherwise rounded up and capped at 99. */
export const pctOf = (done, sched) => (!sched ? null : done >= sched ? 100 : Math.min(99, Math.ceil((100 * done) / sched)));
export function avgPct(vals) {
  const v = vals.filter((x) => x != null);
  if (!v.length) return null;
  return Math.min(...v) === 100 ? 100 : Math.min(99, Math.ceil(v.reduce((a, b) => a + b, 0) / v.length));
}

/** {sched, done, days:[{day, scheduled, done}]} for one habit over the last 21 days (today counts only once done). */
export function habitParts(hb, user = state.me?.id) {
  let sched = 0, done = 0;
  const days = [];
  for (let i = WINDOW - 1; i >= 0; i--) {
    const day = addDays(state.today, -i);
    const scheduled = day >= hb.created_on && hb.days.includes(dow(day));
    const ok = scheduled && isDone(hb, valueOf(hb.id, day, user));
    if (scheduled && (day < state.today || ok)) sched++;
    if (ok) done++;
    days.push({ day, scheduled, done: ok, counted: scheduled && (day < state.today || ok) });
  }
  return { sched, done, days };
}
/** Tasks count like one habit: every task / step with a day in the window is an item, done once completed (today counts only when done). */
export function taskParts() {
  const start = addDays(state.today, -(WINDOW - 1));
  let sched = 0, done = 0;
  const days = [];
  for (let i = 0; i < WINDOW; i++) {
    const day = addDays(start, i);
    let n = 0, dn = 0, counted = 0;
    for (const t of taskList()) if (t.day === day) { n++; if (t.done_at) dn++; if (day < state.today || t.done_at) counted++; }
    sched += counted; done += dn;
    days.push({ day, scheduled: n > 0, n, done: dn, counted: counted > 0 });
  }
  return { sched, done, days };
}
export const taskRate = () => { const p = taskParts(); return pctOf(p.done, p.sched); };
export const habitRate = (hb) => { const p = habitParts(hb); return pctOf(p.done, p.sched); };
export function overallRate(list = habitList(), withTasks = true) {
  let s = 0, d = 0;
  for (const hb of list) { const p = habitParts(hb); s += p.sched; d += p.done; }
  if (withTasks) { const t = taskParts(); s += t.sched; d += t.done; }
  return pctOf(d, s);
}
/** Today only: how many of today's habits are done. */
export function todayProgress(day = state.viewDay) {
  let n = 0, done = 0;
  for (const hb of habitList()) {
    if (day < hb.created_on || !hb.days.includes(dow(day))) continue;
    n++; if (isDone(hb, valueOf(hb.id, day))) done++;
  }
  return { n, done, pct: pctOf(done, n) ?? 0 };
}

/** Today screen for tasks: how many of that day's tasks are done. */
export function taskDayProgress(day = state.taskDay) {
  let n = 0, done = 0;
  for (const t of taskList()) if (t.day === day) { n++; if (t.done_at) done++; }
  return { n, done, pct: pctOf(done, n) ?? 0 };
}
