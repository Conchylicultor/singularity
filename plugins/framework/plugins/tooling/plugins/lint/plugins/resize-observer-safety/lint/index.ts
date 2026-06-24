import noRawResizeObserver from "./no-raw-resize-observer";

export default {
  name: "resize-observer-safety",
  rules: {
    "no-raw-resize-observer": noRawResizeObserver,
  },
  ignores: {
    // The element-size primitive is the one sanctioned home for the idiom.
    "no-raw-resize-observer": [
      "plugins/primitives/plugins/element-size/web/internal/element-size.ts",
    ],
  },
};
