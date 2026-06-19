import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import {
  evaluateInvariant,
  loadFixtures,
  type LayoutFixture,
  type MeasuredFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { buildFixturesPage, type BuiltPage } from "./build-fixtures-page";
import { openMeasurer, type Measurer } from "./measure-page";

// THE generic geometry suite. It builds the measurer page once (Vite + React +
// real Tailwind), opens one headless Chromium, and sweeps the WHOLE fixture
// catalog: for each fixture it measures every `widths` entry, then evaluates
// each invariant via the pure oracle. `falsification` invariants are handled
// specially — re-measured with the mutation applied, then asserted VIOLATED, so
// the harness is proven to bite on the historical broken construct.
//
// jsdom can't lay out CSS grid or compute text overflow, so this drives a real
// browser (same approach as the bespoke frame/truncating-text geometry tests it
// supersedes). It launches Vite + Chromium and is therefore slow — that's
// expected; it gates behind the sig-cached `layout-geometry` check.

// bun:test registers tests synchronously, but loadFixtures is async. Await it
// once at module top-level so the per-fixture describes below are registered
// before the run starts.
const collected = await loadFixtures();

let built: BuiltPage;
let measurer: Measurer;

beforeAll(async () => {
  built = await buildFixturesPage();
  measurer = await openMeasurer(built.outDir);
});

afterAll(async () => {
  await measurer?.close();
  if (built?.outDir) await rm(built.outDir, { recursive: true, force: true });
});

/** Measure a fixture across all its widths (unmutated). */
async function sweep(fixture: LayoutFixture): Promise<Record<number, MeasuredFixture>> {
  const out: Record<number, MeasuredFixture> = {};
  for (const width of fixture.widths) {
    out[width] = await measurer.measure(fixture.id, width);
  }
  return out;
}

test("the fixture catalog is non-empty", () => {
  expect(collected.length).toBeGreaterThan(0);
});

for (const fixture of collected) {
  describe(fixture.id, () => {
    let measuredByWidth: Record<number, MeasuredFixture>;

    beforeAll(async () => {
      measuredByWidth = await sweep(fixture);
    });

    for (const inv of fixture.invariants) {
      if (inv.kind === "falsification") {
        // Re-measure the mutated construct across the sweep, then assert the
        // inner `expectViolated` invariant is genuinely VIOLATED.
        test(`falsification(${inv.mutate.kind}:${"value" in inv.mutate ? inv.mutate.value : ""}) → ${inv.expectViolated.kind} VIOLATED`, async () => {
          const mutatedByWidth: Record<number, MeasuredFixture> = {};
          for (const width of fixture.widths) {
            mutatedByWidth[width] = await measurer.measure(
              fixture.id,
              width,
              inv.mutate,
            );
          }
          const r = evaluateInvariant(inv.expectViolated, mutatedByWidth);
          // The whole point: the mutation reproduces the historical broken shape,
          // so the inner invariant MUST fail. If it passes, the harness is NOT
          // biting — a real failure to investigate, never to paper over.
          if (r.ok) {
            throw new Error(
              `falsification did not bite: applying ${JSON.stringify(inv.mutate)} to "${fixture.id}" left invariant ${inv.expectViolated.kind} satisfied — the mutated construct should have violated it`,
            );
          }
          expect(r.ok).toBe(false);
        });
        continue;
      }

      test(inv.kind, () => {
        const r = evaluateInvariant(inv, measuredByWidth);
        if (!r.ok) throw new Error(r.detail);
        expect(r.ok).toBe(true);
      });
    }
  });
}
