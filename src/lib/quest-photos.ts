import { supabase } from "./supabase";

const BUCKET = "quest-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, re-fetched by the UI as needed

function downscaleToBlob(file: File, maxW = 640, quality = 0.7): Promise<Blob> {
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
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Downscales, uploads to the private quest-photos bucket, and returns the storage path. */
export async function uploadQuestPhoto(userId: string, questId: string, file: File): Promise<string> {
  const blob = await downscaleToBlob(file);
  const path = `${userId}/${questId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Resolves a private storage path to a temporary signed URL for display. */
export async function getQuestPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.warn("failed to sign quest photo url", error);
    return null;
  }
  return data.signedUrl;
}
