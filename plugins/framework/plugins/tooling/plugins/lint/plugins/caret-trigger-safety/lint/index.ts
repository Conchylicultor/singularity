import noAdhocCaretTrigger from "./no-adhoc-caret-trigger";

export default {
  name: "caret-trigger-safety",
  rules: {
    "no-adhoc-caret-trigger": noAdhocCaretTrigger,
  },
  ignores: {
    // The caret-trigger primitive is the one sanctioned home for the idiom: the
    // hook owns the update listener, `scanTrigger` owns the `lastIndexOf`.
    "no-adhoc-caret-trigger": [
      "plugins/primitives/plugins/text-editor/plugins/caret-trigger/web/internal/use-caret-trigger.ts",
    ],
  },
};
