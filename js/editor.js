// Create / edit a habit, plus the icon picker (every Tabler icon, outline and filled).
import { h, WEEKDAYS, debounce, toast, clamp } from './util.js';
import { icon, habitIcon, loadIndex, searchIcons, parseRef } from './icons.js';
import { COLORS, COLOR_NAMES, PALETTE, hex, colorKey } from './colors.js';
import { openPanel, panelBar, segmented, dangerButton, toggleSwitch, iconCircle } from './ui.js';
import { state, saveHabit, deleteHabit, saveReminder } from './store.js';
import { permissionState, isEnabled } from './push.js';

const SUGGESTIONS = ['water', 'run', 'book', 'sleep', 'meditate', 'gym', 'food', 'music', 'money', 'heart', 'plant', 'code', 'brush', 'bike', 'study'];

export function openEditor(id = null) {
  const existing = id ? state.habits.get(id) : null;
  const draft = existing
    ? { ...existing, color: colorKey(existing.color), days: [...existing.days], start: existing.created_on, remind: state.reminders.get(existing.id) || '', minutes: Math.round(existing.target / 60) || 30, count: existing.goal_type === 'count' ? existing.target : 8 }
    : { title: '', icon: 'outline:star', color: 'purple', goal_type: 'count', unit: '', days: [0, 1, 2, 3, 4, 5, 6], minutes: 30, count: 1, start: state.today, remind: '' };

  const panel = openPanel({ cls: 'editor', tapClose: true });
  const paint = () => panel.el.style.setProperty('--c', hex(draft.color));
  paint();

  // name + icon
  const circle = h('button', { type: 'button', class: 'name-circle', 'aria-label': 'Choose icon', onClick: () => openIconPicker(draft, (ref) => { draft.icon = ref; paintIcon(); }) });
  const paintIcon = () => circle.replaceChildren(habitIcon(draft.icon, 26, 1.7));
  const name = h('input', { class: 'name-input', type: 'text', placeholder: 'Type here...', maxLength: 60, value: draft.title, autocomplete: 'off', enterKeyHint: 'done', onInput: (e) => { draft.title = e.target.value; validate(); } });

  // colors
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, COLORS.map((k) =>
    h('button', { type: 'button', class: `swatch ${k === draft.color ? 'on' : ''}`, 'data-k': k, role: 'radio', 'aria-label': COLOR_NAMES[k], style: { background: PALETTE[k] },
      onClick: () => { draft.color = k; paint(); swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); } })));

  // goal
  const goalBody = h('div', { class: 'goal-body' });
  const seg = segmented([['count', 'Count'], ['time', 'Time']], draft.goal_type, (v) => { draft.goal_type = v; paintGoal(); });
  function stepper(get, set, min, max, step, suffix) {
    const val = h('input', { class: 'step-input', type: 'number', inputMode: 'numeric', min, max, value: get(), onInput: (e) => { const n = parseInt(e.target.value, 10); if (n) set(clamp(n, min, max)); } });
    val.addEventListener('blur', () => { val.value = get(); });
    const move = (d) => { set(clamp(get() + d, min, max)); val.value = get(); };
    return h('div', { class: 'stepper' },
      h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Less', onClick: () => move(-step) }, icon('minus', { size: 30, stroke: 2.2 })),
      h('div', { class: 'step-mid' }, val, suffix && h('span', { class: 'step-suffix' }, suffix)),
      h('button', { type: 'button', class: 'step-btn', 'aria-label': 'More', onClick: () => move(step) }, icon('plus', { size: 34.5, stroke: 2.09 })));
  }
  function paintGoal() {
    goalBody.replaceChildren();
    if (draft.goal_type === 'time') goalBody.append(h('p', { class: 'hint' }, 'How long, each day?'), stepper(() => draft.minutes, (v) => (draft.minutes = v), 1, 1440, 5, 'min'));
    else goalBody.append(h('p', { class: 'hint' }, 'How many times, each day?'), stepper(() => draft.count, (v) => (draft.count = v), 1, 9999, 1, null),
      h('input', { class: 'pill-input', type: 'text', placeholder: 'Unit (optional): glasses, pages…', maxLength: 20, value: draft.unit, onInput: (e) => { draft.unit = e.target.value; } }));
  }

  // days
  const days = h('div', { class: 'days' }, WEEKDAYS.map((l, i) => h('button', { type: 'button', class: `day ${draft.days.includes(i) ? 'on' : ''}`, 'aria-label': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i], 'aria-pressed': draft.days.includes(i),
    onClick: (e) => {
      const on = draft.days.includes(i);
      if (on && draft.days.length === 1) return;
      draft.days = on ? draft.days.filter((d) => d !== i) : [...draft.days, i].sort();
      e.currentTarget.classList.toggle('on', !on); e.currentTarget.setAttribute('aria-pressed', String(!on));
    } }, l)));

  // start date: just the date field (today by default); tap it to change
  const startInput = h('input', { class: 'pill-input date-input', type: 'date', value: draft.start, min: existing ? null : state.today, 'aria-label': 'Start date', onChange: (e) => { if (e.target.value) draft.start = e.target.value; } });

  // reminder
  const timeInput = h('input', { class: 'pill-input', type: 'time', value: draft.remind || '09:00', 'aria-label': 'Reminder time', onChange: (e) => { draft.remind = e.target.value || ''; } });
  const remindNote = h('p', { class: 'hint' });
  let notifyOk = permissionState() === 'granted' && !state.demo ? null : false;
  const remindSwitch = toggleSwitch(!!draft.remind, (on, api) => {
    if (on && notifyOk === false) { toast(state.demo ? 'Sign in with Google to use reminders.' : 'Turn on notifications in Account first.'); return; }
    api.set(on); draft.remind = on ? timeInput.value || '09:00' : ''; paintRemind();
  });
  function paintRemind() {
    timeInput.hidden = !draft.remind;
    remindNote.hidden = notifyOk !== false;
    remindNote.textContent = state.demo ? 'Sign in with Google to use reminders.' : permissionState() === 'needs-install' ? 'Add Muna to your Home Screen, then allow notifications in Account.' : 'Allow notifications in Account to receive reminders.';
  }
  if (notifyOk === null) isEnabled().then((ok) => { notifyOk = ok; paintRemind(); });

  const save = h('button', { type: 'button', class: 'pill primary block', onClick: onSave }, existing ? 'Save changes' : 'Add habit');
  function validate() { save.disabled = !draft.title.trim(); }
  async function onSave() {
    if (!draft.title.trim()) return;
    save.disabled = true;
    const time = draft.goal_type === 'time';
    try {
      const habitId = await saveHabit({
        id: existing?.id, title: draft.title.trim(), icon: draft.icon, color: draft.color, goal_type: draft.goal_type,
        target: time ? draft.minutes * 60 : draft.count, unit: time ? '' : draft.unit.trim(), days: draft.days, group_id: null, created_on: draft.start,
      });
      await saveReminder(habitId, draft.remind || null).catch((e) => { toast('Saved, but the reminder could not be set.'); console.error(e); });
      panel.close();
    } catch (e) { toast(e.message || 'Could not save'); save.disabled = false; }
  }
  const del = existing ? dangerButton('Delete habit', 'This removes the habit and all of its history. It cannot be undone.', async () => { await deleteHabit(existing.id); panel.close(); }, 'block') : null;

  panel.el.append(
    panelBar(panel, { title: existing ? 'Edit habit' : 'New habit' }),
    h('div', { class: 'panel-body' },
      h('div', { class: 'name-pill' }, circle, name),
      h('section', { class: 'field-card' }, h('h3', {}, 'Color'), swatches),
      h('section', { class: 'field-card' }, h('h3', {}, 'Goal'), seg.el, goalBody),
      h('section', { class: 'field-card' }, h('h3', {}, 'Repeat'), days),
      h('section', { class: 'field-card' }, h('h3', {}, 'Starts'), startInput),
      h('section', { class: 'field-card' }, h('div', { class: 'row-between' }, h('h3', {}, 'Reminder'), remindSwitch.el), timeInput, remindNote),
      save, del, h('div', { class: 'spacer' })));
  paintIcon(); paintGoal(); paintRemind(); validate();
  if (!existing) setTimeout(() => name.focus({ preventScroll: true }), 400);
}

