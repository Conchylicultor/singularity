import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";

/**
 * The globals whose presence means "this code is running in a browser". A
 * `bun:test` file that installs any of them is claiming a DOM the runner does
 * not have — and what it actually installs is a *partial* one.
 *
 * That partiality is the whole point, not a style preference. Runtime-agnostic
 * code branches on `typeof window === "undefined"`, a PRESENCE test: a
 * hand-built `window = { sessionStorage }` sails straight past every one of
 * those guards and then explodes on the first member the stub happens not to
 * carry — `window.history.state` in `primitives/app-instance`, which is what
 * this detector was written for. The crash lands far from the stub, inside a
 * module the suite is not even about, and the reach of the trap *grows* as the
 * guarded code grows.
 *
 * The fix is never to widen the stub: jsdom already is the complete one. Move
 * the suite to the plugin's `web/__tests__/`, where vitest supplies it whole.
 */
export const FAKE_DOM_GLOBALS: ReadonlySet<string> = new Set([
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "sessionStorage",
  "localStorage",
  "matchMedia",
  "getComputedStyle",
  "requestAnimationFrame",
  "customElements",
  "Element",
  "HTMLElement",
  "Node",
  "ResizeObserver",
  "IntersectionObserver",
  "MutationObserver",
]);

/** A {@link FAKE_DOM_GLOBALS} member installed on `globalThis`, and where. */
export interface FakeDomInstall {
  name: string;
  /** Offset of the install's first character in the ORIGINAL source. */
  index: number;
}

/**
 * `globalThis` / `global`, optionally cast and parenthesised. The `as …` span
 * stops at the cast's own closing paren; TS type arguments use `<>`, so a
 * generic inside the cast cannot end it early.
 */
const GLOBAL_OBJECT = String.raw`\b(?:globalThis|global)\b(?:\s+as\s+[^)]*)?\s*\)?\s*`;

/** Any string-literal opening quote. Written double-quoted so the backtick is literal. */
const QUOTE = "[\"'`]";

/**
 * Every browser global this source installs on `globalThis` / `global`, in each
 * form a test actually reaches for: a direct assignment (dotted or indexed, cast
 * or not) and `Object.defineProperty(globalThis, "window", …)`.
 *
 * Scanned over `maskSource`d text, so an install written *inside a string or a
 * comment* — every fixture in this module's own test suite, for instance — is
 * not code and is not reported. Quoted keys therefore have to be read back out
 * of the original bytes at the matched offset, the same technique the check uses
 * for dynamic `import("…")` specifiers.
 *
 * Indirect forms (`Object.assign(globalThis, {…})`, a computed key) are out of a
 * regex's reach and deliberately not chased: this is a guardrail against the
 * idiom a test author types, and the crash it prevents stays loud regardless.
 */
export function fakeDomInstalls(src: string): FakeDomInstall[] {
  const masked = maskSource(src);
  const installs: FakeDomInstall[] = [];

  const record = (index: number, name: string) => {
    if (FAKE_DOM_GLOBALS.has(name)) installs.push({ name, index });
  };

  // `globalThis.window = …` / `(globalThis as Record<string, unknown>).window = …`.
  const dotted = new RegExp(
    `${GLOBAL_OBJECT}\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = dotted.exec(masked))) record(m.index, m[1]!);

  // `globalThis["window"] = …` and `Object.defineProperty(globalThis, "window", …)`
  // — one shape apiece, each ending at the quote that opens the key, each
  // confirmed by what follows the key's closing quote.
  const keyed = [
    {
      pattern: new RegExp(`${GLOBAL_OBJECT}\\[\\s*(${QUOTE})`, "g"),
      after: /^\s*\]\s*=(?!=)/,
    },
    {
      pattern: new RegExp(
        `\\bObject\\s*\\.\\s*defineProperty\\s*\\(\\s*(?:globalThis|global)\\s*,\\s*(${QUOTE})`,
        "g",
      ),
      after: /^\s*,/,
    },
  ];
  for (const { pattern, after } of keyed) {
    while ((m = pattern.exec(masked))) {
      const openQuote = m.index + m[0].length - 1;
      const close = masked.indexOf(masked[openQuote]!, openQuote + 1);
      if (close < 0) continue;
      if (!after.test(masked.slice(close + 1))) continue;
      // The key is masked in `masked` (it IS a string) — read it from the source.
      record(m.index, src.slice(openQuote + 1, close));
    }
  }

  return installs.sort((a, b) => a.index - b.index);
}
