// The composition-name vocabulary: what a composition may be CALLED, and which
// of those names a composition may also be SERVED under.
//
// This file has ZERO imports on purpose. Build-time tooling (codegen, the CLI,
// the checks), the server, and the browser all need to ask the same questions —
// "is this a legal composition id?" and "may compose-serve provision a namespace
// for it?" — and a module with no imports is reachable from every one of those
// runtimes. The vocabulary used to live in codegen's `plugin-registry-gen.ts`,
// which imports `fs` at module scope, so web and server could not reach it and
// each hand-rolled its own approximation.

// Composition ids double as gateway namespaces and per-name registry file
// segments — same charset as the gateway's name regex (gateway/registry.go),
// which also makes them path-safe by construction. This is the canonical TS
// copy of the gateway name rule; the one place that cannot import it
// (`framework/server-core/bin/select-registry.ts` — boot cannot import
// config_v2) carries a KEEP IN SYNC comment pointing here.
export const COMPOSITION_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The id of the composition the repo itself builds — the main app.
 *
 * It is spelled the same as `MAIN_WORKTREE_NAME`
 * (`@plugins/infra/plugins/paths/core`), but only by the elision rule of the
 * target model: the main app's composition happens to be served out of the main
 * checkout, so the two names coincide at that one point. They are two different
 * axes — a composition is a subset of plugins, a worktree is a checkout of the
 * repo — and a later phase owns the relation between them. Deliberately NOT
 * aliased to, or imported alongside, `MAIN_WORKTREE_NAME`: aliasing them would
 * assert an identity that does not hold in general.
 */
export const MAIN_COMPOSITION_ID = "singularity";

/**
 * Namespaces a composition can never claim: the central runtime, the main app
 * namespace, and the main git branch. Enforced by the compose-serve stage, the
 * serve-composition reset guard and the `composition-closure` check.
 *
 * `MAIN_COMPOSITION_ID` is in here and stays in here. Main IS a composition —
 * `assertCompositionId` accepts it — but its namespace belongs to main's own
 * build, so compose-serve may never provision it.
 */
export const RESERVED_COMPOSITION_NAMESPACES: ReadonlySet<string> = new Set([
  "central",
  MAIN_COMPOSITION_ID,
  "main",
]);

/** A name a composition may be called — the charset/length rule, nothing more. */
export function assertCompositionName(name: string): void {
  if (!COMPOSITION_NAME_RE.test(name)) {
    throw new Error(
      `Invalid composition name "${name}" — must match ${COMPOSITION_NAME_RE}.`,
    );
  }
}

/**
 * Non-throwing "may compose-serve provision a namespace for this id?". The
 * predicate form is what a render path needs — the Studio compositions list
 * disables main's serve toggle rather than crashing on it — and what the
 * activated-set derivation filters with.
 */
export function isServableCompositionId(id: string): boolean {
  return (
    COMPOSITION_NAME_RE.test(id) && !RESERVED_COMPOSITION_NAMESPACES.has(id)
  );
}

/** A composition id that is also servable as a gateway namespace. */
export function assertServableCompositionNamespace(name: string): void {
  assertCompositionName(name);
  if (RESERVED_COMPOSITION_NAMESPACES.has(name)) {
    throw new Error(
      `Composition name "${name}" is a reserved namespace ` +
        `(${[...RESERVED_COMPOSITION_NAMESPACES].join(", ")}) — it can never be served.`,
    );
  }
}

/**
 * A legal composition id — the split between "named" and "served", in one
 * function.
 *
 * Every composition must have a valid name. Every composition EXCEPT main's must
 * additionally own a servable namespace, because compose-serve will provision
 * one for it the moment its `autoBuild` is on. Main's composition is the sole
 * exception: it is built by `./singularity build` into the main checkout's own
 * namespace, never compose-served, so it may carry a reserved id.
 *
 * Use this wherever an id is being validated as a manifest entry. Use
 * `assertServableCompositionNamespace` only where a namespace is about to be
 * provisioned or wiped — the two are no longer the same question.
 */
export function assertCompositionId(id: string): void {
  assertCompositionName(id);
  if (id === MAIN_COMPOSITION_ID) return;
  assertServableCompositionNamespace(id);
}
