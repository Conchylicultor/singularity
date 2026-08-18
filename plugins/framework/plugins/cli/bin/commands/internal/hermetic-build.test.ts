/**
 * The `--hermetic` refusal matrix. Every arm here is a flag combination whose
 * only other proof is a 10-minute build, and two of them (`--skip-checks`,
 * `--no-restart`) are refused precisely because they would otherwise be SILENT —
 * a passing build that read as "I skipped validation". So the guard is tested
 * where it is cheap: `hermeticFlagConflicts` is pure, and one message per
 * conflict is part of the contract (a caller fixing two mistakes should see
 * both).
 */
import { describe, expect, test } from "bun:test";
import { hermeticFlagConflicts } from "./hermetic-build";

/** The coherent invocation every case below perturbs by exactly one field. */
const ok = { composition: ["sonata"], restart: true };

describe("hermeticFlagConflicts", () => {
  test("a composition plus no deploy-only flag is clean", () => {
    expect(hermeticFlagConflicts(ok)).toEqual([]);
    expect(
      hermeticFlagConflicts({ ...ok, composition: ["sonata", "website"] }),
    ).toEqual([]);
  });

  test("--hermetic with no composition is refused: no dist to key on", () => {
    for (const composition of [undefined, []]) {
      const conflicts = hermeticFlagConflicts({ ...ok, composition });
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toContain("--composition");
    }
  });

  test("--composition singularity is refused, naming the mechanism", () => {
    const conflicts = hermeticFlagConflicts({
      ...ok,
      composition: ["singularity"],
    });
    expect(conflicts).toHaveLength(1);
    // The refusal has to state WHY, or it reads as an arbitrary reserved word:
    // select-registry.ts adopts the emitted file for main's backend on presence.
    expect(conflicts[0]).toContain("select-registry.ts");
    expect(conflicts[0]).toContain(
      "server.composition.singularity.generated.ts",
    );
  });

  test("`singularity` is caught anywhere in the variadic list", () => {
    expect(
      hermeticFlagConflicts({ ...ok, composition: ["sonata", "singularity"] }),
    ).toHaveLength(1);
  });

  test.each([
    ["--allow-main", { allowMain: true }],
    ["--skip-checks", { skipChecks: true }],
    // commander stores `--no-restart` as `restart: false`; `undefined` is not a
    // spelling of it, so the check must be for `false` specifically.
    ["--no-restart", { restart: false }],
    ["--serve-composition", { serveComposition: "sonata" }],
  ])("%s is deploy-only and refused", (flag, patch) => {
    const conflicts = hermeticFlagConflicts({ ...ok, ...patch });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain(flag);
  });

  test("falsy deploy-only flags are not conflicts", () => {
    expect(
      hermeticFlagConflicts({
        ...ok,
        allowMain: false,
        skipChecks: false,
        serveComposition: undefined,
      }),
    ).toEqual([]);
  });

  test("every conflict is reported, not just the first", () => {
    const conflicts = hermeticFlagConflicts({
      composition: [],
      restart: false,
      allowMain: true,
      skipChecks: true,
      serveComposition: "sonata",
    });
    expect(conflicts).toHaveLength(5);
  });
});
