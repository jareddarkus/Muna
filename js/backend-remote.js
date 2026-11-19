// Supabase backend: auth, database, realtime and avatar storage.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

const check = ({ data, error }) => { if (error) throw error; return data; };

/** Reads every page of a query (PostgREST returns at most 1000 rows at a time). */
async function all(build, size = 1000) {
  const out = [];
  for (let from = 0; ; from += size) {
    const rows = check(await build().range(from, from + size - 1));
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

export const remote = {
  name: 'remote',

  async session() { return (await sb.auth.getSession()).data.session; },
  onAuth(cb) { sb.auth.onAuthStateChange((event, session) => cb(event, session)); },
  async signInGoogle() {
    const redirectTo = location.origin + location.pathname.replace(/index\.html$/, '');
    check(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } }));
  },
  async signOut() { await sb.auth.signOut(); },
  async googleEnabled() {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      return !!(await r.json())?.external?.google;
    } catch { return true; }
  },

  /** Everything the signed-in user can see. `since` limits log history. */
  async load(userId, since, recentSince) {
    const [me, habits, myLogs, social, reminders, tasks] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).single().then(check),
      sb.from('habits').select('*').eq('owner_id', userId).order('created_at').then(check),
      all(() => sb.from('habit_logs').select('habit_id,user_id,day,value').eq('user_id', userId).gte('day', since).order('day')),
      this.loadSocial(userId),
      sb.from('habit_reminders').select('habit_id,remind_at').eq('user_id', userId).then(check),
      all(() => sb.from('tasks').select('*').eq('owner_id', userId).order('created_at').order('id')),
    ]);
    const profiles = await this.profilesFor([...social.members.map((m) => m.user_id), ...social.friendships.flatMap((f) => [f.requester_id, f.addressee_id]), ...social.invites.map((i) => i.inviter_id), ...social.requests.map((q) => q.user_id)]);
    return { me, habits, tasks, logs: myLogs, profiles, reminders, ...social };
  },
  async loadSocial(userId) {
    const [members, friendships, invites, requests] = await Promise.all([
      sb.from('group_members').select('*').then(check),
      sb.from('friendships').select('*').order('created_at').then(check),
      sb.from('group_invites').select('*').eq('invitee_id', userId).then(check),
      sb.from('group_requests').select('*').then(check),
    ]);
    const mine = members.filter((m) => m.user_id === userId).map((m) => m.group_id);
    const ids = [...new Set([...mine, ...invites.map((i) => i.group_id), ...requests.map((q) => q.group_id)])];
    const [groups, rates] = await Promise.all([
      ids.length ? sb.from('groups').select('*').in('id', ids).then(check) : [],
      mine.length ? sb.rpc('group_rates', { gids: mine }).then(check) : [],
    ]);
    return { groups, members, friendships, invites, requests, rates };
  },
  async profilesFor(ids) {
    ids = [...new Set(ids)];
    const out = [];
    for (let i = 0; i < ids.length; i += 150) out.push(...check(await sb.from('profiles').select('*').in('id', ids.slice(i, i + 150))));
    return out;
  },

  async saveHabit(row) { check(await sb.from('habits').upsert(row)); },
  async deleteHabit(id) { check(await sb.from('habits').delete().eq('id', id)); },
  /** Saves tasks parents-first, one level at a time (the database checks each parent before its children arrive). */
  async saveTasks(rows) {
    const ids = new Set(rows.map((r) => r.id)), done = new Set();
    let left = rows;
    while (left.length) {
      const level = left.filter((r) => !r.parent_id || !ids.has(r.parent_id) || done.has(r.parent_id));
      if (!level.length) throw new Error('Task steps are out of order.');
      check(await sb.from('tasks').upsert(level));
      level.forEach((r) => done.add(r.id));
      left = left.filter((r) => !done.has(r.id));
    }
  },
  async deleteTask(id) { check(await sb.from('tasks').delete().eq('id', id)); },
  async saveLog(row) { check(await sb.from('habit_logs').upsert(row)); },

  async saveReminder(habitId, userId, time) {
    if (!time) check(await sb.from('habit_reminders').delete().eq('habit_id', habitId).eq('user_id', userId));
    else check(await sb.from('habit_reminders').upsert({ habit_id: habitId, user_id: userId, remind_at: time }));
  },

  // ── web push ──
  async vapidKey() {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ action: 'vapid-public' }) });
    if (!r.ok) throw new Error('Notifications aren\u2019t available right now.');
    return (await r.json()).publicKey;
  },
  async savePushSub(sub) { check(await sb.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth })); },
  async deletePushSub(endpoint) { check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); },
  async sendTestPush() {
    const { data } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ action: 'test' }) });
    if (!r.ok) throw new Error('Could not send the test notification.');
    return (await r.json()).sent || 0;
  },

  async updateProfile(patch, id) { return check(await sb.from('profiles').update(patch).eq('id', id).select().single()); },
  async uploadAvatar(blob, userId, oldUrl) {
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    check(await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }));
    const { publicUrl } = sb.storage.from('avatars').getPublicUrl(path).data;
    const marker = '/avatars/';
    if (oldUrl?.includes(`${marker}${userId}/`)) sb.storage.from('avatars').remove([oldUrl.split(marker)[1]]).catch(() => {});
    return publicUrl;
  },

  async removeAvatarFile(url, userId) {
    const marker = '/avatars/';
    if (url?.includes(`${marker}${userId}/`)) await sb.storage.from('avatars').remove([url.split(marker)[1]]);
  },

  async createGroup(f) { return check(await sb.from('groups').insert({ name: f.name, description: f.description || '', icon: f.icon, color: f.color, is_public: f.is_public }).select().single()); },
  async updateGroup(id, patch) { check(await sb.from('groups').update(patch).eq('id', id)); },
  async deleteGroup(id) { check(await sb.from('groups').delete().eq('id', id)); },
  async groupById(id) { return check(await sb.from('groups').select('*').eq('id', id).maybeSingle()); },
  async joinGroup(gid) { check(await sb.rpc('join_group', { gid })); },
  async leaveGroup(gid) { check(await sb.rpc('leave_group', { gid })); },
  async requestJoin(gid) { check(await sb.rpc('request_join', { gid })); },
  async respondRequest(gid, uid, accept) { check(await sb.rpc('respond_request', { gid, uid, accept })); },
  async inviteUser(gid, uid) { check(await sb.rpc('invite_user', { gid, uid })); },
  async respondInvite(iid, accept) { check(await sb.rpc('respond_invite', { iid, accept })); },
  async setRole(gid, uid, newRole) { check(await sb.rpc('set_role', { gid, uid, new_role: newRole })); },
  async kickMember(gid, uid) { check(await sb.rpc('kick_member', { gid, uid })); },
  async searchGroups(q) { return check(await sb.rpc('search_groups', { q })); },
  async recommendedGroups(words) { return check(await sb.rpc('recommended_groups', { words })); },
  async searchProfiles(q) {
    const esc = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    return check(await sb.from('profiles').select('id,username,display_name,avatar_url,about').ilike('username', `${esc}%`).order('username').limit(8));
  },
  async memberRate(uid) { return check(await sb.rpc('member_rate', { uid })); },
  async friendHabits(uid) { return check(await sb.rpc('friend_habits', { uid })); },
  async groupOverview(gid) { return check(await sb.rpc('group_overview', { gid })); },

  // ── posts, comments, likes ──
  async listPosts(gid) {
    const rows = check(await sb.from('posts').select('*, post_likes(user_id), comments(count)').eq('group_id', gid).order('created_at', { ascending: false }).limit(40));
    const withHabit = rows.filter((p) => p.habit_id).map((p) => p.id);
    const rates = withHabit.length ? check(await sb.rpc('post_rates', { pids: withHabit })) : [];
    const byId = new Map(rates.map((r) => [r.post_id, r.pct]));
    return rows.map((p) => ({ ...p, likes: p.post_likes.map((l) => l.user_id), comment_count: p.comments?.[0]?.count || 0, pct: byId.get(p.id) ?? null }));
  },
  async createPost(gid, body, habit, task) {
    const row = { group_id: gid, body, task: task || null, habit_id: habit?.id || null, habit: habit ? { title: habit.title, icon: habit.icon, color: habit.color, goal_type: habit.goal_type, target: habit.target, unit: habit.unit, days: habit.days } : null };
    return check(await sb.from('posts').insert(row).select().single());
  },
  async deletePost(id) { check(await sb.from('posts').delete().eq('id', id)); },
  async togglePostLike(id, uid, liked) {
    if (liked) check(await sb.from('post_likes').insert({ post_id: id, user_id: uid }));
    else check(await sb.from('post_likes').delete().eq('post_id', id).eq('user_id', uid));
  },
  async listComments(pid) {
    const comments = check(await sb.from('comments').select('*').eq('post_id', pid).order('created_at'));
    const ids = comments.map((c) => c.id);
    const likes = ids.length ? check(await sb.from('comment_likes').select('comment_id,user_id').in('comment_id', ids)) : [];
    return { comments, likes };
  },
  async addComment(pid, body, parentId) { return check(await sb.from('comments').insert({ post_id: pid, body, parent_id: parentId || null }).select().single()); },
  async deleteComment(id) { check(await sb.from('comments').delete().eq('id', id)); },
  async toggleCommentLike(id, uid, liked) {
    if (liked) check(await sb.from('comment_likes').insert({ comment_id: id, user_id: uid }));
    else check(await sb.from('comment_likes').delete().eq('comment_id', id).eq('user_id', uid));
  },

  async findProfile(username) { return check(await sb.from('profiles').select('*').eq('username', username).maybeSingle()); },
  async requestFriend(me, uid) { return check(await sb.from('friendships').insert({ requester_id: me, addressee_id: uid }).select().single()); },
  async acceptFriend(id) { check(await sb.from('friendships').update({ status: 'accepted' }).eq('id', id)); },
  async removeFriendship(id) { check(await sb.from('friendships').delete().eq('id', id)); },

  /** Live changes. Handlers get the raw postgres_changes payload. */
  listen(handlers) {
    const ch = sb.channel('muna-sync');
    for (const t of ['habits', 'tasks', 'habit_logs', 'habit_reminders', 'group_members', 'group_invites', 'group_requests', 'friendships', 'posts', 'comments', 'post_likes', 'comment_likes']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => handlers[t]?.(p));
    }
    ch.subscribe((status) => handlers.status?.(status));
    return () => sb.removeChannel(ch);
  },
};
