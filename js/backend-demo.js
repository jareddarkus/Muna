// Offline preview backend: everything lives in this browser only (no account, no sync).
import { uuid } from './util.js';

const KEY = 'muna.demo.data';
const ME = { id: 'demo-user', username: 'you', display_name: 'You', avatar_url: null };
const needAccount = () => { throw new Error('Sign in with Google to use friends and groups.'); };

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
const db = Object.assign({ me: ME, habits: [], logs: [], reminders: [] }, read());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };

export const demo = {
  name: 'demo',
  async load() { return { me: db.me, habits: db.habits, logs: db.logs, reminders: db.reminders, profiles: [db.me], groups: [], members: [], friendships: [] }; },
  async loadSocial() { return { groups: [], members: [], friendships: [] }; },
  async profilesFor() { return [db.me]; },
  async signOut() { localStorage.removeItem(KEY); },

  async saveHabit(row) {
    const i = db.habits.findIndex((x) => x.id === row.id);
    if (i < 0) db.habits.push({ created_at: new Date().toISOString(), ...row }); else db.habits[i] = { ...db.habits[i], ...row };
    save();
  },
  async deleteHabit(id) { db.habits = db.habits.filter((x) => x.id !== id); db.logs = db.logs.filter((l) => l.habit_id !== id); save(); },
  async saveLog(row) {
    const l = db.logs.find((x) => x.habit_id === row.habit_id && x.user_id === row.user_id && x.day === row.day);
    if (l) l.value = row.value; else db.logs.push({ ...row });
    save();
  },
  async saveReminder(habit_id, _u, time) { db.reminders = db.reminders.filter((r) => r.habit_id !== habit_id); if (time) db.reminders.push({ habit_id, remind_at: time }); save(); },
  async updateProfile(patch) { db.me = { ...db.me, ...patch }; save(); return db.me; },
  async uploadAvatar(blob) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  },

  createGroup: needAccount, renameGroup: needAccount, deleteGroup: needAccount, joinGroup: needAccount,
  addMember: needAccount, removeMember: needAccount, findProfile: needAccount, requestFriend: needAccount,
  acceptFriend: needAccount, removeFriendship: needAccount,
  listen() { return () => {}; },
};
export const newDemoId = uuid;
