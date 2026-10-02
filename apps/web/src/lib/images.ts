/**
 * Shrinks a photo before upload (technicians and customers are often on
 * limited mobile data): longest side ≤ maxDimension, re-encoded as JPEG.
 * Falls back to the original file if the browser can't decode it.
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Keep whichever is smaller (already-small JPEGs can grow when re-encoded).
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
