export const MAX_FILES = 3;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
export const mediaExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
export type Evidence = { type: string; size: number; name: string };
export function evidenceError(files: readonly Evidence[]) {
  if (files.length > MAX_FILES) return "Poți adăuga maximum 3 fișiere.";
  let total = 0;
  for (const file of files) {
    if (!Object.hasOwn(mediaExtensions, file.type))
      return "Alege poze JPG, PNG, WebP sau clipuri MP4, MOV, WebM.";
    if (
      file.size <= 0 ||
      file.size > (file.type.startsWith("image/") ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)
    )
      return "O poză poate avea maximum 5 MB, iar un clip maximum 15 MB.";
    total += file.size;
  }
  return total > MAX_TOTAL_BYTES ? "Dovezile pot avea maximum 20 MB în total." : "";
}
export function cleanText(value: string, limit: number) {
  return Array.from(value.trim())
    .slice(0, limit)
    .join("")
    .replace(/\p{Surrogate}/gu, "\uFFFD");
}
export function newReportId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
