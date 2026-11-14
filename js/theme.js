// Light / dark / follow-the-system, remembered on this device.
const KEY = 'muna.theme';
const metas = () => [...document.querySelectorAll('meta[name="theme-color"]')];
const original = metas().map((m) => m.content);

export const getTheme = () => { try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; } };

export function setTheme(mode) {
  try { mode === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode); } catch {}
  applyTheme(mode);
}
export function applyTheme(mode = getTheme()) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
  metas().forEach((m, i) => { m.content = mode === 'light' ? '#ffffff' : mode === 'dark' ? '#000000' : original[i]; });
}
applyTheme();
