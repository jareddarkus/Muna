// Create / edit a habit, plus the icon picker (all Tabler icons, outline and filled).
import { h, WEEKDAYS, debounce, toast, clamp, addDays, fmtDay } from './util.js';
import { icon, habitIcon, loadIndex, searchIcons, parseRef } from './icons.js';
import { colorKeys, COLOR_NAMES, colorVars, gradient } from './colors.js';
import { openSheet, sheetHeader, closeButton, segmented, dangerButton, toggleSwitch } from './ui.js';
import { state, saveHabit, deleteHabit, saveReminder, myGroups } from './store.js';
import { permissionState, isEnabled } from './push.js';

const SUGGESTIONS = ['water', 'run', 'book', 'sleep', 'meditate', 'gym', 'food', 'music', 'money', 'heart', 'pill', 'code', 'brush', 'bike', 'plant'];

export function openEditor(id = null) {
  const existing = id ? state.habits.get(id) : null;
  const mine = !existing || existing.owner_id === state.me.id; // members of a shared habit can only set their own reminder
  const draft = existing
    ? { ...existing, days: [...existing.days], start: existing.created_on, remind: state.reminders.get(existing.id) || '', minutes: Math.round(existing.target / 60) || 30, count: existing.goal_type === 'count' ? existing.target : 8 }
    : { title: '', icon: 'outline:droplet', color: 'blue', goal_type: 'count', unit: '', days: [0, 1, 2, 3, 4, 5, 6], group_id: null, minutes: 30, count: 1, start: state.today, remind: '' };

  const sheet = openSheet({ cls: 'editor' });
  const apply = () => Object.entries(colorVars(draft.color)).forEach(([k, v]) => sheet.el.style.setProperty(k, v));
  apply();

  // ── icon + title ──
  const bubble = h('button', { type: 'button', class: 'bubble xl pick', 'aria-label': 'Choose icon', onClick: () => openIconPicker(draft, (ref) => { draft.icon = ref; paintIcon(); }) });
  const badge = h('span', { class: 'bubble-badge' }, icon('pencil', { size: 14 }));
  bubble.append(badge);
  let shown = null;
  const paintIcon = () => { if (shown) shown.remove(); shown = habitIcon(draft.icon, 44); bubble.prepend(shown); };
  const title = h('input', { class: 'title-input', type: 'text', placeholder: 'Habit name', maxLength: 60, value: draft.title, autocomplete: 'off', enterKeyHint: 'done', onInput: (e) => { draft.title = e.target.value; validate(); } });

  // ── colors ──
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, colorKeys.map((k) =>
    h('button', { type: 'button', class: `swatch ${k === draft.color ? 'on' : ''}`, 'data-k': k, role: 'radio', 'aria-label': COLOR_NAMES[k], title: COLOR_NAMES[k], style: { background: gradient(k) },
      onClick: () => { draft.color = k; apply(); swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); } }, icon('check', { size: 16 }))));

  // ── goal ──
  const goalBody = h('div', { class: 'goal-body' });
  const seg = segmented([['count', 'Count'], ['time', 'Time']], draft.goal_type, (v) => { draft.goal_type = v; paintGoal(); });
  function stepper(get, set, min, max, step, suffix) {
    const val = h('input', { class: 'step-input', type: 'number', inputMode: 'numeric', min, max, value: get(), onInput: (e) => { const n = parseInt(e.target.value, 10); if (n) set(clamp(n, min, max)); } });
    val.addEventListener('blur', () => { val.value = get(); });
    const dec = () => { set(clamp(get() - step, min, max)); val.value = get(); };
    const inc = () => { set(clamp(get() + step, min, max)); val.value = get(); };
    return h('div', { class: 'stepper' },
      h('button', { type: 'button', class: 'round-btn mini ghost', 'aria-label': 'Less', onClick: dec }, icon('minus', { size: 18 })),
      h('div', { class: 'step-mid' }, val, suffix && h('span', { class: 'step-suffix' }, suffix)),
      h('button', { type: 'button', class: 'round-btn mini ghost', 'aria-label': 'More', onClick: inc }, icon('plus', { size: 18 })));
  }
  function paintGoal() {
    goalBody.replaceChildren();
    if (draft.goal_type === 'time') {
      goalBody.append(h('p', { class: 'hint' }, 'How long, each day?'), stepper(() => draft.minutes, (v) => (draft.minutes = v), 1, 1440, 5, 'min'));
    } else {
      goalBody.append(h('p', { class: 'hint' }, 'How many times, each day?'), stepper(() => draft.count, (v) => (draft.count = v), 1, 9999, 1, null),
        h('input', { class: 'text-input', type: 'text', placeholder: 'Unit (optional) — glasses, pages, reps…', maxLength: 20, value: draft.unit, onInput: (e) => { draft.unit = e.target.value; } }));
    }
  }

  // ── days ──
  const days = h('div', { class: 'days' }, WEEKDAYS.map((l, i) => h('button', { type: 'button', class: `day ${draft.days.includes(i) ? 'on' : ''}`, 'aria-label': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i], 'aria-pressed': draft.days.includes(i),
    onClick: (e) => {
      const on = draft.days.includes(i);
      if (on && draft.days.length === 1) return;
      draft.days = on ? draft.days.filter((d) => d !== i) : [...draft.days, i].sort();
      e.currentTarget.classList.toggle('on', !on); e.currentTarget.setAttribute('aria-pressed', String(!on));
    } }, l)));

  // ── start date ──
  const startChips = h('div', { class: 'chips' }, [['Today', state.today], ['Tomorrow', addDays(state.today, 1)], ['Next week', addDays(state.today, 7)]].map(([l, d]) =>
    h('button', { type: 'button', class: 'chip', 'data-d': d, onClick: () => { draft.start = d; startInput.value = d; paintStart(); } }, l)));
  const startInput = h('input', { class: 'text-input date-input', type: 'date', value: draft.start, min: existing ? null : state.today, 'aria-label': 'Start date', onChange: (e) => { if (e.target.value) { draft.start = e.target.value; paintStart(); } } });
  const startHint = h('p', { class: 'hint' });
  function paintStart() {
    startChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.d === draft.start));
    startHint.textContent = draft.start > state.today ? `It will first appear on ${fmtDay(draft.start, { weekday: 'long', month: 'long', day: 'numeric' })}.` : draft.start === state.today ? 'It appears right away.' : `Started ${fmtDay(draft.start, { month: 'long', day: 'numeric', year: 'numeric' })}.`;
  }

  // ── reminder ──
  const timeInput = h('input', { class: 'text-input time-input', type: 'time', value: draft.remind || '09:00', 'aria-label': 'Reminder time', onChange: (e) => { draft.remind = e.target.value || ''; } });
  const remindNote = h('p', { class: 'hint' });
  const remindSwitch = toggleSwitch(!!draft.remind, (on, api) => {
    if (on && notifyOk === false) { toast(state.demo ? 'Sign in with Google to use reminders.' : 'Turn on notifications in Settings first.'); return; }
    api.set(on); draft.remind = on ? timeInput.value || '09:00' : ''; paintRemind();
  });
  let notifyOk = permissionState() === 'granted' && !state.demo ? null : false;
  function paintRemind() {
    timeInput.hidden = !draft.remind;
    remindNote.hidden = notifyOk !== false;
    remindNote.textContent = state.demo ? 'Sign in with Google to use reminders.' : permissionState() === 'needs-install' ? 'Add Muna to your Home Screen, then allow notifications in Settings.' : 'Allow notifications in Settings to receive reminders.';
  }
  if (notifyOk === null) isEnabled().then((ok) => { notifyOk = ok; paintRemind(); });

  // ── sharing ──
  const groups = myGroups();
  const share = groups.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Share with a group'),
    h('div', { class: 'chips' }, [{ id: null, name: 'Just me' }, ...groups].map((g) => h('button', { type: 'button', class: `chip ${draft.group_id === g.id ? 'on' : ''}`, onClick: (e) => {
      draft.group_id = g.id; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.currentTarget));
    } }, g.id && icon('users', { size: 16 }), g.name)))) : null;

  // ── actions ──
  const save = h('button', { type: 'button', class: 'btn primary block', onClick: onSave }, existing ? 'Save changes' : 'Add habit');
  function validate() { save.disabled = mine && !draft.title.trim(); }
  async function onSave() {
    if (mine && !draft.title.trim()) return;
    save.disabled = true;
    const time = draft.goal_type === 'time';
    try {
      let habitId = existing?.id;
      if (mine) {
        habitId = await saveHabit({
          id: existing?.id, title: draft.title.trim(), icon: draft.icon, color: draft.color, goal_type: draft.goal_type,
          target: time ? draft.minutes * 60 : draft.count, unit: time ? '' : draft.unit.trim(), days: draft.days, group_id: draft.group_id || null,
          created_on: draft.start,
        });
      }
      await saveReminder(habitId, draft.remind || null).catch((e) => { toast('Saved, but the reminder could not be set.'); console.error(e); });
      sheet.close();
    } catch (e) { toast(e.message || 'Could not save'); save.disabled = false; }
  }
  const del = existing ? dangerButton('Delete habit', 'Tap again to delete', async () => { await deleteHabit(existing.id); sheet.close(); }, 'block') : null;

  sheet.el.append(
    sheetHeader({ title: !mine ? 'Reminder' : existing ? 'Edit habit' : 'New habit', right: closeButton(sheet) }),
    h('div', { class: 'sheet-scroll' },
      mine && h('section', { class: 'card name-card' }, bubble, title),
      mine && h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Color'), swatches),
      mine && h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Goal'), seg.el, goalBody),
      mine && h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Repeat'), days),
      mine && h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Starts'), startChips, startInput, startHint),
      h('section', { class: 'card' }, h('div', { class: 'card-row' }, h('h3', { class: 'card-title tight' }, 'Reminder'), remindSwitch.el), timeInput, remindNote),
      mine && share, mine && del, h('div', { class: 'sheet-spacer' })),
    h('footer', { class: 'sheet-foot' }, save));
  paintIcon(); paintGoal(); paintStart(); paintRemind(); validate();
  if (!existing) setTimeout(() => title.focus({ preventScroll: true }), 350);
}

