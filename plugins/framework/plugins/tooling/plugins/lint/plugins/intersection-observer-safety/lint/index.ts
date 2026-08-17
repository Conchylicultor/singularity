import noRawIntersectionObserver from "./no-raw-intersection-observer";

export default {
  name: "intersection-observer-safety",
  rules: {
    "no-raw-intersection-observer": noRawIntersectionObserver,
  },
  ignores: {
    // The in-view primitive is the one sanctioned home for the idiom.
    "no-raw-intersection-observer": [
      "plugins/primitives/plugins/in-view/web/internal/in-view.ts",
    ],
  },
};
