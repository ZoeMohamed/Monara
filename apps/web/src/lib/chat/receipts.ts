import {
  type ChatReceiptRequest,
  chatReceiptAttachmentSchema,
  chatReceiptRequestSchema,
} from "@monara/contracts";

export type ChatReceiptSubmission = ChatReceiptRequest & { file: File };
export type ChatReceiptSelection = ChatReceiptSubmission & { previewUrl: string };

/** Metadata and file signatures are checked before preview; the server must validate uploads again. */
export async function prepareChatReceipt(file: File, id: string): Promise<ChatReceiptSubmission> {
  const parsed = chatReceiptAttachmentSchema.safeParse({
    id,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!parsed.success) throw new Error("Choose a JPG, PNG or WebP image up to 10 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : webp))
    throw new Error("That file doesn’t look like a supported image. Try another photo.");
  return { ...chatReceiptRequestSchema.parse({ attachment: parsed.data }), file };
}
