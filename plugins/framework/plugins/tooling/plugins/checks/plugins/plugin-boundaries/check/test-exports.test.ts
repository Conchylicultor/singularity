import { describe, expect, it } from "bun:test";
import { findTestSupportInBarrel } from "./test-exports";

const BARREL = "plugins/database/server/index.ts";
const rulesOf = (src: string) =>
  findTestSupportInBarrel(BARREL, src).map((v) => v.message);

describe("findTestSupportInBarrel", () => {
  it("passes an ordinary barrel", () => {
    expect(
      rulesOf(
        [
          'import type { Def } from "@plugins/framework/plugins/server-core/core";',
          'export { createPool, type Pool } from "./internal/pool";',
          'export { testConnection } from "./internal/probe";',
          "export default { description: 'x' } satisfies Def;",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("flags a test hook by name, including a type-only or renamed one", () => {
    expect(
      rulesOf(
        [
          'export { reset, _setClockForTests } from "./internal/latch";',
          'export { a as resetStateForTest } from "./internal/state";',
          'export type { OptsForTesting } from "./internal/state";',
        ].join("\n"),
      ),
    ).toEqual([
      "public barrel exports test hook `_setClockForTests`",
      "public barrel exports test hook `resetStateForTest`",
      "public barrel exports test hook `OptsForTesting`",
    ]);
  });

  it("flags names taken from a test-support module, whatever they are called", () => {
    const specifiers = [
      "./test-support",
      "./internal/fixtures",
      "./internal/fixture",
      "./internal/hookpad.fixtures",
      "./testing",
      "./__tests__/helper",
      "./internal/x.test",
    ];
    for (const s of specifiers) {
      expect(rulesOf(`export { FakeSocket } from "${s}";`)).toEqual([
        `public barrel takes names from test-support module \`${s}\``,
      ]);
    }
    expect(
      rulesOf('import { Fake } from "./test-support";\nexport { Fake };'),
    ).toEqual([
      "public barrel takes names from test-support module `./test-support`",
    ]);
  });

  it("does not read a name as a file: `loadFixtures` from `./oracle` passes", () => {
    expect(rulesOf('export { loadFixtures } from "./oracle";')).toEqual([]);
  });

  it("points at the runtime's testing barrel", () => {
    const [v] = findTestSupportInBarrel(
      BARREL,
      'export { xForTests } from "./a";',
    );
    expect(v?.fix).toContain("plugins/database/server/testing/index.ts");
  });
});
