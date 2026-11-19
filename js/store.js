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
  groups: new Map(), // every group we know about (mine, invited to, searched)
  members: [],
  friendships: [],
  invites: [],
  requests: [], // join requests for groups I administer
  groupRates: new Map(),
  today: todayStr(),
  viewDay: todayStr(), // the day shown on the Today screen
  reminders: new Map(), // habit id -> 'HH:MM' (mine)
};

let backend = remote;
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const busHandlers = new Map();
export const bus = {
  on(name, fn) { (busHandlers.get(name) || busHandlers.set(name, new Set()).get(name)).add(fn); return () => busHandlers.get(name).delete(fn); },
  emit(name) { busHandlers.get(name)?.forEach((f) => f()); },
};
const socialUserIds = (s) => [...s.members.map((m) => m.user_id), ...s.friendships.flatMap((f) => [f.requester_id, f.addressee_id]), ...(s.invites || []).map((i) => i.inviter_id), ...(s.requests || []).map((r) => r.user_id)];
let raf;
export function emit() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { listeners.forEach((f) => f()); saveCache(); }); }

// ───────────── selectors ─────────────
export const logKey = (h, u, d) => `${h}|${u}|${d}`;
export const valueOf = (habitId, day = state.today, user = state.me?.id) => state.logs.get(logKey(habitId, user, day)) || 0;
export const isScheduled = (h, day) => day >= h.created_on && h.days.includes(dow(day));
export const progressOf = (h, v) => clamp(v / h.target, 0, 1);
export const isDone = (h, v) => v >= h.target;
export const habitList = () => [...state.habits.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
export const isMember = (gid) => state.members.some((m) => m.group_id === gid && m.user_id === state.me?.id);
export const isAdmin = (gid) => state.members.some((m) => m.group_id === gid && m.user_id === state.me?.id && m.role === 'admin');
export const myGroups = () => [...state.groups.values()].filter((g) => isMember(g.id));
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
        reminders: [...state.reminders].map(([habit_id, remind_at]) => ({ habit_id, remind_at })), profiles: [...state.profiles.values()], groups: [...state.groups.values()], members: state.members, friendships: state.friendships, invites: state.invites, requests: state.requests, rates: [...state.groupRates.values()],
      }));
    } catch {}
  }, 1200);
}
function applySocial(s) {
  const next = new Map(s.groups.map((g) => [g.id, g]));
  for (const [id, g] of state.groups) if (!next.has(id)) next.set(id, g); // keep groups we are only looking at
  state.groups = next;
  state.members = s.members;
  state.friendships = s.friendships;
  state.invites = s.invites || [];
  state.requests = s.requests || [];
  state.groupRates = new Map((s.rates || []).map((r) => [r.gid, r]));
}
function hydrate(b) {
  state.me = b.me;
  state.habits = new Map(b.habits.map((x) => [x.id, x]));
  state.logs = new Map(b.logs.map((l) => [logKey(l.habit_id, l.user_id, l.day), l.value]));
  state.profiles = new Map(b.profiles.map((p) => [p.id, p]));
  applySocial(b);
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
  state.habits.clear(); state.logs.clear(); state.groups.clear(); state.members = []; state.friendships = []; state.invites = []; state.requests = [];
  emit();
}

