import { supabase } from "./supabase";
import { getQuestPhotoUrl } from "./quest-photos";

// Deliberately reuses the SAME private "quest-photos" bucket as quest proof
// photos (per the feature request: "через тот же Supabase Storage, что и
// для фото квестов") rather than a new bucket — the existing RLS policies
// already scope access by the first path segment being auth.uid(), and a
// "background-<ts>.jpg" file under the user's own folder is covered by
// those same policies with zero schema changes.
const BUCKET = "quest-photos";

function downscaleToBlob(file: File, maxW = 1600, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

/** Downscales, uploads to the private quest-photos bucket under this user's own folder, and returns the storage path. */
export async function uploadBackgroundPhoto(userId: string, file: File): Promise<string> {
  const blob = await downscaleToBlob(file);
  const path = `${userId}/background-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Resolves a private background-photo storage path to a temporary signed URL. Same bucket/mechanism as quest photos, so this just re-exports that resolver. */
export const getBackgroundPhotoUrl = getQuestPhotoUrl;
