import { z } from "zod";

// The crash report payload, stored in the generic `data` jsonb column and
// validated on ingest by the crash ReportKind. Mirrors the crash fields that
// previously lived as dedicated columns on the reports table.
export const CrashPayloadSchema = z.object({
  errorType: z.string().nullable().optional(),
  stack: z.string().nullable().optional(),
  componentStack: z.string().nullable().optional(),
  // For react-boundary crashes: which plugin slot rendered the throwing tree
  // (e.g. "Shell.Toolbar") and which contribution inside it (the plugin id or a
  // human label). Omitted for window-level errors — we don't know then.
  slot: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});
export type CrashPayload = z.infer<typeof CrashPayloadSchema>;

// Crash fingerprint = sha256(errorType + top 3 normalized stack frames), first
// 16 hex chars. Normalization strips line:col and cache-busters so the same bug
// yields the same fingerprint across restarts and dev reloads.
export async function crashFingerprint(data: CrashPayload): Promise<string> {
  const frames = normalizeFrames(data.stack ?? "");
  const top = frames.slice(0, 3).join("|");
  const input = `${data.errorType ?? "Error"}|${top}`;
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
