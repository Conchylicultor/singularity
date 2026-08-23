import {
  MAIN_COMPOSITION_ID,
  namespaceFor,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import { checkoutRef } from "@plugins/infra/plugins/paths/server";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { fillSegment } from "@plugins/primitives/plugins/pane/core";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";

// Where a minted prototype can be LOOKED AT, which is the only thing a
// prototype is for — so both verbs print it.
//
// Derived, never literal. `namespaceUrl` owns `.localhost:9000`
// (`no-hand-built-namespace-url` enforces that), `prototypesApp.basePath` owns
// `/prototypes`, and `fillSegment` applies the same per-segment encoding the
// web router does. What is spelled here and nowhere else is the pane's own
// `proto/:name` segment: it is declared in `gallery/web`, which a CLI process
// must not import (React in a terminal verb), so this one literal is the seam.
// `present/e2e/present-verify.ts` carries the same literal for the same reason.

/** The detail pane's route segment, as `gallery/web/panes.tsx` declares it. */
const DETAIL_SEGMENT = "proto/:name";

/**
 * Resolve this checkout's namespace ONCE, and hand back the formatter —
 * `prototypeUrl(id)` → `http://<ns>.localhost:9000/prototypes/proto/<id>`.
 *
 * A factory rather than a per-id function because resolving the namespace shells
 * out to git, and `prototype list` formats a URL for every prototype on disk.
 *
 * The namespace is minted from the CHECKOUT the command runs in, never from
 * `SINGULARITY_WORKTREE`: the CLI does not set that variable for itself, so
 * reading it would print main's URL from every worktree. `checkoutRef` is the
 * one place the "is this the main checkout?" comparison is made, and
 * `namespaceFor` the one place the elision rule lives.
 */
export async function prototypeUrlFormatter(): Promise<(id: string) => string> {
  const ns = namespaceFor(
    MAIN_COMPOSITION_ID,
    await checkoutRef(await getWorktreeRoot()),
  );
  return (id) =>
    namespaceUrl(
      ns,
      `${prototypesApp.basePath}/${fillSegment(DETAIL_SEGMENT, { name: id }).join("/")}`,
    );
}
