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
      const total = passed + failures.length;
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
