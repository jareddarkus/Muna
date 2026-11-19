// Tap or press-and-hold the progress ring on a card.
//   tap  -> onTap()            (adds 1 count / 1 minute, or ticks a task)
//   hold -> the ring fills up while you keep pressing; reaching 100% calls onComplete()
import { haptic } from './util.js';

const HOLD_DELAY = 170;   // a press longer than this starts the fill instead of being a tap
const FULL_MS = 1000;     // time to fill an empty circle
const MOVE_LIMIT = 10;

export function attachRingActions(btn, { ring, state, getProgress, isDone, onTap, onComplete }) {
  let holdTimer = null, raf = 0, filling = false, completed = false, sx = 0, sy = 0, down = false, quick = false;

  const setFilling = (on) => { filling = on; state.filling = on; btn.classList.toggle('filling', on); };
  const stopFill = () => { cancelAnimationFrame(raf); if (filling) { setFilling(false); ring.set(getProgress()); } };

  function startFill() {
    holdTimer = null;
    if (isDone()) { quick = true; return; } // nothing to fill: a press on a finished item just counts as a tap on release
    setFilling(true); haptic('light');
    const from = getProgress(), dur = Math.max(450, FULL_MS * (1 - from)), t0 = performance.now();
    let mark = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur), p = from + (1 - from) * t;
      ring.set(p);
      const m = Math.floor(p * 4); if (m > mark && t < 1) { mark = m; haptic('select'); }
      if (t >= 1) { completed = true; setFilling(false); haptic('success'); onComplete(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  const cancel = () => { clearTimeout(holdTimer); holdTimer = null; down = false; stopFill(); };

  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    down = true; completed = false; quick = false; sx = e.clientX; sy = e.clientY;
    try { btn.setPointerCapture(e.pointerId); } catch {}
    holdTimer = setTimeout(startFill, HOLD_DELAY);
  });
  btn.addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_LIMIT) cancel(); });
  btn.addEventListener('pointerup', (e) => {
    if (!down) return;
    e.stopPropagation();
    down = false;
    const wasTap = holdTimer !== null || quick; // released before the fill started
    clearTimeout(holdTimer); holdTimer = null;
    if (wasTap) { onTap(); return; }
    if (!completed) stopFill();
  });
  btn.addEventListener('pointercancel', cancel);
  // the click that follows must not open the card; keyboards (no pointer) still work
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail === 0) onTap(); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
