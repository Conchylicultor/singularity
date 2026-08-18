// The composition-name vocabulary: what a composition may be CALLED, and which
// of those names a composition may also be SERVED under.
//
// This file's only import is `@plugins/infra/plugins/namespace/core`, which is
// itself zero-import — so the reachability that matters is preserved. Build-time
// tooling (codegen, the CLI, the checks), the server, and the browser all need to
// ask the same questions — "is this a legal composition id?" and "may
// compose-serve provision a namespace for it?" — and a module whose closure
// touches no runtime API is reachable from every one of those runtimes. The
// vocabulary used to live in codegen's `plugin-registry-gen.ts`, which imports
// `fs` at module scope, so web and server could not reach it and each
// hand-rolled its own approximation.

// A composition id is one LABEL of a namespace — `<composition>.<checkout>` joins
// two of them — and it is also a per-name registry file segment, which is what
// makes it path-safe by construction. So the grammar is NOT restated here: it is
// `NAMESPACE_LABEL_RE`, owned by the namespace plugin and pinned to the
// gateway's own regex by the `namespace:grammar-in-sync` check. Deliberately not
// re-exported under a composition-flavoured alias either — a second name for one
// rule is how the third copy got written last time.
import {
  MAIN_COMPOSITION_ID,
  NAMESPACE_LABEL_RE,
} from "@plugins/infra/plugins/namespace/core";

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
  if (!NAMESPACE_LABEL_RE.test(name)) {
    throw new Error(
      `Invalid composition name "${name}" — must match ${NAMESPACE_LABEL_RE}.`,
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
    NAMESPACE_LABEL_RE.test(id) && !RESERVED_COMPOSITION_NAMESPACES.has(id)
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
