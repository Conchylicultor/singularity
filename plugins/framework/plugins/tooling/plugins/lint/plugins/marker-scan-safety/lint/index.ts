import noAdhocMarkerScan from "./no-adhoc-marker-scan";
import noAdhocBindingScan from "./no-adhoc-binding-scan";

export default {
  name: "marker-scan-safety",
  rules: {
    "no-adhoc-marker-scan": noAdhocMarkerScan,
    // Sibling concern: a global `const <name> = <call>(` binding scanner run over
    // RAW (un-masked) source — the fully-unmasked twin of the `{ strings: false }`
    // footgun `no-adhoc-marker-scan` covers. Both route through `markerCallSpans`.
    "no-adhoc-binding-scan": noAdhocBindingScan,
  },
  ignores: {
    // `{ strings: false }` is sanctioned ONLY for a genuine token-in-string scan
    // (a token that lives inside a real string literal with no enclosing marker
    // call, where a full mask would erase the very thing being searched for) or
    // a careful dual-mask. Everywhere else, marker-value scans must full-mask +
    // read-by-offset via `findMarkerCalls`.
    "no-adhoc-marker-scan": [
      // Token-in-string: scans caller source for an `/api/<prefix>` URL that
      // legitimately lives inside caller string literals passed to fetch — there
      // is no enclosing marker call, so masking fully would erase the URL.
      "plugins/plugin-meta/plugins/facets/plugins/routes/facet/index.ts",
      // Dual-mask: statement structure (brace/semicolon depth) is detected on a
      // FULL mask; only the final statement text is sliced from the strings-kept
      // copy at identical offsets so downstream sees real module specifiers.
      "plugins/framework/plugins/tooling/plugins/checks/plugins/plugin-boundaries/check/parse.ts",
      // Unit tests of maskSource's `{ strings: false }` behavior itself.
      "plugins/plugin-meta/plugins/parse-utils/core/mask-source.test.ts",
      // Test fixtures exercising find-marker-calls / mask behavior.
      "plugins/plugin-meta/plugins/parse-utils/core/find-marker-calls.test.ts",
    ],
  },
};