// ───────────── icon picker ─────────────
export function openIconPicker(draft, onPick) {
  const sheet = openSheet({ cls: 'picker' });
  Object.entries(colorVars(draft.color)).forEach(([k, v]) => sheet.el.style.setProperty(k, v));
  let { style } = parseRef(draft.icon);
  let query = '', results = [], shownCount = 0, all = null;
  const BATCH = 150;

  const count = h('span', { class: 'picker-count' }, 'Loading icons…');
  const grid = h('div', { class: 'icon-grid' });
  const sentinel = h('div', { class: 'sentinel' });
  const scroller = h('div', { class: 'sheet-scroll picker-scroll' }, grid, sentinel);
  const input = h('input', { class: 'search', type: 'search', placeholder: 'Search icons — water, run, book…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, onInput: debounce((e) => { query = e.target.value; run(); }, 90) });
  const seg = segmented([['outline', 'Outline'], ['filled', 'Filled']], style, (v) => { style = v; run(); });
  const chips = h('div', { class: 'chips scroll' }, SUGGESTIONS.map((s) => h('button', { type: 'button', class: 'chip', onClick: () => { input.value = s; query = s; run(); } }, s)));

  sheet.el.append(
    sheetHeader({ title: 'Choose icon', right: closeButton(sheet) }),
    h('div', { class: 'picker-top' }, h('div', { class: 'search-wrap' }, icon('search', { size: 20 }), input), seg.el, chips, count),
    scroller);

  const cur = parseRef(draft.icon);
  function cell(i) {
    const name = i[0], ref = `${style}:${name}`;
    return h('button', { type: 'button', class: `icon-cell ${draft.icon === ref ? 'on' : ''}`, title: name.replace(/-/g, ' '), 'aria-label': name.replace(/-/g, ' '),
      onClick: () => { onPick(ref); sheet.close(); } }, habitIcon(ref, 26));
  }
  function more() {
    const next = results.slice(shownCount, shownCount + BATCH);
    next.forEach((i) => grid.append(cell(i)));
    shownCount += next.length;
    sentinel.hidden = shownCount >= results.length;
  }
  function run() {
    results = searchIcons(all, query, style);
    // keep the current icon first when browsing, so it is easy to find
    if (!query && cur.style === style) { const k = results.findIndex((i) => i[0] === cur.name); if (k > 0) results.unshift(results.splice(k, 1)[0]); }
    grid.replaceChildren(); shownCount = 0; scroller.scrollTop = 0;
    count.textContent = results.length ? `${results.length.toLocaleString()} ${style} icons` : 'No icons found — try another word';
    more();
  }
  const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && shownCount < results.length) more(); }, { root: scroller, rootMargin: '600px' });
  io.observe(sentinel);
  loadIndex().then((idx) => { all = idx; run(); }).catch(() => { count.textContent = 'Could not load icons'; });
}