// ───────────── icon picker ─────────────
export function openIconPicker(draft, onPick) {
  const panel = openPanel({ cls: 'picker' });
  panel.el.style.setProperty('--c', draft.color === 'task' ? PALETTE.darkGray : hex(draft.color));
  let { style } = parseRef(draft.icon);
  let query = '', results = [], shown = 0, all = null;
  const BATCH = 150;
  const count = h('span', { class: 'picker-count' }, 'Loading icons…');
  const grid = h('div', { class: 'icon-grid' });
  const sentinel = h('div', { class: 'sentinel' });
  const scroller = h('div', { class: 'panel-body picker-scroll' }, grid, sentinel);
  const input = h('input', { class: 'pill-input search', type: 'search', placeholder: 'Search icons: water, run, book…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, onInput: debounce((e) => { query = e.target.value; run(); }, 90) });
  const seg = segmented([['outline', 'Outline'], ['filled', 'Filled']], style, (v) => { style = v; run(); });
  const chips = h('div', { class: 'chips scroll' }, SUGGESTIONS.map((s) => h('button', { type: 'button', class: 'chip', onClick: () => { input.value = s; query = s; run(); } }, s)));
  panel.el.append(panelBar(panel, { title: 'Choose icon' }), h('div', { class: 'picker-top' }, input, seg.el, chips, count), scroller);
  const cur = parseRef(draft.icon);
  const cell = (i) => {
    const ref = `${style}:${i[0]}`;
    return h('button', { type: 'button', class: `icon-cell ${draft.icon === ref ? 'on' : ''}`, title: i[0].replace(/-/g, ' '), 'aria-label': i[0].replace(/-/g, ' '), onClick: () => { onPick(ref); panel.close(); } }, habitIcon(ref, 30, 1.5));
  };
  function more() {
    const next = results.slice(shown, shown + BATCH);
    next.forEach((i) => grid.append(cell(i)));
    shown += next.length;
    sentinel.hidden = shown >= results.length;
  }
  function run() {
    results = searchIcons(all, query, style);
    if (!query && cur.style === style) { const k = results.findIndex((i) => i[0] === cur.name); if (k > 0) results.unshift(results.splice(k, 1)[0]); }
    grid.replaceChildren(); shown = 0; scroller.scrollTop = 0;
    count.textContent = results.length ? `${results.length.toLocaleString()} ${style} icons` : 'No icons found, try another word';
    more();
  }
  new IntersectionObserver((e) => { if (e[0].isIntersecting && shown < results.length) more(); }, { root: scroller, rootMargin: '600px' }).observe(sentinel);
  loadIndex().then((idx) => { all = idx; run(); }).catch(() => { count.textContent = 'Could not load icons'; });
}
