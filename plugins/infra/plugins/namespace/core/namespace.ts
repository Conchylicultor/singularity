// Canonical namespace identity.
//
// A NAMESPACE is the one name that a deployed app answers to. It is the
// subdomain in `http://<ns>.localhost:9000`, the spec-dir basename under
// `~/.singularity/worktrees/<ns>/`, the socket stem `<ns>.sock`, the Postgres
// database, the config dir, and the `SINGULARITY_WORKTREE` a backend is spawned
// with. All of those are the SAME string, which is exactly why there must be
// only one function that decides what it is.
//
// This file has ZERO imports on purpose, for the same reason
// `plugin-meta/composition/core/namespace.ts` does: the build-time tooling, the
// CLI, the server and the browser all have to ask the same questions, and a
// module with no imports is reachable from every one of those runtimes.
//
// The gateway (Go) deliberately does NOT implement the rule below. It treats a
// namespace as an opaque directory key — it maps a Host header to a spec dir and
// never decomposes it — so the elision rule exists in TypeScript only and has no
// second implementation to drift from. The one thing both sides must agree on is
// the GRAMMAR, and that agreement is a check (`namespace:grammar-in-sync`), not
// a comment.

/**
 * A gateway namespace: subdomain, spec-dir basename, socket stem, DB name.
 *
 * Branded so it cannot be confused with the other identity that looks exactly
 * like it — a CHECKOUT name (`checkoutWorktreeName(root)`, a directory
 * basename). Those two are equal today for every agent worktree, and stop being
 * equal the moment a composition is served from a non-main checkout. The brand
 * is what turns that divergence into a `tsc` error instead of a wrong path.
 */
export type Namespace = string & { readonly __brand: "Namespace" };

/**
 * Which checkout a namespace is served from.
 *
 * A discriminated union rather than a nullable string on purpose. The main
 * checkout's directory basename happens to BE `"singularity"`, so a plain
 * `checkout: string` lets a caller pass that basename and silently mint
 * `sonata.singularity` — a namespace for a checkout that should have elided.
 * With this union that spelling does not exist. Minted by `checkoutRef(root)`
 * (`@plugins/infra/plugins/paths/server`), the one place the "is this the main
 * checkout?" comparison is made.
 */
export type CheckoutRef =
  | { readonly kind: "main" }
  | { readonly kind: "worktree"; readonly name: string };

/**
 * The id of the composition the repo itself builds — the main app.
 *
 * Lives here, rather than beside the rest of the composition vocabulary, because
 * `namespaceFor` needs it and `infra -> plugin-meta` is the wrong direction.
 * `plugin-meta/composition/core/namespace.ts` imports it from here; its
 * zero-import reachability is preserved because this leaf is itself zero-import.
 */
export const MAIN_COMPOSITION_ID = "singularity";

/** One DNS label: the charset that is also path-safe and Postgres-safe. */
export const NAMESPACE_LABEL_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * A whole namespace: one label, or two joined by a dot.
 *
 * Written as a per-label composition rather than by adding `.` to the charset,
 * because this shape structurally forbids the only ways a dotted name could stop
 * being a single safe path segment: `..`, an empty label, a leading dot, a
 * trailing dot.
 *
 * Capped at TWO labels. The model has exactly two axes — composition and
 * checkout — so a third label is not a thing that can be meant. The gateway's
 * own regex is deliberately looser (it validates path-safety, not meaning); the
 * semantic cap belongs here, where the axes are known.
 */
export const NAMESPACE_RE =
  /^[a-z0-9][a-z0-9-]{0,62}(\.[a-z0-9][a-z0-9-]{0,62})?$/;

/**
 * Mint the namespace for a (composition, checkout) pair — THE elision rule.
 *
 * | composition   | checkout    | namespace          |
 * |---------------|-------------|--------------------|
 * | `singularity` | main        | `singularity`      |
 * | `singularity` | `att-X`     | `att-X`            |
 * | `sonata`      | main        | `sonata`           |
 * | `sonata`      | `att-X`     | `sonata.att-X`     |
 *
 * Both sentinels elide, which is what preserves every URL in use today. The
 * cost is that a single label is AMBIGUOUS — `foo` could be composition `foo` on
 * main, or the main composition on checkout `foo`. That ambiguity is inherent,
 * not an artifact of this encoding: any scheme preserving both of today's URL
 * shapes maps two pairs onto one label. It is therefore PREVENTED rather than
 * decoded — see `namespaceCollision`
 * (`@plugins/infra/plugins/worktree/server`), which refuses whichever side tries
 * to claim an already-occupied name.
 *
 * There is deliberately no inverse. Decomposing a namespace back into its pair
 * would need the composition set at every call site, so instead the pair is
 * RECORDED where it is minted (`composition.json`'s `composition` + `checkout`).
 * Provenance on disk cannot be ambiguous; a name can.
 */
