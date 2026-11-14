// App state, selectors and actions. UI never talks to Supabase directly.
import { remote } from './backend-remote.js';
import { demo } from './backend-demo.js';
import { todayStr, addDays, dow, diffDays, uuid, clamp } from './util.js';

export const HISTORY_DAYS = 400;
export const state = {
  status: 'boot', // boot | out | in
  demo: false,
  online: true,
  me: null,
  habits: new Map(),
  logs: new Map(), // "habit|user|day" -> value
  profiles: new Map(),
  groups: new Map(),
  members: [],
  friendships: [],
  today: todayStr(),
  viewDay: todayStr(), // the day shown on the Today screen
  reminders: new Map(), // habit id -> 'HH:MM' (mine)
};

let backend = remote;
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let raf;
export function emit() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { listeners.forEach((f) => f()); saveCache(); }); }

// ───────────── selectors ─────────────
export const logKey = (h, u, d) => `${h}|${u}|${d}`;
export const valueOf = (habitId, day = state.today, user = state.me?.id) => state.logs.get(logKey(habitId, user, day)) || 0;
export const isScheduled = (h, day) => day >= h.created_on && h.days.includes(dow(day));
export const progressOf = (h, v) => clamp(v / h.target, 0, 1);
export const isDone = (h, v) => v >= h.target;
export const habitList = () => [...state.habits.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
export const myGroups = () => [...state.groups.values()];
export const MAX_AHEAD = 7;
export function setViewDay(d) {
  const lo = addDays(state.today, -HISTORY_DAYS), hi = addDays(state.today, MAX_AHEAD);
  state.viewDay = d < lo ? lo : d > hi ? hi : d;
  emit();
}
export const shiftViewDay = (n) => setViewDay(addDays(state.viewDay, n));
export const profileOf = (id) => state.profiles.get(id) || { id, username: 'someone', display_name: '' };
export const membersOf = (gid) => state.members.filter((m) => m.group_id === gid);

/** Average progress across the habits scheduled on `day` (null when nothing was scheduled). */
export function dayStats(day, list = habitList()) {
  let n = 0, sum = 0, done = 0;
  for (const h of list) {
    if (!isScheduled(h, day)) continue;
    const v = valueOf(h.id, day);
    n++; sum += progressOf(h, v); if (isDone(h, v)) done++;
  }
  return { n, done, p: n ? sum / n : null };
}

/** Current streak: consecutive scheduled days completed (today may still be pending). */
export function streakOf(h) {
  let streak = 0;
  const limit = Math.min(HISTORY_DAYS, diffDays(h.created_on, state.today));
  for (let i = 0; i <= limit; i++) {
    const d = addDays(state.today, -i);
    if (!isScheduled(h, d)) continue;
    if (isDone(h, valueOf(h.id, d))) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}
export function bestStreakOf(h) {
  let best = 0, run = 0;
  const span = Math.min(HISTORY_DAYS, diffDays(h.created_on, state.today));
  for (let i = span; i >= 0; i--) {
    const d = addDays(state.today, -i);
    if (!isScheduled(h, d)) continue;
    if (isDone(h, valueOf(h.id, d))) best = Math.max(best, ++run); else run = 0;
  }
  return best;
}

// ───────────── local cache (instant first paint) ─────────────
let cacheTimer;
function saveCache() {
  if (state.status !== 'in' || state.demo) return;
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    try {
      localStorage.setItem(`muna.cache.${state.me.id}`, JSON.stringify({
        me: state.me, habits: [...state.habits.values()], logs: [...state.logs].map(([k, value]) => { const [habit_id, user_id, day] = k.split('|'); return { habit_id, user_id, day, value }; }),
        reminders: [...state.reminders].map(([habit_id, remind_at]) => ({ habit_id, remind_at })), profiles: [...state.profiles.values()], groups: [...state.groups.values()], members: state.members, friendships: state.friendships,
      }));
    } catch {}
  }, 1200);
}
function hydrate(b) {
  state.me = b.me;
  state.habits = new Map(b.habits.map((x) => [x.id, x]));
  state.logs = new Map(b.logs.map((l) => [logKey(l.habit_id, l.user_id, l.day), l.value]));
  state.profiles = new Map(b.profiles.map((p) => [p.id, p]));
  state.groups = new Map(b.groups.map((g) => [g.id, g]));
  state.members = b.members;
  state.friendships = b.friendships;
  state.reminders = new Map((b.reminders || []).map((r) => [r.habit_id, String(r.remind_at).slice(0, 5)]));
}

