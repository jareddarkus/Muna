import { h } from './util.js';
import { icon } from './icons.js';
import { openSheet, sheetHeader, closeButton } from './ui.js';
import { VERSION, CHANGELOG } from './version.js';

const SEEN = 'muna.seen';
export const hasUnseenUpdate = () => { try { return localStorage.getItem(SEEN) !== VERSION; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, VERSION); } catch {} };

export function openUpdates(onSeen) {
  markSeen(); onSeen?.();
  const sheet = openSheet({ cls: 'tall' });
  const reload = h('button', { type: 'button', class: 'btn block', onClick: async () => {
    reload.disabled = true; reload.textContent = 'Reloading\u2026';
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map((r) => r.update())); } catch {}
    location.reload();
  } }, icon('refresh', { size: 18 }), 'Reload to get the latest');
  sheet.el.append(sheetHeader({ title: 'Updates', right: closeButton(sheet) }),
    h('div', { class: 'sheet-scroll' },
      h('div', { class: 'ver-hero' }, h('span', { class: 'ver-big' }, `v${VERSION}`), h('span', { class: 'ver-sub' }, 'You\u2019re on the latest version you have loaded.')),
      CHANGELOG.map((c, i) => h('section', { class: 'card release' },
        h('div', { class: 'release-head' }, h('h3', {}, `Version ${c.version}`), i === 0 && h('span', { class: 'tag-new' }, 'Latest')),
        h('p', { class: 'hint tight' }, c.date),
        h('ul', {}, c.items.map((t) => h('li', {}, t))))),
      reload, h('div', { class: 'sheet-spacer' })));
}
