import { supabase } from "./supabase";
import { getQuestPhotoUrl } from "./quest-photos";

// Same private "quest-photos" bucket as quest proof photos and the profile
// background photo (per the request: "используй тот же Supabase Storage,
// что и для фото-подтверждений квестов и фона") — the existing RLS policies
// already scope access by the first path segment being auth.uid(), so an
// "avatar-<ts>.jpg" file under the user's own folder needs zero schema
// changes.
const BUCKET = "quest-photos";

function downscaleToBlob(file: File, maxW = 512, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        // Square-crop to the smaller dimension so the round avatar frame
        // doesn't stretch/squash a non-square photo.
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const scale = Math.min(1, maxW / side);
        const canvas = document.createElement("canvas");
        canvas.width = side * scale;
        canvas.height = side * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          quality,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Downscales, square-crops, uploads to the private quest-photos bucket under this user's own folder, and returns the storage path. */
export async function uploadAvatarPhoto(userId: string, file: File): Promise<string> {
  const blob = await downscaleToBlob(file);
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Resolves a private avatar-photo storage path to a temporary signed URL. Same bucket/mechanism as quest/background photos, so this just re-exports that resolver. */
export const getAvatarPhotoUrl = getQuestPhotoUrl;
