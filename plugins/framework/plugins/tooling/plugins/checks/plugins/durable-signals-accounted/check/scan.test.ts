import { describe, expect, test } from "bun:test";
import {
  inventorySinks,
  scanSinkCalls,
  type ComputedIdExemption,
  type RawSinkCall,
  type ResolvedSinkCall,
} from "./scan";
import { ACCOUNTING } from "./accounting";

const resolveLiterals = (calls: RawSinkCall[]): ResolvedSinkCall[] =>
  calls.map((c) => ({
    marker: c.marker,
    path: c.path,
    line: c.line,
    id: c.id.kind === "literal" ? c.id.value : null,
  }));

const LOG_TS = "plugins/primitives/plugins/log-channels/server/internal/log.ts";
const EXEMPTION: ComputedIdExemption = {
  marker: "defineFileSink",
  path: LOG_TS,
  reason: "test",
};

describe("scanSinkCalls", () => {
  test("finds a multi-line defineFileSink call and reads its literal id", () => {
    const src = [
      'import { defineFileSink } from "@plugins/infra/plugins/file-sink/core";',
      '// defineFileSink({ id: "commented" }) is not a call',
      'const note = "defineFileSink({ id: \\"stringed\\" })";',
      "const sink = defineFileSink({",
      '  id: "my-sink",',
      '  description: "d",',
      "  path: P,",
      "});",
    ].join("\n");
    const calls = scanSinkCalls([{ rel: "a.ts", src }], "defineFileSink");
    expect(calls).toEqual([
      {
        marker: "defineFileSink",
        path: "a.ts",
        line: 4,
        id: { kind: "literal", value: "my-sink" },
      },
    ]);
  });

  test("skips the primitive's own signature, classifies const and computed ids", () => {
    const src = [
      "export function defineFileSink(spec: FileSinkSpec): FileSink {}",
      "defineFileSink({ id: MY_CONST, path: P });",
      "defineFileSink({ id: spec.id, path: P });",
      "defineFileSink({ path: P });",
    ].join("\n");
    const ids = scanSinkCalls([{ rel: "b.ts", src }], "defineFileSink").map(
      (c) => c.id.kind,
    );
    expect(ids).toEqual(["const", "computed", "computed"]);
  });
});

describe("inventorySinks", () => {
  test("an exempted computed id is excused; an unexempted one is unresolvable", () => {
    const computed = "defineFileSink({ id: spec.id, path: P });";
    const calls = resolveLiterals([
      ...scanSinkCalls([{ rel: LOG_TS, src: computed }], "defineFileSink"),
      ...scanSinkCalls([{ rel: "other.ts", src: computed }], "defineFileSink"),
    ]);
    const inv = inventorySinks(calls, [EXEMPTION]);
    expect(inv.unresolvable.map((s) => s.path)).toEqual(["other.ts"]);
    expect(inv.staleExemptions).toEqual([]);
  });

  test("an exemption whose file has no computed-id call goes stale", () => {
    const literalOnly = 'defineFileSink({ id: "fixed", path: P });';
    const calls = resolveLiterals(
      scanSinkCalls([{ rel: LOG_TS, src: literalOnly }], "defineFileSink"),
    );
    const inv = inventorySinks(calls, [EXEMPTION]);
    expect(inv.staleExemptions).toEqual([EXEMPTION]);
    expect(inv.found.has("fixed")).toBe(true);
  });

  test("one id through both primitives is a collision", () => {
    const calls = resolveLiterals([
      ...scanSinkCalls(
        [
          {
            rel: "log.ts",
            src: 'defineLogSink({ id: "dup", description: "d" });',
          },
        ],
        "defineLogSink",
      ),
      ...scanSinkCalls(
        [{ rel: "file.ts", src: 'defineFileSink({ id: "dup", path: P });' }],
        "defineFileSink",
      ),
    ]);
    const inv = inventorySinks(calls, []);
    expect(inv.collisions.map((c) => c.id)).toEqual(["dup"]);
  });

  test("a found file sink id with no accounting entry is unclassified", () => {
    const calls = resolveLiterals(
      scanSinkCalls(
        [
          {
            rel: "c.ts",
            src: 'defineFileSink({ id: "never-accounted-sink", path: P });',
          },
        ],
        "defineFileSink",
      ),
    );
    const { found } = inventorySinks(calls, []);
    expect([...found.keys()].filter((id) => !(id in ACCOUNTING))).toEqual([
      "never-accounted-sink",
    ]);
  });
});
