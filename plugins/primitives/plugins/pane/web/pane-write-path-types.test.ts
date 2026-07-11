import { expect, test } from "bun:test";
import { openPane, Pane, type } from "./pane";

// ---------------------------------------------------------------------------
// Compile-time regression guard for the pane "write path" typing.
//
// `openPane` (and `useToggle`) check the `params` argument against the target
// pane's full param set:
//   - a PARAMFUL pane requires exactly its declared params (no missing, no
//     extra keys),
//   - a PARAMLESS pane accepts only `{}` (stray keys rejected — validates the
//     `Record<string, never>` empty case of InferParams).
//
// The same closed-set discipline covers the two NON-URL surfaces:
//   - `options` — the opener may pass a Partial of the pane's declared defaults
//     and nothing else; `useOptions()` returns them TOTAL (never `Partial`),
//     because the deep-link value is the declared default.
//   - `hint` — an ephemeral optimistic mirror; `useHint()` yields a `Hint<T>`
//     whose only accessor demands the canonical value beside it.
// A pane declaring neither rejects both outright (the hole that let a dead
// `input: { convId }` ride on `attemptPane`).
//
// The assertions below are validated by `./singularity check type-check`: every
// `@ts-expect-error` must correspond to a real error (tsc fails on an UNUSED
// directive), and every positive case must compile. The function is NEVER
// invoked at runtime, so the live store is never touched.
// ---------------------------------------------------------------------------

const Dummy = () => null;

const paramful = Pane.define({
  id: "wtp-paramful",
  segment: "wtp/:foo",
  resolve: false,
  component: Dummy,
});

const paramless = Pane.define({
  id: "wtp-paramless",
  segment: "wtp-none",
  component: Dummy,
});

const optioned = Pane.define({
  id: "wtp-optioned",
  segment: "wtp-opt",
  component: Dummy,
  options: { focused: false },
});

const hinted = Pane.define({
  id: "wtp-hinted",
  segment: "wtp-hint",
  component: Dummy,
  hint: type<{ title: string }>(),
});

// Never called — purely a type-level harness so `liveStore` is never reached.
function typeAssertions() {
  // Paramful: missing required `foo`.
  // @ts-expect-error - `foo` is required
  openPane(paramful, {}, { mode: "root" });

  // Paramful: extra key `bar` rejected.
  // @ts-expect-error - `bar` is not a declared param
  openPane(paramful, { foo: "x", bar: "y" }, { mode: "root" });

  // Paramful: correct — compiles.
  openPane(paramful, { foo: "x" }, { mode: "root" });

  // Paramless: extra key rejected (validates the closed empty param type).
  // @ts-expect-error - paramless pane accepts no params
  openPane(paramless, { foo: "x" }, { mode: "root" });

  // Paramless: empty — compiles.
  openPane(paramless, {}, { mode: "root" });

  // ---- useToggle: pure type-level assertions (the hook is never called) ----
  // `useToggle(params, opts?)` checks `params` against the pane's full params,
  // identically to `openPane`. Assert assignability of the first arg type via
  // typeof rather than invoking the hook outside a render.
  type ParamfulToggleParams = Parameters<typeof paramful.useToggle>[0];
  type ParamlessToggleParams = Parameters<typeof paramless.useToggle>[0];

  const okParamful: ParamfulToggleParams = { foo: "x" };
  void okParamful;
  // @ts-expect-error - `foo` is required for the paramful pane's toggle
  const missingParamful: ParamfulToggleParams = {};
  void missingParamful;
  // @ts-expect-error - `bar` is not a declared param
  const extraParamful: ParamfulToggleParams = { foo: "x", bar: "y" };
  void extraParamful;

  const okParamless: ParamlessToggleParams = {};
  void okParamless;
  // @ts-expect-error - paramless toggle accepts no params
  const extraParamless: ParamlessToggleParams = { foo: "x" };
  void extraParamless;

  // ---- options: a Partial of the declared defaults, and nothing else --------
  openPane(optioned, {}, { mode: "root", options: { focused: true } });
  openPane(optioned, {}, { mode: "root", options: {} });
  // @ts-expect-error - `focused` is a boolean, not a string
  openPane(optioned, {}, { mode: "root", options: { focused: "yes" } });
  // @ts-expect-error - `bogus` is not a declared option
  openPane(optioned, {}, { mode: "root", options: { bogus: 1 } });
  // @ts-expect-error - a pane declaring no options accepts none
  openPane(paramless, {}, { mode: "root", options: { focused: true } });

  // `useOptions()` is TOTAL: a declared key is never `| undefined`, so a read
  // site has no absence to launder into a fabricated default with `??`.
  const opts: { focused: boolean } = {} as ReturnType<typeof optioned.useOptions>;
  void opts;

  // ---- hint: the declared shape, and nothing else ---------------------------
  openPane(hinted, {}, { mode: "root", hint: { title: "Hello" } });
  // @ts-expect-error - `title` is required by the declared hint shape
  openPane(hinted, {}, { mode: "root", hint: {} });
  // @ts-expect-error - `subtitle` is not part of the declared hint shape
  openPane(hinted, {}, { mode: "root", hint: { title: "a", subtitle: "b" } });
  // @ts-expect-error - a pane declaring no hint accepts none
  openPane(paramless, {}, { mode: "root", hint: { title: "Hello" } });

  // `Hint` carries no data: the ONLY accessor is `pick`, and it requires the
  // canonical value beside it. There is no way to read `title` on its own.
  type HintApi = ReturnType<typeof hinted.useHint>;
  const hintApi = {} as HintApi;
  const picked: string | undefined = hintApi.pick("title", "canonical");
  void picked;
  // @ts-expect-error - `pick` requires the canonical value as its 2nd argument
  hintApi.pick("title");
  // @ts-expect-error - `subtitle` is not a hinted key
  hintApi.pick("subtitle", "x");
  // @ts-expect-error - the canonical value must match the hinted key's type
  hintApi.pick("title", 42);
  // @ts-expect-error - a hint exposes no data properties, only `pick`
  hintApi.title;

  // ---- `useInput()` is gone. Options and hints are not interchangeable. -----
  // @ts-expect-error - `useInput` no longer exists on a PaneObject
  hinted.useInput();
}

test("pane write-path param typing guard compiles", () => {
  expect(typeof typeAssertions).toBe("function");
});
