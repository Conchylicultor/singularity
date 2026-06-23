import { useCallback, useRef } from "react";

/**
 * Mirror the latest `value` into a ref, written **during render** so the ref is
 * already current the instant a callback / effect / event handler reads it
 * (no post-commit lag, unlike an effect-write).
 *
 * THE single sanctioned home for the "latest-value ref" idiom
 * (`const r = useRef(x); r.current = x`), which was hand-rolled across the
 * codebase. Read `ref.current` **only** outside render (callbacks, effects,
 * rAF, event handlers) — during render, read `value` directly. For several
 * values, pass an object literal: `useLatestRef({ a, b })` (its identity churns
 * every render anyway; only `.current.field` is read in callbacks).
 *
 * Carries the one `react-hooks/refs` exemption for this whole class, so every
 * call site stays clean and the rule can be enforced at `error`.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-value sync: the write is in render BY DESIGN so the ref is current before any callback/effect reads it, and `.current` is never read during render. The one home for the idiom hand-rolled across the codebase.
  ref.current = value;
  return ref;
}

/**
 * A referentially **stable** callback whose body always sees the latest closure.
 * Built on {@link useLatestRef}: the returned function identity never changes,
 * but each call dispatches to the most recent `fn`. Use for callbacks handed to
 * long-lived effects / external stores / memoized children that must not churn
 * when `fn`'s captured deps change.
 *
 * Only for a **pure pass-through** wrapper; if the callback needs extra
 * render-derived logic, compose `useLatestRef` + `useCallback` directly.
 */
export function useEventCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useLatestRef(fn);
  return useCallback((...args: A) => ref.current(...args), [ref]);
}
