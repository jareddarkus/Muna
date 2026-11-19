import { h } from './util.js';
import { icon } from './icons.js';
import { openPanel, panelBar } from './ui.js';
import { VERSION, CHANGELOG } from './version.js';

const SEEN = 'muna.seen';
export const hasUnseenUpdate = () => { try { return localStorage.getItem(SEEN) !== VERSION; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, VERSION); } catch {} };

export function openUpdates(onSeen) {
  markSeen(); onSeen?.();
  const panel = openPanel({ cls: 'updates' });
  const reload = h('button', { type: 'button', class: 'pill block', onClick: async () => {
    reload.disabled = true; reload.textContent = 'Reloading…';
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map((r) => r.update())); } catch {}
    location.reload();
  } }, icon('refresh', { size: 24 }), 'Reload to get the latest');
  panel.el.append(panelBar(panel, { title: 'Updates' }), h('div', { class: 'panel-body' },
    h('div', { class: 'ver-hero' }, h('span', { class: 'ver-big' }, `v${VERSION}`), h('span', { class: 'ver-sub' }, 'The version you have loaded')),
    CHANGELOG.map((c, i) => h('section', { class: 'field-card release' },
      h('div', { class: 'row-between' }, h('h3', {}, `Version ${c.version}`), i === 0 && h('span', { class: 'tag' }, 'Latest')),
      h('p', { class: 'hint tight' }, c.date), h('ul', {}, c.items.map((t) => h('li', {}, t))))),
    reload, h('div', { class: 'spacer' })));
}
