import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import { defineDep } from "@plugins/infra/plugins/deps/deps";
import { readyForTests } from "@plugins/infra/plugins/deps/deps/testing";
import { pythonEnv } from "./python-env";
import { PythonEntryError, runPython } from "./run-python";

// The runPython contract, against the machine's own python3 standing in for an
// installed env (no uv, no network): a fake env whose bin/python links to it,
// and a throwaway project holding the modules.
let base: string;
let ready: ReturnType<typeof makeReady>;

function makeReady() {
  const project = join(base, "project");
  const dep = defineDep({
    id: "run-python-test",
    owner: "infra/deps/python",
    description: "",
    sizeHint: "",
    source: pythonEnv({ project: relative(REPO_ROOT, project) }),
  });
  return readyForTests(dep, join(base, "env"), "test-identity");
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "run-python-"));
  mkdirSync(join(base, "env", "bin"), { recursive: true });
  // A wrapper, not a symlink: macOS's /usr/bin/python3 is an xcode-select shim
  // that dispatches on its own argv[0], and `python` is not a name it knows.
  writeFileSync(
    join(base, "env", "bin", "python"),
    '#!/bin/sh\nexec python3 "$@"\n',
    {
      mode: 0o755,
    },
  );
  const pkg = join(base, "project", "fixture");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "__init__.py"), "");
  writeFileSync(
    join(pkg, "echo.py"),
    'import json, sys\nreq = json.load(sys.stdin)\nprint("working", file=sys.stderr)\njson.dump({"doubled": [v * 2 for v in req["values"]]}, sys.stdout)\n',
  );
  writeFileSync(
    join(pkg, "crash.py"),
    'import sys\nprint("about to fail", file=sys.stderr)\nsys.exit(3)\n',
  );
  writeFileSync(join(pkg, "chatty.py"), 'print("not json")\n');
  ready = makeReady();
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("runPython", () => {
  test("round-trips JSON: stdin in, one document out, stderr to log", async () => {
    const lines: string[] = [];
    const out = await runPython(ready, {
      module: "fixture.echo",
      input: { values: [1, 2, 3] },
      output: z.object({ doubled: z.array(z.number()) }),
      timeoutMs: 30_000,
      log: (l) => lines.push(l),
    });
    expect(out).toEqual({ doubled: [2, 4, 6] });
    expect(lines).toEqual(["working"]);
  });

  test("a non-zero exit throws PythonEntryError with the stderr tail", async () => {
    const err = await runPython(ready, {
      module: "fixture.crash",
      input: {},
      output: z.unknown(),
      timeoutMs: 30_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PythonEntryError);
    expect((err as PythonEntryError).exitCode).toBe(3);
    expect((err as PythonEntryError).stderrTail).toContain("about to fail");
  });

  test("stdout that is not one JSON document throws", async () => {
    const err = await runPython(ready, {
      module: "fixture.chatty",
      input: {},
      output: z.unknown(),
      timeoutMs: 30_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PythonEntryError);
  });

  test("the output schema parses, never casts", async () => {
    const err = await runPython(ready, {
      module: "fixture.echo",
      input: { values: [1] },
      output: z.object({ doubled: z.array(z.string()) }),
      timeoutMs: 30_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(z.ZodError);
  });
});
