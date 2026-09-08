// Wraps a core regex source in boundary guards for inline active-data patterns.
// Negative lookbehind for `/` excludes path segments and URL subdomains;
// the trailing guards exclude path separators and dotted suffixes. All inline
// ID patterns should use this so boundary fixes apply uniformly.
//
// The dot guard is deliberately NOT a bare `(?!\.)`: a dot after an id is a
// suffix only when something word-like follows it (`proto-….html`,
// `att-….localhost:9000`). A dot followed by anything else is the full stop of
// the sentence the id was written in — `…on the Trimmed page of proto-….` — and
// refusing that one silently switched the chip off for every id that happened
// to end its sentence, which is where ids most often land.
export function inlineBoundary(corePattern: RegExp): RegExp {
  return new RegExp(
    `(?<!\\/)${corePattern.source}(?!\\/)(?!\\.[0-9A-Za-z])\\b`,
    "g",
  );
}
