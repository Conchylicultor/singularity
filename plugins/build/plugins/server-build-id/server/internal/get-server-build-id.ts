import { WEB_DIST_DIR } from "@plugins/infra/plugins/paths/server";
import { readFileSync } from "node:fs";

// Read the build id baked into the served bundle once and memoize it. The
// server restarts on every build after the atomic `dist` swap, so a once-read
// `.build-id` always equals the currently-served bundle.
let cached: string | null | undefined;

export function getServerBuildId(): string | null {
  if (cached !== undefined) return cached;
  try {
    cached = readFileSync(`${WEB_DIST_DIR}/.build-id`, "utf8").trim() || null;
    // eslint-disable-next-line promise-safety/no-bare-catch -- best-effort optional dotfile read; a missing/unreadable .build-id (before first build or in dev) legitimately means "build id unknown" → staleness detection inert, never a bug to surface
  } catch {
    cached = null;
  }
  return cached;
}
