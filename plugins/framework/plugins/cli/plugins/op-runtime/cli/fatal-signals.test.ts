import { expect, test } from "bun:test";
import {
  FATAL_SIGNAL_EXITS,
  installFatalSignalExit,
  type FatalSignal,
} from "./fatal-signals";

/**
 * Install, run `body`, then remove exactly the listeners this install added —
 * so a test never leaves the runner holding a handler that would `process.exit`
 * on a later signal.
 */
function withInstalled(
  options: Parameters<typeof installFatalSignalExit>[0],
  body: () => void,
): void {
  const before = new Map<FatalSignal, ReadonlySet<unknown>>(
    FATAL_SIGNAL_EXITS.map(([sig]) => [sig, new Set(process.listeners(sig))]),
  );
  try {
    installFatalSignalExit(options);
    body();
  } finally {
    for (const [sig] of FATAL_SIGNAL_EXITS) {
      const previous = before.get(sig)!;
      for (const listener of process.listeners(sig)) {
        if (!previous.has(listener)) {
          process.removeListener(
            sig,
            listener as (signal: FatalSignal) => void,
          );
        }
      }
    }
  }
}

test("the signal→exit-code map is 128 + signo, and has no uncatchable member", () => {
  expect(Object.fromEntries(FATAL_SIGNAL_EXITS)).toEqual({
    SIGINT: 130,
    SIGTERM: 143,
    SIGHUP: 129,
    SIGQUIT: 131,
  });
  const signals = FATAL_SIGNAL_EXITS.map(([sig]) => sig as string);
  expect(signals).not.toContain("SIGKILL");
  expect(signals).not.toContain("SIGSTOP");
});

test("installs one listener per signal", () => {
  withInstalled({}, () => {
    for (const [sig] of FATAL_SIGNAL_EXITS) {
      expect(process.listeners(sig).length).toBeGreaterThan(0);
    }
  });
});

// The ordering the whole seam exists for: Bun sigactions lazily on the FIRST
// process.on(sig) and does not chain, so a native tap armed before that call is
// silently overwritten. afterInstall must therefore observe every listener as
// already registered.
test("afterInstall runs after every process.on, and is given the full signal set", () => {
  const listenerCounts = new Map<FatalSignal, number>();
  let seen: readonly FatalSignal[] | null = null;
  withInstalled(
    {
      afterInstall: (signals) => {
        seen = signals;
        for (const sig of signals)
          listenerCounts.set(sig, process.listeners(sig).length);
      },
    },
    () => {
      expect(seen).not.toBeNull();
      expect(seen).toEqual(FATAL_SIGNAL_EXITS.map(([sig]) => sig));
      for (const [sig] of FATAL_SIGNAL_EXITS) {
        expect(listenerCounts.get(sig) ?? 0).toBeGreaterThan(0);
      }
    },
  );
});

// The listener records first and exits second, so a command's onSignal always
// runs while the process is still alive — which is what lets build.ts stamp the
// signal onto its receipt before the exit hooks fire.
test("onSignal fires with the signal and its exit code, before process.exit", () => {
  const calls: Array<[FatalSignal, number]> = [];
  const realExit = process.exit;
  withInstalled({ onSignal: (sig, code) => calls.push([sig, code]) }, () => {
    // A holder rather than a `let`: TS narrows a closure-assigned `let` to its
    // initializer type in the enclosing scope, which would make the assertion
    // below unwritable.
    const exit: { code: number | null } = { code: null };
    // @ts-expect-error — replacing a `never`-returning builtin for the test.
    process.exit = (code: number) => {
      exit.code = code;
    };
    try {
      const listener = process.listeners("SIGTERM").at(-1) as () => void;
      listener();
    } finally {
      process.exit = realExit;
    }
    expect(calls).toEqual([["SIGTERM", 143]]);
    expect(exit.code).toBe(143);
  });
});
