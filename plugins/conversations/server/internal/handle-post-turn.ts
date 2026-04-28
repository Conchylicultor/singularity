import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { sendTurn } from "./runtime";

const PROMPT_IMAGES_DIR = join(tmpdir(), "singularity-prompt-images");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB per request

const TOKEN_RE = /<<<image:(\d+)>>>/g;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

// Magic-byte sniff for the small set of formats we accept. Refuses anything
// that doesn't match the claimed MIME (preventing e.g. a renamed shell script
// from landing on disk via a forged content-type).
function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return "image/gif";
    }
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  return null;
}

export async function handlePostTurn(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new Response("invalid id", { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  let text: string;
  let imagePaths: string[] = [];

  if (contentType.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const rawText = form.get("text");
    if (typeof rawText !== "string" || rawText.length === 0) {
      return Response.json({ error: "text required" }, { status: 400 });
    }
    text = rawText;

    // Collect image-N parts in N order. Allow gaps (a removed image leaves a
    // hole in numbering) by indexing rather than iterating sequentially.
    const tokenIndices = new Set<number>();
    for (const m of text.matchAll(TOKEN_RE)) {
      const n = Number.parseInt(m[1]!, 10);
      if (Number.isFinite(n)) tokenIndices.add(n);
    }

    let totalBytes = 0;
    const pathByIndex = new Map<number, string>();

    for (const idx of tokenIndices) {
      const part = form.get(`image-${idx}`);
      if (!(part instanceof Blob)) {
        return Response.json(
          { error: `missing image-${idx} part` },
          { status: 400 },
        );
      }
      if (part.size > MAX_IMAGE_BYTES) {
        return Response.json(
          { error: `image-${idx} exceeds ${MAX_IMAGE_BYTES} bytes` },
          { status: 413 },
        );
      }
      totalBytes += part.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return Response.json(
          { error: `total image payload exceeds ${MAX_TOTAL_BYTES} bytes` },
          { status: 413 },
        );
      }
      const bytes = new Uint8Array(await part.arrayBuffer());
      const detected = detectMime(bytes);
      if (!detected || !ALLOWED_MIME.has(detected)) {
        return Response.json(
          { error: `image-${idx} is not a recognized image format` },
          { status: 400 },
        );
      }
      const dir = join(PROMPT_IMAGES_DIR, id);
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${randomUUID()}.${mimeToExt(detected)}`);
      await Bun.write(path, bytes);
      pathByIndex.set(idx, path);
    }

    text = text.replace(TOKEN_RE, (_match, nStr: string) => {
      const n = Number.parseInt(nStr, 10);
      const path = pathByIndex.get(n);
      return path ? `@${path}` : "";
    });

    imagePaths = Array.from(pathByIndex.values());
  } else {
    // Backward-compat JSON body: { text: string }.
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.length === 0) {
      return Response.json({ error: "body.text required" }, { status: 400 });
    }
    text = body.text;
  }

  const finalText = text.trim();
  if (finalText.length === 0) {
    return Response.json({ error: "text required" }, { status: 400 });
  }

  try {
    await sendTurn(id, finalText);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
  return Response.json({ ok: true, imagePaths });
}