// ───────────── boot / auth ─────────────
let unlisten = null;
let subscribedOnce = false;
export async function boot() {
  if (localStorage.getItem('muna.demo')) return enterDemo();
  remote.onAuth((event, session) => {
    if (event === 'SIGNED_OUT' && !state.demo) { state.status = 'out'; state.me = null; unlisten?.(); emit(); }
    // Never call Supabase straight from inside this callback (it can deadlock); hop out first.
    if (event === 'SIGNED_IN' && session && state.me?.id !== session.user.id) setTimeout(() => enterOnce(session.user).then(emit), 0);
  });
  const session = await remote.session();
  if (session) await enterOnce(session.user); else state.status = 'out';
  if (/[?&#](code|error)=/.test(location.href)) history.replaceState(null, '', location.pathname);
  emit();
}

let entering = null;
const enterOnce = (user) => (entering ??= enter(user).finally(() => { entering = null; }));

async function enter(user) {
  backend = remote; state.demo = false;
  try {
    const cached = JSON.parse(localStorage.getItem(`muna.cache.${user.id}`));
    if (cached) { hydrate(cached); state.status = 'in'; emit(); }
  } catch {}
  await refresh(user.id);
  state.status = 'in';
  syncTimezone();
  unlisten?.(); subscribedOnce = false;
  unlisten = remote.listen(realtimeHandlers());
}

function syncTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && state.me && state.me.timezone !== tz && !state.demo) backend.updateProfile({ timezone: tz }, state.me.id).then((m) => { state.me = m; state.profiles.set(m.id, m); }).catch(() => {});
  } catch {}
}

export async function enterDemo() {
  localStorage.setItem('muna.demo', '1');
  backend = demo; state.demo = true;
  hydrate(await demo.load());
  state.status = 'in';
  emit();
}

async function refresh(userId = state.me.id) {
  try {
    rollDay();
    const b = await backend.load(userId, addDays(state.today, -HISTORY_DAYS), addDays(state.today, -2));
    hydrate(b); state.online = true;
  } catch (e) {
    console.error(e);
    state.online = false;
    if (!state.me) throw e;
  }
}
export const reload = async () => { await refresh(); emit(); };

export async function signInGoogle() { await remote.signInGoogle(); }
export const googleEnabled = () => remote.googleEnabled();
export async function signOut() {
  const wasDemo = state.demo;
  localStorage.removeItem('muna.demo');
  unlisten?.();
  await backend.signOut();
  if (state.me && !wasDemo) localStorage.removeItem(`muna.cache.${state.me.id}`);
  state.me = null; state.status = 'out'; state.demo = false; backend = remote;
  state.habits.clear(); state.logs.clear(); state.groups.clear(); state.members = []; state.friendships = [];
  emit();
}

