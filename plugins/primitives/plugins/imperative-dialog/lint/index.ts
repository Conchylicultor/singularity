import noNativeDialog from "./no-native-dialog";

/**
 * Lint barrel for the imperative-dialog rules. The root eslint.config.ts
 * auto-discovers this default export (via lint.generated.ts) and registers
 * `imperative-dialog/no-native-dialog` repo-wide as error.
 *
 * `ignores` is empty: the rule is scope-precise (fires only on the ambient globals,
 * never a local/imported binding of the same name), so no file needs a blanket
 * exemption — a genuine one-off escapes per-site via
 * `// eslint-disable-next-line imperative-dialog/no-native-dialog -- <reason>`.
 */
export default {
  name: "imperative-dialog",
  rules: {
    "no-native-dialog": noNativeDialog,
  },
  ignores: {
    "no-native-dialog": [],
  },
};
