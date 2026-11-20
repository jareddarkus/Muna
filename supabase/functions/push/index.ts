// Muna push: serves the public VAPID key, sends a test notification, delivers nudges between friends, and (called by pg_cron every minute)
// delivers due habit reminders. Deployed with verify_jwt = false; each action does its own check.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generateVapid, sendWebPush, type Vapid } from './webpush.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SUBJECT = 'mailto:push@example.com'; // required by the push services; not used for anything else
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function secret(key: string): Promise<string | null> {
  const { data, error } = await db.from('app_secrets').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
/** The VAPID key pair is generated once, on first use, and kept in the database (never in the repo). */
async function vapid(): Promise<Vapid> {
  const have = await secret('vapid');
  if (have) return JSON.parse(have);
  await db.from('app_secrets').insert({ key: 'vapid', value: JSON.stringify(await generateVapid()) }); // a concurrent loser just fails the insert
  return JSON.parse((await secret('vapid'))!);
}

async function deliver(rows: { sub_id: string; endpoint: string; p256dh: string; auth: string }[], message: unknown): Promise<number> {
  const keys = await vapid();
  let sent = 0;
  const gone: string[] = [];
  const text = JSON.stringify(message);
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (r) => {
      try {
        const status = await sendWebPush(r, text, keys, SUBJECT);
        if (status === 404 || status === 410) gone.push(r.sub_id); else if (status < 300) sent++; else console.error('push status', status, new URL(r.endpoint).host);
      } catch (e) { console.error('push failed', e); }
    }));
  }
  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { action, ...rest } = await req.json().catch(() => ({}));

    if (action === 'vapid-public') return json({ publicKey: (await vapid()).publicKey });

    if (action === 'test') {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
      const { data: { user } } = await db.auth.getUser(jwt);
      if (!user) return json({ error: 'not signed in' }, 401);
      const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user.id);
      const rows = (subs || []).map((s) => ({ sub_id: s.id, ...s }));
      const sent = await deliver(rows, { title: 'Muna', body: 'Notifications are working.', tag: 'muna-test', url: './' });
      return json({ sent });
    }

    if (action === 'nudge') {
      // push notification for a nudge the caller just sent (the nudge row itself is created, and checked, by the send_nudge database function)
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
      const { data: { user } } = await db.auth.getUser(jwt);
      if (!user) return json({ error: 'not signed in' }, 401);
      const { data: n } = await db.from('nudges').select('id, to_id, title, pushed_at').eq('id', rest.nudge_id).eq('from_id', user.id).maybeSingle();
      if (!n) return json({ error: 'no such nudge' }, 404);
      if (n.pushed_at) return json({ sent: 0 });
      await db.from('nudges').update({ pushed_at: new Date().toISOString() }).eq('id', n.id);
      const { data: me } = await db.from('profiles').select('username').eq('id', user.id).maybeSingle();
      const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.to_id);
      const rows = (subs || []).map((x) => ({ sub_id: x.id, ...x }));
      const sent = await deliver(rows, { title: `@${me?.username || 'A friend'} is nudging you`, body: `Time for "${n.title}"`, tag: `nudge-${n.id}`, url: './' });
      return json({ sent });
    }

    if (action === 'tick') {
      const expected = await secret('cron_secret');
      if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'forbidden' }, 403);
      const { data, error } = await db.rpc('claim_due_reminders');
      if (error) throw error;
      let sent = 0;
      for (const r of data || []) sent += await deliver([r], { title: r.title, body: r.body, tag: `habit-${r.habit_id}`, url: './' });
      return json({ due: (data || []).length, sent });
    }

    return json({ error: 'unknown action', ...rest }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
});