// ───────────── realtime ─────────────
function realtimeHandlers() {
  const refreshSocial = debounceAsync(async () => {
    const s = await backend.loadSocial(state.me.id);
    state.groups = new Map(s.groups.map((g) => [g.id, g])); state.members = s.members; state.friendships = s.friendships;
    await ensureProfiles([...s.members.map((m) => m.user_id), ...s.friendships.flatMap((f) => [f.requester_id, f.addressee_id])]);
    const hb = await backend.load(state.me.id, addDays(state.today, -HISTORY_DAYS), addDays(state.today, -2)); // shared habits may have changed
    state.habits = new Map(hb.habits.map((x) => [x.id, x]));
    for (const l of hb.logs) if (!pending.has(logKey(l.habit_id, l.user_id, l.day))) state.logs.set(logKey(l.habit_id, l.user_id, l.day), l.value);
    emit();
  }, 400);
  return {
    habits: (p) => {
      if (p.eventType === 'DELETE') state.habits.delete(p.old.id); else state.habits.set(p.new.id, p.new);
      emit();
    },
    habit_logs: (p) => {
      const r = p.eventType === 'DELETE' ? p.old : p.new;
      const k = logKey(r.habit_id, r.user_id, r.day);
      if (pending.has(k)) return; // our own write is in flight; don't let its echo flicker the UI
      if (p.eventType === 'DELETE') state.logs.delete(k); else state.logs.set(k, r.value);
      if (r.user_id !== state.me.id) ensureProfiles([r.user_id]);
      emit();
    },
    habit_reminders: (p) => {
      const r = p.eventType === 'DELETE' ? p.old : p.new;
      if (p.eventType === 'DELETE') state.reminders.delete(r.habit_id); else state.reminders.set(r.habit_id, String(r.remind_at).slice(0, 5));
      emit();
    },
    profiles: (p) => { if (p.new?.id) { state.profiles.set(p.new.id, p.new); if (p.new.id === state.me.id) state.me = p.new; emit(); } },
    groups: refreshSocial, group_members: refreshSocial, friendships: refreshSocial,
    status: (s) => { if (s === 'SUBSCRIBED') { if (subscribedOnce) reloadSilently(); subscribedOnce = true; } },
  };
}
async function reloadSilently() { if (state.status === 'in' && !state.demo) { await refresh(); emit(); } }
function debounceAsync(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(() => fn().catch(console.error), ms); }; }
async function ensureProfiles(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !state.profiles.has(id));
  if (!missing.length) return;
  for (const p of await backend.profilesFor(missing)) state.profiles.set(p.id, p);
  emit();
}

// Refresh when the app returns to the foreground or the day changes.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || state.status !== 'in') return;
  rollDay();
  reloadSilently(); emit();
});
function rollDay() {
  const t = todayStr();
  if (t === state.today) return;
  if (state.viewDay === state.today) state.viewDay = t;
  state.today = t;
}
setInterval(() => { if (state.status === 'in') { const before = state.today; rollDay(); if (state.today !== before) emit(); } }, 30000);

// ───────────── actions (optimistic) ─────────────
const pending = new Map(); // log key -> timer
const offlineGuard = (p) => p.catch((e) => { console.error(e); state.online = false; emit(); throw e; });

export function setValue(habit, value, day = state.today) {
  value = clamp(Math.round(value), 0, 86400 * 2);
  const k = logKey(habit.id, state.me.id, day);
  state.logs.set(k, value);
  emit();
  clearTimeout(pending.get(k));
  const t = setTimeout(async () => {
    const v = state.logs.get(k) ?? 0;
    let failed = false;
    try { await backend.saveLog({ habit_id: habit.id, user_id: state.me.id, day, value: v }); state.online = true; }
    catch (e) { console.error(e); state.online = false; failed = true; }
    if (pending.get(k) === t) pending.delete(k); // otherwise a newer edit is already queued
    if (failed && !pending.has(k)) pending.set(k, setTimeout(() => { pending.delete(k); if (state.logs.has(k)) setValue(habit, state.logs.get(k), day); }, 5000));
    emit();
  }, 280);
  pending.set(k, t);
}
export const bump = (habit, delta, day) => setValue(habit, valueOf(habit.id, day) + delta, day);

