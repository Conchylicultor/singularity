/**
 * The `no-legacy-resource-spelling` allowlist, held to the disk and to the
 * lint config the repo really builds.
 *
 *   - A `/**` glob is a substrate plugin: its directory exists.
 *   - Every other entry is a burndown file: it exists, it is listed once and
 *     outside the substrate, and the rule still flags it. A file a wave
 *     migrated must leave the list, so the list stays the inventory of what is
 *     left rather than a record of what once was.
 *   - Through `buildLintConfig` (what `eslint.config.ts` and `type-check` build,
 *     `ignores` included — RuleTester sees only the rule module): the rule is
 *     off for a substrate file and a burndown file, and on for any other app
 *     file, including a new file beside a listed one.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint, Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { buildLintConfig } from "@plugins/framework/plugins/tooling/plugins/lint/core";
import contribution from "./index";
import rule from "./no-legacy-resource-spelling";

const ROOT = resolve(import.meta.dir, "../../../../..");
const RULE = "no-legacy-resource-spelling";
const QUALIFIED = `${contribution.name}/${RULE}`;

const entries = contribution.ignores[RULE];
const globs = entries.filter((e) => e.endsWith("/**"));
const files = entries.filter((e) => !e.endsWith("/**"));

describe("no-legacy-resource-spelling ignores", () => {
  it("every substrate glob names an existing plugin directory", () => {
    const missing = globs.filter((g) => {
      const dir = resolve(ROOT, g.slice(0, -"/**".length));
      return !existsSync(dir) || !statSync(dir).isDirectory();
    });
    expect(missing).toEqual([]);
  });

  it("every burndown entry is one existing file, listed once, outside the substrate", () => {
    expect(files.filter((f, i) => files.indexOf(f) !== i)).toEqual([]);
    expect(files.filter((f) => !existsSync(resolve(ROOT, f)))).toEqual([]);
    const underSubstrate = files.filter((f) =>
      globs.some((g) => new Bun.Glob(g).match(f)),
    );
    expect(underSubstrate).toEqual([]);
  });

  it("every burndown file still imports an old spelling", () => {
    const linter = new Linter({ configType: "flat", cwd: ROOT });
    const config: Linter.Config[] = [
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        },
        plugins: {
          [contribution.name]: { rules: { [RULE]: rule } },
        } as unknown as Linter.Config["plugins"],
        rules: { [QUALIFIED]: "error" },
      },
    ];
    const stale = files.filter((f) => {
      const filename = resolve(ROOT, f);
      const messages = linter.verify(readFileSync(filename, "utf8"), config, {
        filename,
      });
      const fatal = messages.find((m) => m.fatal);
      if (fatal) throw new Error(`${f}: ${fatal.message}`);
      return !messages.some((m) => m.ruleId === QUALIFIED);
    });
    expect(stale).toEqual([]);
  });

  it("the built lint config turns the rule off exactly for the allowlist", async () => {
    const config = await buildLintConfig({
      root: ROOT,
      typeSource: { projectService: true },
    });
    if (!config.some((c) => c.plugins?.[contribution.name] !== undefined)) {
      throw new Error(
        "the lint config does not load plugins/network/plugins/live/lint — " +
          "run ./singularity build to regenerate lint.generated.ts",
      );
    }
    // Resolves each file's merged config without parsing it (no type
    // program is built), so the paths need not exist.
    const eslint = new ESLint({
      cwd: ROOT,
      overrideConfigFile: true,
      baseConfig: config,
    });
    const severity = async (rel: string) => {
      const resolved = (await eslint.calculateConfigForFile(
        resolve(ROOT, rel),
      )) as Linter.Config | undefined;
      return resolved?.rules?.[QUALIFIED];
    };

    // Substrate and burndown: off.
    expect(await severity("plugins/network/plugins/live/web/index.ts")).toEqual(
      [0],
    );
    expect(
      await severity(
        "plugins/primitives/plugins/live-state/web/use-resource.ts",
      ),
    ).toEqual([0]);
    expect(await severity(files[0]!)).toEqual([0]);
    expect(await severity(files[files.length - 1]!)).toEqual([0]);
    // Any other app file: on — a new file in a plugin whose other files are
    // listed included, since the list names files, not plugins.
    expect(await severity("plugins/tasks/web/new-reader.tsx")).toEqual([2]);
    expect(
      await severity("plugins/shell/plugins/notifications/web/index.ts"),
    ).toEqual([2]);
  }, 60_000);
});
