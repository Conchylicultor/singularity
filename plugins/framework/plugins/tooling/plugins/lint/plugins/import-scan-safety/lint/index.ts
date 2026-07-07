import noAdhocImportScan from "./no-adhoc-import-scan";

export default {
  name: "import-scan-safety",
  rules: {
    "no-adhoc-import-scan": noAdhocImportScan,
  },
  ignores: {
    // `findImports` is the one sanctioned home for a whole-file static-import
    // scanner — it owns the FROM_RE / SIDE_EFFECT_RE shapes this rule forbids
    // everywhere else.
    "no-adhoc-import-scan": [
      "plugins/plugin-meta/plugins/parse-utils/core/find-imports.ts",
    ],
  },
};
