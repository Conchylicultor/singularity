// A collection's compiled specs (window, `:rows`, `:groups` — or, declared
// `all`, the whole ordered set and `:rows`) without registering them — so a
// suite in another plugin can serve a REAL collection declaration against its
// own throwaway database and runtime tuples (the reports producer oracle; the
// P8 conversions' parity and oracle suites), exactly as `serveCollection`
// compiles it.
export { compileCollection } from "../internal/serve-collection";
// A union collection's three compiled server halves without registering — so
// an arm's own suite can read what its binding routes (the backup arm's
// route-column provenance), exactly as `serveUnionCollection` compiles it.
export { compileUnion } from "../internal/serve-union";
// The C39 old-bundle check: what a tab still running a bundle that declared a
// key with a param-less legacy descriptor gets when it subscribes `{}` against
// the entry the key is served by now (a `liveCollection(key, { all })` one) —
// the verdict it is refused with, or the payload parsed with its OLD schema.
// The P8 conversions (`task-categories`, `tasks`) run it against their real keys.
export { subscribeAsOldDescriptor } from "./old-subscription";
export type { OldDescriptor, OldSubscription } from "./old-subscription";
