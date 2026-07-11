import { expect, test, describe } from "bun:test";
import type { StallSection } from "@plugins/debug/plugins/trace/plugins/stall/core";
import { deriveCulprit } from "./culprit";

describe("deriveCulprit", () => {
  test("fingerprints on the caller STACK, not a generic native leaf", () => {
    // The Jul-7 shape: the hottest leaf is a generic native frame shared by every
    // JSON caller, but the top stack names the actual caller path.
    const section: StallSection = {
      nSamples: 1000,
      sampleRateHz: 230,
      topLeaves: [
        { key: "JSON.parse [native]", count: 700, pct: 70 },
        { key: "parseTranscript @ plugins/ccusage/parse.ts:42", count: 200, pct: 20 },
      ],
      topStacks: [
        { stack: "parseTranscript ← readEntries ← run", count: 650, pct: 65 },
        { stack: "flushNotifies ← tick", count: 150, pct: 15 },
      ],
    };
    const { culpritStack, hotFrame } = deriveCulprit(section);
    // Fingerprint grain is the caller stack, never the native leaf.
    expect(culpritStack).toBe("parseTranscript ← readEntries ← run");
    // hotFrame is the first source-attributed (` @ `) leaf, NOT `JSON.parse [native]`.
    expect(hotFrame).toBe("parseTranscript @ plugins/ccusage/parse.ts:42");
  });

  test("empty section falls back without throwing", () => {
    const section: StallSection = {
      nSamples: 0,
      sampleRateHz: 0,
      topLeaves: [],
      topStacks: [],
    };
    expect(() => deriveCulprit(section)).not.toThrow();
    expect(deriveCulprit(section)).toEqual({
      culpritStack: "unknown",
      hotFrame: "event-loop stall",
    });
  });

  test("a source-attributed leaf as the hottest is picked as hotFrame", () => {
    const section: StallSection = {
      nSamples: 500,
      sampleRateHz: 230,
      topLeaves: [
        { key: "compileTemplate @ plugins/story/render.ts:88", count: 400, pct: 80 },
        { key: "memcpy [native]", count: 50, pct: 10 },
      ],
      topStacks: [{ stack: "compileTemplate ← renderPage ← handle", count: 400, pct: 80 }],
    };
    const { culpritStack, hotFrame } = deriveCulprit(section);
    expect(culpritStack).toBe("compileTemplate ← renderPage ← handle");
    expect(hotFrame).toBe("compileTemplate @ plugins/story/render.ts:88");
  });
});
