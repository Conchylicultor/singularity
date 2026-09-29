import hookBindingName from "./hook-binding-name";
import useFieldBranded from "./use-field-branded";

/**
 * Lint barrel for the hook-value rules. The root `eslint.config.ts`
 * auto-discovers this default export and registers each rule repo-wide as
 * `error`.
 *
 * Two rules, one invariant: **a hook carried as a value only ever lives under a
 * `use*` name.**
 *
 * - `use-field-branded` makes the hook visible to the type checker: a `use*`
 *   field of a function type must be declared `Hook<…>`.
 * - `hook-binding-name` makes the name follow the type: any binding whose type
 *   is `Hook<…>` must be named `use*`.
 *
 * `hook-binding-name` is enforced in test/e2e files too: a hook renamed there
 * breaks the same way (the compiler memoizes by name), and a test only ever
 * sees the brand through a type an app file already declared. The field rule
 * stays app-only — a test fixture's ad-hoc shape declares no public contract.
 *
 * A genuine one-off escapes per-site, with the reason next to the code:
 * `// eslint-disable-next-line hook-value/<rule> -- <reason>`.
 */
export default {
  name: "hook-value",
  rules: {
    "hook-binding-name": hookBindingName,
    "use-field-branded": useFieldBranded,
  },
  enforceEverywhere: ["hook-binding-name"],
};
