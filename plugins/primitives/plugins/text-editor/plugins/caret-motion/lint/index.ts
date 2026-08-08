import noUnannouncedCaretMove from "./no-unannounced-caret-move";

export default {
  name: "caret-motion",
  rules: {
    "no-unannounced-caret-move": noUnannouncedCaretMove,
  },
  // No `ignores`, deliberately: every horizontal-arrow handler is a caret mover
  // (or an observer), so there is no sanctioned home to exempt — not even this
  // plugin, which names no arrow command.
};
