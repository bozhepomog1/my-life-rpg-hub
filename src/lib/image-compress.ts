/**
 * Client-side image downscale/compress, used before sending a photo to any
 * server endpoint that doesn't need full resolution (currently: the
 * parse-meal-photo Edge Function's food recognition — see nutrition.ts).
 * Keeping this generic (not nutrition-specific) since other features may
 * want the same "shrink before upload" behavior later.
 *
 * Unlike quest-photos.ts's downscaleToBlob (which produces a Blob for
 * Supabase Storage upload), this returns a raw base64 payload + media type —
 * the shape the Anthropic Messages API's image content blocks expect
 * (`{ type: "base64", media_type, data }`), since the photo here is never
 * persisted anywhere, just sent once for recognition and discarded.
 */
export interface CompressedImage {
  /** Base64-encoded JPEG bytes, WITHOUT the "data:image/jpeg;base64," prefix. */
  base64: string;
  mediaType: "image/jpeg";
}

/**
 * Resizes so the longer side is at most `maxDim` (default 1024px — plenty
 * for a vision model to identify food items and estimate portions; the
 * original could be several MB straight off a phone camera) and re-encodes
 * as JPEG at `quality`. Always outputs JPEG regardless of the input format
 * (HEIC/PNG/etc.) since canvas.toBlob's JPEG encoder is universally
 * supported and this is a one-shot recognition request, not an archival
 * copy — no reason to preserve the original format/transparency.
 */
export function compressImageToBase64(
  file: File,
  maxDim = 1024,
  quality = 0.82,
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        if (!base64) return reject(new Error("toDataURL produced empty output"));
        resolve({ base64, mediaType: "image/jpeg" });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
