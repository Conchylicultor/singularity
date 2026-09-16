import { namespaceUrl } from "@plugins/infra/plugins/namespace/core";
import { checkoutNamespace } from "@plugins/infra/plugins/paths/server";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { fillSegment } from "@plugins/primitives/plugins/pane/core";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import { prototypeUrl, type OptionPicks } from "../core";

// Where a minted prototype can be LOOKED AT, which is the only thing a
// prototype is for — so both verbs print it.
//
// Derived, never literal. `namespaceUrl` owns `.localhost:9000`
// (`no-hand-built-namespace-url` enforces that), `prototypesApp.basePath` owns
// `/prototypes`, and `fillSegment` applies the same per-segment encoding the
// web router does. What is spelled here and nowhere else is the pane's own
// `proto/:name/:stage?` segment: it is declared in `gallery/web`, which a CLI
// process must not import (React in a terminal verb), so this one literal is
// the seam.
// `present/e2e/present-verify.ts` carries the same literal for the same reason.

/**
 * The detail pane's route segment, as `gallery/web/panes.tsx` declares it. No
 * `stage` is filled, so the URL is the bare one: whichever stage sorts first.
 */
const DETAIL_SEGMENT = "proto/:name/:stage?";

/**
 * Resolve this checkout's namespace ONCE, and hand back the formatter —
 * `prototypeUrl(id)` → `http://<ns>.localhost:9000/prototypes/proto/<id>`.
 *
 * A factory rather than a per-id function because resolving the namespace shells
 * out to git, and `prototype list` formats a URL for every prototype on disk.
 */
export async function prototypeUrlFormatter(): Promise<(id: string) => string> {
  const at = await checkoutUrl();
  return (id) =>
    at(
      `${prototypesApp.basePath}/${fillSegment(DETAIL_SEGMENT, { name: id }).join("/")}`,
    );
}

/**
 * The raw DOCUMENT of one variant of a prototype, on this checkout's origin —
 * `http://<ns>.localhost:9000/api/prototypes/<id>/index.html?palette=azure`.
 * Built by the one document-URL builder the frames use (`prototypeUrl`), so the
 * terminal's link and the pane's frame name a variant the same way. Loading it
 * renders that variant and writes nothing: the server stamps the query onto
 * the page, the user's picks stay as they are.
 */
export async function prototypeDocumentUrlFormatter(): Promise<{
  /** The path on the origin — what `screenshot.ts --path` takes. */
  path: (id: string, picks: OptionPicks) => string;
  /** The whole URL. */
  url: (id: string, picks: OptionPicks) => string;
}> {
  const at = await checkoutUrl();
  const path = (id: string, picks: OptionPicks) => prototypeUrl(id, { picks });
  return { path, url: (id, picks) => at(path(id, picks)) };
}

/**
 * `path` → `http://<ns>.localhost:9000<path>`, on this checkout's namespace.
 *
 * The namespace is minted from the CHECKOUT the command runs in, never from a
 * RUNTIME namespace: a CLI process declares none, and asking for one throws.
 * `checkoutNamespace` is
 * that mint: it asks git which checkout this root is and applies the elision
 * rule, so neither half is spelled again here.
 */
async function checkoutUrl(): Promise<(path: string) => string> {
  const ns = await checkoutNamespace(await getWorktreeRoot());
  return (path) => namespaceUrl(ns, path);
}