export async function saveHabit(data) {
  const isNew = !data.id;
  const row = { ...data, id: data.id || uuid() };
  if (isNew) { row.owner_id = state.me.id; row.created_on ??= state.today; row.created_at = new Date().toISOString(); }
  const prev = state.habits.get(row.id);
  state.habits.set(row.id, { ...prev, ...row });
  emit();
  const { created_at, ...payload } = row;
  try { await offlineGuard(backend.saveHabit(payload)); } catch (e) { if (isNew) state.habits.delete(row.id); else state.habits.set(row.id, prev); emit(); throw e; }
  return row.id;
}
export async function saveReminder(habitId, time) {
  const prev = state.reminders.get(habitId);
  if (prev === (time || undefined)) return;
  if (time) state.reminders.set(habitId, time); else state.reminders.delete(habitId);
  emit();
  try { await offlineGuard(backend.saveReminder(habitId, state.me.id, time || null)); }
  catch (e) { if (prev) state.reminders.set(habitId, prev); else state.reminders.delete(habitId); emit(); throw e; }
}
export async function deleteHabit(id) {
  const prev = state.habits.get(id);
  state.habits.delete(id); emit();
  try { await offlineGuard(backend.deleteHabit(id)); } catch (e) { state.habits.set(id, prev); emit(); throw e; }
}

export async function updateProfile(patch) {
  const prev = state.me;
  state.me = { ...state.me, ...patch }; state.profiles.set(state.me.id, state.me); emit();
  try { state.me = await backend.updateProfile(patch, prev.id); state.profiles.set(state.me.id, state.me); emit(); }
  catch (e) { state.me = prev; state.profiles.set(prev.id, prev); emit(); throw e; }
}
export async function setAvatar(blob) {
  const url = await backend.uploadAvatar(blob, state.me.id, state.me.avatar_url);
  await updateProfile({ avatar_url: url });
}

// ── social ──
async function socialRefresh() { const s = await backend.loadSocial(state.me.id); state.groups = new Map(s.groups.map((g) => [g.id, g])); state.members = s.members; state.friendships = s.friendships; await ensureProfiles([...s.members.map((m) => m.user_id), ...s.friendships.flatMap((f) => [f.requester_id, f.addressee_id])]); emit(); }
export async function createGroup(name) { const g = await backend.createGroup(name.trim()); await socialRefresh(); return g; }
export async function renameGroup(id, name) { await backend.renameGroup(id, name.trim()); await socialRefresh(); }
export async function deleteGroup(id) { await backend.deleteGroup(id); await reload(); }
export async function leaveGroup(id) { await backend.removeMember(id, state.me.id); await reload(); }
export async function removeMember(gid, uid) { await backend.removeMember(gid, uid); await socialRefresh(); }
export async function joinGroup(code) { const id = await backend.joinGroup(code); await reload(); return id; }
export async function addMember(gid, uid) { await backend.addMember(gid, uid); await socialRefresh(); }

export const friendsOf = () => state.friendships.filter((f) => f.status === 'accepted').map((f) => ({ ...f, other: profileOf(f.requester_id === state.me.id ? f.addressee_id : f.requester_id) }));
export const incomingRequests = () => state.friendships.filter((f) => f.status === 'pending' && f.addressee_id === state.me.id).map((f) => ({ ...f, other: profileOf(f.requester_id) }));
export const outgoingRequests = () => state.friendships.filter((f) => f.status === 'pending' && f.requester_id === state.me.id).map((f) => ({ ...f, other: profileOf(f.addressee_id) }));

export async function addFriendByUsername(username) {
  username = username.trim().toLowerCase().replace(/^@/, '');
  if (!username) throw new Error('Type a username first.');
  const p = await backend.findProfile(username);
  if (!p) throw new Error(`No one is called @${username}.`);
  if (p.id === state.me.id) throw new Error("That's you!");
  state.profiles.set(p.id, p);
  const existing = state.friendships.find((f) => [f.requester_id, f.addressee_id].includes(p.id));
  if (existing) {
    if (existing.status === 'pending' && existing.addressee_id === state.me.id) { await backend.acceptFriend(existing.id); await socialRefresh(); return `You and @${p.username} are now friends.`; }
    throw new Error(existing.status === 'accepted' ? `You're already friends with @${p.username}.` : 'Request already sent.');
  }
  await backend.requestFriend(state.me.id, p.id);
  await socialRefresh();
  return `Request sent to @${p.username}.`;
}
export async function acceptFriend(id) { await backend.acceptFriend(id); await socialRefresh(); }
export async function removeFriendship(id) { await backend.removeFriendship(id); await socialRefresh(); }
