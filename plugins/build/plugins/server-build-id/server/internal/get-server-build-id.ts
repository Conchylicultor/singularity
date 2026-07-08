import { WEB_DIST_DIR } from "@plugins/infra/plugins/paths/server";
import { readFileSync } from "node:fs";

// Read the build id baked into the currently-served bundle from `dist/.build-id`,
// FRESH on every call. It must NOT be memoized: `./singularity build` swaps the
// `dist` symlink (what the browser downloads) *before* it restarts this backend,
// so between the swap and the restart the served bundle is already newer than any
// value read at process start. A once-memoized id would then disagree with the
// served bundle, and a reload could never converge (the tab loads the new bundle
// while the server keeps reporting the old id) until the restart landed — the
// stuck "Server updated" reload button. Reading the tiny dotfile per call is
// negligible (callers are the push-based frontendHash resource and report
// tagging), and by resolving through the same `dist` symlink the gateway serves
// from, the reported id always matches the bundle in the browser's hands.
export function getServerBuildId(): string | null {
  try {
    return readFileSync(`${WEB_DIST_DIR}/.build-id`, "utf8").trim() || null;
    // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- best-effort optional dotfile read; a missing/unreadable .build-id (before first build or in dev) legitimately means "build id unknown" → staleness detection inert, never a bug to surface
  } catch {
    return null;
  }
}
