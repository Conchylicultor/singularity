// Fingerprint = sha256(errorType + top 3 normalized stack frames), first 16 hex
// chars. Normalization strips line:col and cache-busters so the same bug yields
// the same fingerprint across restarts and dev reloads.

export async function fingerprint(
  errorType: string | null | undefined,
  stack: string | null | undefined,
): Promise<string> {
  const frames = normalizeFrames(stack ?? "");
  const top = frames.slice(0, 3).join("|");
  const input = `${errorType ?? "Error"}|${top}`;
  return sha256Hex(input).then((h) => h.slice(0, 16));
}

function normalizeFrames(stack: string): string[] {
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at "))
    .map((l) =>
      l
        .replace(/:\d+:\d+\)?$/, "")
        .replace(/\?(?:v|t|import)=[a-z0-9]+/gi, "")
        .replace(/\/node_modules\/\.vite\/deps\//, "/NM/")
        .replace(/\/@fs\//, "/"),
    );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
