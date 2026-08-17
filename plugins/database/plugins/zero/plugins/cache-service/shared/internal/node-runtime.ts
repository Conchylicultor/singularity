/**
 * Single source of truth for the Node runtime the supervised zero-cache service
 * runs under — and that @rocicorp/zero-sqlite3's native addon must be built for.
 *
 * These two MUST agree on ONE ABI. The addon is compiled for exactly one
 * NODE_MODULE_VERSION; loading it under a Node major with a different ABI throws
 * ERR_DLOPEN_FAILED. Pinning a single major (not a "22 or 24" range) makes that
 * disagreement structurally impossible:
 *
 *   start.ts (resolveNode)   — accepts ONLY this major on PATH
 *   ensure-zero-sqlite3.ts   — builds the addon for this major's ABI
 *
 * NOTE: this file is kept dependency-free (no @plugins imports) on purpose — it
 * is pulled in by ensure-zero-sqlite3.ts (a `bun install` postinstall step), so
 * staying alias-free means it imposes no module-resolution requirement on that
 * context. Its consumers (start.ts, ensure-zero-node.ts) DO import the runtime's
 * declared directory from this plugin's `data-dirs/` — which reaches
 * @plugins/infra/plugins/paths/core — and that alias resolves fine in both the
 * postinstall and the gateway-spawned start.ts, because both run with cwd at the
 * repo root where tsconfig's `paths` apply.
 */
import { join } from "node:path";

// The Node major zero-cache runs under. Node 24 → NODE_MODULE_VERSION 137.
// Node 25 breaks Zero's tsx tooling (EBADENGINE + ERR_MODULE_NOT_FOUND); Node 22
// is a DIFFERENT ABI (127), so it must not load a 24-built addon.
export const ZERO_NODE_MAJOR = 24;

// Concrete build target handed to prebuild-install / node-gyp via
// npm_config_target. Any 24.x yields the same ABI; this is a representative
// patch release. Its major MUST equal ZERO_NODE_MAJOR (asserted below).
export const ZERO_NODE_BUILD_TARGET = "24.17.0";

if (
  Number.parseInt(ZERO_NODE_BUILD_TARGET.split(".")[0] ?? "", 10) !==
  ZERO_NODE_MAJOR
) {
  throw new Error(
    `zero node-runtime: ZERO_NODE_BUILD_TARGET (${ZERO_NODE_BUILD_TARGET}) major must equal ZERO_NODE_MAJOR (${ZERO_NODE_MAJOR})`,
  );
}

/**
 * The pinned version's subdirectory inside the managed Node-runtime dir. Single
 * source of truth shared by ensure-zero-node.ts (writes here) and start.ts
 * (resolves `bin/node` here) so the two can never drift.
 *
 * Takes the runtime dir rather than the data root: WHERE that dir lives is the
 * `services/node` declaration in this plugin's `data-dirs/index.ts`, and both
 * callers pass `zeroNodeDir.path`. This file stays dependency-free (no
 * `@plugins` import) for the postinstall context — see the note at the top —
 * which is exactly why it takes the resolved dir instead of resolving it.
 */
export function zeroNodeCacheDir(zeroNodeRoot: string): string {
  return join(zeroNodeRoot, ZERO_NODE_BUILD_TARGET);
}
