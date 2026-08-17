/**
 * A class string that came out of the class-name channel. Structurally it IS a
 * string — assignable to `string`, to `className?: string`, to clsx's
 * `ClassValue` — so nothing downstream changes. What it is NOT is constructible
 * FROM a string: `const c: ClassName = "fixed inset-0"` is a type error, and
 * the only place in the repo that mints one is `cn()`.
 *
 * This is a RELOCATION, not a new check. A class literal in a data position is
 * invisible to every `no-adhoc-*` rule; branding the FIELD forces its author to
 * write `cn("…")`, which moves the literal into the `CallExpression` anchor
 * those rules already visit. No rule changes.
 *
 * The brand's value is the instruction, not a marker: TypeScript quotes it back
 * verbatim in the assignment error, so the diagnostic reads as what to do.
 */
export type ClassName = string & {
  readonly __className: "build class strings with cn()";
};
