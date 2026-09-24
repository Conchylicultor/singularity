import { GUARDS } from "./registry";

/**
 * Every bypass file a registered guard honours (`.allow-main`, …), sorted and
 * deduped. Derived from the registry, so a new guard's bypass file is known to
 * every reader — the conversation view's "bypass active" chip — with no edit
 * there.
 */
export const BYPASS_TOKENS: readonly string[] = [
  ...new Set(GUARDS.flatMap((g) => (g.bypassToken ? [g.bypassToken] : []))),
].sort();
