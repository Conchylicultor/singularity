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
      "plugins/primitives/plugins/scroll-reveal/web/internal/use-reveal-on-active.ts",
    ],
    // The auto-scroll primitive is the one sanctioned home for raw scroll writes.
    "no-adhoc-scroll-write": [
      "plugins/primitives/plugins/auto-scroll/web/use-sticky-scroll.ts",
      "plugins/primitives/plugins/auto-scroll/web/scroll-to-bottom.ts",
      "plugins/primitives/plugins/auto-scroll/web/scroll-child-into-view.ts",
    ],
  },
};
