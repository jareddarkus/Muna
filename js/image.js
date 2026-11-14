// Profile photos are center-cropped, shrunk and converted to WebP before upload.
export async function compressAvatar(file, size = 512) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('That photo could not be read.'); }
  const s = Math.min(bmp.width, bmp.height), out = Math.min(size, s);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, out, out);
  bmp.close?.();
  const toBlob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85); // very old browsers
  return blob;
}
