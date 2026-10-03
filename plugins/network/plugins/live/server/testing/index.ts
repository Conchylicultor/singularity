// A collection's compiled specs (window, `:rows`, `:groups`) without
// registering them — so a suite in another plugin can serve a REAL collection
// declaration against its own throwaway database and runtime tuples (the
// reports producer oracle), exactly as `serveCollection` compiles it.
export { compileCollection } from "../internal/serve-collection";
// A union collection's three compiled server halves without registering — so
// an arm's own suite can read what its binding routes (the backup arm's
// route-column provenance), exactly as `serveUnionCollection` compiles it.
export { compileUnion } from "../internal/serve-union";
