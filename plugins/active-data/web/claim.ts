import type { ComponentType } from "react";

/**
 * The answer a `display:"code"` contribution gives when the host asks "is this
 * backticked token yours?".
 *
 * Three arms, mirroring live-state's two-channel model:
 *
 * - `pending`  — no trustworthy answer yet (I/O in flight). The host renders the
 *   plain terminal `<code>` and does **not** consult the next candidate: a level
 *   below a still-loading one would mount, fire its own I/O, and be discarded the
 *   moment the answer lands.
 * - `declined` — a determinate non-answer, with a reason. The host moves on to the
 *   next syntactic candidate.
 * - `claimed`  — resolved; the host renders the contribution's component with the
 *   value the claim produced.
 *
 * There is deliberately no "I couldn't handle this, here's a plain code element"
 * arm: rendering a fallback is the host's job, so a contributor cannot publish a
 * decline as an absorbable success (the defect this protocol replaces).
 */
export type CodeClaim<T> =
  | { status: "pending" }
  | { status: "declined"; reason: string }
  | { status: "claimed"; value: T };

const PENDING: CodeClaim<never> = { status: "pending" };

/** No trustworthy answer yet — the host renders the terminal `<code>` and stops. */
export function claimPending<T>(): CodeClaim<T> {
  return PENDING;
}

/** A determinate non-answer — the host consults the next candidate. */
export function declined<T>(reason: string): CodeClaim<T> {
  return { status: "declined", reason };
}

/** Resolved — the host renders this contribution's component with `value`. */
export function claimed<T>(value: T): CodeClaim<T> {
  return { status: "claimed", value };
}

/**
 * The semantic half of a `display:"code"` contribution: the hook that decides,
 * paired with the component that is unreachable except on a claim.
 *
 * The two halves are sealed together by `codeTag()` (in `./slots`) precisely so a
 * contributor cannot supply a component reachable without a claim — `component`
 * takes the very `T` that `useClaim` produces, so "matched syntactically but
 * cannot resolve" has no representable rendering.
 */
export interface CodeResolver<T> {
  useClaim: (text: string) => CodeClaim<T>;
  component: ComponentType<{ content: string; value: T }>;
}
