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
    const [me, habits, myLogs, otherLogs, social, reminders] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).single().then(check),
      sb.from('habits').select('*').order('created_at').then(check),
      all(() => sb.from('habit_logs').select('habit_id,user_id,day,value').eq('user_id', userId).gte('day', since).order('day')),
      all(() => sb.from('habit_logs').select('habit_id,user_id,day,value').neq('user_id', userId).gte('day', recentSince).order('day')),
      this.loadSocial(userId),
      sb.from('habit_reminders').select('habit_id,remind_at').eq('user_id', userId).then(check),
    ]);
    const profiles = await this.profilesFor([...social.members.map((m) => m.user_id), ...habits.map((x) => x.owner_id), ...social.friendships.flatMap((f) => [f.requester_id, f.addressee_id]), ...otherLogs.map((l) => l.user_id)]);
    return { me, habits, logs: [...myLogs, ...otherLogs], profiles, reminders, ...social };
  },
  async loadSocial() {
    const [groups, members, friendships] = await Promise.all([
      sb.from('groups').select('*').order('created_at').then(check),
      sb.from('group_members').select('*').then(check),
      sb.from('friendships').select('*').order('created_at').then(check),
    ]);
    return { groups, members, friendships };
  },
  async profilesFor(ids) {
    ids = [...new Set(ids)];
    const out = [];
    for (let i = 0; i < ids.length; i += 150) out.push(...check(await sb.from('profiles').select('*').in('id', ids.slice(i, i + 150))));
    return out;
  },

  async saveHabit(row) { check(await sb.from('habits').upsert(row)); },
  async deleteHabit(id) { check(await sb.from('habits').delete().eq('id', id)); },
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

  async createGroup(name) { return check(await sb.from('groups').insert({ name }).select().single()); },
  async renameGroup(id, name) { check(await sb.from('groups').update({ name }).eq('id', id)); },
  async deleteGroup(id) { check(await sb.from('groups').delete().eq('id', id)); },
  async joinGroup(code) { return check(await sb.rpc('join_group', { code })); },
  async addMember(gid, uid) { check(await sb.rpc('add_group_member', { gid, uid })); },
  async removeMember(gid, uid) { check(await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', uid)); },

  async findProfile(username) { return check(await sb.from('profiles').select('*').eq('username', username).maybeSingle()); },
  async requestFriend(me, uid) { return check(await sb.from('friendships').insert({ requester_id: me, addressee_id: uid }).select().single()); },
  async acceptFriend(id) { check(await sb.from('friendships').update({ status: 'accepted' }).eq('id', id)); },
  async removeFriendship(id) { check(await sb.from('friendships').delete().eq('id', id)); },

  /** Live changes. Handlers get the raw postgres_changes payload. */
  listen(handlers) {
    const ch = sb.channel('muna-sync');
    for (const t of ['habits', 'habit_logs', 'habit_reminders', 'groups', 'group_members', 'friendships', 'profiles']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => handlers[t]?.(p));
    }
    ch.subscribe((status) => handlers.status?.(status));
    return () => sb.removeChannel(ch);
  },
};
