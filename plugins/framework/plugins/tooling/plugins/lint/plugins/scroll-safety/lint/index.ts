import noAdhocScrollIntoView from "./no-adhoc-scroll-into-view";
import noAdhocScrollWrite from "./no-adhoc-scroll-write";

export default {
  name: "scroll-safety",
  rules: {
    "no-adhoc-scroll-into-view": noAdhocScrollIntoView,
    "no-adhoc-scroll-write": noAdhocScrollWrite,
  },
  ignores: {
    // The scroll-reveal primitive is the one sanctioned home for the idiom.
    "no-adhoc-scroll-into-view": [
      "plugins/primitives/plugins/dom/plugins/scroll-reveal/web/internal/use-reveal-on-active.ts",
    ],
    // The auto-scroll primitive is the one sanctioned home for raw scroll
    // writes — the whole plugin, so a new scroll role added there is covered.
    "no-adhoc-scroll-write": [
      "plugins/primitives/plugins/dom/plugins/auto-scroll/web/**",
    ],
  },
};
