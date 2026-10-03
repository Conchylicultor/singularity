import { isAbsolute, resolve, sep } from "node:path";

/**
 * The absolute path a checkout-relative `relPath` names under `root`, or `null`
 * when it is not one: empty, holding a NUL, absolute, `~`-prefixed, or
 * escaping the root through `..`. Every `/api/code/:worktree/*` read takes its
 * path through here — a file outside a checkout is host-fs's to serve, never
 * code-api's.
 */
export function resolveInsideRoot(
  root: string,
  relPath: string,
): string | null {
  if (!relPath || relPath.includes("\0")) return null;
  if (isAbsolute(relPath) || relPath.startsWith("~")) return null;
  const absRoot = resolve(root);
  const absTarget = resolve(absRoot, relPath);
  const rootNorm = absRoot.endsWith(sep) ? absRoot : absRoot + sep;
  return absTarget === absRoot || absTarget.startsWith(rootNorm)
    ? absTarget
    : null;
}
