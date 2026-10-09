import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { schemaLoadFailures } from "./schema-load-probe";
import { MIGRATIONS_PLUGIN_DIR } from "./schema-glob-patterns";

// A throwaway repo root holding two schema-glob files and this plugin's real
// probe script, so the probe answers about exactly these files. The property
// under test is "ANY load error is a failure": drizzle-kit drops a file that
// throws whatever the error, so the probe must not depend on an error's kind.
// The plain `Error` below is the kind the CLI's old output grep missed (a
// barrel asking for a runtime namespace at module eval).
const root = mkdtempSync(join(tmpdir(), "schema-load-probe-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function schemaFile(plugin: string, body: string): string {
  const dir = join(root, "plugins", plugin, "server", "internal");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "tables.ts");
  writeFileSync(file, body);
  return file;
}

const pluginDir = join(root, MIGRATIONS_PLUGIN_DIR);
mkdirSync(pluginDir, { recursive: true });
symlinkSync(
  resolve(import.meta.dir, "../../scripts"),
  join(pluginDir, "scripts"),
);

describe("schemaLoadFailures", () => {
  test("names a file that throws a plain Error at load, and only that file", async () => {
    schemaFile("ok", "export const ok = 1;\n");
    const broken = schemaFile(
      "broken",
      'throw new Error("this process has not declared a runtime namespace");\n',
    );

    const failures = await schemaLoadFailures(root);

    expect(failures.map((f) => f.file)).toEqual([broken]);
    expect(failures[0]!.error).toContain("runtime namespace");
  });
});
