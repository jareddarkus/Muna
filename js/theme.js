// Light / dark / system. The choice is remembered on this device; "system" follows the phone.
const KEY = 'muna.theme';
const dark = matchMedia('(prefers-color-scheme: dark)');
let choice = 'system';
try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'system') choice = v; } catch {}

export const getTheme = () => choice;
const resolved = () => (choice === 'system' ? (dark.matches ? 'dark' : 'light') : choice);
function apply() {
  const t = resolved();
  document.documentElement.dataset.theme = t;
  // status bar / browser chrome colour: the page background (lgray)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t === 'dark' ? '#3A3946' : '#F6F5F8'));
}
export function setTheme(t) {
  choice = t;
  try { localStorage.setItem(KEY, t); } catch {}
  apply();
}
dark.addEventListener?.('change', () => { if (choice === 'system') apply(); });
apply();
