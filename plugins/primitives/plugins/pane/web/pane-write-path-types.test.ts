import { expect, test } from "bun:test";
import { openPane, Pane } from "./pane";

// ---------------------------------------------------------------------------
// Compile-time regression guard for the pane "write path" param typing.
//
// `openPane` (and `useToggle`) check the `params` argument against the target
// pane's full param set:
//   - a PARAMFUL pane requires exactly its declared params (no missing, no
//     extra keys),
//   - a PARAMLESS pane accepts only `{}` (stray keys rejected — validates the
//     `Record<string, never>` empty case of InferParams).
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
}

test("pane write-path param typing guard compiles", () => {
  expect(typeof typeAssertions).toBe("function");
});
