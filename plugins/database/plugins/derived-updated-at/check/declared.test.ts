import { test, expect } from "bun:test";
import { resolve } from "path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { runDeclaredProbe } from "./internal/run-probe";

test("names exactly the undeclared updated_at table of a schema file", async () => {
  const root = await getWorktreeRoot();
  const fixture = resolve(import.meta.dir, "internal/fixtures/tables.ts");
  const probe = await runDeclaredProbe(root, [fixture]);
  if (probe.kind !== "ok") throw new Error(probe.message);
  expect(probe.loadFailures).toEqual([]);
  expect(probe.undeclared).toEqual([
    { table: "dua_fixture_undeclared", file: fixture },
  ]);
});

test("reports a schema file that fails to load", async () => {
  const root = await getWorktreeRoot();
  const missing = resolve(import.meta.dir, "internal/fixtures/missing.ts");
  const probe = await runDeclaredProbe(root, [missing]);
  if (probe.kind !== "ok") throw new Error(probe.message);
  expect(probe.loadFailures.map((f) => f.file)).toEqual([missing]);
});
