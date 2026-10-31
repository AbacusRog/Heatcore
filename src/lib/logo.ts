/** Shrink a chosen logo to a small image that is saved with the business details. Keeps transparency. */
export async function resizeLogo(file: File, maxW = 600, maxH = 240): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file, such as a PNG or JPG.');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is too large. Choose one under 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image. Try a PNG or JPG.'));
      i.src = url;
    });
    const w0 = img.naturalWidth || maxW;
    const h0 = img.naturalHeight || maxH;
    const scale = Math.min(1, maxW / w0, maxH / h0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image on this device.');
    ctx.drawImage(img, 0, 0, w, h);
    let out = canvas.toDataURL('image/png');
    if (out.length > 350_000) {
      const webp = canvas.toDataURL('image/webp', 0.85);
      out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
    }
    if (out.length > 700_000) throw new Error('That logo is too detailed. Try a simpler or smaller image.');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
