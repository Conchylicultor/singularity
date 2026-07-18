import noAdhocScrollIntoView from "./no-adhoc-scroll-into-view";

export default {
  name: "scroll-reveal-safety",
  rules: {
    "no-adhoc-scroll-into-view": noAdhocScrollIntoView,
  },
  ignores: {
    // The scroll-reveal primitive is the one sanctioned home for the idiom.
    "no-adhoc-scroll-into-view": [
      "plugins/primitives/plugins/scroll-reveal/web/internal/use-reveal-on-active.ts",
    ],
  },
};
