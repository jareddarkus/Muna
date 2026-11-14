// Notifications: web push registration for this device.
import { remote } from './backend-remote.js';
import { state } from './store.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/** 'unsupported' | 'needs-install' | 'denied' | 'default' | 'granted' */
export function permissionState() {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!ok) return isIOS && !standalone() ? 'needs-install' : 'unsupported';
  return Notification.permission;
}
async function registration() {
  await navigator.serviceWorker.register('sw.js');
  return navigator.serviceWorker.ready;
}
export async function isEnabled() {
  if (permissionState() !== 'granted') return false;
  try { return !!(await (await registration()).pushManager.getSubscription()); } catch { return false; }
}
const toBytes = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export async function enablePush() {
  if (state.demo) throw new Error('Sign in with Google to use notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked. Allow them in your browser or phone settings.' : 'Notifications weren’t allowed.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(await remote.vapidKey()) });
  await remote.savePushSub(sub.toJSON());
}
export async function disablePush() {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await remote.deletePushSub(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
/** Keep the server's copy of this device fresh (also re-links it after switching accounts). */
export async function syncPush() {
  try { if (state.demo || !(await isEnabled())) return; const sub = await (await registration()).pushManager.getSubscription(); if (sub) await remote.savePushSub(sub.toJSON()); } catch {}
}
export const sendTest = () => remote.sendTestPush();
