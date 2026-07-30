/**
 * Pass/fail reporting for e2e scripts.
 *
 * The pre-move scripts each reimplemented a `check()` logger, in two mutually
 * incompatible shapes — `check(name, ok, detail)` (predicate) and
 * `check(label, actual, expected)` (equality) — with four different endings
 * (`process.exit(1)` on a boolean AND; a `FAILURES: n` line; a joined failure
 * array; and one script that printed mismatches and exited 0 regardless).
 *
 * The two shapes cannot be safely overloaded on arity: `check("x", true, "d")`
 * and `check("x", true, true)` are indistinguishable. So they become two named
 * methods on one object, sharing a single failure counter and a single exit path.
 */

import { drainDiagnostics } from "./diagnostics";

/**
 * Async errors with nowhere to land, collected process-wide.
 *
 * `finish()` ends the run with an explicit `process.exit(0)` when every
 * assertion passed. That exit code WINS over the one the runtime would have set
 * on its own — so an unhandled rejection printed to stderr at second 4 was
 * followed, at second 9, by `ALL CHECKS PASSED` and exit 0. Anything that threw
 * outside the script's own `await` chain was invisible to the verdict: a route
 * handler, a listener, a detached promise in a helper.
 *
 * That is the same failure `promise-safety`'s rules exist to prevent — a script
 * that goes green while asserting nothing — so an unhandled rejection is a
 * FAILURE here, not a diagnostic. A verification script that reports success is
 * cited as evidence; it must not be able to do that with an error in flight.
 *
 * Installing a listener suppresses the runtime's own reporting, so the handler
 * prints the error itself. `uncaughtException` is deliberately NOT intercepted:
 * a listener there would keep a process running past a genuinely fatal error,
 * and an uncaught throw already fails the run loudly on its own.
 *
 * Known limit: a rejection is delivered on a later tick, so one raised after the
 * script's final `await` can still land after `finish()` has exited. Everything
 * raised during the run — which is every case this is aimed at — is caught.
 */
const asyncFailures: string[] = [];
let watchingAsyncFailures = false;

function watchAsyncFailures(): void {
  if (watchingAsyncFailures) return;
  watchingAsyncFailures = true;
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const line = `unhandled rejection — ${err.message}`;
    asyncFailures.push(line);
    console.log(`FAIL  ${line}`);
    // A few frames of provenance: which handler / helper the throw came from is
    // the whole question when the throw happened outside the script's own flow.
    if (err.stack) {
      for (const frame of err.stack.split("\n").slice(1, 4)) {
        console.log(`      ${frame.trim()}`);
      }
    }
  });
}

export interface Report {
  /** Predicate form. `detail` is printed only on failure. */
  ok(name: string, condition: boolean, detail?: string): void;
  /** Equality form. Prints got/want on failure. */
  eq(name: string, actual: unknown, expected: unknown): void;
  /** Unconditional failure — for a branch that should have been unreachable. */
  fail(name: string, detail?: string): void;
  /** A transcript line that is not itself an assertion. */
  note(line: string): void;
  readonly failures: readonly string[];
  /** Print the summary and exit 0 (all passed) or 1 (any failed). Never returns. */
  finish(): never;
}

export function report(title?: string): Report {
  const failures: string[] = [];
  let passed = 0;
  watchAsyncFailures();
  if (title) console.log(`\n=== ${title} ===`);

  const record = (name: string, detail?: string): void => {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  return {
    failures,

    ok(name, condition, detail) {
      if (condition) {
        passed++;
        console.log(`ok    ${name}`);
      } else {
        record(name, detail);
      }
    },

    eq(name, actual, expected) {
      // JSON equality: every pre-move call site compared primitives or values
      // the script had already JSON.stringify'd by hand.
      if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++;
        console.log(`ok    ${name}`);
      } else {
        record(
          name,
          `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`,
        );
      }
    },

    fail(name, detail) {
      record(name, detail);
    },

    note(line) {
      console.log(`      ${line}`);
    },

    finish(): never {
      // Fold in anything that threw outside the script's own await chain. These
      // already printed a FAIL line when they were caught; adding them here is
      // what stops the run exiting 0 with an error in flight.
      failures.push(...asyncFailures);
      const total = passed + failures.length;

      // Non-fatal notices (a screenshot that could not be written, say) are
      // surfaced but never counted: a diagnostic must not decide the verdict of
      // a run whose assertions are green.
      const diagnostics = drainDiagnostics();
      if (diagnostics.length > 0) {
        console.log(`\nDIAGNOSTICS (non-fatal): ${diagnostics.length}`);
        for (const d of diagnostics) console.log(`  - ${d}`);
      }

      if (failures.length === 0) {
        console.log(`\nALL CHECKS PASSED (${total})`);
        process.exit(0);
      }
      console.log(`\nFAILURES: ${failures.length}/${total}`);
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    },
  };
}
