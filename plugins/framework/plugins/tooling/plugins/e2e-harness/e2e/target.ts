/**
 * Where an e2e script points its browser.
 *
 * This exists to kill a whole class of rot by construction. Before the per-plugin
 * move, four scripts carried a *literal* ephemeral worktree host as their default
 * (`att-1781283277-ilxk.localhost:9000`, `claude-1776940724-olee.localhost:9000`,
 * …). Those worktrees are long gone, so the scripts could not run as written and
 * nobody noticed, because a default that is a dead string fails at the browser,
 * not at the type checker.
 *
 * The default here is DERIVED, never literal: the current checkout's own
 * gateway namespace. `basename(REPO_ROOT)` is the worktree directory name, which
 * is exactly the namespace the gateway serves this worktree's backend under —
 * the same derivation `test/bun-preload.ts` uses for `SINGULARITY_WORKTREE`. So
 * `bun plugins/<path>/e2e/<name>.ts` with no arguments at all hits the deploy
 * that `./singularity build` just produced, in every worktree, forever.
 */
import { basename } from "node:path";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import { arg } from "./args";

/** The gateway port every namespace is served behind. */
const GATEWAY_PORT = 9000;

/**
 * Resolution order: an explicit flag (`--base`, or the `--url` / `--origin`
 * aliases the pre-move scripts used) → `$SINGULARITY_E2E_BASE` → the current
 * worktree's own namespace. Trailing slashes are stripped so callers can always
 * concatenate a leading-slash path.
 */
export function baseUrl(): string {
  const explicit = arg("base") ?? arg("url") ?? arg("origin");
  const raw =
    explicit ?? process.env.SINGULARITY_E2E_BASE ?? defaultWorktreeBase();
  return raw.replace(/\/+$/, "");
}

function defaultWorktreeBase(): string {
  const name = process.env.SINGULARITY_WORKTREE ?? basename(REPO_ROOT);
  return `http://${name}.localhost:${GATEWAY_PORT}`;
}

/** `baseUrl()` joined to an app path, with exactly one slash between them. */
export function pathUrl(path: string): string {
  return `${baseUrl()}/${path.replace(/^\/+/, "")}`;
}
