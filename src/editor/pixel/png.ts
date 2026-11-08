import type { Strip } from './canvas-model';

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Encodes a frame strip as a PNG blob. */
export async function encodeStripPng(strip: Strip): Promise<Blob> {
  const c = canvasOf(strip.width, strip.height);
  c.getContext('2d')!.putImageData(new ImageData(strip.data, strip.width, strip.height), 0, 0);
  // Executor form: Promise.withResolvers is not in the project's ES2023 lib.
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be saved.'))), 'image/png'));
}

/** Decodes a PNG blob back to RGBA pixels (Image + canvas getImageData). */
export async function decodePng(blob: Blob): Promise<{ data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = canvasOf(img.naturalWidth, img.naturalHeight);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    return { data, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws RGBA pixels onto a canvas, blending over what is there (unlike putImageData). */
export function blitRgba(ctx: CanvasRenderingContext2D, data: Uint8ClampedArray<ArrayBuffer>, w: number, h: number) {
  const tmp = canvasOf(w, h);
  tmp.getContext('2d')!.putImageData(new ImageData(data, w, h), 0, 0);
  ctx.drawImage(tmp, 0, 0);
}
