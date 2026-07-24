import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import {
  applyAuthoredOverrideSeeding,
  listReviewMarkedOverrides,
} from "./authored-override-seed";

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "authored-seed-"));
});
afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const full = join(configDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function read(rel: string): string {
  return readFileSync(join(configDir, rel), "utf8");
}

/**
 * A descriptor stub: seeding reads only `name` + `requiresAuthoredOverride`, so
 * the schema/fields half of the interface is irrelevant here.
 */
function descriptor(opts: { name: string; guidance?: string[] }): ConfigDescriptor {
  return {
    name: opts.name,
    fields: {},
    defaults: {},
    requiresAuthoredOverride: opts.guidance ? { guidance: opts.guidance } : undefined,
  } as unknown as ConfigDescriptor;
}

const GUIDANCE = ['Arrange "items" for how this slot renders.'];

const ORIGIN_HASH = "aaaaaaaaaaaa";
const ORIGIN = `// @hash ${ORIGIN_HASH}
{
  // Hide: { "item": "<key>", "hidden": true }
  "items": [
    "plug:one",
    "plug:two"
  ]
}
`;

function seedOne(opts: {
  originRel: string;
  guidance?: string[];
}): ReturnType<typeof applyAuthoredOverrideSeeding> {
  return applyAuthoredOverrideSeeding({
    configDir,
    descriptorsByOriginRel: new Map([
      [
        opts.originRel,
        descriptor({
          name: opts.originRel.split("/").pop()!.replace(".origin.jsonc", ""),
          guidance: opts.guidance ?? GUIDANCE,
        }),
      ],
    ]),
  });
}

test("seeds a missing override from the origin's bytes, with the marker block", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc", ORIGIN);

  const result = seedOne({ originRel: "apps/pages/shell/pages.sidebar.origin.jsonc" });

  expect(result.seeded).toEqual(["apps/pages/shell/pages.sidebar.jsonc"]);
  expect(result.remarked).toEqual([]);

  const seeded = read("apps/pages/shell/pages.sidebar.jsonc");
  // Header hash preserved, marker + guidance inserted right after it, body verbatim.
  expect(seeded).toBe(
    `// @hash ${ORIGIN_HASH}\n` +
      "// @review — seeded, not authored. Delete this line once the values below are deliberate.\n" +
      `// ${GUIDANCE[0]}\n` +
      ORIGIN.slice(`// @hash ${ORIGIN_HASH}\n`.length),
  );
});

test("does not seed a descriptor without requiresAuthoredOverride", () => {
  write("build/build.origin.jsonc", ORIGIN);

  const result = applyAuthoredOverrideSeeding({
    configDir,
    descriptorsByOriginRel: new Map([
      ["build/build.origin.jsonc", descriptor({ name: "build" })],
    ]),
  });

  expect(result).toEqual({ seeded: [], remarked: [] });
  expect(existsSync(join(configDir, "build/build.jsonc"))).toBe(false);
});

test("leaves an existing in-sync, marker-free override untouched", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc", ORIGIN);
  const authored = `// @hash ${ORIGIN_HASH}\n{\n  "items": ["plug:two", "plug:one"]\n}\n`;
  write("apps/pages/shell/pages.sidebar.jsonc", authored);

  const result = seedOne({ originRel: "apps/pages/shell/pages.sidebar.origin.jsonc" });

  expect(result).toEqual({ seeded: [], remarked: [] });
  expect(read("apps/pages/shell/pages.sidebar.jsonc")).toBe(authored);
});

test("re-stamps + re-marks a stale override, preserving its body bytes", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc", ORIGIN);
  const body = `{\n  // why this order\n  "items": ["plug:one", { "type": "spacer", "id": "gap" }]\n}\n`;
  write("apps/pages/shell/pages.sidebar.jsonc", `// @hash bbbbbbbbbbbb\n${body}`);

  const result = seedOne({ originRel: "apps/pages/shell/pages.sidebar.origin.jsonc" });

  expect(result.seeded).toEqual([]);
  expect(result.remarked).toEqual(["apps/pages/shell/pages.sidebar.jsonc"]);

  const raw = read("apps/pages/shell/pages.sidebar.jsonc");
  const lines = raw.split("\n");
  expect(lines[0]).toBe(`// @hash ${ORIGIN_HASH}`);
  // The delta names the entry the catalog gained; the author's spacer is
  // authoring structure, not a catalog entry, so it is NOT reported as removed.
  expect(lines[1]).toBe("// @review — the catalog changed under this file: +plug:two.");
  expect(lines[2]).toBe("// Place the new entries deliberately, then delete this @review line.");
  // Body bytes below the header block survive byte-for-byte (comment included).
  expect(lines.slice(3).join("\n")).toBe(body);
});

