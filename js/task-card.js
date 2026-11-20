// The task card: exactly the same pill everywhere a task, step or sub-step is listed (Tasks tab, inside a task, in the editor).
import { shortDay } from './util.js';
import { hex } from './colors.js';
import { card, taskRing } from './cards.js';
import { state, taskList, isTaskDone, setTaskDone, stepCount, taskPath, taskProgress, togetherCue } from './store.js';
import { attachHold } from './hold.js';
import { attachRingActions } from './ring-actions.js';
import { taskItems } from './task-actions.js';

/** A card for task `t`. `onOpen(id)` runs when the card itself is tapped. */
export function makeTaskCard(t, onOpen) {
  const c = card({ onClick: () => onOpen(comp.t.id) });
  const tr = taskRing();
  c.slot.append(tr.el);
  const comp = { ...c, tr, t };
  attachHold(c.el, () => taskItems(comp.t));
  const cur = () => state.tasks.get(comp.t.id);
  // tap the ring: tick / untick; hold it: the circle fills and the task is completed at 100%
  attachRingActions(tr.el, { ring: tr.ring, state: tr,
    getProgress: () => { const x = cur(); return !x ? 0 : isTaskDone(x) ? 1 : stepCount(x.id).n ? taskProgress(x.id) : 0; },
    isDone: () => { const x = cur(); return !x || isTaskDone(x); },
    onTap: () => { const x = cur(); if (x) setTaskDone(x, !isTaskDone(x)).catch(() => {}); },
    onComplete: () => { const x = cur(); if (x) setTaskDone(x, true).catch(() => {}); } });
  return comp;
}

export const taskIndex = () => {
  const idx = new Map();
  for (const x of taskList()) if (x.parent_id) (idx.get(x.parent_id) || idx.set(x.parent_id, []).get(x.parent_id)).push(x);
  return idx;
};

/** Fills a card with the task's current data. `day` is the day being viewed (for "Due …"); `showPath: false` hides "in Parent". */
export function paintTaskCard(c, tk, { day = state.today, idx = taskIndex(), showPath = true } = {}) {
  c.t = tk;
  const done = isTaskDone(tk), sc = stepCount(tk.id), path = showPath ? taskPath(tk) : '';
  const late = !tk.day ? (tk.parent_id ? '' : 'Anytime') : tk.day < day ? `Due ${shortDay(tk.day)}` : '';
  const sub = [late, path ? `in ${path}` : '', sc.n ? `${sc.done}/${sc.n} steps` : '', togetherCue(tk.id)].filter(Boolean).join(' • ') || (tk.parent_id ? 'Step' : 'Task');
  c.set({ color: hex(tk.color), icon: tk.icon, name: tk.title, sub, done });
  c.tr.set(done, sc.n > 0, taskProgress(tk.id, idx), hex(tk.color));
  return done;
}

/** Keeps `host` showing one card per task in `list` (cards are reused between calls via `cache`). */
export function syncTaskCards(host, list, cache, onOpen, opts = {}) {
  const idx = taskIndex();
  for (const [id, c] of cache) if (!list.some((t) => t.id === id)) { c.el.remove(); cache.delete(id); }
  const els = list.map((tk) => {
    let c = cache.get(tk.id);
    if (!c) { c = makeTaskCard(tk, onOpen); cache.set(tk.id, c); }
    paintTaskCard(c, tk, { idx, ...opts });
    return c.el;
  });
  const cur = [...host.children];
  if (els.length !== cur.length || els.some((e, i) => e !== cur[i])) host.replaceChildren(...els);
}
