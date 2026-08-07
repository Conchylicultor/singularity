/**
 * The SYNTACTIC gate for a backticked commit sha.
 *
 * Anchored rather than built with `inlineBoundary`: that helper guards SUBSTRING
 * scanning in prose, and the `display:"code"` path already requires a full-string
 * match — the boundary assertions would be dead weight.
 *
 * Bounds: **7** is git's minimum `%h` abbreviation (the shortest sha a tool will
 * ever hand a human), **40** is a full SHA-1.
 *
 * The `(?=.*[a-f])` lookahead is the load-bearing part. Digits are a subset of
 * hex, so without it every backticked all-digit token — a request id, a port, a
 * count — becomes an HTTP commit lookup per code span. It costs the ~3.4% of real
 * 7-char shas that happen to be all digits; those fall through as plain code.
 * Deliberately asymmetric: a false negative is invisible, a false positive is a
 * request.
 */
export const COMMIT_SHA_RE = /^(?=.*[a-f])[0-9a-f]{7,40}$/;
