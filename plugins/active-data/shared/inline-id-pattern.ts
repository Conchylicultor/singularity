// Wraps a core regex source in boundary guards for inline active-data patterns.
// Negative lookbehind for `/` excludes path segments and URL subdomains;
// negative lookahead for `/` and `.` excludes trailing path separators and
// domain suffixes. All inline ID patterns should use this so boundary fixes
// apply uniformly.
export function inlineBoundary(corePattern: RegExp): RegExp {
  return new RegExp(
    `(?<!\\/)${corePattern.source}(?![/.])\\b`,
    "g",
  );
}
