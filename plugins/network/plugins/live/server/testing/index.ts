// A collection's compiled specs (window, `:rows`, `:groups`) without
// registering them — so a suite in another plugin can serve a REAL collection
// declaration against its own throwaway database and runtime tuples (the
// reports producer oracle), exactly as `serveCollection` compiles it.
export { compileCollection } from "../internal/serve-collection";
