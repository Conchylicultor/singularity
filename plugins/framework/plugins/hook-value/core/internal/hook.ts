/**
 * A React hook carried as a value — a field, prop, parameter or variable that
 * holds a hook and is called later.
 *
 * Every binding of this type must be named `use*` (lint:
 * `hook-value/hook-binding-name`). The React Compiler and `rules-of-hooks`
 * recognise a hook by its NAME alone: a hook called as `resolve(params)` is
 * treated as a pure function, its result memoized on its arguments, and on a
 * cache hit the hook's own hooks are skipped — the next hook lands on the wrong
 * slot (React #311). The brand is what lets the type checker see that a value
 * is a hook, so a rename that drops the `use` prefix is caught.
 *
 * The brand is OPTIONAL, so any plain function (a `useFoo` declaration, an
 * inline arrow) is assignable without a cast; the declared/inferred type still
 * carries `__hook`, which is all the lint reads.
 */
export type Hook<F extends (...args: never[]) => unknown> = F & {
  readonly __hook?: true;
};
