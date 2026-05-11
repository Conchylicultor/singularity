import tsPlugin from "@typescript-eslint/eslint-plugin";

const original = tsPlugin.rules!["no-floating-promises"];

const GUIDANCE =
  "\n\nDo NOT silently swallow errors with .catch(() => {}) or .catch(console.error) — this hides bugs." +
  "\n\nFix: (1) `await` the promise, (2) `.catch()` with a specific handler that re-throws unknown errors, " +
  "or (3) prefix with `void` for intentional fire-and-forget (errors still surface via the global " +
  "unhandledrejection handler). See CLAUDE.md § Promise handling.";

export default {
  ...original,
  meta: {
    ...original.meta,
    messages: Object.fromEntries(
      Object.entries(original.meta.messages).map(([id, msg]) =>
        [id, id.startsWith("floatingFix") ? msg : msg + GUIDANCE],
      ),
    ),
  },
};
