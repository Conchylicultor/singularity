import noAdhocCaretTrigger from "./no-adhoc-caret-trigger";

export default {
  name: "caret-trigger-safety",
  rules: {
    "no-adhoc-caret-trigger": noAdhocCaretTrigger,
  },
  ignores: {
    // The caret-trigger primitive is the one sanctioned home for the idiom: the
    // hook owns the update listener, `scanTrigger` owns the `lastIndexOf`, and
    // `CaretTriggerMenu` owns the `FloatingSurface` panel. The menu component is
    // a *required* entry, not a defensive one: `FloatingSurface` is another
    // plugin, so the primitive must reach it through the barrel the rule reads,
    // and the component takes the keyboard model as a prop rather than calling
    // `useCaretMenu` itself — the split the primitive exists to enforce.
    "no-adhoc-caret-trigger": [
      "plugins/primitives/plugins/text-editor/plugins/caret-trigger/web/internal/use-caret-trigger.ts",
      "plugins/primitives/plugins/text-editor/plugins/caret-trigger/web/components/caret-trigger-menu.tsx",
    ],
  },
};
