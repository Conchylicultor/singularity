import noAnonymousPassthrough from "./no-anonymous-passthrough";
import noUnanchoredPassthrough from "./no-unanchored-passthrough";

/**
 * Lint barrel for the passthrough rules. The root `eslint.config.ts`
 * auto-discovers this default export and registers each rule repo-wide as
 * `error`.
 *
 * Two rules, and together they are exhaustive over one promise: **everything a
 * caller spreads on a primitive lands on ONE node, and `ref` is that node's
 * name.**
 *
 * - `no-unanchored-passthrough` is the promise. It watches the rest binding
 *   inside a component whose props type is open, and holds the bag to one
 *   element — the element carrying `ref`.
 * - `no-anonymous-passthrough` is the GATE that makes the first one
 *   non-dodgeable. It rejects an inline `[key: string]: unknown` in a `*Props`
 *   declaration, so a props type cannot be open without also extending
 *   `Passthrough` — which is where `ref` is declared. Without it a new
 *   primitive could open a bag, expose no node at all, and satisfy the first
 *   rule vacuously: with nothing named `ref` to check against, "the bag is on
 *   the wrong element" is unaskable.
 *
 * So the pair reads: you may not open a passthrough without stating its
 * destination, and having stated it, you may not move the bag off it.
 *
 * ## No `ignores`
 *
 * There is no path allowlist, and none is needed — which is unusual enough to
 * be worth saying why.
 *
 * The definition site is normally the problem (`row/no-adhoc-row` has to exempt
 * `Row`'s own files, because no class-level test can tell the original from a
 * copy). Here it exempts itself by construction. `no-anonymous-passthrough`
 * fires only on declarations named `*Props`, and the marker this plugin owns is
 * called `Passthrough` — a name, not a props type, so the one index signature
 * that must exist is the one the rule cannot see. `splitPassthrough` is
 * likewise a plain function, not a component, and `no-unanchored-passthrough`
 * only ever looks inside one.
 *
 * The nine unrelated open records in the repo (the durable event payloads, the
 * plugin `Contribution` types) are untouched for the same reason: they are bags
 * of DATA, nothing spreads them onto an element, and their names say so.
 *
 * A genuine one-off escapes per-site, with the reason travelling next to the
 * code: `// eslint-disable-next-line passthrough/<rule> -- <reason>`.
 */
export default {
  name: "passthrough",
  rules: {
    "no-anonymous-passthrough": noAnonymousPassthrough,
    "no-unanchored-passthrough": noUnanchoredPassthrough,
  },
};
