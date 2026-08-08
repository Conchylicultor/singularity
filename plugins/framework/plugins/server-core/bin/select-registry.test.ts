/**
 * The backend's registry selection chain, post-S5: per-name → full, with NO
 * checkout-global singleton tier. The singleton case is asserted explicitly —
 * it is the branch S5 removed, and re-adding it would silently let one
 * namespace's release reconfigure every other namespace's backend.
 */

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { selectRegistry } from "./select-registry";

const coreDir = mkdtempSync(join(tmpdir(), "select-registry-test-"));
afterAll(() => rmSync(coreDir, { recursive: true, force: true }));

const write = (file: string) =>
  writeFileSync(join(coreDir, file), "export {};\n");
const full = join(coreDir, "server.generated.ts");

write("server.generated.ts");
write("server.composition.website.generated.ts");
write("server.composition.generated.ts"); // legacy singleton — must be ignored

test("a composition namespace selects ITS per-name registry", () => {
  expect(selectRegistry(coreDir, "website")).toBe(
    join(coreDir, "server.composition.website.generated.ts"),
  );
});

test("an ordinary worktree namespace selects the full registry", () => {
  // Another namespace's per-name file is on disk (and so is a legacy singleton);
  // neither may be selected under this name.
  expect(selectRegistry(coreDir, "att-1785964183-wqzj")).toBe(full);
});

test("no namespace in the env selects the full registry", () => {
  expect(selectRegistry(coreDir, undefined)).toBe(full);
  expect(selectRegistry(coreDir, "")).toBe(full);
});

test("a namespace-unsafe SINGULARITY_WORKTREE throws instead of falling back", () => {
  for (const bad of ["Website", "we bsite", "../evil", "-website"]) {
    expect(() => selectRegistry(coreDir, bad)).toThrow(
      "cannot select a plugin registry",
    );
  }
});
