import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The content-addressed web-artifact store.
 *
 * Holds both of the store's subtrees (`store/` keyed by inputs hash,
 * `fingerprints/` mapping a builder identity to its artifact set) — they are
 * one reclaim unit, so they are one declaration and the consumer joins the two
 * children off it.
 *
 * @see plugins/framework/plugins/tooling/plugins/web-artifacts/core/internal/store.ts
 */
export const webArtifactsDir = defineDataDir({
  kind: "cache",
  name: "web-artifacts",
  owner: "framework/tooling/web-artifacts",
  description:
    "Content-addressed per-plugin web build artifacts (a dir per artifact keyed by its inputs hash) plus the per-builder-identity fingerprint index, shared across worktrees",
  reclaim: { kind: "safe" },
});

export default [webArtifactsDir];
