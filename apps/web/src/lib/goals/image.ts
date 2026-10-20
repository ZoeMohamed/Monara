export const GOAL_IMAGE_BUCKET = "goal-images";
export const MAX_GOAL_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_GOAL_IMAGE_REQUEST_BYTES = MAX_GOAL_IMAGE_BYTES + 100_000;

type GoalImageKind = { extension: "jpg" | "png" | "webp"; contentType: string };

/** Timeouts and server/gateway errors can precede a late commit. */
export function goalUploadResponseCompleted(error: unknown): boolean {
  return (
    error === null ||
    (error instanceof Error &&
      error.name === "StorageApiError" &&
      "status" in error &&
      typeof error.status === "number" &&
      [400, 401, 403, 404, 409, 413, 415, 422].includes(error.status))
  );
}

export function validGoalImageContentLength(value: string | null): boolean {
  if (value === null) return false;
  const length = Number(value);
  return Number.isSafeInteger(length) && length > 0 && length <= MAX_GOAL_IMAGE_REQUEST_BYTES;
}

export function detectGoalImage(bytes: Uint8Array): GoalImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { extension: "png", contentType: "image/png" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { extension: "webp", contentType: "image/webp" };
  return null;
}
