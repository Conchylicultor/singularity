import { describe, expect, test } from "bun:test";
import { planCompositionSet } from "./composition-set";

const known =
  (...ids: string[]) =>
  (id: string) =>
    ids.includes(id);

describe("planCompositionSet", () => {
  test("a checkout that composes nothing builds nothing", () => {
    expect(planCompositionSet([], [], known())).toEqual({
      build: [],
      unverifiable: [],
    });
  });

  test("builds what was requested", () => {
    expect(planCompositionSet(["website"], [], known("website"))).toEqual({
      build: ["website"],
      unverifiable: [],
    });
  });

  // The regression: releasing `website` left `sonata`'s resident registry at an
  // older commit, and tsc — whose program is a glob over the same directory —
  // failed the release on the plugin paths that had since moved under it.
  test("a resident composition is rebuilt even when this build never named it", () => {
    expect(
      planCompositionSet(["website"], ["sonata"], known("website", "sonata")),
    ).toEqual({ build: ["website", "sonata"], unverifiable: [] });
  });

  test("a plain build still refreshes every resident registry", () => {
    expect(
      planCompositionSet([], ["sonata", "website"], known("sonata", "website")),
    ).toEqual({ build: ["sonata", "website"], unverifiable: [] });
  });

  test("requested and resident naming the same composition builds it once", () => {
    expect(
      planCompositionSet(["website"], ["website"], known("website")),
    ).toEqual({ build: ["website"], unverifiable: [] });
  });

  test("requested order leads, and is preserved", () => {
    expect(
      planCompositionSet(
        ["website", "agent-manager"],
        ["sonata", "website"],
        known("website", "agent-manager", "sonata"),
      ),
    ).toEqual({
      build: ["website", "agent-manager", "sonata"],
      unverifiable: [],
    });
  });

  // A Studio-created composition is absent from the hermetic posture's CODE
  // SEED manifest, so a release cannot re-derive its registry. It is reported,
  // never built and never deleted.
  test("a resident composition outside the manifest is reported, not built", () => {
    expect(
      planCompositionSet(["website"], ["studio-thing"], known("website")),
    ).toEqual({ build: ["website"], unverifiable: ["studio-thing"] });
  });

  test("an unverifiable composition is reported once", () => {
    expect(
      planCompositionSet([], ["studio-thing", "studio-thing"], known()),
    ).toEqual({ build: [], unverifiable: ["studio-thing"] });
  });
});