// ───────────── realtime ─────────────
function realtimeHandlers() {
  const refreshSocial = debounceAsync(async () => {
    const soc = await backend.loadSocial(state.me.id);
    applySocial(soc);
    await ensureProfiles(socialUserIds(soc));
    emit();
  }, 400);
  const postsChanged = debounceAsync(async () => bus.emit('posts'), 300);
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
    group_members: refreshSocial, friendships: refreshSocial, group_invites: refreshSocial, group_requests: refreshSocial,
    posts: postsChanged, comments: postsChanged, post_likes: postsChanged, comment_likes: postsChanged,
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
async function socialRefresh() { const soc = await backend.loadSocial(state.me.id); applySocial(soc); await ensureProfiles(socialUserIds(soc)); emit(); }
export const refreshSocialNow = socialRefresh;
export async function createGroup(fields) { const g = await backend.createGroup({ ...fields, name: fields.name.trim(), description: (fields.description || '').trim() }); await socialRefresh(); return g; }
export async function updateGroup(id, patch) { await backend.updateGroup(id, patch); await socialRefresh(); }
export async function deleteGroup(id) { await backend.deleteGroup(id); await socialRefresh(); }
export async function leaveGroup(id) { await backend.leaveGroup(id); await socialRefresh(); }
export async function joinGroup(id) { await backend.joinGroup(id); await socialRefresh(); }
export async function requestJoin(id) { await backend.requestJoin(id); await socialRefresh(); }
export async function respondRequest(gid, uid, accept) { await backend.respondRequest(gid, uid, accept); await socialRefresh(); }
export async function inviteUser(gid, uid) { await backend.inviteUser(gid, uid); await socialRefresh(); }
export async function respondInvite(id, accept) { await backend.respondInvite(id, accept); await socialRefresh(); }
export async function setRole(gid, uid, role) { await backend.setRole(gid, uid, role); await socialRefresh(); }
export async function kickMember(gid, uid) { await backend.kickMember(gid, uid); await socialRefresh(); }
export const searchGroups = (q) => backend.searchGroups(q);
export async function recommendedGroups() {
  const words = [...new Set(habitList().flatMap((h) => h.title.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length >= 3))].slice(0, 12);
  return words.length ? backend.recommendedGroups(words) : [];
}
export async function searchUsers(q) {
  q = q.trim().toLowerCase().replace(/^@/, '');
  if (!q) return [];
  const rows = await backend.searchProfiles(q);
  rows.forEach((p) => state.profiles.set(p.id, p));
  return rows.filter((p) => p.id !== state.me.id);
}
export const memberRate = (uid) => backend.memberRate(uid);
export const friendHabits = (uid) => backend.friendHabits(uid);
export const groupOverview = async (gid) => { const rows = await backend.groupOverview(gid); await ensureProfiles(rows.map((r) => r.user_id)); return rows; };
export const loadGroup = async (gid) => { const g = await backend.groupById(gid); if (g) { state.groups.set(g.id, g); emit(); } return g; };
// posts
export const listPosts = async (gid) => { const rows = await backend.listPosts(gid); await ensureProfiles(rows.map((p) => p.author_id)); return rows; };
export const createPost = (gid, body, habit) => backend.createPost(gid, body, habit);
export const deletePost = (id) => backend.deletePost(id);
export const togglePostLike = (id, liked) => backend.togglePostLike(id, state.me.id, liked);
export const listComments = async (pid) => { const rows = await backend.listComments(pid); await ensureProfiles(rows.comments.map((c) => c.author_id)); return rows; };
export const addComment = (pid, body, parentId) => backend.addComment(pid, body, parentId);
export const deleteComment = (id) => backend.deleteComment(id);
export const toggleCommentLike = (id, liked) => backend.toggleCommentLike(id, state.me.id, liked);
export const copyHabit = (snap) => saveHabit({ title: snap.title, icon: snap.icon, color: snap.color, goal_type: snap.goal_type, target: snap.target, unit: snap.unit || '', days: snap.days, group_id: null });
export const isFriend = (uid) => state.friendships.some((f) => f.status === 'accepted' && [f.requester_id, f.addressee_id].includes(uid));
export const friendshipWith = (uid) => state.friendships.find((f) => [f.requester_id, f.addressee_id].includes(uid));
export const pendingCount = () => state.invites.length + state.requests.length + state.friendships.filter((f) => f.status === 'pending' && f.addressee_id === state.me?.id).length;

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
export async function addFriendById(uid) {
  const existing = friendshipWith(uid);
  if (existing) {
    if (existing.status === 'pending' && existing.addressee_id === state.me.id) { await backend.acceptFriend(existing.id); await socialRefresh(); return; }
    return;
  }
  await backend.requestFriend(state.me.id, uid);
  await socialRefresh();
}
export async function acceptFriend(id) { await backend.acceptFriend(id); await socialRefresh(); }
export async function removeFriendship(id) { await backend.removeFriendship(id); await socialRefresh(); }
