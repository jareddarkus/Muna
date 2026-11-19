// A tiny photo editor: drag to position, slide to zoom, always square. Saves a 512px WebP.
import { h, toast } from './util.js';
import { openPanel, panelBar } from './ui.js';

const VIEW = 280, OUT = 512;

export function openCropper(file, onDone) {
  const panel = openPanel({ cls: 'cropper' });
  const stage = h('div', { class: 'crop-stage' });
  const img = new Image();
  const canvas = h('canvas', { class: 'crop-canvas', width: VIEW, height: VIEW });
  const mask = h('div', { class: 'crop-mask' });
  const zoom = h('input', { class: 'crop-zoom', type: 'range', min: 1, max: 3, step: 0.01, value: 1, 'aria-label': 'Zoom' });
  const save = h('button', { type: 'button', class: 'pill primary block', disabled: true }, 'Use photo');
  stage.append(canvas, mask);
  panel.el.append(panelBar(panel, { title: 'Your photo' }), h('div', { class: 'panel-body center' }, stage, h('p', { class: 'hint center' }, 'Drag to move, slide to zoom'), zoom, save));

  let bmp = null, scale = 1, minScale = 1, ox = 0, oy = 0; // image pixels -> view: scale, offset
  const ctx = canvas.getContext('2d');
  function clampOffsets() {
    const w = bmp.width * scale, hh = bmp.height * scale;
    ox = Math.min(0, Math.max(VIEW - w, ox)); oy = Math.min(0, Math.max(VIEW - hh, oy));
  }
  function draw() {
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, ox, oy, bmp.width * scale, bmp.height * scale);
  }
  function setScale(s) {
    const cx = (VIEW / 2 - ox) / scale, cy = (VIEW / 2 - oy) / scale; // keep the centre fixed
    scale = s; ox = VIEW / 2 - cx * scale; oy = VIEW / 2 - cy * scale; clampOffsets(); draw();
  }
  zoom.addEventListener('input', () => setScale(minScale * parseFloat(zoom.value)));

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); clampOffsets(); draw(); });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  createImageBitmap(file, { imageOrientation: 'from-image' }).then((b) => {
    bmp = b; minScale = VIEW / Math.min(b.width, b.height); scale = minScale;
    ox = (VIEW - b.width * scale) / 2; oy = (VIEW - b.height * scale) / 2; draw(); save.disabled = false;
  }).catch(() => { toast('That photo could not be read.'); panel.close(); });

  save.addEventListener('click', async () => {
    save.disabled = true;
    const out = document.createElement('canvas'); out.width = out.height = OUT;
    const k = OUT / VIEW, c = out.getContext('2d'); c.imageSmoothingQuality = 'high';
    c.drawImage(bmp, ox * k, oy * k, bmp.width * scale * k, bmp.height * scale * k);
    const toBlob = (t, q) => new Promise((res) => out.toBlob(res, t, q));
    let blob = await toBlob('image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
    try { await onDone(blob); panel.close(); } catch (e) { toast(e?.message || 'Could not save the photo'); save.disabled = false; }
  });
}
