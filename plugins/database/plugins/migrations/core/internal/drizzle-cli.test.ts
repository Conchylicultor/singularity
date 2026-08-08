/**
 * Tests for the drizzle CLI argv builder. Run with `bun test`.
 *
 * The property that matters is the one that used to be a repo-wide text scan:
 * NO option combination can produce a subcommand other than `generate`. Flags
 * only ever append after it.
 */

import { describe, expect, test } from "bun:test";
import { DRIZZLE_KIT_BIN, drizzleGenerateArgv } from "./drizzle-cli";

/** Where the subcommand sits: right after the binary. */
function subcommandOf(argv: string[]): string | undefined {
  const i = argv.indexOf(DRIZZLE_KIT_BIN);
  return i === -1 ? undefined : argv[i + 1];
}

describe("drizzleGenerateArgv", () => {
  test("runs the binary under the Bun runtime, not the shebang's Node", () => {
    // `--bun` is load-bearing: bunx honours drizzle-kit's `#!/usr/bin/env node`
    // shebang otherwise, and the child then dies on `Bun.which()` with exit 0
    // and no migration written.
    expect(drizzleGenerateArgv()).toEqual([
      process.execPath,
      "x",
      "--bun",
      DRIZZLE_KIT_BIN,
      "generate",
    ]);
  });

  test("every option combination still runs `generate`", () => {
    const combos: Parameters<typeof drizzleGenerateArgv>[0][] = [
      {},
      { custom: true },
      { name: "add_widgets" },
      { configPath: "../tmp/drizzle.config.ts" },
      { custom: true, name: "backfill_widgets" },
      {
        custom: true,
        name: "backfill_widgets",
        configPath: "x/drizzle.config.ts",
      },
      // Falsy/absent values must not shift the argv either.
      { custom: false, name: null, configPath: null },
    ];
    for (const opts of combos) {
      expect(subcommandOf(drizzleGenerateArgv(opts))).toBe("generate");
    }
  });

  test("flags append after the subcommand", () => {
    expect(drizzleGenerateArgv({ custom: true, name: "wipe_rows" })).toEqual([
      process.execPath,
      "x",
      "--bun",
      DRIZZLE_KIT_BIN,
      "generate",
      "--custom",
      "--name",
      "wipe_rows",
    ]);
    expect(
      drizzleGenerateArgv({ configPath: ".check-x/drizzle.config.ts" }),
    ).toEqual([
      process.execPath,
      "x",
      "--bun",
      DRIZZLE_KIT_BIN,
      "generate",
      "--config=.check-x/drizzle.config.ts",
    ]);
  });

  test("the binary is named exactly once", () => {
    const argv = drizzleGenerateArgv({
      custom: true,
      name: "n",
      configPath: "c",
    });
    expect(argv.filter((a) => a === DRIZZLE_KIT_BIN)).toHaveLength(1);
  });
});
