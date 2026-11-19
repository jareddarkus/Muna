// Small DOM + date helpers shared by every module.

/** Hyperscript: h('div', {class:'x', onClick: fn}, child, [children], 'text') */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText = v;
      else for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { el.replaceChildren(); return el; };

/** The whole interface is drawn slightly smaller than its design sizes. */
export const UI_SCALE = 1;
export const sz = (n) => Math.round(n * UI_SCALE);

// ── dates (all "days" are local calendar days as YYYY-MM-DD strings) ──
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayStr = () => ymd(new Date());
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); };
export const dow = (s) => parseDay(s).getDay();
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const fmtDay = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parseDay(s).toLocaleDateString(undefined, o);

// ── formatting ──
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
export function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m >= 60) { const hh = Math.floor(m / 60), mm = m % 60; return mm ? `${hh} h ${mm} min` : `${hh} h`; }
  return `${m} min`;
}
export const pct = (p) => `${Math.round(p * 100)}%`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
export const tap = () => { try { navigator.vibrate?.(8); } catch {} };

/** Animate a number inside an element with ease-out. */
export function tween(el, to, fmt = (v) => String(Math.round(v)), ms = 550) {
  const from = el._v ?? to;
  el._v = to;
  cancelAnimationFrame(el._raf);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

/** Keeps a list of keyed components in sync without rebuilding the DOM. */
export function keyedList(container, create) {
  const comps = new Map();
  return function sync(items) {
    const seen = new Set();
    let prev = null;
    for (const item of items) {
      seen.add(item.id);
      let c = comps.get(item.id);
      if (!c) { c = create(item); comps.set(item.id, c); }
      c.update(item);
      const want = prev ? prev.nextSibling : container.firstChild;
      if (c.el !== want) container.insertBefore(c.el, want);
      prev = c.el;
    }
    for (const [id, c] of comps) if (!seen.has(id)) { c.destroy?.(); c.el.remove(); comps.delete(id); }
  };
}

let toastEl, toastTimer;
export function toast(msg, ms = 2600) {
  if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status' }); document.body.append(toastEl); }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "18 Nov" */
export const shortDay = (s) => `${parseDay(s).getDate()} ${MONTHS[parseDay(s).getMonth()]}`;
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return shortDay(ymd(new Date(iso)));
}
/** Goal text: "5h", "25 m", "Once", "8 glasses" */
export function goalLabel(hb) {
  if (hb.goal_type === 'time') {
    const m = Math.round(hb.target / 60);
    return m >= 60 ? `${+(m / 60).toFixed(1)}h` : `${m} m`;
  }
  return hb.target === 1 && !hb.unit ? 'Once' : `${hb.target} ${hb.unit || (hb.target === 1 ? 'time' : 'times')}`;
}
/** "Daily", "Mon - Sat", "Mon, Wed, Fri" */
export function scheduleLabel(days) {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'Daily';
  const order = [1, 2, 3, 4, 5, 6, 0]; // weeks start on Monday
  const idx = order.map((x) => d.includes(x));
  let start = idx.indexOf(true), end = idx.lastIndexOf(true);
  if (start >= 0 && d.length >= 3 && idx.slice(start, end + 1).every(Boolean)) return `${DAY_NAMES[order[start]]} - ${DAY_NAMES[order[end]]}`;
  return order.filter((x) => d.includes(x)).map((x) => DAY_NAMES[x]).join(', ');
}
/** Number shown inside a habit ring: hours with one decimal for long goals, otherwise minutes or a count. */
export function ringNumber(hb, v) {
  if (hb.goal_type === 'time') {
    return hb.target >= 3600 ? String(+(v / 3600).toFixed(1)) : String(Math.floor(v / 60));
  }
  return String(Math.floor(v));
}