export function namespaceFor(
  composition: string,
  checkout: CheckoutRef,
): Namespace {
  if (!NAMESPACE_LABEL_RE.test(composition)) {
    throw new Error(
      `Invalid composition id "${composition}" — must match ${NAMESPACE_LABEL_RE}.`,
    );
  }
  if (checkout.kind === "worktree" && !NAMESPACE_LABEL_RE.test(checkout.name)) {
    throw new Error(
      `Invalid checkout name "${checkout.name}" — must match ${NAMESPACE_LABEL_RE}.`,
    );
  }

  const isMainComposition = composition === MAIN_COMPOSITION_ID;
  if (checkout.kind === "main") {
    // Main checkout: the suffix elides, so the namespace is just the
    // composition — including main's own, whose id IS the main namespace.
    return composition as Namespace;
  }
  if (isMainComposition) {
    // Main composition on a worktree: the prefix elides. This is the shape every
    // agent worktree has today (`att-XXX`).
    return checkout.name as Namespace;
  }
  return `${composition}.${checkout.name}` as Namespace;
}

/**
 * Validating cast at a serialization boundary — an env var, a spec-dir basename,
 * a DB row, a URL host.
 *
 * Unlike `asPluginId`, this VALIDATES rather than just casting. A namespace
 * becomes a filesystem path and a database name, so a malformed one is a hazard
 * rather than a display bug; the boundary is the right place to be loud.
 */
export function asNamespace(raw: string): Namespace {
  if (!NAMESPACE_RE.test(raw)) {
    throw new Error(
      `Invalid namespace "${raw}" — must match ${NAMESPACE_RE} ` +
        `(one or two dot-joined labels of [a-z0-9][a-z0-9-]*).`,
    );
  }
  return raw as Namespace;
}

/** Non-throwing twin of `asNamespace`, for render paths and untrusted input. */
export function isNamespace(raw: string): boolean {
  return NAMESPACE_RE.test(raw);
}

/** The port every browser-facing namespace is served on. */
export const GATEWAY_PORT = 9000;

/** The DNS suffix every namespace is served under. */
export const NAMESPACE_HOST_SUFFIX = ".localhost";

/**
 * The host authority for a namespace: `<ns>.localhost:9000`.
 *
 * Use this (or `namespaceUrl`) rather than interpolating `.localhost` by hand —
 * `no-hand-built-namespace-url` enforces it. Two dozen hand-built copies is how
 * the port and the suffix ended up spelled in two dozen places.
 */
export function namespaceHost(
  ns: Namespace,
  port: number = GATEWAY_PORT,
): string {
  return `${ns}${NAMESPACE_HOST_SUFFIX}:${port}`;
}

/**
 * The origin (plus optional path) a namespace is reachable at.
 *
 * `path` is appended verbatim and must start with `/` when present, so the
 * result is an origin when omitted and never a double slash when given.
 */
export function namespaceUrl(
  ns: Namespace,
  path = "",
  port: number = GATEWAY_PORT,
): string {
  if (path && !path.startsWith("/")) {
    throw new Error(`namespaceUrl path must start with "/" — got "${path}".`);
  }
  return `http://${namespaceHost(ns, port)}${path}`;
}

/**
 * Read a namespace back off a browser `location.host` (or any Host header).
 *
 * The TypeScript mirror of the gateway's `parseWorktree` (`gateway/proxy.go`),
 * and the reason the four hand-rolled copies of this — which disagreed with each
 * other AND with the gateway, one of them taking `host.split(".")[0]` — collapse
 * to one function. Returns `null` for the loopback hosts and anything not served
 * under `.localhost`, which is how "no namespace here" is spelled.
 */
export function namespaceFromHost(host: string): Namespace | null {
  let h = host;
  // Bracketed IPv6 (`[::1]:9000`) before the port strip, since it contains ':'.
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end >= 0) h = h.slice(1, end);
  } else {
    const i = h.lastIndexOf(":");
    if (i > 0) h = h.slice(0, i);
  }
  h = h.toLowerCase();
  // A fully-qualified host may carry a trailing root dot.
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return null;
  if (!h.endsWith(NAMESPACE_HOST_SUFFIX)) return null;
  const name = h.slice(0, -NAMESPACE_HOST_SUFFIX.length);
  return isNamespace(name) ? (name as Namespace) : null;
}