test("falls back to generic guidance when no entry delta is computable", () => {
  const origin = `// @hash ${ORIGIN_HASH}\n{\n  "enabled": true\n}\n`;
  write("debug/monitor/monitor.origin.jsonc", origin);
  write("debug/monitor/monitor.jsonc", `// @hash bbbbbbbbbbbb\n{\n  "enabled": false\n}\n`);

  const result = seedOne({ originRel: "debug/monitor/monitor.origin.jsonc" });

  expect(result.remarked).toEqual(["debug/monitor/monitor.jsonc"]);
  const lines = read("debug/monitor/monitor.jsonc").split("\n");
  expect(lines[1]).toBe(
    "// @review — the defaults changed under this file. Review the values below, then delete this @review line.",
  );
  expect(lines[2]).toBe(`// ${GUIDANCE[0]}`);
});

test("is idempotent across two runs (an existing marker is never rewritten)", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc", ORIGIN);

  const first = seedOne({ originRel: "apps/pages/shell/pages.sidebar.origin.jsonc" });
  const afterFirst = read("apps/pages/shell/pages.sidebar.jsonc");
  const second = seedOne({ originRel: "apps/pages/shell/pages.sidebar.origin.jsonc" });

  expect(first.seeded).toEqual(["apps/pages/shell/pages.sidebar.jsonc"]);
  expect(second).toEqual({ seeded: [], remarked: [] });
  expect(read("apps/pages/shell/pages.sidebar.jsonc")).toBe(afterFirst);
});

test("a scoped @app delta anchors to the BASE origin: re-marked, never seeded", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc", ORIGIN);
  write("apps/pages/shell/pages.sidebar.jsonc", `// @hash ${ORIGIN_HASH}\n{\n  "items": ["plug:one", "plug:two"]\n}\n`);
  // A partial, base-anchored delta carrying a now-stale hash.
  const scopedBody = `{\n  "items": ["plug:one"]\n}\n`;
  write("apps/pages/shell/@app/agents/pages.sidebar.jsonc", `// @hash bbbbbbbbbbbb\n${scopedBody}`);

  const result = seedOne({ originRel: "apps/pages/shell/pages.sidebar.origin.jsonc" });

  expect(result.seeded).toEqual([]);
  expect(result.remarked).toEqual(["apps/pages/shell/@app/agents/pages.sidebar.jsonc"]);

  const raw = read("apps/pages/shell/@app/agents/pages.sidebar.jsonc");
  expect(raw.split("\n")[0]).toBe(`// @hash ${ORIGIN_HASH}`);
  expect(raw.split("\n")[1]).toBe("// @review — the catalog changed under this file: +plug:two.");
  expect(raw.endsWith(scopedBody)).toBe(true);
  // No scoped file is ever created.
  expect(existsSync(join(configDir, "apps/pages/shell/@app/agents/pages.sidebar.origin.jsonc"))).toBe(false);
});

test("listReviewMarkedOverrides reports marked overrides and ignores origins", () => {
  const root = mkdtempSync(join(tmpdir(), "authored-seed-root-"));
  const cfg = join(root, "config");
  mkdirSync(join(cfg, "apps/pages/shell"), { recursive: true });
  writeFileSync(join(cfg, "apps/pages/shell/pages.sidebar.origin.jsonc"), ORIGIN);
  writeFileSync(
    join(cfg, "apps/pages/shell/pages.sidebar.jsonc"),
    `// @hash ${ORIGIN_HASH}\n// @review — seeded, not authored.\n{}\n`,
  );
  writeFileSync(join(cfg, "apps/pages/shell/pages.toolbar.jsonc"), `// @hash ${ORIGIN_HASH}\n{}\n`);

  expect(listReviewMarkedOverrides({ root })).toEqual([
    "apps/pages/shell/pages.sidebar.jsonc",
  ]);

  rmSync(root, { recursive: true, force: true });
});
